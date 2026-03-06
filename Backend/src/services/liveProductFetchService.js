// src/services/liveProductFetchService.js
// PATH A — DB Miss → Async Job Pattern (Rule 5 + Rule 6)
// 1. Respond IMMEDIATELY with { status:'fetching', jobId }
// 2. Run scrape + analysis in background
// 3. Update job status: pending → partial → ready | failed
// 4. Release Redis lock in finally block (Rule 6)
"use strict";

const logger = require("../utils/logger");
const amazonService = require("./amazonService");
const { enrichAll } = require("./productEnricher");
const { groupByProduct, aggregateGroup } = require("../utils/scorer");
const { acquireLock, releaseLock } = require("../utils/redisLock");
const { checkAndIncrement } = require("../utils/dailyCap");
const { getRelated } = require("./relatedProductService");
const { updateJob } = require("./jobStatusService");
const { normalizeQuery } = require("../utils/queryNormalizer");
const { addDynamicBrand } = require("../utils/productNameNormalizer");

let prisma = null;
function setPrisma(client) {
  prisma = client;
}

/**
 * startLiveFetch(redis, jobId, query, intentResult)
 *
 * Non-blocking — called with setImmediate so response fires first.
 * Updates job via jobStatusService throughout lifecycle.
 */
async function startLiveFetch(redis, jobId, query, intentResult) {
  const normalizedQuery = query.toLowerCase().trim();
  const startTime = Date.now();

  try {
    // ── STEP 0: Redis category-cache check ───────────────────────
    // If the product already exists in the top50 Redis cache for this
    // category, serve it immediately — skip daily cap + lock + all API calls
    if (intentResult.category) {
      try {
        const catRaw = await redis.get(`top50:${intentResult.category}`);
        if (catRaw) {
          const catProducts = JSON.parse(catRaw);
          const words = normalizedQuery.split(" ").filter((w) => w.length > 2);
          const redisHit = catProducts.find((p) => {
            if (!p.name) return false;
            const nameLow = p.name.toLowerCase();
            return (
              words.every((w) => nameLow.includes(w)) ||
              nameLow.includes(normalizedQuery.slice(0, 20))
            );
          });
          if (redisHit) {
            const related = await getRelated(
              redis,
              intentResult.category,
              null,
              redisHit.name,
            );
            await updateJob(redis, jobId, {
              status: "ready",
              primaryProduct: redisHit,
              suggestions: related,
              source: "redis_category_cache",
              intent: intentResult.intent,
              confidence: intentResult.confidence,
              executionTimeMs: Date.now() - startTime,
            });
            logger.info(
              `LiveFetch: job ${jobId} served from Redis — "${redisHit.name}"`,
            );
            return;
          }
        }
      } catch (redisErr) {
        logger.warn(
          `LiveFetch: Redis category check error: ${redisErr.message}`,
        );
      }
    }

    // ── Daily cap check ───────────────────────────────────────────
    await checkAndIncrement(redis);

    // ── Redis lock (prevent duplicate scrape) ─────────────────────
    const lockAcquired = await acquireLock(redis, normalizedQuery);
    if (!lockAcquired) {
      // Another process is already fetching — mark job as pending
      // Frontend polls until that process writes the result
      logger.info(
        `LiveFetch: lock held for "${normalizedQuery}" — job ${jobId} waiting`,
      );
      return;
    }

    try {
      // ── Tier 3: Live fetch from Amazon (only platform with data) ──
      logger.info(`LiveFetch: scraping "${query}" for job ${jobId}`);

      const [amazonRes] = await Promise.allSettled([
        amazonService.searchProducts(query, intentResult.category || ""),
      ]);

      const amazonProducts = settled(amazonRes, "Amazon");
      const allProducts = [...amazonProducts];

      // Preserve ASIN from raw Amazon results — needed for GPT-4o mini pipeline
      const primaryAsin =
        amazonProducts.find((p) => p.platformId)?.platformId || null;

      if (allProducts.length === 0) {
        await updateJob(redis, jobId, {
          status: "failed",
          executionTimeMs: Date.now() - startTime,
        });
        return;
      }

      // ── Emit partial update (raw title/price/image, no AI score) ──
      const firstRaw = allProducts[0];
      await updateJob(redis, jobId, {
        status: "partial",
        primaryProduct: {
          name: firstRaw.name,
          price: firstRaw.price,
          imageUrl: firstRaw.imageUrl,
          brand: firstRaw.brand,
        },
        executionTimeMs: Date.now() - startTime,
      });

      // ── Group + score ─────────────────────────────────────────────
      const avgPrice =
        allProducts
          .map((p) => p.price)
          .filter(Boolean)
          .reduce((a, b, _, arr) => a + b / arr.length, 0) || null;

      const groups = groupByProduct(allProducts);
      const scored = groups
        .map((g) => aggregateGroup(g, avgPrice))
        .filter((p) => p.aiScore > 0)
        .sort((a, b) => b.aiScore - a.aiScore)
        .slice(0, 10)
        .map((p, i) => ({ rank: i + 1, ...p }));

      let primary = scored[0] || null;
      const alternatives = scored.slice(1); // products 2-10

      // ── Enrich all 10: Redis → MongoDB → ScraperAPI (primary only) ───
      // For alternatives: cache-only (enrichAll scrapeLimit=0).
      // For primary: ScraperAPI allowed only if ASIN available and
      //              no cached analysis found (enrichAll scrapeLimit=1).
      let allEnriched;
      if (primary) {
        // Attach ASIN to primary so enricher can look it up
        const primaryWithAsin = primaryAsin
          ? { ...primary, asin: primaryAsin }
          : primary;
        allEnriched = await enrichAll([primaryWithAsin, ...alternatives], {
          scrapeLimit: primaryAsin ? 1 : 0,
        });
      } else {
        allEnriched = [];
      }

      primary = allEnriched[0] || null;
      const enrichedAlternatives = allEnriched.slice(1);
      let analysedCategory = intentResult.category || null;

      // Surface category from enrichment result if pipeline confirmed it
      if (primary?.confirmedCategory)
        analysedCategory = primary.confirmedCategory;

      // ── Save all enriched products to DB (non-blocking, best-effort) ──
      if (prisma) {
        for (const p of allEnriched.filter(Boolean)) {
          saveToDb(p, analysedCategory).catch((err) =>
            logger.warn(`LiveFetch: DB save failed: ${err.message}`),
          );
        }
      }

      // ── Fetch 9 related (Rule 7: category confirmed first) ────────
      // Use enriched alternatives as suggestions; fall back to top50
      const suggestions =
        enrichedAlternatives.length >= 3
          ? enrichedAlternatives
          : analysedCategory
            ? await getRelated(redis, analysedCategory, null, primary?.name)
            : [];

      // ── Mark job ready ────────────────────────────────────────────
      await updateJob(redis, jobId, {
        status: "ready",
        primaryProduct: primary,
        suggestions,
        source: "live_analysis",
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        executionTimeMs: Date.now() - startTime,
      });

      // ── Persist learned brand+category mapping ────────────────────
      // Allows future identical searches to resolve via DB instead of Amazon.
      const learnedBrand = primary?.brand || intentResult.brand || null;
      const learnedCategory = analysedCategory || intentResult.category || null;
      if (learnedBrand) {
        // Immediately register brand in runtime memory so detect works within the
        // same process without waiting for the next 6h setDynamicBrands() refresh.
        addDynamicBrand(learnedBrand);
      }
      if (prisma && (learnedBrand || learnedCategory)) {
        saveQueryMapping(query, learnedBrand, learnedCategory).catch((err) =>
          logger.warn(`LiveFetch: QueryMapping save failed: ${err.message}`),
        );
      }

      logger.info(
        `LiveFetch: job ${jobId} ready in ${Date.now() - startTime}ms`,
      );
    } finally {
      // Rule 6: ALWAYS release lock, even on error
      await releaseLock(redis, normalizedQuery);
    }
  } catch (err) {
    if (err.message === "DAILY_CAP_EXCEEDED") {
      logger.warn(`LiveFetch: daily cap exceeded — job ${jobId} failed`);
    } else {
      logger.error(`LiveFetch: job ${jobId} failed: ${err.message}`);
    }
    await updateJob(redis, jobId, {
      status: "failed",
      executionTimeMs: Date.now() - startTime,
    }).catch(() => {});
  }
}

