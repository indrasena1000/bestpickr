// // src/agents/rankingAgent.js — bestpickr AI Ranking Agent
// // ─────────────────────────────────────────────────────────────────
// // 3-TIER CACHE ARCHITECTURE:
// //
// //   Tier 1 — Search Cache (Redis, 6h TTL)
// //     Exact-match on normalized query + category.
// //     "best sony headphones" and "sony headphones" → same key.
// //     Cheapest to serve: 0 ScraperAPI credits.
// //
// //   Tier 2 — Category Cache (Redis, cron-preloaded at 12 AM IST)
// //     If no search cache hit, check if we have preloaded data
// //     for the category (e.g., "headphones", "smartphones").
// //     Also 0 credits — data was preloaded during off-hours.
// //
// //   Tier 3 — Live Scrape (ScraperAPI + Amazon PA5 API)
// //     Only when both caches miss. Costs 1-2 credits per search.
// //     Results get cached in Tier 1 for next 6 hours.
// //
// // FLOW:
// //   1. Check search-specific Redis cache (normalized key)
// //   2. If miss → check category cache (cron-preloaded)
// //   3. If miss → call all 3 platform APIs in parallel
// //   4. Score + rank results
// //   5. Cache in Redis (non-blocking)
// //   6. Save to PostgreSQL for long-term data (non-blocking)
// // ─────────────────────────────────────────────────────────────────
// 'use strict'

// const pLimit          = require('p-limit')
// const amazonService   = require('../services/amazonService')
// const flipkartService = require('../services/flipkartService')
// const myntraService   = require('../services/myntraService')
// const { groupByProduct, aggregateGroup } = require('../utils/scorer')
// const { getCachedResults, cacheResults, getCategoryCache } = require('../utils/redis')
// const { CATEGORIES }  = require('../cron/categoryPreloader')
// const logger          = require('../utils/logger')

// // FIX 1: prisma is injected from server.js via setPrisma()
// // Never create new PrismaClient() here — use the shared instance
// let prisma = null

// function setPrisma(client) {
//   prisma = client
//   logger.info('rankingAgent: prisma client injected ✅')
// }

// // Limit concurrent platform API calls (don't hammer services)
// const limit = pLimit(3)

// // ── CATEGORY DETECTION ──────────────────────────────────────────
// // Maps user query keywords → category slugs for Tier 2 cache lookup.
// // If the route already provides a category, we use that directly.
// // Otherwise, we try to detect it from the query text.
// const CATEGORY_KEYWORDS = {
//   headphones:  ['headphone', 'earphone', 'earbuds', 'earbud', 'headset', 'tws', 'neckband', 'airpods'],
//   smartphones: ['phone', 'mobile', 'smartphone', 'iphone', 'samsung galaxy', 'oneplus', 'pixel'],
//   laptops:     ['laptop', 'macbook', 'notebook', 'chromebook'],
//   appliances:  ['appliance', 'mixer', 'grinder', 'microwave', 'oven', 'toaster', 'blender', 'juicer'],
//   gaming:      ['gaming', 'controller', 'gamepad', 'console', 'playstation', 'xbox'],
//   footwear:    ['shoe', 'sneaker', 'sandal', 'slipper', 'boot', 'running shoe', 'trainer'],
//   skincare:    ['skincare', 'serum', 'sunscreen', 'moisturizer', 'cleanser', 'face wash', 'toner'],
//   fashion:     ['shirt', 'tshirt', 't-shirt', 'jeans', 'kurta', 'dress', 'jacket', 'hoodie'],
//   books:       ['book', 'novel', 'textbook', 'fiction', 'non-fiction'],
//   cameras:     ['camera', 'dslr', 'mirrorless', 'gopro', 'webcam', 'lens'],
// }

// function detectCategory(query, category) {
//   // If route already provides category, use it
//   if (category) {
//     const slug = category.toLowerCase().trim()
//     if (CATEGORIES.some(c => c.slug === slug)) return slug
//   }
//   // Try to detect from query text
//   const q = query.toLowerCase()
//   for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
//     if (keywords.some(kw => q.includes(kw))) return slug
//   }
//   return null
// }

// // ── MAIN AGENT ────────────────────────────────────────────────────
// async function runSearchAgent(query, category = '') {
//   const startTime = Date.now()
//   logger.info(`Agent: query="${query}" category="${category}"`)

