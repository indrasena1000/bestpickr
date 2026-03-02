// src/services/productMatchService.js
// ─────────────────────────────────────────────────────────────────
// v3.0: Three-tier product matching with confidence scoring
//   1. findFromRedis()  — Redis top50 cache, instant, confidence-scored
//   2. weightedSearch() — PostgreSQL trigram (pg_trgm) fuzzy search with
//                         automatic fallback to LIKE-based search when the
//                         extension is not yet enabled. Run this in Neon SQL
//                         Editor before using trigram mode:
//
//                           CREATE EXTENSION IF NOT EXISTS pg_trgm;
//                           CREATE INDEX CONCURRENTLY IF NOT EXISTS
//                             products_name_trgm_idx ON "Product"
//                             USING GIN (name gin_trgm_ops);
//                           CREATE INDEX CONCURRENTLY IF NOT EXISTS
//                             products_brand_trgm_idx ON "Product"
//                             USING GIN (brand gin_trgm_ops);
//
//   3. findProduct()    — Legacy single-best-match (kept for compat)
//   4. findTopMatches() — Legacy multi-match
// ─────────────────────────────────────────────────────────────────
"use strict";

const logger = require("../utils/logger");
const { Prisma } = require("@prisma/client");
const { normalize } = require("../utils/productNameNormalizer");

// ── pg_trgm availability flag ─────────────────────────────────────────────
// Set to false on first failure so we stop retrying the trigram path every
// request if the extension was never enabled. Resets on server restart.
let _trigramAvailable = true;

let prisma = null;
function setPrisma(client) {
  prisma = client;
}

// ── CONFIDENCE THRESHOLDS ────────────────────────────────────────
const CONFIDENCE = {
  HIGH: 0.85, // Skip Amazon entirely
  MEDIUM: 0.6, // Use results but consider enrichment
  LOW: 0.35, // Weak match, supplement with live fetch
};

/**
 * Levenshtein distance — used for fuzzy model matching.
 */
function levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * fuzzyScore(query, candidate) → 0–1
 * Combines substring containment + Levenshtein similarity.
 */
