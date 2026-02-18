// src/agents/rankingAgent.js — bestpickr AI Ranking Agent
// ─────────────────────────────────────────────────────────────────
// THIS IS THE BRAIN OF BESTPICKR.
//
// The agent:
//   1. Receives a search query + category
//   2. Fires parallel API calls to Amazon, Flipkart, Myntra
//   3. Aggregates duplicate products across platforms
//   4. Calculates AI score for each product
//   5. Ranks them top 10
//   6. Saves to database (cache)
//   7. Returns ranked results
//
// DESIGN PATTERN: Agent Pattern
//   The agent is autonomous — it decides which platforms to query,
//   handles failures gracefully (if Amazon is down, still returns
//   Flipkart results), and caches results to avoid redundant work.
// ─────────────────────────────────────────────────────────────────
const { PrismaClient } = require("@prisma/client");
const pLimit = require("p-limit");
const amazonService = require("../services/amazonService");
const flipkartService = require("../services/flipkartService");
const myntraService = require("../services/myntraService");
const { groupByProduct, aggregateGroup } = require("../utils/scorer");
const logger = require("../utils/logger");
// import pLimit from "p-limit";

const prisma = new PrismaClient();

// Limit concurrent requests to avoid overwhelming APIs
const limit = pLimit(3);

// ── MAIN AGENT FUNCTION ───────────────────────────────────────────
/**
 * Search and rank products across all platforms.
 *
 * @param {string} query    - User search query
 * @param {string} category - Product category
 * @returns {Array}         - Top 10 ranked products
 */
async function runSearchAgent(query, category = "") {
  const startTime = Date.now();
  logger.info(`🤖 Agent started: query="${query}" category="${category}"`);

  // ── STEP 1: Check cache first ─────────────────────────────────
  const cached = await checkCache(query, category);
  if (cached) {
    logger.info(`⚡ Cache hit for "${query}" — ${Date.now() - startTime}ms`);
    return { results: cached, fromCache: true };
  }

  // ── STEP 2: Fire all platform APIs in PARALLEL ────────────────
  // Promise.allSettled means: even if one API fails,
  // we still get results from the others.
  logger.info(`📡 Calling all platform APIs in parallel...`);

  const [amazonResult, flipkartResult, myntraResult] = await Promise.allSettled(
    [
      limit(() => amazonService.searchProducts(query, category)),
      limit(() => flipkartService.searchProducts(query, category)),
      limit(() => myntraService.searchProducts(query, category)),
    ],
  );

  // Extract results, log any failures
  const amazonProducts = extractSettled(amazonResult, "Amazon");
  const flipkartProducts = extractSettled(flipkartResult, "Flipkart");
  const myntraProducts = extractSettled(myntraResult, "Myntra");

  const allProducts = [
    ...amazonProducts,
    ...flipkartProducts,
    ...myntraProducts,
  ];
  logger.info(
    `📦 Total raw products: ${allProducts.length} (Amazon:${amazonProducts.length} Flipkart:${flipkartProducts.length} Myntra:${myntraProducts.length})`,
  );

  if (allProducts.length === 0) {
    logger.warn(`⚠️ No products found for "${query}"`);
    return { results: [], fromCache: false };
  }

  // ── STEP 3: Calculate category average price ──────────────────
  // Used in the "value for money" scoring component
  const prices = allProducts.map((p) => p.price).filter(Boolean);
  const avgCategoryPrice = prices.length
    ? prices.reduce((a, b) => a + b, 0) / prices.length
    : null;

  // ── STEP 4: Group same products across platforms ──────────────
  // e.g., Sony WH-1000XM5 appears on Amazon AND Flipkart
  // Group them so we compare cross-platform pricing
  const groups = groupByProduct(allProducts);
  logger.info(`🔗 Grouped into ${groups.length} unique products`);

  // ── STEP 5: Score and rank each product ──────────────────────
  const scored = groups
    .map((group) => aggregateGroup(group, avgCategoryPrice))
    .sort((a, b) => b.aiScore - a.aiScore) // Sort by AI score descending
    .slice(0, 10) // Top 10 only
    .map((product, index) => ({
      rank: index + 1,
      ...product,
    }));

  logger.info(
    `🏆 Top 10 ranked. #1: "${scored[0]?.name}" (${scored[0]?.aiScore})`,
  );

  // ── STEP 6: Save to DB (cache + product storage) ─────────────
  // Run async — don't block the response
  saveResultsToDb(query, category, scored).catch((err) =>
    logger.error("DB save error:", err.message),
  );

  const elapsed = Date.now() - startTime;
  logger.info(`✅ Agent complete in ${elapsed}ms`);

  return {
    results: scored,
    fromCache: false,
    elapsed_ms: elapsed,
    platforms: {
      amazon: amazonProducts.length,
      flipkart: flipkartProducts.length,
      myntra: myntraProducts.length,
    },
  };
}

