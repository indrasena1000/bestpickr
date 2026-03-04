// src/services/backgroundCategoryEnricher.js
// ─────────────────────────────────────────────────────────────────
// Non-blocking background job that enriches a category's product pool.
//
// Triggered when getRelated() finds < N results after all DB checks.
// Never blocks the user response — always fires via setImmediate.
//
// Flow:
//   1. Acquire category-level Redis lock (prevent duplicate jobs)
//   2. Search top platforms for category products (Amazon + Flipkart)
//   3. Group → score → save to PostgreSQL (up to 15 products)
//   4. Rebuild Redis top50:{category} key with updated DB data
//   5. Release lock
// ─────────────────────────────────────────────────────────────────
"use strict";

const logger = require("../utils/logger");

const amazonService = require("./amazonService");
// Flipkart disabled for Amazon-only launch mode
// const flipkartService = require('./flipkartService')
const { groupByProduct, aggregateGroup } = require("../utils/scorer");
const { acquireLock, releaseLock } = require("../utils/redisLock");

const ENRICH_LOCK_PREFIX = "cat_enrich:";
const ENRICH_SNAPSHOT_TTL = 21600; // 6h — matches rankingSnapshotCron
const MAX_PRODUCTS_SAVE = 15;
const MIN_AI_SCORE = 5.0; // Only store reasonably-scored items

let prisma = null;
function setPrisma(client) {
  prisma = client;
}

// ── MAIN: triggerCategoryEnrichment ──────────────────────────────
/**
 * Fire-and-forget: enrich a category's product pool in the background.
 * Safe to call from any hot path — returns immediately.
 *
 * @param {Object} redis   — ioredis client
 * @param {string} category — canonical category slug e.g. 'headphones'
 * @param {string} [hint]  — optional search query hint e.g. 'best headphones'
 */
function triggerCategoryEnrichment(redis, category, hint) {
  if (!redis || !category) return;
  setImmediate(() =>
    _runEnrichment(redis, category, hint).catch((err) =>
      logger.error(
        `BgEnricher: unhandled error for "${category}": ${err.message}`,
      ),
    ),
  );
}

async function _runEnrichment(redis, category, hint) {
  const lockKey = `${ENRICH_LOCK_PREFIX}${category}`;

  // Check lock — skip if already enriching this category
  const locked = await acquireLock(redis, lockKey);
  if (!locked) {
    logger.info(`BgEnricher: "${category}" already being enriched — skipping`);
    return;
  }

  const start = Date.now();
  logger.info(`BgEnricher: starting enrichment for category "${category}"`);

  try {
    const query = hint || `best ${category}`;

    // Amazon-only mode for launch week — Flipkart re-enable later
    const [amzRes] = await Promise.allSettled([
      amazonService.searchProducts(query, category),
    ]);

    const amzProducts = amzRes.status === "fulfilled" ? amzRes.value || [] : [];

    if (amzRes.status === "rejected")
      logger.warn(
        `BgEnricher: Amazon failed for "${category}": ${amzRes.reason?.message}`,
      );

    const allProducts = [...amzProducts];

    if (allProducts.length === 0) {
      logger.warn(
        `BgEnricher: 0 products fetched for "${category}" — aborting`,
      );
      return;
    }

    const avgPrice =
      allProducts
        .map((p) => p.price)
        .filter(Boolean)
        .reduce((a, b, _, arr) => a + b / arr.length, 0) || null;

    const groups = groupByProduct(allProducts);
    const scored = groups
      .map((g) => aggregateGroup(g, avgPrice))
      .filter((p) => p.aiScore >= MIN_AI_SCORE)
      .sort((a, b) => b.aiScore - a.aiScore)
      .slice(0, MAX_PRODUCTS_SAVE);

    logger.info(`BgEnricher: "${category}" scored ${scored.length} products`);

    // ── Save to PostgreSQL ──────────────────────────────────────
    if (prisma && scored.length > 0) {
      await _saveProductsBatch(scored, category);
    }

    // ── Rebuild Redis top50:{category} ─────────────────────────
    await _rebuildRedisSnapshot(redis, category);

    logger.info(
      `BgEnricher: "${category}" enriched in ${Date.now() - start}ms — ${scored.length} products processed`,
    );
  } catch (err) {
    logger.error(`BgEnricher: "${category}" failed: ${err.message}`);
  } finally {
    await releaseLock(redis, lockKey);
  }
}

// ── Batch save to PostgreSQL ──────────────────────────────────────
async function _saveProductsBatch(products, category) {
  let saved = 0;
  for (const product of products) {
    for (const plt of product.platforms || []) {
      try {
        const platformEnum = (plt.name || "").toUpperCase();
        if (!["AMAZON", "FLIPKART", "MYNTRA"].includes(platformEnum)) continue;

        const platformId = `${product.name.slice(0, 80)}-${plt.name}`;

        await prisma.product.upsert({
          where: {
            platform_platformId: { platform: platformEnum, platformId },
          },
          update: {
            currentPrice: plt.price || 0,
            platformRating: plt.rating || null,
            reviewCount: plt.reviewCount || 0,
            aiScore: product.aiScore,
            imageUrl: product.imageUrl || null,
            lastScored: new Date(),
            inStock: plt.inStock !== false,
            category,
          },
          create: {
            name: product.name,
            brand: product.brand || null,
            category,
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
        saved++;
      } catch (err) {
        logger.warn(`BgEnricher DB: "${product.name}": ${err.message}`);
      }
    }
  }
  logger.info(`BgEnricher: saved/updated ${saved} DB rows for "${category}"`);
}

// ── Rebuild Redis top50:{category} from DB ────────────────────────
async function _rebuildRedisSnapshot(redis, category) {
  if (!prisma) return;
  try {
    const products = await prisma.product.findMany({
      where: { category, inStock: true },
      orderBy: { aiScore: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        brand: true,
        category: true,
        imageUrl: true,
        currentPrice: true,
        platformRating: true,
        reviewCount: true,
        aiScore: true,
        affiliateUrl: true,
        platformUrl: true,
        platform: true,
        platformId: true,
      },
    });

    if (products.length === 0) return;

    const snapshot = products.map((p, i) => ({
      id: p.id,
      rank: i + 1,
      name: p.name,
      brand: p.brand,
      category: p.category,
      imageUrl: p.imageUrl,
      price: p.currentPrice,
      rankingScore: p.aiScore,
      aiScore: p.aiScore,
      rating: p.platformRating,
      reviewCount: p.reviewCount,
      affiliateLink: p.affiliateUrl || p.platformUrl,
      asin: p.platform === "AMAZON" ? p.platformId : null,
    }));

    await redis.set(
      `top50:${category}`,
      JSON.stringify(snapshot),
      "EX",
      ENRICH_SNAPSHOT_TTL,
    );
    logger.info(
      `BgEnricher: Redis top50:${category} updated with ${snapshot.length} products`,
    );
  } catch (err) {
    logger.warn(
      `BgEnricher: Redis rebuild failed for "${category}": ${err.message}`,
    );
  }
}

module.exports = { triggerCategoryEnrichment, setPrisma };