function fuzzyScore(query, candidate) {
  if (!query || !candidate) return 0;
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (c === q) return 1.0;
  if (c.includes(q) || q.includes(c)) return 0.95;
  const dist = levenshtein(q, c);
  const maxLen = Math.max(q.length, c.length);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * computeProductConfidence(product, intentResult)
 *
 * Scores a product against the structured intent attributes.
 * Returns 0–1 confidence that this product is what the user wants.
 */
function computeProductConfidence(product, intentResult) {
  if (!product) return 0;
  const pName = (product.name || "").toLowerCase();
  const pBrand = (product.brand || "").toLowerCase();

  const { brand, model, category, capacity, features } = intentResult;
  let score = 0;
  let maxScore = 0;

  // Model match (strongest signal — 40 points)
  if (model) {
    maxScore += 40;
    const modelLow = model.toLowerCase();
    if (pName.includes(modelLow)) {
      score += 40;
    } else {
      const fuzz = fuzzyScore(modelLow, pName);
      score += Math.round(fuzz * 30); // partial model match
    }
  }

  // Brand match (25 points)
  if (brand) {
    maxScore += 25;
    if (pBrand === brand || pBrand.includes(brand) || pName.includes(brand)) {
      score += 25;
    }
  }

  // Category match (20 points)
  if (category) {
    maxScore += 20;
    const pCat = (product.category || "").toLowerCase();
    if (
      pCat === category ||
      pCat.includes(category) ||
      pName.includes(category)
    ) {
      score += 20;
    }
  }

  // Capacity match (10 points)
  if (capacity && capacity.length > 0) {
    maxScore += 10;
    for (const cap of capacity) {
      const capStr = `${cap.value}${cap.unit}`.toLowerCase();
      if (
        pName.includes(capStr) ||
        pName.includes(`${cap.value} ${cap.unit}`.toLowerCase())
      ) {
        score += 10;
        break;
      }
    }
  }

  // Feature match (5 points)
  if (features && features.length > 0) {
    maxScore += 5;
    const matched = features.filter((f) => pName.includes(f.toLowerCase()));
    if (matched.length > 0) score += 5;
  }

  if (maxScore === 0) {
    // No signals — fall back to raw name fuzzy
    const clean = intentResult.cleanQuery || "";
    return clean ? fuzzyScore(clean, pName) : 0;
  }

  return parseFloat((score / maxScore).toFixed(2));
}

// ═════════════════════════════════════════════════════════════════
// 1. REDIS CONFIDENCE MATCHER
// ═════════════════════════════════════════════════════════════════

/**
 * findFromRedis(redis, intentResult) → { products, confidence, source }
 *
 * Scans Redis top50:{category} for products matching the structured query.
 * Returns confidence-scored results. If best match ≥ 0.85, caller can
 * skip Amazon entirely.
 */
async function findFromRedis(redis, intentResult) {
  if (!redis || !intentResult.category) {
    return { products: [], confidence: 0, source: "redis_miss" };
  }

  try {
    const catRaw = await redis.get(`top50:${intentResult.category}`);
    if (!catRaw) return { products: [], confidence: 0, source: "redis_miss" };

    const catProducts = JSON.parse(catRaw);
    if (!catProducts || catProducts.length === 0) {
      return { products: [], confidence: 0, source: "redis_empty" };
    }

    // Score every product in the cache against the intent
    const scored = catProducts
      .map((p) => ({
        product: p,
        confidence: computeProductConfidence(p, intentResult),
      }))
      .filter((x) => x.confidence >= CONFIDENCE.LOW)
      .sort((a, b) => b.confidence - a.confidence);

    if (scored.length === 0) {
      return { products: [], confidence: 0, source: "redis_no_match" };
    }

    const bestConfidence = scored[0].confidence;
    const products = scored.map((x) => ({
      ...x.product,
      matchConfidence: x.confidence,
    }));

    logger.info(
      `ProductMatchSvc: Redis found ${products.length} matches ` +
        `(best="${products[0].name}" conf=${bestConfidence})`,
    );

    return {
      products,
      confidence: bestConfidence,
      source:
        bestConfidence >= CONFIDENCE.HIGH ? "redis_high" : "redis_partial",
    };
  } catch (err) {
    logger.warn(`ProductMatchSvc: Redis scan error: ${err.message}`);
    return { products: [], confidence: 0, source: "redis_error" };
  }
}

// ═════════════════════════════════════════════════════════════════
// 2. POSTGRESQL WEIGHTED SEARCH — trigram (pg_trgm) + LIKE fallback
// ═════════════════════════════════════════════════════════════════

/**
 * weightedSearchTrigram(intentResult, limit)
 *
 * Uses PostgreSQL pg_trgm similarity() to fuzzy-match product names and brands.
 * This handles:
 *   - Punctuation/spacing variants: "WH-1000XM5" ≈ "WH 1000XM5"
 *   - Partial typos:                "Redmi Note13" ≈ "Redmi Note 13 Pro"
 *   - Brand-only queries:           "sony" → all Sony products ranked by similarity
 *
 * Similarity thresholds (0–1 scale, pg_trgm):
 *   ≥ 0.55 — strong match (exact/near-exact model name)
 *   ≥ 0.35 — moderate match (brand + partial name)
 *   ≥ 0.20 — weak match (used as minimum to include in candidates)
 *
 * The raw SQL uses:
 *   GREATEST(similarity(name, $query), similarity(brand, $brand_or_query))
 * so either column can be the primary match signal.
 *
 * NOTE: $queryRaw returns column names in snake_case matching the DB schema
 * (Prisma quotes columns in double-quotes during migration). Fields are mapped
 * to camelCase for JS consumption below.
 */
async function weightedSearchTrigram(intentResult, limit = 10) {
  const { brand, model, category, cleanQuery } = intentResult;

  // Build the primary search term: prefer model > brand+cleanQuery > cleanQuery
  // Strip punctuation so "WH-1000XM5" and "WH 1000XM5" score equally
  const primaryTerm = (model || cleanQuery || brand || "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim();
  const brandTerm = (brand || primaryTerm).toLowerCase();

  if (!primaryTerm) return [];

  // Minimum similarity — below this products are clearly unrelated
  const MIN_SIM = 0.15;

  // Category filter clause: if a category was detected, restrict to it.
  // This prevents "sony headphones" from returning Sony TVs.
  // We parameterize with Prisma.sql to avoid injection.
  const categoryClause = category
    ? Prisma.sql`AND LOWER(p.category) = LOWER(${category})`
    : Prisma.sql``;

  // Main trigram query:
  //   1. Compute similarity between the search term and product name/brand
  //   2. GREATEST() means either field can be the best match signal
  //   3. Filter by MIN_SIM to keep result set manageable before JS re-ranking
  //   4. Order by trigram score DESC, then aiScore DESC as tiebreaker
  const rows = await prisma.$queryRaw`
    SELECT
      p.id,
      p.name,
      p.brand,
      p.category,
      p."imageUrl",
      p."platformId",
      p."platformUrl",
      p."affiliateUrl",
      p."currentPrice",
      p."originalPrice",
      p."aiScore",
      p."lastScored",
      p."inStock",
      p.platform,
      p."productGroupId",
      p."reviewCount",
      p."platformRating",
      p."createdAt",
      p."updatedAt",
      GREATEST(
        similarity(p.name,  ${primaryTerm}),
        similarity(p.brand, ${brandTerm})
      ) AS sim
    FROM "Product" p
    WHERE
      GREATEST(
        similarity(p.name,  ${primaryTerm}),
        similarity(p.brand, ${brandTerm})
      ) >= ${MIN_SIM}
      ${categoryClause}
    ORDER BY sim DESC, p."aiScore" DESC NULLS LAST
    LIMIT ${limit * 5}
  `;

  return rows;
}

/**
 * weightedSearch(intentResult, limit) → { products, confidence, source }
 *
 * Primary path: pg_trgm trigram similarity (fast, fuzzy, index-backed).
 * Automatic fallback: if pg_trgm is not enabled, falls back to the original
 * LIKE-based search so nothing breaks during the Neon migration window.
 *
 * After fetching candidates either way, re-scores with computeProductConfidence()
 * (structured signals: model, brand, category, capacity, features) to produce
 * the final confidence-gated result.
 */
async function weightedSearch(intentResult, limit = 10) {
  if (!prisma) {
    logger.warn(
      "ProductMatchSvc: prisma not injected — skipping weightedSearch",
    );
    return { products: [], confidence: 0, source: "db_miss" };
  }

  const { brand, model, category, capacity, cleanQuery } = intentResult;
  if (!cleanQuery && !model && !brand) {
    return { products: [], confidence: 0, source: "db_no_query" };
  }

  let candidates = [];
  let searchPath = "trigram";

  // ── Try trigram first ─────────────────────────────────────────────
  if (_trigramAvailable) {
    try {
      const rows = await weightedSearchTrigram(intentResult, limit);
      // $queryRaw returns plain objects — map to standard Prisma shape for
      // downstream code (formatForResponse, computeProductConfidence, etc.)
      candidates = rows.map((r) => ({
        id: r.id,
        name: r.name,
        brand: r.brand,
        category: r.category,
        imageUrl: r.imageUrl,
        platformId: r.platformId,
        platformUrl: r.platformUrl,
        affiliateUrl: r.affiliateUrl,
        currentPrice:
          r.currentPrice !== undefined ? Number(r.currentPrice) : null,
        originalPrice:
          r.originalPrice !== undefined ? Number(r.originalPrice) : null,
        aiScore: r.aiScore !== undefined ? Number(r.aiScore) : null,
        lastScored: r.lastScored,
        inStock: r.inStock,
        platform: r.platform,
        productGroupId: r.productGroupId,
        reviewCount: r.reviewCount !== undefined ? Number(r.reviewCount) : 0,
        platformRating:
          r.platformRating !== undefined ? Number(r.platformRating) : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        _trigramSim: r.sim !== undefined ? Number(r.sim) : 0,
      }));
      logger.info(
        `ProductMatchSvc: trigram fetched ${candidates.length} candidates ` +
          `for "${cleanQuery || model || brand}" (best sim=${candidates[0]?._trigramSim?.toFixed(3) ?? "n/a"})`,
      );
    } catch (err) {
      // pg_trgm not installed — disable for this server process lifetime and fall through
      if (
        err.message?.includes("similarity") ||
        err.message?.includes("operator does not exist")
      ) {
        _trigramAvailable = false;
        logger.warn(
          "ProductMatchSvc: pg_trgm not enabled — falling back to LIKE search. " +
            "Run in Neon SQL Editor: CREATE EXTENSION IF NOT EXISTS pg_trgm;",
        );
      } else {
        logger.error(`ProductMatchSvc: trigram error: ${err.message}`);
      }
    }
  }

  // ── Fallback: LIKE-based search (original v2.0 logic) ─────────────
  if (candidates.length === 0) {
    searchPath = "like";
    try {
      const conditions = [];
      if (model)
        conditions.push({ name: { contains: model, mode: "insensitive" } });
      if (brand) {
        if (model)
          conditions.push({
            AND: [
              { brand: { equals: brand, mode: "insensitive" } },
              { name: { contains: model, mode: "insensitive" } },
            ],
          });
        if (category)
          conditions.push({
            AND: [
              { brand: { equals: brand, mode: "insensitive" } },
              { category: { equals: category, mode: "insensitive" } },
            ],
          });
        conditions.push({ brand: { contains: brand, mode: "insensitive" } });
      }
      if (category)
        conditions.push({
          category: { equals: category, mode: "insensitive" },
        });
      if (cleanQuery) {
        const words = cleanQuery.split(" ").filter((w) => w.length > 2);
        for (const w of words.slice(0, 3)) {
          conditions.push({ name: { contains: w, mode: "insensitive" } });
        }
      }
      if (conditions.length > 0) {
        candidates = await prisma.product.findMany({
          where: { OR: conditions },
          orderBy: { aiScore: "desc" },
          take: 50,
        });
      }
    } catch (err) {
      logger.error(`ProductMatchSvc: LIKE fallback error: ${err.message}`);
      return { products: [], confidence: 0, source: "db_error" };
    }
  }

  if (candidates.length === 0) {
    logger.info(
      `ProductMatchSvc: weightedSearch — no candidates for "${cleanQuery || model}"`,
    );
    return { products: [], confidence: 0, source: "db_empty" };
  }

  // ── Re-rank with structured confidence scoring ─────────────────────
  // computeProductConfidence uses model/brand/category/capacity/feature signals
  // on top of what the DB already filtered — gives a final 0–1 confidence score.
  const scored = candidates
    .map((p) => ({
      product: p,
      confidence: computeProductConfidence(p, intentResult),
    }))
    .filter((x) => x.confidence >= CONFIDENCE.LOW)
    .sort((a, b) =>
      b.confidence !== a.confidence
        ? b.confidence - a.confidence
        : (b.product.aiScore || 0) - (a.product.aiScore || 0),
    )
    .slice(0, limit);

  if (scored.length === 0) {
    return { products: [], confidence: 0, source: "db_below_threshold" };
  }

  const bestConfidence = scored[0].confidence;
  const products = scored.map((x) => x.product);

  logger.info(
    `ProductMatchSvc: weightedSearch [${searchPath}] found ${products.length} matches ` +
      `(best="${products[0].name}" conf=${bestConfidence})`,
  );

  return {
    products,
    confidence: bestConfidence,
    source:
      bestConfidence >= CONFIDENCE.HIGH
        ? `db_high_${searchPath}`
        : `db_partial_${searchPath}`,
  };
}

// ═════════════════════════════════════════════════════════════════
// 3. LEGACY COMPAT — findProduct, findTopMatches
// ═════════════════════════════════════════════════════════════════

/**
 * findProduct(rawQuery) → { product, score } | null
 */
async function findProduct(rawQuery) {
  if (!prisma) return null;
  const { brand, model, normalized } = normalize(rawQuery);
  if (!normalized) return null;

  try {
    const exact = await prisma.product.findFirst({
      where: {
        name: { contains: model || normalized, mode: "insensitive" },
        ...(brand ? { brand: { equals: brand, mode: "insensitive" } } : {}),
      },
      orderBy: { aiScore: "desc" },
    });

    if (exact) {
      const score = fuzzyScore(normalized, exact.name);
      if (score >= 0.5) return { product: exact, score, source: "db_exact" };
    }

    const candidates = await prisma.product.findMany({
      where: {
        OR: [
          ...(brand
            ? [{ brand: { contains: brand, mode: "insensitive" } }]
            : []),
          ...(model
            ? [{ name: { contains: model, mode: "insensitive" } }]
            : []),
        ],
      },
      orderBy: { aiScore: "desc" },
      take: 20,
    });

    if (candidates.length === 0) return null;

    const scored = candidates
      .map((p) => ({ product: p, score: fuzzyScore(normalized, p.name) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best.score < CONFIDENCE.LOW) return null;
    return { ...best, source: "db_fuzzy" };
  } catch (err) {
    logger.error(`ProductMatchSvc: findProduct error: ${err.message}`);
    return null;
  }
}

/**
 * findTopMatches(rawQuery, limit) → Product[]
 */
async function findTopMatches(rawQuery, limit = 10) {
  if (!prisma) return [];
  const { brand, model, normalized } = normalize(rawQuery);
  if (!normalized) return [];

  try {
    const firstWord = normalized.split(" ")[0] || normalized;
    const candidates = await prisma.product.findMany({
      where: {
        OR: [
          ...(brand
            ? [{ brand: { contains: brand, mode: "insensitive" } }]
            : []),
          ...(model
            ? [{ name: { contains: model, mode: "insensitive" } }]
            : []),
          { name: { contains: firstWord, mode: "insensitive" } },
        ],
      },
      orderBy: { aiScore: "desc" },
      take: 50,
    });

    if (candidates.length === 0) return [];

    return candidates
      .map((p) => ({ product: p, score: fuzzyScore(normalized, p.name) }))
      .filter((x) => x.score >= 0.25)
      .sort((a, b) =>
        b.score !== a.score
          ? b.score - a.score
          : (b.product.aiScore || 0) - (a.product.aiScore || 0),
      )
      .slice(0, limit)
      .map((x) => x.product);
  } catch (err) {
    logger.error(`ProductMatchSvc: findTopMatches error: ${err.message}`);
    return [];
  }
}

/**
 * isStale(product) → bool
 * Returns true if product's analysis is older than 7 days.
 */
function isStale(product) {
  if (!product?.lastScored) return true;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(product.lastScored).getTime() > sevenDaysMs;
}

/**
 * formatForResponse(product) → unified response object
 */
function formatForResponse(product) {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    price: product.currentPrice,
    category: product.category,
    rankingScore: product.aiScore,
    affiliateLink: product.affiliateUrl || product.platformUrl,
    imageUrl: product.imageUrl,
    analysedAt: product.lastScored,
    platform: product.platform,
  };
}

module.exports = {
  findProduct,
  findTopMatches,
  weightedSearch,
  findFromRedis,
  isStale,
  formatForResponse,
  setPrisma,
  computeProductConfidence,
  CONFIDENCE,
};