//   // ── TIER 1: Search-specific Redis cache ─────────────────────────
//   // Normalized key: "best sony headphones" → same key as "sony headphones"
//   try {
//     const cached = await getCachedResults(query, category)
//     if (cached && cached.length > 0) {
//       logger.info(`Agent: Tier 1 HIT (search cache) for "${query}" in ${Date.now() - startTime}ms`)
//       return { results: cached, fromCache: true, source: 'search_cache' }
//     }
//   } catch (cacheErr) {
//     logger.warn(`Agent: Tier 1 check failed: ${cacheErr.message} — continuing`)
//   }

//   // ── TIER 2: Category cache (cron-preloaded at 12 AM IST) ───────
//   // If the query maps to a known category, serve preloaded data.
//   // This avoids scraping for common category-level queries.
//   const detectedCategory = detectCategory(query, category)
//   if (detectedCategory) {
//     try {
//       const categoryResults = await getCategoryCache(detectedCategory)
//       if (categoryResults && categoryResults.length > 0) {
//         logger.info(
//           `Agent: Tier 2 HIT (category cache "${detectedCategory}") → ` +
//           `${categoryResults.length} products in ${Date.now() - startTime}ms`
//         )
//         // Cache this as a search result too, so next identical query hits Tier 1
//         cacheResults(query, category, categoryResults).catch(err =>
//           logger.warn(`Agent: Tier 2→1 promotion failed: ${err.message}`)
//         )
//         return { results: categoryResults, fromCache: true, source: 'category_cache' }
//       }
//     } catch (catErr) {
//       logger.warn(`Agent: Tier 2 check failed: ${catErr.message} — continuing to live scrape`)
//     }
//   }

//   // ── TIER 3: Live scrape (costs ScraperAPI credits) ──────────────
//   // Both caches missed — call all platform APIs in parallel.
//   // Promise.allSettled = if one fails, others still return results.
//   logger.info(`Agent: Tier 3 — live scraping all platforms for "${query}"...`)

//   const [amazonResult, flipkartResult, myntraResult] = await Promise.allSettled([
//     limit(() => amazonService.searchProducts(query, category)),
//     limit(() => flipkartService.searchProducts(query, category)),
//     limit(() => myntraService.searchProducts(query, category)),
//   ])

//   const amazonProducts   = extractSettled(amazonResult,   'Amazon')
//   const flipkartProducts = extractSettled(flipkartResult, 'Flipkart')
//   const myntraProducts   = extractSettled(myntraResult,   'Myntra')

//   const allProducts = [...amazonProducts, ...flipkartProducts, ...myntraProducts]

//   logger.info(
//     `Agent: raw products: ${allProducts.length} ` +
//     `(Amazon:${amazonProducts.length} Flipkart:${flipkartProducts.length} Myntra:${myntraProducts.length})`
//   )

//   // FIX 3: If ALL platforms return empty, something is wrong
//   // Log a clear warning so the developer knows immediately
//   if (allProducts.length === 0) {
//     logger.warn(`Agent: ⚠️  ALL platforms returned 0 products for "${query}"`)
//     logger.warn('Agent: Check ScraperAPI key, Amazon API keys, and network connectivity')
//     return { results: [], fromCache: false, error: 'no_products_found' }
//   }

//   // ── STEP 3: Category average price (for value scoring) ─────────
//   const prices = allProducts.map(p => p.price).filter(Boolean)
//   const avgCategoryPrice = prices.length
//     ? prices.reduce((a, b) => a + b, 0) / prices.length
//     : null

//   // ── STEP 4: Group same product across platforms ───────────────
//   // Sony WH-1000XM5 on Amazon + Flipkart → one group
//   const groups = groupByProduct(allProducts)
//   logger.info(`Agent: grouped into ${groups.length} unique products`)

//   // ── STEP 5: Score and rank ────────────────────────────────────
//   const scored = groups
//     .map(group => aggregateGroup(group, avgCategoryPrice))
//     .filter(p => p.aiScore > 0)
//     .sort((a, b) => b.aiScore - a.aiScore)
//     .slice(0, 10)
//     .map((product, index) => ({ rank: index + 1, ...product }))