// ── HELPERS ──────────────────────────────────────────────────────
function settled(result, platformName) {
  if (result.status === "fulfilled") {
    const items = result.value || [];
    if (items.length === 0)
      logger.warn(`LiveFetch: ${platformName} returned 0 products`);
    return items;
  }
  logger.warn(
    `LiveFetch: ${platformName} failed: ${result.reason?.message || result.reason}`,
  );
  return [];
}

async function saveToDb(product, category) {
  for (const plt of product.platforms || []) {
    try {
      const platformEnum = plt.name?.toUpperCase();
      if (!["AMAZON", "FLIPKART", "MYNTRA"].includes(platformEnum)) continue;

      // For Amazon use the real ASIN — a name-based ID causes Redis/MongoDB
      // analysis cache misses and re-runs GPT every time the product is opened.
      const platformId =
        platformEnum === "AMAZON" && product.asin
          ? product.asin
          : `${product.name.slice(0, 80)}-${plt.name}`;

      const saved = await prisma.product.upsert({
        where: { platform_platformId: { platform: platformEnum, platformId } },
        update: {
          currentPrice: plt.price || 0,
          platformRating: plt.rating || null,
          reviewCount: plt.reviewCount || 0,
          aiScore: product.aiScore,
          imageUrl: product.imageUrl || null,
          lastScored: new Date(),
          inStock: plt.inStock !== false,
          ...(category ? { category } : {}),
        },
        create: {
          name: product.name,
          brand: product.brand || null,
          category: category || null,
          imageUrl: product.imageUrl || null,
          platform: platformEnum,
          platformId,
          platformUrl: plt.url || "",
          affiliateUrl: plt.affiliateUrl || plt.url || "",
          currentPrice: plt.price || 0,
          platformRating: plt.rating || null,
          reviewCount: plt.reviewCount || 0,
          aiScore: product.aiScore,
          lastScored: new Date(),
        },
      });

      if (plt.price && plt.price > 0) {
        await prisma.priceHistory.create({
          data: { productId: saved.id, price: plt.price },
        });
      }
    } catch (e) {
      logger.warn(
        `LiveFetch DB: "${product.name}" on ${plt.name}: ${e.message}`,
      );
    }
  }
}

/**
 * saveQueryMapping(rawQuery, brand, category)
 *
 * Persists a learned brand+category association for a raw search query.
 * On conflict (same normalizedQuery), increments hitCount and updates brand/category.
 */
async function saveQueryMapping(rawQuery, brand, category) {
  if (!prisma || (!brand && !category)) return;
  const normalizedKey = normalizeQuery(rawQuery);
  if (!normalizedKey) return;

  try {
    await prisma.searchQueryMapping.upsert({
      where: { normalizedQuery: normalizedKey },
      update: {
        brand: brand || undefined,
        category: category || undefined,
        hitCount: { increment: 1 },
      },
      create: {
        normalizedQuery: normalizedKey,
        brand: brand || null,
        category: category || null,
        learnedFrom: "amazon_api",
      },
    });
    logger.info(
      `LiveFetch: learned mapping "${normalizedKey}" → brand="${brand}" category="${category}"`,
    );
  } catch (err) {
    logger.warn(`LiveFetch: saveQueryMapping error: ${err.message}`);
  }
}

module.exports = { startLiveFetch, setPrisma };
