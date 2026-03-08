// src/controllers/searchController.js
// ─────────────────────────────────────────────────────────────────
// v2.0: Confidence-gated search with 3-tier internal matching.
//
// Flow:
//   1. Normalize → extractAttributes → classifyIntent
//   2. Redis confidence match (top50 cache) — if ≥ 85% → return
//   3. PostgreSQL weighted search — if ≥ 85% → return
//   4. Amazon API live fetch — ONLY if no high-confidence match
//
// Paths:
//   A: PRODUCT_SPECIFIC  → Redis → DB → live fetch (last resort)
//   B: CATEGORY/BRAND_CATEGORY/GENERIC → Redis top50 + filter
//   C: LOW_CONFIDENCE    → run A + B in parallel
//   D: FALLBACK          → trending multi-category
// ─────────────────────────────────────────────────────────────────
"use strict";

const { validationResult } = require("express-validator");
const logger = require("../utils/logger");
const {
  getClient,
  getSubTypeProducts,
  setSubTypeProducts,
} = require("../utils/redis");
const { normalizeQuery } = require("../utils/queryNormalizer");
const { classifyIntent, INTENT } = require("../services/searchIntentService");
const {
  findFromRedis,
  weightedSearch,
  findTopMatches,
  isStale,
  formatForResponse,
  CONFIDENCE,
} = require("../services/productMatchService");
const { getRelated } = require("../services/relatedProductService");
const { getFallback } = require("../services/fallbackService");
const { startLiveFetch } = require("../services/liveProductFetchService");
const { createJob, getJob } = require("../services/jobStatusService");
const {
  enrichWithAnalysis,
  enrichFromCache,
  enrichAll,
} = require("../services/productEnricher");
const {
  triggerCategoryEnrichment,
} = require("../services/backgroundCategoryEnricher");

const SEARCH_CACHE_TTL = 600; // 10 min per spec

// ── Helpers ───────────────────────────────────────────────────────
function makeResponse(overrides) {
  return {
    intent: null,
    confidence: null,
    matchType: null,
    primaryProduct: null,
    suggestions: [],
    source: null,
    status: "ready",
    jobId: null,
    executionTimeMs: 0,
    wasSpellingCorrected: false,
    correctedQuery: null,
    ...overrides,
  };
}

async function getCached(redis, key) {
  if (!redis) return null;
  try {
    const r = await redis.get(key);
    return r ? JSON.parse(r) : null;
  } catch (_) {
    return null;
  }
}

async function setCached(redis, key, data) {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(data), "EX", SEARCH_CACHE_TTL);
  } catch (_) {}
}

function applyFilters(products, { brand, price_min, price_max, features }) {
  let f = [...products];
  if (price_max) f = f.filter((p) => !p.price || p.price <= price_max);
  if (price_min) f = f.filter((p) => !p.price || p.price >= price_min);
  if (brand)
    f = f.filter((p) => `${p.brand} ${p.name}`.toLowerCase().includes(brand));
  if (features?.length)
    f = f.filter((p) =>
      features.some((ft) => `${p.name} ${p.brand}`.toLowerCase().includes(ft)),
    );
  return f;
}