//   logger.info(`Agent: ranked ${scored.length} products. #1: "${scored[0]?.name}" score=${scored[0]?.aiScore}`)

//   // ── STEP 6: Cache in Redis → Tier 1 for next time (non-blocking)
//   cacheResults(query, category, scored).catch(err =>
//     logger.error(`Agent: Redis cache save failed: ${err.message}`)
//   )

//   // ── STEP 7: Persist to PostgreSQL for long-term data (non-blocking)
//   if (prisma) {
//     saveProductsToDb(query, category, scored).catch(err =>
//       // FIX 2: Full error message — was previously "DB save error:" with nothing after
//       logger.error(`Agent: DB save error: ${err.message} | code: ${err.code} | ${err.stack?.split('\n')[1]?.trim()}`)
//     )
//   } else {
//     logger.warn('Agent: prisma not injected — skipping DB save (call setPrisma() from server.js)')
//   }

//   const elapsed = Date.now() - startTime
//   logger.info(`Agent: complete in ${elapsed}ms`)

//   return {
//     results:    scored,
//     fromCache:  false,
//     source:     'live_scrape',
//     elapsed_ms: elapsed,
//     platforms: {
//       amazon:   amazonProducts.length,
//       flipkart: flipkartProducts.length,
//       myntra:   myntraProducts.length,
//     },
//   }
// }

// // ── SAVE TO POSTGRESQL ────────────────────────────────────────────
// // Persists products + price history for long-term data.
// // Redis handles speed; PostgreSQL handles durability and price tracking.
// // This runs async and never blocks the search response.
// async function saveProductsToDb(query, category, results) {
//   let savedCount = 0

//   for (const product of results) {
//     for (const plt of product.platforms) {
//       try {
//         // Ensure platform name matches Prisma enum: AMAZON | FLIPKART | MYNTRA
//         const platformEnum = plt.name.toUpperCase()
//         if (!['AMAZON', 'FLIPKART', 'MYNTRA'].includes(platformEnum)) {
//           logger.warn(`Agent DB: skipping unknown platform "${plt.name}"`)
//           continue
//         }

//         const platformId = `${product.name.slice(0, 80)}-${plt.name}`

//         const saved = await prisma.product.upsert({
//           where: {
//             platform_platformId: { platform: platformEnum, platformId },
//           },
//           update: {
//             currentPrice:   plt.price   || 0,
//             platformRating: plt.rating  || null,
//             reviewCount:    plt.reviewCount || 0,
//             aiScore:        product.aiScore,
//             imageUrl:       product.imageUrl || null,   // FIX: was missing in old code
//             lastScored:     new Date(),
//             inStock:        plt.inStock !== false,
//           },
//           create: {
//             name:           product.name,
//             brand:          product.brand    || null,
//             category:       category         || null,
//             imageUrl:       product.imageUrl || null,
//             platform:       platformEnum,
//             platformId,
//             platformUrl:    plt.url          || '',
//             affiliateUrl:   plt.url          || '',
//             currentPrice:   plt.price        || 0,
//             platformRating: plt.rating       || null,
//             reviewCount:    plt.reviewCount  || 0,
//             aiScore:        product.aiScore,
//             lastScored:     new Date(),
//           },
//         })

//         // Price history: only record if we have a real price
//         if (plt.price && plt.price > 0) {
//           await prisma.priceHistory.create({
//             data: { productId: saved.id, price: plt.price },
//           })
//         }

//         savedCount++
//       } catch (e) {
//         // FIX 2: Log actual error details — was previously silent
//         logger.warn(`Agent DB: product save failed for "${product.name}" on ${plt.name}: ${e.message}`)
//       }
//     }
//   }

//   if (savedCount > 0) {
//     logger.info(`Agent DB: saved ${savedCount} product-platform records`)
//   }
// }

// // ── HELPER ────────────────────────────────────────────────────────
// function extractSettled(result, platformName) {
//   if (result.status === 'fulfilled') {
//     const items = result.value || []
//     if (items.length === 0) {
//       logger.warn(`Agent: ${platformName} returned 0 products`)
//     }
//     return items
//   }
//   // FIX 2: Log full error reason
//   logger.warn(`Agent: ${platformName} API failed: ${result.reason?.message || result.reason}`)
//   return []
// }