// ── CACHE CHECK ───────────────────────────────────────────────────
async function checkCache(query, category) {
  try {
    const cacheKey = query.toLowerCase().trim();
    const entry = await prisma.searchCache.findUnique({
      where: { query_category: { query: cacheKey, category: category || "" } },
    });

    if (entry && new Date() < new Date(entry.expiresAt)) {
      // Increment hit count
      await prisma.searchCache.update({
        where: { id: entry.id },
        data: { hitCount: { increment: 1 } },
      });
      return entry.resultJson;
    }

    // Expired cache — delete it
    if (entry) {
      await prisma.searchCache.delete({ where: { id: entry.id } });
    }
  } catch (err) {
    logger.warn("Cache check failed:", err.message);
  }
  return null;
}

// ── SAVE RESULTS TO DB ────────────────────────────────────────────
async function saveResultsToDb(query, category, results) {
  const ttlSeconds = parseInt(process.env.CACHE_TTL_SECONDS) || 3600;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  // Save search cache
  await prisma.searchCache.upsert({
    where: {
      query_category: {
        query: query.toLowerCase().trim(),
        category: category || "",
      },
    },
    update: { resultJson: results, expiresAt, hitCount: 1 },
    create: {
      query: query.toLowerCase().trim(),
      category: category || "",
      resultJson: results,
      expiresAt,
    },
  });

  // Save individual products + price history
  for (const product of results) {
    for (const plt of product.platforms) {
      try {
        const existing = await prisma.product.upsert({
          where: {
            platform_platformId: {
              platform: plt.name.toUpperCase(),
              platformId: `${product.name}-${plt.name}`,
            },
          },
          update: {
            currentPrice: plt.price || 0,
            platformRating: plt.rating,
            reviewCount: plt.reviewCount || 0,
            aiScore: product.aiScore,
            lastScored: new Date(),
          },
          create: {
            name: product.name,
            brand: product.brand,
            category: category,
            platform: plt.name.toUpperCase(),
            platformId: `${product.name}-${plt.name}`,
            platformUrl: plt.url || "",
            currentPrice: plt.price || 0,
            platformRating: plt.rating,
            reviewCount: plt.reviewCount || 0,
            aiScore: product.aiScore,
            lastScored: new Date(),
          },
        });

        // Record price history
        if (plt.price) {
          await prisma.priceHistory.create({
            data: { productId: existing.id, price: plt.price },
          });
        }
      } catch (e) {
        // Non-fatal — continue with other products
        logger.warn(
          `Product save failed for ${product.name} on ${plt.name}:`,
          e.message,
        );
      }
    }
  }
}

// ── HELPER ────────────────────────────────────────────────────────
function extractSettled(result, platformName) {
  if (result.status === "fulfilled") return result.value || [];
  logger.warn(`${platformName} API failed:`, result.reason?.message);
  return [];
}

module.exports = { runSearchAgent };