// ── RELEVANCE SCORING (Issue 1) ──────────────────────────────────
// Prevents unrelated products (kitchen scale for "air conditioner") from
// appearing just to fill space. Returns items sorted by relevance score;
// items scoring 0 are dropped entirely.
function scoreRelevance(products, intentResult) {
  const { category, brand, cleanQuery, features } = intentResult;
  const qTokens = (cleanQuery || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  return products
    .map((p) => {
      const text =
        `${p.name || ""} ${p.brand || ""} ${p.category || ""}`.toLowerCase();
      let score = 0;
      let tokenMatchCount = 0;

      // Category match (strong signal)
      if (category && p.category === category) score += 40;

      // Brand match
      if (brand && text.includes(brand.toLowerCase())) score += 25;

      // Query token matches (each token hit = 10 pts)
      for (const t of qTokens) {
        if (text.includes(t)) {
          score += 10;
          tokenMatchCount++;
        }
        // Stem plural: "conditioners" → "conditioner"
        else if (
          t.endsWith("s") &&
          t.length > 4 &&
          text.includes(t.slice(0, -1))
        ) {
          score += 8;
          tokenMatchCount++;
        }
      }

      // Feature match
      if (features?.length) {
        for (const ft of features) {
          if (text.includes(ft.toLowerCase())) score += 5;
        }
      }

      // VETO: if the query had specific tokens (e.g. "geyser", "air conditioner") but
      // NONE of them appear in this product, reject it — even if it matched the broad
      // category (e.g. "appliances"). This prevents pressure cookers appearing when
      // searching "geyser" and kitchen choppers for "air conditioner under 30000".
      if (qTokens.length >= 1 && tokenMatchCount === 0) score = 0;

      return { ...p, _relevance: score };
    })
    .filter((p) => p._relevance > 0)
    .sort((a, b) => b._relevance - a._relevance);
}

// ── DEDUPLICATION (Issue 6) ───────────────────────────────────────
// Removes duplicate products by ASIN, platformId, or normalized name.
function dedup(products) {
  const seen = new Set();
  return products.filter((p) => {
    // Primary key: ASIN or platformId
    const asinKey = p.asin || p.platformId || null;
    if (asinKey && seen.has(`id:${asinKey}`)) return false;
    if (asinKey) seen.add(`id:${asinKey}`);

    // Secondary key: normalized name (first 60 chars lowercase, no spaces)
    const nameKey = (p.name || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .slice(0, 60);
    if (nameKey && seen.has(`n:${nameKey}`)) return false;
    if (nameKey) seen.add(`n:${nameKey}`);

    return true;
  });
}

// ── LEARNED QUERY MAPPING ─────────────────────────────────────────
// Checks if we have a previously-learned brand+category for this normalized query.
// Populated by liveProductFetchService after each Amazon live fetch.
async function checkLearnedMapping(prisma, normalizedKey) {
  if (!prisma || !normalizedKey) return null;
  try {
    return await prisma.searchQueryMapping.findUnique({
      where: { normalizedQuery: normalizedKey },
      select: { brand: true, category: true },
    });
  } catch (_) {
    return null;
  }
}

async function getTop50(redis, category) {
  if (!redis || !category) return [];
  try {
    const r = await redis.get(`top50:${category}`);
    return r ? JSON.parse(r) : [];
  } catch (_) {
    return [];
  }
}

// ── PATH A: PRODUCT_SPECIFIC (confidence-gated) ──────────────────
// Flow:
//  1. Redis top50 confidence match → ≥ 85% = done (no Amazon)
//  2. PostgreSQL weighted search → ≥ 85% = done (no Amazon)
//  3. Legacy DB findTopMatches + enrich (backward compat)
//  4. DB miss → async live fetch (Amazon API as last resort)
async function pathA(redis, query, intentResult, startTime) {
  // ── Step 1: Redis confidence match ─────────────────────────────
  const redisResult = await findFromRedis(redis, intentResult);

  if (
    redisResult.confidence >= CONFIDENCE.HIGH &&
    redisResult.products.length > 0
  ) {
    // HIGH confidence from Redis → skip Amazon entirely
    const primary = await enrichFromCache(redisResult.products[0]);
    const rawRelated =
      redisResult.products.length > 1
        ? redisResult.products.slice(1, 10)
        : await getRelated(
            redis,
            intentResult.category,
            primary.id,
            primary.name,
          );
    const suggestions = dedup(await enrichAll(rawRelated, { scrapeLimit: 0 }));

    logger.info(
      `PathA: Redis HIGH confidence (${redisResult.confidence}) — "${primary.name}" — skipping Amazon`,
    );
    return makeResponse({
      intent: intentResult.intent,
      confidence: redisResult.confidence,
      matchType: intentResult.matchType,
      primaryProduct: primary,
      suggestions,
      source: "redis_high",
      status: "ready",
      executionTimeMs: Date.now() - startTime,
    });
  }

  // ── Step 2: PostgreSQL weighted search ─────────────────────────
  const dbResult = await weightedSearch(intentResult, 10);

  if (dbResult.confidence >= CONFIDENCE.HIGH && dbResult.products.length > 0) {
    // HIGH confidence from DB → skip Amazon
    const formatted = dbResult.products.map((p) => ({
      ...formatForResponse(p),
      asin: p.platform === "AMAZON" ? p.platformId : null,
    }));
    const enriched = await enrichAll(formatted, { scrapeLimit: 1 });
    const primary = enriched[0];
    const suggestions = dedup(enriched.slice(1));

    logger.info(
      `PathA: DB HIGH confidence (${dbResult.confidence}) — "${primary.name}" — skipping Amazon`,
    );
    return makeResponse({
      intent: intentResult.intent,
      confidence: dbResult.confidence,
      matchType: intentResult.matchType,
      primaryProduct: primary,
      suggestions,
      source: "db_high",
      status: "ready",
      executionTimeMs: Date.now() - startTime,
    });
  }

  // ── Step 3: Medium confidence — use DB results but consider refresh
  if (
    dbResult.confidence >= CONFIDENCE.MEDIUM &&
    dbResult.products.length > 0
  ) {
    const formatted = dbResult.products.map((p) => ({
      ...formatForResponse(p),
      asin: p.platform === "AMAZON" ? p.platformId : null,
    }));
    const enriched = await enrichAll(formatted, { scrapeLimit: 1 });
    const primary = enriched[0];
    const suggestions = dedup(enriched.slice(1));

    if (isStale(dbResult.products[0])) {
      logger.info(
        `PathA: DB MEDIUM conf (${dbResult.confidence}), stale — background refresh queued`,
      );
    }

    return makeResponse({
      intent: intentResult.intent,
      confidence: dbResult.confidence,
      matchType: intentResult.matchType,
      primaryProduct: primary,
      suggestions,
      source: dbResult.source,
      status: "ready",
      executionTimeMs: Date.now() - startTime,
    });
  }

  // ── Step 3b: Partial Redis results (< HIGH confidence) ────────
  // For category/brand queries, lower the bar so Redis results are preferred
  // over Amazon API. A 0.40 confidence match is adequate for category browsing.
  // For specific product queries (PRODUCT_SPECIFIC), keep the stricter 0.60
  // threshold — users typing exact model names expect an exact match.
  const partialThreshold =
    intentResult.intent === INTENT.PRODUCT_SPECIFIC
      ? CONFIDENCE.MEDIUM // 0.60 — specific product queries need higher certainty
      : 0.4; // 0.40 — category/brand queries can serve looser Redis hits
  if (
    redisResult.products.length > 0 &&
    redisResult.confidence >= partialThreshold
  ) {
    const primary = await enrichFromCache(redisResult.products[0]);
    const suggestions = dedup(
      await enrichAll(redisResult.products.slice(1, 10), {
        scrapeLimit: 0,
      }),
    );

    return makeResponse({
      intent: intentResult.intent,
      confidence: redisResult.confidence,
      matchType: intentResult.matchType,
      primaryProduct: primary,
      suggestions,
      source: "redis_partial",
      status: "ready",
      executionTimeMs: Date.now() - startTime,
    });
  }

  // ── Step 4: Legacy findTopMatches fallback ─────────────────────
  const dbMatches = await findTopMatches(query, 10);

  if (dbMatches.length > 0) {
    const formatted = dbMatches.map((p) => ({
      ...formatForResponse(p),
      asin: p.platform === "AMAZON" ? p.platformId : null,
    }));
    const enriched = await enrichAll(formatted, { scrapeLimit: 1 });
    const primary = enriched[0];
    const suggestions = dedup(enriched.slice(1));

    logger.info(`PathA: legacy DB hit — ${enriched.length} enriched results`);
    return makeResponse({
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      matchType: intentResult.matchType,
      primaryProduct: primary,
      suggestions,
      source: "db_legacy",
      status: "ready",
      executionTimeMs: Date.now() - startTime,
    });
  }

  // ── Step 5: DB miss → async live fetch (Amazon as LAST RESORT) ─
  const jobId = await createJob(redis, normalizeQuery(query));
  setImmediate(() => startLiveFetch(redis, jobId, query, intentResult));
  logger.info(
    `PathA: all internal sources miss for "${query}" — job ${jobId} → Amazon`,
  );

  return makeResponse({
    intent: intentResult.intent,
    confidence: intentResult.confidence,
    matchType: intentResult.matchType,
    status: "fetching",
    jobId,
    source: "pending",
    executionTimeMs: Date.now() - startTime,
  });
}

// ── PATH B: CATEGORY / BRAND_CATEGORY / GENERIC ───────────────────
async function pathB(redis, intentResult, startTime, prisma, rawQuery) {
  const { category, subType, intent } = intentResult;

  // Use the sub-type Redis pool first (e.g. top50:air_conditioner) so we don't
  // serve generic "appliances" results for specific sub-category queries.
  // Falls back to the broad category pool if the sub-type pool is empty.
  let products = subType ? await getTop50(redis, subType) : [];
  if (products.length === 0) products = await getTop50(redis, category);

  let filtered = applyFilters(products, intentResult);

  // DB fallback expansion if < 5 results
  if (filtered.length < 5 && prisma && category) {
    try {
      const dbProducts = await prisma.product.findMany({
        where: {
          category,
          inStock: true,
          aiScore: { not: null },
          imageUrl: { not: null },
          brand: { not: null },
          platform: "AMAZON",
        },
        orderBy: { aiScore: "desc" },
        take: 100,
        select: {
          id: true,
          name: true,
          brand: true,
          category: true,
          imageUrl: true,
          currentPrice: true,
          aiScore: true,
          affiliateUrl: true,
          platformUrl: true,
        },
      });
      const dbFmt = dbProducts.map((p) => ({
        ...p,
        price: p.currentPrice,
        rankingScore: p.aiScore,
        affiliateLink: p.affiliateUrl || p.platformUrl,
      }));
      const dbFiltered = applyFilters(dbFmt, intentResult);
      const seen = new Set(filtered.map((p) => p.name));
      for (const p of dbFiltered) {
        if (!seen.has(p.name)) {
          filtered.push(p);
          seen.add(p.name);
        }
        if (filtered.length >= 10) break;
      }
    } catch (err) {
      logger.warn(`PathB: DB fallback: ${err.message}`);
    }
  }

  // ── Relevance scoring + dedup (Issue 1 + Issue 6) ───────────────
  // Always filter products to those actually matching the query tokens —
  // even single-word queries like "geyser" must veto unrelated appliances.
  let final = dedup(filtered);
  if (intentResult.cleanQuery) {
    const scored = scoreRelevance(final, intentResult);
    // Always use scored result. If empty, the zero-results block below
    // falls through to pathA live fetch — do NOT restore unscored products
    // when none are relevant (e.g. kitchen choppers for "air conditioner").
    final = scored;
  }

  // ── Fire background enrichment if results are thin ─────────────
  // This populates Redis top50:{category} + PostgreSQL for future queries
  if (final.length < 5 && category) {
    const hint = rawQuery || `best ${category}`;
    logger.info(
      `PathB: thin results (${final.length}) for "${category}" — triggering background enrichment`,
    );
    triggerCategoryEnrichment(redis, category, hint);
  }

  // ── If ZERO results, fall through to pathA live fetch ──────────
  // So the user gets immediate results instead of an empty page
  if (final.length === 0 && rawQuery) {
    logger.info(
      `PathB: zero results for "${category}" — falling through to pathA live fetch`,
    );
    return pathA(redis, rawQuery, intentResult, startTime);
  }

  return makeResponse({
    intent,
    confidence: intentResult.confidence,
    matchType: intentResult.matchType,
    suggestions: final.slice(0, 10),
    source: products.length > 0 ? "cache" : "database",
    status: "ready",
    executionTimeMs: Date.now() - startTime,
  });
}

// ── MAIN HANDLER ─────────────────────────────────────────────────
let prismaClient = null;
function setPrisma(client) {
  prismaClient = client;
}

async function search(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  const rawQuery = String(req.body.query || "")
    .slice(0, 200)
    .replace(/<[^>]*>/g, "")
    .trim();
  const rawCat = String(req.body.category || "")
    .slice(0, 50)
    .trim();
  if (!rawQuery)
    return res.status(400).json({ success: false, error: "query is required" });

  req.setTimeout(60000);
  const startTime = Date.now();
  const redis = getClient();
  const normalized = normalizeQuery(rawQuery);
  const cacheKey = `search:${normalized}`;

  // Step 1: Search cache (10 min TTL)
  const cached = await getCached(redis, cacheKey);
  if (cached) {
    logger.info(
      `Search: cache HIT for "${rawQuery}" (${Date.now() - startTime}ms)`,
    );
    return res.json({ success: true, ...cached, fromCache: true });
  }

  // Step 2: Classify intent (now with structured attributes)
  let intentResult = classifyIntent(rawQuery, rawCat);

  // Step 2b: Check learned query mappings (populated by past live fetches).
  // If we have previously fetched "safari bags" and learned brand=safari,
  // category=bags, upgrade the intent so pathB/pathA serve from cache
  // instead of hitting Amazon again.
  if (prismaClient && (!intentResult.brand || !intentResult.category)) {
    const learned = await checkLearnedMapping(prismaClient, normalized);
    if (learned) {
      const boostedCategory = learned.category || intentResult.category;
      const boostedBrand    = learned.brand    || intentResult.brand;
      // Upgrade intent so the query routes through the right path instead of
      // LOW_CONFIDENCE (which wastes resources running pathA + pathB in parallel)
      let boostedIntent = intentResult.intent;
      if (intentResult.intent === "LOW_CONFIDENCE" && boostedCategory) {
        boostedIntent = boostedBrand ? "BRAND_CATEGORY" : "CATEGORY";
      }
      intentResult = {
        ...intentResult,
        brand:      boostedBrand    || null,
        category:   boostedCategory || null,
        intent:     boostedIntent,
        confidence: intentResult.confidence < 0.55 ? 0.55 : intentResult.confidence,
      };
    }
  }
  logger.info(
    `Search: "${rawQuery}" → ${intentResult.intent} ` +
      `conf=${intentResult.confidence} cat=${intentResult.category} ` +
      `brand=${intentResult.brand} model=${intentResult.model} ` +
      `match=${intentResult.matchType}` +
      (intentResult.wasSpellingCorrected
        ? ` corrected="${intentResult.correctedQuery}"`
        : ""),
  );

  // Analytics
  logger.info(
    "ANALYTICS " +
      JSON.stringify({
        query: rawQuery,
        normalizedQuery: normalized,
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        matchType: intentResult.matchType,
        brand: intentResult.brand,
        model: intentResult.model,
        category: intentResult.category,
        wasSpellingCorrected: intentResult.wasSpellingCorrected,
        timestamp: new Date().toISOString(),
      }),
  );

  try {
    const { intent, confidence, wasSpellingCorrected, correctedQuery } =
      intentResult;
    let result;

    // Spelling correction metadata — attached to all responses
    const spellingMeta = wasSpellingCorrected
      ? { wasSpellingCorrected: true, correctedQuery }
      : { wasSpellingCorrected: false };

    if (intent === INTENT.FALLBACK || confidence < 0.3) {
      const fb = await getFallback(redis, rawQuery);
      result = makeResponse({
        ...fb,
        ...spellingMeta,
        intent: INTENT.FALLBACK,
        confidence,
        executionTimeMs: Date.now() - startTime,
      });
    } else if (intent === INTENT.LOW_CONFIDENCE) {
      const [aResult, bResult] = await Promise.all([
        pathA(redis, rawQuery, intentResult, startTime).catch(() => null),
        pathB(redis, intentResult, startTime, prismaClient, rawQuery).catch(
          () => null,
        ),
      ]);
      const winner = aResult?.primaryProduct ? aResult : bResult || aResult;
      result = {
        ...winner,
        ...spellingMeta,
        intent: INTENT.LOW_CONFIDENCE,
        confidence,
      };
    } else if (intent === INTENT.PRODUCT_SPECIFIC) {
      result = await pathA(redis, rawQuery, intentResult, startTime);
      result = { ...result, ...spellingMeta };
    } else {
      result = await pathB(
        redis,
        intentResult,
        startTime,
        prismaClient,
        rawQuery,
      );
      result = { ...result, ...spellingMeta };
    }

    if (result.status === "ready") {
      setCached(redis, cacheKey, result).catch(() => {});

      // ── Reactive sub-type cache warming (Item 6) ──────────────────────────
      // If this query maps to a sub-type (e.g. "washing machine" → washing_machine)
      // and the Redis sub-type slot is empty, fill it now from what we just fetched.
      // This means future searches for this sub-type get instant Redis hits without
      // waiting for the crons (which are currently commented out in server.js).
      if (intentResult.subType && intentResult.category && redis) {
        getSubTypeProducts(intentResult.category, intentResult.subType)
          .then((existing) => {
            if (!existing || existing.length === 0) {
              const toCache = [];
              if (result.primaryProduct) toCache.push(result.primaryProduct);
              if (result.suggestions) toCache.push(...result.suggestions);
              if (toCache.length > 0) {
                setSubTypeProducts(
                  intentResult.category,
                  intentResult.subType,
                  toCache,
                ).catch(() => {});
                logger.info(
                  `Search: warmed sub-type cache [${intentResult.category}:${intentResult.subType}]` +
                    ` with ${toCache.length} products (reactive)`,
                );
              }
            }
          })
          .catch(() => {});
      }
    }
    res.json({ success: true, query: rawQuery, ...result });
  } catch (err) {
    logger.error(`Search: "${rawQuery}": ${err.message}`);
    res
      .status(500)
      .json({ success: false, error: "Search failed. Please try again." });
  }
}

// ── JOB STATUS ENDPOINT ───────────────────────────────────────────
async function jobStatus(req, res) {
  const { jobId } = req.params;
  if (!jobId || !jobId.startsWith("bp_")) {
    return res.status(400).json({ success: false, error: "Invalid jobId" });
  }
  const redis = getClient();
  const job = await getJob(redis, jobId);
  if (!job)
    return res.status(404).json({ success: false, error: "Job not found" });
  if (job.status === "ready") {
    const norm = normalizeQuery(job.normalizedQuery || "");
    if (norm) setCached(redis, `search:${norm}`, job).catch(() => {});
  }
  res.json({ success: true, ...job });
}

// ── SUGGESTIONS ENDPOINT ──────────────────────────────────────────
async function suggestions(req, res) {
  const q = (req.query.q || "").toLowerCase().trim();
  if (q.length < 2) return res.json({ suggestions: [] });
  const all = [
    "Sony WH-1000XM5 headphones",
    "iPhone 15 Pro",
    "Samsung Galaxy S24",
    "MacBook Air M3",
    "Nike Air Max",
    "Adidas Ultraboost",
    "boAt headphones",
    "Bose QuietComfort",
    "Apple AirPods",
    "gaming mouse",
    "mechanical keyboard",
    "running shoes",
    "air fryer",
    "robot vacuum",
    "skincare serum",
    "OnePlus 12",
    "Realme GT Neo 5",
  ];
  res.json({
    suggestions: all.filter((s) => s.toLowerCase().includes(q)).slice(0, 6),
  });
}

module.exports = { search, suggestions, jobStatus, setPrisma };