// module.exports = { runSearchAgent, setPrisma }
// src/agents/rankingAgent.js — bestpickr AI Ranking Agent
// ─────────────────────────────────────────────────────────────────
// 3-TIER CACHE ARCHITECTURE:
//
//   Tier 1 — Search Cache (Redis, 6h TTL)
//     Exact-match on normalized query + category.
//     "best sony headphones" and "sony headphones" → same key.
//     Cheapest to serve: 0 ScraperAPI credits.
//
//   Tier 2 — Category Cache (Redis, cron-preloaded at 12 AM IST)
//     If no search cache hit, check if we have preloaded data
//     for the category (e.g., "headphones", "smartphones").
//     Also 0 credits — data was preloaded during off-hours.
//
//   Tier 3 — Live Scrape (ScraperAPI + Amazon PA5 API)
//     Only when both caches miss. Costs 1-2 credits per search.
//     Results get cached in Tier 1 for next 6 hours.
//
// FLOW:
//   1. Check search-specific Redis cache (normalized key)
//   2. If miss → check category cache (cron-preloaded)
//   3. If miss → call all 3 platform APIs in parallel
//   4. Score + rank results
//   5. Cache in Redis (non-blocking)
//   6. Save to PostgreSQL for long-term data (non-blocking)
// ─────────────────────────────────────────────────────────────────
"use strict";

const pLimit = require("p-limit");
const amazonService = require("../services/amazonService");
const flipkartService = require("../services/flipkartService");
const myntraService = require("../services/myntraService");
const { getAffiliateLinks } = require("../services/cuelinkService");
const { groupByProduct, aggregateGroup } = require("../utils/scorer");
const {
  getCachedResults,
  cacheResults,
  getCategoryCache,
} = require("../utils/redis");
const { CATEGORIES } = require("../cron/categoryPreloader");
const logger = require("../utils/logger");
const { getMockResults } = require("../utils/mockData");

// FIX 1: prisma is injected from server.js via setPrisma()
// Never create new PrismaClient() here — use the shared instance
let prisma = null;

function setPrisma(client) {
  prisma = client;
  logger.info("rankingAgent: prisma client injected ✅");
}

// Limit concurrent platform API calls (don't hammer services)
const limit = pLimit(3);

// ── CATEGORY DETECTION ──────────────────────────────────────────
// Maps user query keywords → category slugs for Tier 2 cache lookup.
// If the route already provides a category, we use that directly.
// Otherwise, we try to detect it from the query text.
const CATEGORY_KEYWORDS = {
  headphones: [
    "headphone", "headphones", "earphone", "earphones",
    "earbuds", "earbud", "headset", "tws", "neckband", "airpods", "audio", "speaker",
  ],
  smartphones: [
    "phone", "phones", "mobile", "smartphone", "smartphones",
    "iphone", "android", "samsung galaxy", "oneplus", "pixel",
    "redmi", "realme", "vivo", "oppo",
  ],
  laptops: ["laptop", "laptops", "macbook", "notebook", "chromebook", "ultrabook"],
  appliances: [
    "appliance", "appliances", "mixer", "grinder", "microwave", "oven",
    "toaster", "blender", "juicer", "washing", "fridge", "refrigerator",
    "air conditioner", "vacuum", "purifier", "cooker", "induction",
  ],
  gaming: [
    "gaming", "game", "gamer", "controller", "gamepad",
    "console", "playstation", "xbox", "ps5", "ps4", "nintendo",
  ],
  footwear: [
    "footwear", "shoe", "shoes", "sneaker", "sneakers",
    "sandal", "slipper", "boot", "boots", "running shoe", "trainer",
    "trainers", "clogs", "loafer", "nike", "adidas", "puma", "reebok",
  ],
  skincare: [
    "skincare", "skin care", "beauty", "cosmetic",
    "serum", "sunscreen", "moisturizer", "cleanser", "face wash",
    "toner", "spf",
  ],
  fashion: [
    "fashion", "clothing", "clothes", "apparel", "shirt", "tshirt",
    "t-shirt", "jeans", "kurta", "dress", "jacket", "hoodie", "trouser", "saree",
  ],
  books: ["book", "books", "novel", "textbook", "fiction", "non-fiction"],
  cameras: ["camera", "cameras", "dslr", "mirrorless", "gopro", "webcam", "lens"],
};

function detectCategory(query, category) {
  // If route already provides category, use it
  if (category) {
    const slug = category.toLowerCase().trim();
    if (CATEGORIES.some((c) => c.slug === slug)) return slug;
  }
  // Try to detect from query text
  const q = query.toLowerCase();
  for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => q.includes(kw))) return slug;
  }
  return null;
}

// ── MAIN AGENT ────────────────────────────────────────────────────
async function runSearchAgent(query, category = "") {
  const startTime = Date.now();
  logger.info(`Agent: query="${query}" category="${category}"`);

  // ── TIER 1: Search-specific Redis cache ─────────────────────────
  // Normalized key: "best sony headphones" → same key as "sony headphones"
  try {
    const cached = await getCachedResults(query, category);
    if (cached && cached.length > 0) {
      logger.info(
        `Agent: Tier 1 HIT (search cache) for "${query}" in ${Date.now() - startTime}ms`,
      );
      return { results: cached, fromCache: true, source: "search_cache" };
    }
  } catch (cacheErr) {
    logger.warn(`Agent: Tier 1 check failed: ${cacheErr.message} — continuing`);
  }

  // ── TIER 2: Category cache (cron-preloaded at 12 AM IST) ───────
  // If the query maps to a known category, serve preloaded data.
  // This avoids scraping for common category-level queries.
  const detectedCategory = detectCategory(query, category);
  if (detectedCategory) {
    try {
      const categoryResults = await getCategoryCache(detectedCategory);
      if (categoryResults && categoryResults.length > 0) {
        logger.info(
          `Agent: Tier 2 HIT (category cache "${detectedCategory}") → ` +
            `${categoryResults.length} products in ${Date.now() - startTime}ms`,
        );
        // Cache this as a search result too, so next identical query hits Tier 1
        cacheResults(query, category, categoryResults).catch((err) =>
          logger.warn(`Agent: Tier 2→1 promotion failed: ${err.message}`),
        );
        return {
          results: categoryResults,
          fromCache: true,
          source: "category_cache",
        };
      }
    } catch (catErr) {
      logger.warn(
        `Agent: Tier 2 check failed: ${catErr.message} — continuing to live scrape`,
      );
    }
  }

  // ── TIER 3: Live scrape (costs ScraperAPI credits) ──────────────
  // Both caches missed — call all platform APIs in parallel.
  // Promise.allSettled = if one fails, others still return results.
  logger.info(`Agent: Tier 3 — live scraping all platforms for "${query}"...`);

  const [amazonResult, flipkartResult, myntraResult] = await Promise.allSettled(
    [
      limit(() => amazonService.searchProducts(query, category)),
      limit(() => flipkartService.searchProducts(query, category)),
      limit(() => myntraService.searchProducts(query, category)),
    ],
  );

  const amazonProducts = extractSettled(amazonResult, "Amazon");
  const flipkartProducts = extractSettled(flipkartResult, "Flipkart");
  const myntraProducts = extractSettled(myntraResult, "Myntra");

  const allProducts = [
    ...amazonProducts,
    ...flipkartProducts,
    ...myntraProducts,
  ];

  logger.info(
    `Agent: raw products: ${allProducts.length} ` +
      `(Amazon:${amazonProducts.length} Flipkart:${flipkartProducts.length} Myntra:${myntraProducts.length})`,
  );

  // FIX 3: If ALL platforms return empty, fall back to mock_products.json
  if (allProducts.length === 0) {
    logger.warn(`Agent: ⚠️  ALL platforms returned 0 products for "${query}"`);
    const mockResults = getMockResults(query, category);
    if (mockResults.length > 0) {
      logger.info(`Agent: serving ${mockResults.length} mock products as fallback`);
      // Cache mock results so subsequent searches hit Tier 1
      cacheResults(query, category, mockResults).catch((err) =>
        logger.warn(`Agent: mock→cache failed: ${err.message}`),
      );
      return { results: mockResults, fromCache: false, source: "mock_fallback" };
    }
    return { results: [], fromCache: false, error: "no_products_found" };
  }

  // ── STEP 3: Category average price (for value scoring) ─────────
  const prices = allProducts.map((p) => p.price).filter(Boolean);
  const avgCategoryPrice = prices.length
    ? prices.reduce((a, b) => a + b, 0) / prices.length
    : null;

  // ── STEP 4: Group same product across platforms ───────────────
  // Sony WH-1000XM5 on Amazon + Flipkart → one group
  const groups = groupByProduct(allProducts);
  logger.info(`Agent: grouped into ${groups.length} unique products`);

  // ── STEP 5: Score and rank ────────────────────────────────────
  const scored = groups
    .map((group) => aggregateGroup(group, avgCategoryPrice))
    .filter((p) => p.aiScore > 0)
    .sort((a, b) => b.aiScore - a.aiScore)
    .slice(0, 10)
    .map((product, index) => ({ rank: index + 1, ...product }));

  logger.info(
    `Agent: ranked ${scored.length} products. #1: "${scored[0]?.name}" score=${scored[0]?.aiScore}`,
  );

  // ── STEP 6: Enrich with Cuelinks affiliate links (Flipkart + Myntra) ──
  // Runs in parallel for all top products — non-blocking if Cuelinks is down.
  // Only enriches Amazon products (they have ASINs); scraped Flipkart/Myntra
  // products already have their own URLs from the scraper.
  try {
    const enrichmentPromises = scored.map(async (product) => {
      // Find the Amazon platform entry to get ASIN
      const amazonPlatform = product.platforms?.find(
        (p) => p.name?.toLowerCase() === "amazon",
      );

      // Only enrich if we have an Amazon product with an ASIN
      // ASIN is embedded in the Amazon URL: /dp/B09G9FPHY6
      if (!amazonPlatform?.url) return product;

      const asinMatch = amazonPlatform.url.match(/\/dp\/([A-Z0-9]{10})/);
      if (!asinMatch) return product;

      const asin = asinMatch[1];

      try {
        const affiliateData = await getAffiliateLinks(
          asin,
          product.name,
          product.brand,
          detectedCategory || category,
        );

        // Merge Cuelinks data into the product's platforms array
        if (affiliateData.flipkart && affiliateData.flipkart.affiliateUrl) {
          // Check if Flipkart platform already exists from scraper
          const existingFlipkart = product.platforms.find(
            (p) => p.name?.toLowerCase() === "flipkart",
          );

          if (!existingFlipkart) {
            // Add Flipkart platform from Cuelinks
            product.platforms.push({
              name: "Flipkart",
              price: affiliateData.flipkart.price,
              rating: affiliateData.flipkart.rating,
              reviewCount: affiliateData.flipkart.reviewCount,
              url: affiliateData.flipkart.affiliateUrl,
              inStock: affiliateData.flipkart.inStock !== false,
            });
          } else if (
            !existingFlipkart.url ||
            existingFlipkart.url.includes("flipkart.com/search")
          ) {
            // Upgrade generic search URL to proper affiliate link if available
            existingFlipkart.url = affiliateData.flipkart.affiliateUrl;
            if (affiliateData.flipkart.price)
              existingFlipkart.price = affiliateData.flipkart.price;
          }
        }

        if (affiliateData.myntra && affiliateData.myntra.affiliateUrl) {
          const existingMyntra = product.platforms.find(
            (p) => p.name?.toLowerCase() === "myntra",
          );

          if (!existingMyntra) {
            product.platforms.push({
              name: "Myntra",
              price: affiliateData.myntra.price,
              rating: affiliateData.myntra.rating,
              reviewCount: affiliateData.myntra.reviewCount,
              url: affiliateData.myntra.affiliateUrl,
              inStock: affiliateData.myntra.inStock !== false,
            });
          }
        }

        // Update best deal info if Cuelinks found a cheaper price
        if (affiliateData.bestDeal) {
          const allPrices = product.platforms
            .map((p) => p.price)
            .filter(Boolean);

          if (allPrices.length > 0) {
            product.lowestPrice = Math.min(...allPrices);
          }
        }
      } catch (enrichErr) {
        // Individual product enrichment failed — skip silently
        // Product still returns with Amazon data intact
        logger.warn(
          `Agent: Cuelinks enrichment failed for ASIN ${asin} — ${enrichErr.message}`,
        );
      }

      return product;
    });

    // Wait for all enrichments — but cap at 8 seconds total to not slow response
    await Promise.race([
      Promise.all(enrichmentPromises),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);

    logger.info(
      `Agent: Cuelinks enrichment complete for ${scored.length} products`,
    );
  } catch (enrichErr) {
    // Entire enrichment block failed — search still returns normally
    logger.warn(
      `Agent: Cuelinks enrichment block failed — ${enrichErr.message}`,
    );
  }

  // ── STEP 7: Cache in Redis → Tier 1 for next time (non-blocking)
  cacheResults(query, category, scored).catch((err) =>
    logger.error(`Agent: Redis cache save failed: ${err.message}`),
  );

  // ── STEP 8: Persist to PostgreSQL for long-term data (non-blocking)
  if (prisma) {
    saveProductsToDb(query, category, scored).catch((err) =>
      // FIX 2: Full error message — was previously "DB save error:" with nothing after
      logger.error(
        `Agent: DB save error: ${err.message} | code: ${err.code} | ${err.stack?.split("\n")[1]?.trim()}`,
      ),
    );
  } else {
    logger.warn(
      "Agent: prisma not injected — skipping DB save (call setPrisma() from server.js)",
    );
  }

  const elapsed = Date.now() - startTime;
  logger.info(`Agent: complete in ${elapsed}ms`);

  return {
    results: scored,
    fromCache: false,
    source: "live_scrape",
    elapsed_ms: elapsed,
    platforms: {
      amazon: amazonProducts.length,
      flipkart: flipkartProducts.length,
      myntra: myntraProducts.length,
    },
  };
}

// ── SAVE TO POSTGRESQL ────────────────────────────────────────────
// Persists products + price history for long-term data.
// Redis handles speed; PostgreSQL handles durability and price tracking.
// This runs async and never blocks the search response.
async function saveProductsToDb(query, category, results) {
  let savedCount = 0;

  for (const product of results) {
    for (const plt of product.platforms) {
      try {
        // Ensure platform name matches Prisma enum: AMAZON | FLIPKART | MYNTRA
        const platformEnum = plt.name.toUpperCase();
        if (!["AMAZON", "FLIPKART", "MYNTRA"].includes(platformEnum)) {
          logger.warn(`Agent DB: skipping unknown platform "${plt.name}"`);
          continue;
        }

        const platformId = `${product.name.slice(0, 80)}-${plt.name}`;

        const saved = await prisma.product.upsert({
          where: {
            platform_platformId: { platform: platformEnum, platformId },
          },
          update: {
            currentPrice: plt.price || 0,
            platformRating: plt.rating || null,
            reviewCount: plt.reviewCount || 0,
            aiScore: product.aiScore,
            imageUrl: product.imageUrl || null, // FIX: was missing in old code
            lastScored: new Date(),
            inStock: plt.inStock !== false,
          },
          create: {
            name: product.name,
            brand: product.brand || null,
            category: category || null,
            imageUrl: product.imageUrl || null,
            platform: platformEnum,
            platformId,
            platformUrl: plt.url || "",
            affiliateUrl: plt.url || "",
            currentPrice: plt.price || 0,
            platformRating: plt.rating || null,
            reviewCount: plt.reviewCount || 0,
            aiScore: product.aiScore,
            lastScored: new Date(),
          },
        });

        // Price history: only record if we have a real price
        if (plt.price && plt.price > 0) {
          await prisma.priceHistory.create({
            data: { productId: saved.id, price: plt.price },
          });
        }

        savedCount++;
      } catch (e) {
        // FIX 2: Log actual error details — was previously silent
        logger.warn(
          `Agent DB: product save failed for "${product.name}" on ${plt.name}: ${e.message}`,
        );
      }
    }
  }

  if (savedCount > 0) {
    logger.info(`Agent DB: saved ${savedCount} product-platform records`);
  }
}

// ── HELPER ────────────────────────────────────────────────────────
function extractSettled(result, platformName) {
  if (result.status === "fulfilled") {
    const items = result.value || [];
    if (items.length === 0) {
      logger.warn(`Agent: ${platformName} returned 0 products`);
    }
    return items;
  }
  // FIX 2: Log full error reason
  logger.warn(
    `Agent: ${platformName} API failed: ${result.reason?.message || result.reason}`,
  );
  return [];
}

module.exports = { runSearchAgent, setPrisma };
