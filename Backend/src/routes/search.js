// src/routes/search.js — bestpickr Main Search API
// ─────────────────────────────────────────────────────────────────
// ENDPOINT:  GET /api/search?q=sony+headphones&category=headphones
//
// COMPLETE REQUEST FLOW:
//   1. Validate + sanitize query (min 3 chars, strip special chars)
//   2. Redis check  → if HIT: return instantly (0 API credits used)
//   3. MongoDB SearchCache check → if HIT & fresh: return + repopulate Redis
//   4. Cache MISS → fetch 15 products from Amazon PA-API
//   5. For each product in parallel:
//        - runAnalysisPipeline() → AI analysis (GPT-4o-mini)
//        - getAffiliateLinks()   → Flipkart/Myntra via Cuelinks
//        - buildProductResponse() → assemble final shape
//   6. Sort by aiScore DESC → take top 10
//   7. Persist to MongoDB SearchCache + Redis (non-blocking)
//   8. Return structured JSON response
//
// RATE LIMITING:  30 req/min per IP (separate from global 100/15min)
// REQUEST LOGGING: every request logged with timing + outcome
// ERROR HANDLING:  all states → proper HTTP codes, no crashes
//
// HOW IT FITS THE ARCHITECTURE:
//   ┌──────────────────────────────────────────────────────────────┐
//   │  React Frontend                                               │
//   │    GET /api/search?q=sony+headphones                         │
//   │         ↓                                                    │
//   │  THIS FILE (routes/search.js)                                │
//   │    validate → cache check → Amazon PA-API                    │
//   │         ↓                                                    │
//   │  analysisPipeline.js   ← Amazon reviews → GPT-4o-mini       │
//   │  cuelinksService.js    ← Flipkart/Myntra affiliate links     │
//   │         ↓                                                    │
//   │  Redis + MongoDB SearchCache  (non-blocking saves)           │
//   └──────────────────────────────────────────────────────────────┘
//
// KEY DEPENDENCIES (all match existing codebase patterns):
//   amazonService.js      → searchProducts(query, category)
//   analysisPipeline.js   → runAnalysisPipeline(), buildProductResponse()
//   cuelinksService.js    → getAffiliateLinks(asin, name, brand, category)
//   models/index.js       → SearchCache, ProductListing (Mongoose)
//   utils/redis.js        → getCachedResults(), cacheResults()
//   utils/queryNormalizer → normalize(), buildSearchKey()
//   utils/logger.js       → Winston logger (matches all other routes)
// ─────────────────────────────────────────────────────────────────
"use strict";

const express = require("express");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const router = express.Router();

// ── Internal services (match exact paths from codebase file tree)
const amazonService = require("../services/amazonService");
const { getAffiliateLinks } = require("../services/cuelinkService");
const {
  runAnalysisPipeline,
  buildProductResponse,
} = require("../pipeline/analysisPipeline");
const { SearchCache, ProductListing, ProductAnalysis } = require("../models");
const {
  getCachedResults,
  cacheResults,
  getClient: getRedis,
  getTop50Products,
  setTop50Products,
  getBrandProducts,
  getProductCache,
  setProductCache,
} = require("../utils/redis");
const { normalize, buildSearchKey } = require("../utils/queryNormalizer");
const {
  getMockProductsForSearch,
  buildMockAnalysis,
} = require("../utils/mockData");
const logger = require("../utils/logger");
const { classifyIntent, INTENT } = require("../services/searchIntentService");
const { queueAnalysis } = require("../services/backgroundAnalysis");

// ── Config
const CACHE_TTL_MS = (parseInt(process.env.CACHE_TTL_SECONDS) || 21600) * 1000; // 6h in ms
const MAX_AMAZON_RESULTS = 15; // fetch 15, rank to top 10
const MAX_RESPONSE_RESULTS = 10; // return top 10
const PARALLEL_CONCURRENCY = 5; // max products enriched simultaneously
const ANALYSIS_TIMEOUT_MS = 25000; // 25s per product (scrape + GPT)

// ── Category filter map — ensures results strictly match the requested category
// Prevents: stale cache returning wrong category, Amazon SearchIndex mismatch,
// mock fallback returning off-topic products.
const CATEGORY_FILTER_MAP = {
  headphones:  ['headphone', 'earphone', 'earbuds', 'earbud', 'headset', 'neckband', 'airpods', 'tws', 'audio', 'speaker', 'bluetooth headset'],
  smartphones: ['phone', 'mobile', 'smartphone', 'iphone', 'android', 'redmi', 'realme', 'samsung', 'oneplus', 'vivo', 'oppo', 'pixel'],
  laptops:     ['laptop', 'notebook', 'macbook', 'chromebook', 'ultrabook'],
  gaming:      ['gaming', 'controller', 'gamepad', 'console', 'playstation', 'xbox', 'ps5', 'nintendo', 'game'],
  footwear:    ['footwear', 'shoe', 'shoes', 'sneaker', 'sandal', 'slipper', 'boot', 'trainer', 'nike', 'adidas', 'puma', 'reebok', 'skechers', 'crocs', 'running'],
  skincare:    ['skincare', 'serum', 'sunscreen', 'moisturizer', 'cleanser', 'face wash', 'face', 'spf', 'toner', 'cream', 'lotion', 'skin'],
  fashion:     ['shirt', 't-shirt', 'tshirt', 'jeans', 'kurta', 'dress', 'jacket', 'hoodie', 'trouser', 'saree', 'fashion', 'clothing', 'apparel'],
  appliances:  ['mixer', 'grinder', 'microwave', 'oven', 'washing', 'refrigerator', 'fridge', 'vacuum', 'purifier', 'cooker', 'appliance', 'induction', 'juicer'],
};

/**
 * Filter results to only those matching the requested category.
 * Checks p.category (set for mock data) first, then product name/brand keywords.
 * Returns the filtered array — may be empty if no results match.
 */
function filterByCategory(results, category) {
  if (!category || !CATEGORY_FILTER_MAP[category]) return results;
  const keywords = CATEGORY_FILTER_MAP[category];
  return results.filter((p) => {
    // Direct category slug match (always set for mock products)
    if (p.category && p.category.toLowerCase() === category) return true;
    // Keyword match against product name and brand
    const text = `${p.name || ''} ${p.brand || ''}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  });
}

// ── Query relevance stop words (broader than cache normalizer stop words)
const QUERY_STOP_WORDS = new Set([
  'best', 'top', 'good', 'great', 'cheap', 'cheapest', 'affordable', 'premium',
  'latest', 'new', 'popular', 'trending', 'rated', 'recommended', 'buy', 'online',
  'india', 'price', 'deal', 'offer', 'discount', 'budget', 'value', 'review', 'reviews',
  'under', 'below', 'above', 'the', 'a', 'an', 'for', 'in', 'and', 'or', 'vs',
  'compare', 'comparison', '2024', '2025', '2026',
]);

// Synonym expansions — ensures "machine" matches "washer", "washing", etc.
const PRODUCT_SYNONYM_MAP = {
  'machine':      ['machine', 'washer', 'washing machine'],
  'machines':     ['machine', 'washer', 'washing machine'],
  'washer':       ['washer', 'washing'],
  'washing':      ['washing', 'washer'],
  'purifier':     ['purifier', 'purification', ' ro '],
  'refrigerator': ['refrigerator', 'fridge'],
  'fridge':       ['fridge', 'refrigerator'],
  'iron':         ['steam iron', 'garment', 'ironing', 'steam generator'],
  'ironing':      ['iron', 'ironing', 'steam'],
  'vacuum':       ['vacuum', 'robovac', 'robot cleaner'],
  'microwave':    ['microwave'],
  'television':   ['television', 'tv', 'smart tv', 'qled', 'oled'],
  'tv':           ['tv', 'television', 'smart tv', 'qled', 'oled'],
  'fryer':        ['fryer', 'air fryer'],
  'airfryer':     ['airfryer', 'air fryer'],
  'cooker':       ['cooker', 'pressure cooker', 'rice cooker'],
  'trimmer':      ['trimmer', 'shaver'],
  'shaver':       ['shaver', 'trimmer', 'razor'],
  'juicer':       ['juicer', 'mixer', 'blender'],
  'blender':      ['blender', 'mixer', 'juicer'],
};

/**
 * Filter results by query relevance — ensures "washing machines" only returns
 * washing machines, not fridges/irons that are also in the appliances category.
 *
 * SAFE: if filtering would leave fewer than MIN_RESULTS products, returns
 * the unfiltered set (never causes an empty page due to over-filtering).
 */
function filterByQueryRelevance(results, query) {
  if (!query || results.length === 0) return results;

  const words = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !QUERY_STOP_WORDS.has(w));

  if (words.length === 0) return results;

  // Build expanded set of match terms via synonyms
  const matchTerms = new Set();
  for (const word of words) {
    const syns = PRODUCT_SYNONYM_MAP[word];
    if (syns) syns.forEach((s) => matchTerms.add(s));
    else matchTerms.add(word);
  }
  const termArray = Array.from(matchTerms);

  const filtered = results.filter((p) => {
    const text = `${p.name || ''} ${p.brand || ''}`.toLowerCase();
    return termArray.some((term) => text.includes(term));
  });

  // Safety — never show fewer than 1 result due to over-filtering
  const MIN_RESULTS = 1;
  if (filtered.length < MIN_RESULTS) {
    logger.warn(
      `🔍 Query relevance: "${query}" would leave only ${filtered.length} — keeping all ${results.length}`,
    );
    return results;
  }

  if (filtered.length < results.length) {
    logger.info(
      `🔍 Query relevance: "${query}" kept ${filtered.length}/${results.length} products`,
    );
  }
  return filtered;
}

// ═════════════════════════════════════════════════════════════════
// RATE LIMITER — 30 requests per minute per IP
// ═════════════════════════════════════════════════════════════════
// Separate from the global 100/15min in server.js.
// Search is our most expensive endpoint (ScraperAPI + GPT costs).
// 30/min = 1800/hour — plenty for real users, blocks scrapers.

const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 30, // 30 requests per window per IP
  standardHeaders: true, // Return RateLimit-* headers (RFC 6585)
  legacyHeaders: false, // No X-RateLimit-* (deprecated)
  keyGenerator: (req) => {
    // Respect proxy forwarding (Vercel/Render sets X-Forwarded-For)
    return (
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.headers["x-real-ip"] ||
      req.ip
    );
  },
  handler: (req, res) => {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
    logger.warn(`🔍 Search: rate limit hit — IP=${ip} query="${req.query.q}"`);
    res.status(429).json({
      success: false,
      error:
        "Too many search requests. Please wait a moment before searching again.",
      retryAfter: 60,
    });
  },
  skip: (req) => {
    // Skip rate limiting for health checks and internal calls
    return req.headers["x-internal-call"] === process.env.ADMIN_TOKEN;
  },
});

// ═════════════════════════════════════════════════════════════════
// REQUEST LOGGER MIDDLEWARE
// ═════════════════════════════════════════════════════════════════
// Logs every search request: IP, query, outcome, timing.
// Attaches req._searchLog so the handler can populate it.
// Final log is written in the handler (after we know cache/live status).

function requestLogger(req, res, next) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
  const start = Date.now();

  // Attach a log context object to the request
  req._searchLog = {
    ip,
    query: req.query.q || "",
    category: req.query.category || "",
    startMs: start,
    outcome: "unknown", // filled in by handler: redis_hit | mongo_hit | live | error
    resultCount: 0,
    cached: false,
  };

  // Log request immediately (before processing)
  logger.info(
    `🔍 Search IN: ip=${ip} q="${req.query.q}" category="${req.query.category || ""}" ` +
      `ua="${req.headers["user-agent"]?.slice(0, 60) || ""}"`,
  );

  // Intercept response to log outcome + timing
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    const elapsed = Date.now() - start;
    const log = req._searchLog;
    const cached = body?.cached === true;
    const resultCount = body?.totalResults || 0;
    const status = res.statusCode;

    logger.info(
      `🔍 Search OUT: ip=${log.ip} q="${log.query}" ` +
        `status=${status} results=${resultCount} ` +
        `cached=${cached ? log.outcome : "false"} ` +
        `elapsed=${elapsed}ms`,
    );

    return originalJson(body);
  };

  next();
}

// ═════════════════════════════════════════════════════════════════
// INPUT VALIDATION + SANITIZATION
// ═════════════════════════════════════════════════════════════════
// Returns { valid: true, query, category, normalizedQuery } or { valid: false, error }

function validateAndSanitize(rawQuery, rawCategory) {
  // Guard: must be a string
  if (typeof rawQuery !== "string") {
    return { valid: false, error: "Query must be a string", code: 400 };
  }

  // Step 1: Trim + collapse whitespace
  let query = rawQuery.trim().replace(/\s+/g, " ");

  // Step 2: Strip characters that could cause injection or break APIs
  // Keep: letters, digits, spaces, hyphens, apostrophes (Sony's), dots (v3.0)
  query = query.replace(/[^\w\s\-'.]/g, "");

  // Re-trim after stripping
  query = query.trim();

  // Step 3: Length checks
  if (query.length < 3) {
    return {
      valid: false,
      error: "Search query must be at least 3 characters",
      code: 400,
    };
  }
  if (query.length > 200) {
    return {
      valid: false,
      error: "Search query must be 200 characters or less",
      code: 400,
    };
  }

  // Step 4: Sanitize category
  // Only allow alphanumeric + hyphens (matches categoryPreloader CATEGORIES slugs)
  let category = "";
  if (rawCategory && typeof rawCategory === "string") {
    category = rawCategory
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 50);
  }

  // Step 5: Normalize for cache key (uses queryNormalizer.normalize())
  // "Best Sony headphones under 5000" → "headphones sony"
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return {
      valid: false,
      error:
        "Query contains only stop words — try adding a product name or brand",
      code: 400,
    };
  }

  return {
    valid: true,
    query, // original (for response)
    category, // sanitized category slug
    normalizedQuery, // for cache key + dedup
  };
}

// ═════════════════════════════════════════════════════════════════
// CACHE TIER HELPERS
// ═════════════════════════════════════════════════════════════════

// ── Tier 1: Redis ─────────────────────────────────────────────────
// getCachedResults() from redis.js handles all the Redis plumbing.
// It returns the results array directly (or null on miss).

async function checkRedisCache(query, category) {
  try {
    const results = await getCachedResults(query, category);
    return results; // null if miss, array if hit
  } catch (err) {
    logger.warn(`🔍 Redis cache check failed: ${err.message}`);
    return null;
  }
}

// ── Tier 2: MongoDB SearchCache ───────────────────────────────────
// Fallback for Redis flush or cold starts.
// SearchCache stores ASIN arrays (see models/index.js schema).
// We look up each ASIN's ProductListing + ProductAnalysis to rebuild results.

async function checkMongoCache(normalizedQuery, category) {
  try {
    if (mongoose.connection.readyState !== 1) return null;

    // Build the same normalized query that searchCacheSchema pre-save generates
    const cacheQuery = category
      ? { normalizedQuery, category }
      : { normalizedQuery };

    const cached = await SearchCache.findOne(cacheQuery).lean().exec();

    if (!cached) return null;

    // Check if the cached entry is still fresh (within CACHE_TTL_MS)
    // MongoDB TTL index deletes after 6h, but we double-check here
    const ageMs = Date.now() - new Date(cached.createdAt).getTime();
    if (ageMs > CACHE_TTL_MS) {
      logger.info(
        `🔍 MongoDB cache entry expired (${Math.round(ageMs / 60000)}min old) — treating as miss`,
      );
      return null;
    }

    // Reconstruct full product responses from stored ASINs
    const asins = cached.results || [];
    if (asins.length === 0) return null;

    logger.info(
      `🔍 MongoDB cache HIT: "${normalizedQuery}" — ${asins.length} ASINs, ${Math.round(ageMs / 60000)}min old`,
    );

    // Fetch ProductListings for all ASINs in parallel
    const listings = await ProductListing.find({ asin: { $in: asins } })
      .lean()
      .exec();

    if (!listings.length) return null;

    // Map ASINs back to their listings (preserve ordering)
    const listingMap = {};
    for (const l of listings) {
      listingMap[l.asin] = l;
    }

    // For now: return the listings directly
    // We don't re-run analysis (that would defeat the cache purpose)
    const results = asins
      .map((asin) => listingMap[asin])
      .filter(Boolean)
      .map((listing, idx) => formatProductResult(listing, null, idx + 1))
      .filter(Boolean);

    return results.length > 0 ? results : null;
  } catch (err) {
    logger.warn(`🔍 MongoDB cache check failed: ${err.message}`);
    return null;
  }
}

// ── Save to MongoDB SearchCache ───────────────────────────────────
async function saveToMongoCache(query, normalizedQuery, category, asins) {
  try {
    if (mongoose.connection.readyState !== 1) return;

    await SearchCache.findOneAndUpdate(
      { normalizedQuery, ...(category ? { category } : {}) },
      {
        $set: {
          query,
          normalizedQuery,
          category: category || null,
          results: asins,
          totalResults: asins.length,
          createdAt: new Date(), // Reset TTL clock
        },
      },
      { upsert: true, new: true },
    ).exec();

    logger.info(
      `🔍 MongoDB SearchCache saved: "${normalizedQuery}" → ${asins.length} ASINs`,
    );
  } catch (err) {
    // Non-fatal: next search will just re-fetch
    logger.warn(`🔍 MongoDB cache save failed: ${err.message}`);
  }
}

// ── Save/update ProductListing in MongoDB ─────────────────────────
// Persists enriched product data so future cache rebuilds have full listings.
async function upsertProductListing(
  asin,
  amazonProduct,
  analysis,
  cuelinksData,
) {
  try {
    if (mongoose.connection.readyState !== 1) return;

    const updateData = {
      asin: asin.toUpperCase(),
      title: amazonProduct.name || amazonProduct.title || "Unknown",
      brand: amazonProduct.brand || null,
      category: amazonProduct.category || null,
      imageUrl: amazonProduct.imageUrl || null,
      inStock: amazonProduct.inStock !== false,

      amazonPrice: amazonProduct.price || null,
      amazonUrl: amazonProduct.affiliateUrl || amazonProduct.url || null,
      amazonRating: amazonProduct.rating || null,
      amazonReviewCount: amazonProduct.reviewCount || 0,

      flipkartPrice:
        cuelinksData?.flipkart?.price ||
        amazonProduct._flipkartPrice ||
        null,
      flipkartUrl:
        cuelinksData?.flipkart?.affiliateUrl ||
        amazonProduct._flipkartUrl ||
        null,
      myntraPrice: cuelinksData?.myntra?.price || null,
      myntraUrl: cuelinksData?.myntra?.affiliateUrl || null,

      lastDataRefresh: new Date(),
    };

    await ProductListing.findOneAndUpdate(
      { asin: asin.toUpperCase() },
      { $set: updateData },
      { upsert: true, new: true },
    ).exec();
  } catch (err) {
    // Non-fatal
    logger.warn(`🔍 ProductListing upsert failed for ${asin}: ${err.message}`);
  }
}

// ── Save mock analysis to MongoDB ProductAnalysis ───────────────
// For mock products, the analysis pipeline is skipped (no review scraping).
// We still want the analysis data in MongoDB so cache rebuilds include it.
async function saveToMongoAnalysis(asin, productName, category, brand, analysis) {
  try {
    if (mongoose.connection.readyState !== 1) return;

    await ProductAnalysis.findOneAndUpdate(
      { asin: asin.toUpperCase() },
      {
        $set: {
          asin: asin.toUpperCase(),
          productName,
          category: category?.toLowerCase() || "general",
          brand: brand || null,
          aiScore: analysis.aiScore,
          aspectScores: analysis.aspectScores || {},
          overallSentiment: analysis.overallSentiment || {},
          whatPeopleLove: analysis.whatPeopleLove || [],
          commonComplaints: analysis.commonComplaints || [],
          redFlags: analysis.redFlags || [],
          buyRecommendation: analysis.buyRecommendation || null,
          avoidIf: analysis.avoidIf || null,
          authenticityBadge: analysis.authenticityBadge || "medium",
          authenticityFlags: analysis.authenticityFlags || [],
          reviewsAnalyzed: analysis.reviewsAnalyzed || 0,
          confidenceLevel: analysis.confidenceLevel || "medium",
          analysisDate: new Date(),
          lastUpdated: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true },
    ).exec();

    logger.info(
      `🔍 MongoDB: mock analysis saved for ${asin} — aiScore=${analysis.aiScore}`,
    );
  } catch (err) {
    logger.warn(
      `🔍 MongoDB: mock analysis save failed for ${asin} — ${err.message}`,
    );
  }
}

// ═════════════════════════════════════════════════════════════════
// PRODUCT ENRICHMENT — runs per-product in parallel
// ═════════════════════════════════════════════════════════════════
// For each Amazon product:
//   1. Run AI analysis pipeline (review scrape + GPT)
//   2. Get Cuelinks affiliate links (Flipkart + Myntra)
//   3. Build final formatted response object
//   4. Upsert to ProductListing (non-blocking)

async function enrichProduct(amazonProduct, category) {
  const asin = amazonProduct.platformId || amazonProduct.asin;
  const productName = amazonProduct.name || amazonProduct.title;
  const brand = amazonProduct.brand;
  const reviewCount = amazonProduct.reviewCount || 0;
  const isMock = amazonProduct._mockSource === true;

  if (!asin) {
    logger.warn(
      `🔍 Enrichment: skipping product with no ASIN: "${productName}"`,
    );
    return null;
  }

  logger.info(
    `🔍 Enrichment: starting ${asin} "${productName?.slice(0, 50)}"` +
      (isMock ? " (mock)" : ""),
  );

  let analysis = null;
  let cuelinks = null;

  if (isMock) {
    // ── MOCK PATH: skip scraper + GPT, use pre-built analysis ───
    // Mock ASINs (H01, S03, etc.) aren't real Amazon ASINs.
    // Scraping reviews for them wastes ScraperAPI credits (5 pages × 3 retries)
    // and GPT never runs because 0 reviews are found.
    // Instead: generate analysis from mock data's rating + aiScore.
    analysis = buildMockAnalysis(amazonProduct);

    // Still try Cuelinks for affiliate links (searches by product name)
    try {
      cuelinks = await withTimeout(
        getAffiliateLinks(asin, productName, brand, category),
        10000,
        `Cuelinks timeout for ${asin}`,
      );
    } catch (err) {
      logger.warn(
        `🔍 Enrichment: Cuelinks failed for mock ${asin} — ${err.message}`,
      );
    }

    logger.info(
      `🔍 Enrichment: mock analysis built for ${asin} — aiScore=${analysis.aiScore}`,
    );
  } else {
    // ── REAL PATH: full analysis pipeline + Cuelinks in parallel ──
    const [analysisResult, cuelinksResult] = await Promise.allSettled([
      // Analysis pipeline: MongoDB check → review scrape → GPT → save
      withTimeout(
        runAnalysisPipeline(asin, productName, category || "general", {
          currentReviewCount: reviewCount,
          brand,
        }),
        ANALYSIS_TIMEOUT_MS,
        `Analysis timeout for ${asin}`,
      ),

      // Cuelinks: search Flipkart/Myntra, match product, get affiliate URLs
      withTimeout(
        getAffiliateLinks(asin, productName, brand, category),
        10000,
        `Cuelinks timeout for ${asin}`,
      ),
    ]);

    analysis =
      analysisResult.status === "fulfilled" ? analysisResult.value : null;
    cuelinks =
      cuelinksResult.status === "fulfilled" ? cuelinksResult.value : null;

    if (analysisResult.status === "rejected") {
      logger.warn(
        `🔍 Enrichment: analysis failed for ${asin} — ${analysisResult.reason?.message}`,
      );
    }
    if (cuelinksResult.status === "rejected") {
      logger.warn(
        `🔍 Enrichment: Cuelinks failed for ${asin} — ${cuelinksResult.reason?.message}`,
      );
    }
  }

  // ── Merge Cuelinks data into the product ────────────────────
  // For mock products: use pre-existing Flipkart data from mock_products.json
  // as a fallback when Cuelinks doesn't find a match
  const enrichedProduct = {
    ...amazonProduct,
    asin,
    flipkartPrice:
      cuelinks?.flipkart?.price ||
      (isMock ? amazonProduct._flipkartPrice : null),
    flipkartUrl:
      cuelinks?.flipkart?.affiliateUrl ||
      (isMock ? amazonProduct._flipkartUrl : null),
    flipkartInStock: cuelinks?.flipkart?.inStock !== false,
    myntraPrice: cuelinks?.myntra?.price || null,
    myntraUrl: cuelinks?.myntra?.affiliateUrl || null,
    myntraInStock: cuelinks?.myntra?.inStock !== false,
    bestDeal: cuelinks?.bestDeal || null,
  };

  // ── Build final formatted product object ─────────────────────
  const formatted = formatProductResult(enrichedProduct, analysis, null);

  if (!formatted) {
    logger.warn(`🔍 Enrichment: formatProductResult returned null for ${asin}`);
    return null;
  }

  // ── Persist to MongoDB ProductListing (non-blocking) ─────────
  upsertProductListing(asin, amazonProduct, analysis, cuelinks).catch((err) =>
    logger.warn(`🔍 Enrichment: upsert failed for ${asin} — ${err.message}`),
  );

  // ── Save mock analysis to MongoDB ProductAnalysis (non-blocking) ──
  if (isMock && analysis) {
    saveToMongoAnalysis(asin, productName, category, brand, analysis).catch(
      (err) =>
        logger.warn(
          `🔍 Enrichment: mock analysis save failed for ${asin} — ${err.message}`,
        ),
    );
  }

  logger.info(
    `🔍 Enrichment: ✅ ${asin} "${productName?.slice(0, 40)}" ` +
      `aiScore=${formatted.aiScore} ` +
      `flipkart=${enrichedProduct.flipkartPrice ? "₹" + enrichedProduct.flipkartPrice : "null"} ` +
      `source=${isMock ? "mock" : "live"}`,
  );

  return formatted;
}

// ═════════════════════════════════════════════════════════════════
// PRODUCT RESPONSE FORMATTER
// ═════════════════════════════════════════════════════════════════
// Shapes the data into the exact API response format defined in the spec.
// Handles null analysis gracefully (e.g. new products not yet analyzed).

function formatProductResult(product, analysis, rank) {
  if (!product) return null;

  // Convert Mongoose doc → plain object if needed
  const p = product.toObject ? product.toObject() : { ...product };
  const a = analysis
    ? analysis.toObject
      ? analysis.toObject()
      : { ...analysis }
    : null;

  // ── ASIN: normalize from different source formats ────────────
  const asin = p.asin || p.platformId || null;
  if (!asin) return null;

  // ── AI Score: from analysis, or mock's pre-computed score as fallback ──
  const aiScore = a?.aiScore ?? p._mockAiScore ?? null;

  // ── Prices ──────────────────────────────────────────────────
  const amazonPrice = p.price || p.amazonPrice || null;
  const flipkartPrice = p.flipkartPrice || null;
  const myntraPrice = p.myntraPrice || null;

  const amazonUrl = p.affiliateUrl || p.amazonUrl || p.url || null;
  const flipkartUrl = p.flipkartUrl || null;
  const myntraUrl = p.myntraUrl || null;

  // Determine best deal: lowest price across all platforms
  const priceMap = [];
  if (amazonPrice)
    priceMap.push({ platform: "amazon", price: amazonPrice, url: amazonUrl });
  if (flipkartPrice)
    priceMap.push({
      platform: "flipkart",
      price: flipkartPrice,
      url: flipkartUrl,
    });
  if (myntraPrice)
    priceMap.push({ platform: "myntra", price: myntraPrice, url: myntraUrl });
  priceMap.sort((x, y) => x.price - y.price);

  const bestDeal =
    priceMap.length > 0
      ? {
          platform: priceMap[0].platform,
          price: priceMap[0].price,
          url: priceMap[0].url,
        }
      : p.bestDeal || null;

  // ── Price History ────────────────────────────────────────────
  const rawHistory = p.priceHistory || [];
  const allPrices = rawHistory.map((h) => h.price).filter((n) => n > 0);

  const allTimeLow = allPrices.length
    ? Math.min(...allPrices)
    : amazonPrice || null;
  const allTimeHigh = allPrices.length
    ? Math.max(...allPrices)
    : amazonPrice || null;

  // Price trend: compare last 7 days vs previous 7 days
  const priceTrend = computePriceTrend(rawHistory, amazonPrice);

  // ── Aspect scores: flatten Map → plain object ────────────────
  let aspectScores = {};
  if (a?.aspectScores) {
    if (a.aspectScores instanceof Map) {
      aspectScores = Object.fromEntries(a.aspectScores);
    } else if (typeof a.aspectScores === "object") {
      // Strip _bsontype if this came from a Mongoose lean() call
      const { _bsontype, ...rest } = a.aspectScores;
      aspectScores = rest;
    }
  }

  // ── Sentiment ────────────────────────────────────────────────
  const sentiment = a?.overallSentiment || null;

  // ── Build platforms[] array (frontend iterates p.platforms) ──
  const platforms = [];
  const amazonRating = p.rating || p.amazonRating || null;
  const amazonReviewCount = p.reviewCount || p.amazonReviewCount || 0;

  if (amazonPrice) {
    platforms.push({
      name: "Amazon",
      price: amazonPrice,
      url: amazonUrl,
      affiliateUrl: p.affiliateUrl || amazonUrl,
      rating: amazonRating,
      reviewCount: amazonReviewCount,
      inStock: p.inStock !== false,
    });
  }
  if (flipkartPrice) {
    platforms.push({
      name: "Flipkart",
      price: flipkartPrice,
      url: flipkartUrl,
      affiliateUrl: flipkartUrl,
      rating: p.flipkartRating || amazonRating || null,
      reviewCount: p.flipkartReviewCount || 0,
      inStock: p.flipkartInStock !== false,
    });
  }
  if (myntraPrice) {
    platforms.push({
      name: "Myntra",
      price: myntraPrice,
      url: myntraUrl,
      affiliateUrl: myntraUrl,
      rating: p.myntraRating || null,
      reviewCount: p.myntraReviewCount || 0,
      inStock: p.myntraInStock !== false,
    });
  }

  // ── Compute lowestPrice / highestPrice from platforms ──
  const allPlatformPrices = platforms.map((pl) => pl.price).filter(Boolean);
  const lowestPrice = allPlatformPrices.length
    ? Math.min(...allPlatformPrices)
    : amazonPrice || null;
  const highestPrice = allPlatformPrices.length
    ? Math.max(...allPlatformPrices)
    : amazonPrice || null;

  // ── Aggregate review stats across platforms ──
  const totalReviews = platforms.reduce(
    (sum, pl) => sum + (pl.reviewCount || 0),
    0,
  );
  const avgRating =
    platforms.filter((pl) => pl.rating).length > 0
      ? +(
          platforms.reduce((sum, pl) => sum + (pl.rating || 0), 0) /
          platforms.filter((pl) => pl.rating).length
        ).toFixed(1)
      : amazonRating || null;

  // ── Sentiment percentages (frontend uses p.positivePct) ──
  const positivePct = sentiment
    ? Math.round(sentiment.positive || 0)
    : a?.positivePct || p.positivePct || 75;

  // ── AI Score breakdown (frontend uses p.breakdown) ──
  const breakdown = a?.breakdown || {
    ratingScore: avgRating ? +(avgRating * 2).toFixed(1) : aiScore || 0,
    sentimentScore: positivePct ? +(positivePct / 10).toFixed(1) : aiScore || 0,
    valueScore: aiScore ? +(aiScore * 0.85).toFixed(1) : 0,
    volumeScore: totalReviews > 1000 ? 9 : totalReviews > 100 ? 7 : 5,
  };

  // ── praiseSummary / complaintSummary (strings joined by "·") ──
  const whatPeopleLove = a?.whatPeopleLove || [];
  const commonComplaints = a?.commonComplaints || [];
  const praiseSummary =
    whatPeopleLove.length > 0 ? whatPeopleLove.join(" · ") : null;
  const complaintSummary =
    commonComplaints.length > 0 ? commonComplaints.join(" · ") : null;

  return {
    rank: rank,
    asin,
    platformId: asin,
    name: p.name || p.title || "Unknown Product",
    brand: p.brand || null,
    imageUrl: p.imageUrl || p.image || null,
    category: p.category || null,

    // AI
    aiScore,
    authenticityBadge: a?.authenticityBadge || null,
    confidenceLevel: a?.confidenceLevel || null,

    // Platforms array (frontend iterates p.platforms)
    platforms,
    lowestPrice,
    highestPrice,

    // Aggregate stats
    totalReviews,
    avgRating,
    positivePct,

    // AI Score breakdown
    breakdown,

    // Best deal
    bestDeal,

    // Price history
    priceHistory: {
      allTimeLow,
      allTimeHigh,
      current: amazonPrice || allTimeLow,
      trend: priceTrend,
    },

    // AI insights (arrays + summary strings for frontend)
    whatPeopleLove,
    commonComplaints,
    praiseSummary,
    complaintSummary,
    aspectScores,
    buyRecommendation: a?.buyRecommendation || null,
    avoidIf: a?.avoidIf || null,

    // Raw review stats
    reviewsAnalyzed: a?.reviewsAnalyzed || 0,
    analysisDate: a?.analysisDate || null,
  };
}

// ═════════════════════════════════════════════════════════════════
// PARALLEL ENRICHMENT WITH CONCURRENCY CONTROL
// ═════════════════════════════════════════════════════════════════
// Promise.all() on 15 products simultaneously would slam ScraperAPI.
// We batch into groups of PARALLEL_CONCURRENCY (5) to be respectful.

async function enrichProductsBatched(products, category) {
  const results = [];
  const total = products.length;

  for (let i = 0; i < total; i += PARALLEL_CONCURRENCY) {
    const batch = products.slice(i, i + PARALLEL_CONCURRENCY);

    logger.info(
      `🔍 Enrichment batch ${Math.floor(i / PARALLEL_CONCURRENCY) + 1}/` +
        `${Math.ceil(total / PARALLEL_CONCURRENCY)}: ` +
        `products ${i + 1}–${Math.min(i + batch.length, total)} of ${total}`,
    );

    const batchResults = await Promise.allSettled(
      batch.map((product) => enrichProduct(product, category)),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value !== null) {
        results.push(result.value);
      } else if (result.status === "rejected") {
        logger.warn(
          `🔍 Enrichment batch: product failed — ${result.reason?.message}`,
        );
      }
    }
  }

  return results;
}

// ═════════════════════════════════════════════════════════════════
// REDIS-FIRST SEARCH: TOP50 → BRAND INDEX → AMAZON FALLBACK
// ═════════════════════════════════════════════════════════════════

const TOP50_MAX = 50  // Hard cap on pool size

/**
 * Convert a ranked (enriched) product to the top50 Redis snapshot shape.
 */
function enrichedToTop50Shape(p, category) {
  return {
    id:           p.asin,
    name:         p.name,
    brand:        p.brand,
    category:     p.category || category,
    imageUrl:     p.imageUrl,
    price:        p.lowestPrice || p.platforms?.[0]?.price || null,
    rating:       p.avgRating   || p.platforms?.[0]?.rating || null,
    reviewCount:  p.totalReviews || p.platforms?.[0]?.reviewCount || 0,
    aiScore:      p.aiScore,
    affiliateLink:p.platforms?.[0]?.affiliateUrl || p.platforms?.[0]?.url || null,
    platform:     p.platforms?.[0]?.name || 'Amazon',
    analysedAt:   p.analysisDate || new Date().toISOString(),
  }
}

/**
 * Merge new products into the existing top50 pool.
 * Deduplicates by id, preserves existing entries, appends new ones, caps at TOP50_MAX.
 */
function mergeIntoTop50(existing, incoming) {
  const pool = existing || []
  const seen = new Set(pool.map((p) => p.id))
  for (const p of incoming) {
    if (p.id && !seen.has(p.id)) {
      pool.push(p)
      seen.add(p.id)
      if (pool.length >= TOP50_MAX) break
    }
  }
  return pool
}

/**
 * Format a product from the top50 Redis snapshot into the standard API response shape.
 * Top50 shape: { id, name, brand, category, imageUrl, price, rating, reviewCount,
 *                aiScore, affiliateLink, platform, analysedAt }
 */
function formatTop50AsResult(p, rank) {
  const price = p.price || p.lowestPrice || null;
  const rating = p.rating || null;
  const reviewCount = p.reviewCount || 0;
  const aiScore = p.aiScore || p.rankingScore || null;
  const affiliateUrl = p.affiliateLink || null;
  const platformName = p.platform || "Amazon";

  const platforms = [];
  if (price) {
    platforms.push({
      name: platformName,
      price,
      url: affiliateUrl,
      affiliateUrl,
      rating,
      reviewCount,
      inStock: true,
    });
  }

  const positivePct = rating
    ? Math.round(Math.max(50, Math.min(95, ((rating - 1) / 4) * 90 + 10)))
    : 75;

  const breakdown = {
    ratingScore: rating ? +(rating * 2).toFixed(1) : aiScore || 0,
    sentimentScore: +(positivePct / 10).toFixed(1),
    valueScore: aiScore ? +(aiScore * 0.85).toFixed(1) : 0,
    volumeScore: reviewCount > 1000 ? 9 : reviewCount > 100 ? 7 : 5,
  };

  return {
    rank,
    asin: p.id,
    platformId: p.id,
    name: p.name || "Unknown Product",
    brand: p.brand || null,
    imageUrl: p.imageUrl || null,
    category: p.category || null,
    aiScore,
    authenticityBadge: null,
    confidenceLevel: null,
    platforms,
    lowestPrice: price,
    highestPrice: price,
    totalReviews: reviewCount,
    avgRating: rating,
    positivePct,
    breakdown,
    bestDeal: price ? { platform: platformName, price, url: affiliateUrl } : null,
    priceHistory: {
      allTimeLow: price,
      allTimeHigh: price,
      current: price,
      trend: "stable",
    },
    whatPeopleLove: [],
    commonComplaints: [],
    praiseSummary: null,
    complaintSummary: null,
    aspectScores: {},
    buyRecommendation: null,
    avoidIf: null,
    reviewsAnalyzed: 0,
    analysisDate: p.analysedAt || null,
    _source: "redis_top50",
  };
}

/**
 * Serve CATEGORY or BRAND_CATEGORY queries entirely from the top50 Redis snapshot.
 * Applies brand / price / feature filters. Returns null if top50 has no data.
 * Amazon calls: 0. GPT calls: 0.
 */
async function serveFromTop50(intent, query) {
  const cat = intent.category;
  if (!cat) return null;

  // Try brand index first (more specific slice of top50)
  let pool = null;
  if (intent.brand && intent.intent === INTENT.BRAND_CATEGORY) {
    pool = await getBrandProducts(cat, intent.brand);
    if (pool && pool.length > 0) {
      logger.info(
        `🔍 Top50: brand cache HIT — "${intent.brand}/${cat}" → ${pool.length} products`,
      );
    }
  }

  // Fall back to full top50 if brand index misses or intent is plain CATEGORY
  if (!pool || pool.length === 0) {
    pool = await getTop50Products(cat);
    if (!pool || pool.length === 0) {
      logger.info(`🔍 Top50: MISS — category="${cat}" not in Redis yet`);
      return null;
    }
    logger.info(`🔍 Top50: category HIT — "${cat}" → ${pool.length} products`);

    // Brand filter within full top50 (if brand specified)
    if (intent.brand) {
      const brandLower = intent.brand.toLowerCase();
      const brandMatches = pool.filter(
        (p) => p.brand && p.brand.toLowerCase().includes(brandLower),
      );
      if (brandMatches.length > 0) pool = brandMatches;
    }
  }

  // Price filter
  if (intent.price_min !== null || intent.price_max !== null) {
    const priceMatches = pool.filter((p) => {
      const price = p.price || p.lowestPrice;
      if (!price) return false;
      if (intent.price_min && price < intent.price_min) return false;
      if (intent.price_max && price > intent.price_max) return false;
      return true;
    });
    if (priceMatches.length >= 2) pool = priceMatches;
  }

  // Feature/keyword filter (won't filter below 3 results)
  if (intent.features && intent.features.length > 0) {
    const featMatches = pool.filter((p) => {
      const text = `${p.name || ""} ${p.brand || ""}`.toLowerCase();
      return intent.features.some((f) => text.includes(f.toLowerCase()));
    });
    if (featMatches.length >= 3) pool = featMatches;
  }

  // Query keyword filter (apply loosely — only tighten if we have enough results)
  const queryWords = (query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !QUERY_STOP_WORDS.has(w) && w.length > 2);
  if (queryWords.length > 0) {
    const kwMatches = pool.filter((p) => {
      const text = `${p.name || ""} ${p.brand || ""}`.toLowerCase();
      return queryWords.some((w) => text.includes(w));
    });
    if (kwMatches.length >= 3) pool = kwMatches;
  }

  if (pool.length === 0) return null;

  const ranked = pool
    .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))
    .slice(0, MAX_RESPONSE_RESULTS);

  logger.info(
    `🔍 Top50: serving ${ranked.length} products for intent="${intent.intent}" ` +
      `cat="${cat}" brand="${intent.brand || "-"}" query="${query}" (0 API calls)`,
  );
  return ranked.map((p, i) => formatTop50AsResult(p, i + 1));
}

/**
 * Serve GENERIC / LOW_CONFIDENCE / FALLBACK queries from a known category.
 * Returns null only if top50 is completely empty (cron hasn't run).
 */
async function serveGeneric(intent, query) {
  const cat = intent.category;
  if (!cat) return null;

  const pool = await getTop50Products(cat);
  if (!pool || pool.length === 0) return null;

  const queryWords = (query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !QUERY_STOP_WORDS.has(w) && w.length > 2);

  let filtered = pool;
  if (queryWords.length > 0) {
    const kwMatches = pool.filter((p) => {
      const text = `${p.name || ""} ${p.brand || ""}`.toLowerCase();
      return queryWords.some((w) => text.includes(w));
    });
    // Only tighten if filter leaves meaningful results; otherwise show full category
    if (kwMatches.length >= 2) filtered = kwMatches;
  }

  const ranked = filtered
    .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))
    .slice(0, MAX_RESPONSE_RESULTS);

  if (ranked.length === 0) return null;

  logger.info(
    `🔍 Generic: serving ${ranked.length} from top50 for "${query}" cat="${cat}" (0 API calls)`,
  );
  return ranked.map((p, i) => formatTop50AsResult(p, i + 1));
}

/**
 * Cross-category keyword search — scans ALL loaded top50 snapshots.
 * Used when the query has no detectable category. Returns best matches
 * across all categories, scored by how many query words appear in the
 * product name/brand. Amazon calls: 0.
 */
async function searchAcrossAllCategories(query) {
  const { CANONICAL_CATEGORIES } = require("../utils/categoryKeyMap");

  const qWords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !QUERY_STOP_WORDS.has(w));

  if (qWords.length === 0) return null;

  const allMatches = [];

  for (const cat of CANONICAL_CATEGORIES) {
    const pool = await getTop50Products(cat);
    if (!pool || pool.length === 0) continue;

    for (const p of pool) {
      const text = `${p.name || ""} ${p.brand || ""}`.toLowerCase();
      const score = qWords.filter((w) => text.includes(w)).length;
      if (score > 0) allMatches.push({ ...p, _matchScore: score, _cat: cat });
    }
  }

  if (allMatches.length === 0) return null;

  const ranked = allMatches
    .sort(
      (a, b) =>
        b._matchScore - a._matchScore ||
        (b.aiScore || 0) - (a.aiScore || 0),
    )
    .slice(0, MAX_RESPONSE_RESULTS);

  logger.info(
    `🔍 CrossCategory: found ${ranked.length} matches for "${query}" across all top50s (0 API calls)`,
  );
  return ranked.map((p, i) => formatTop50AsResult(p, i + 1));
}

/**
 * Find the best name-matching product in a top50 pool for a given query.
 * Scores each product by how many non-stopword query words appear in its name/brand.
 * Brand match adds extra weight. Returns null if no product scores above threshold.
 */
function findBestNameMatch(pool, query, brand) {
  if (!pool || pool.length === 0) return null;

  const qWords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !QUERY_STOP_WORDS.has(w));

  if (qWords.length === 0) return null;

  let bestScore = 0;
  let bestProduct = null;

  for (const p of pool) {
    const pText = `${p.name || ''} ${p.brand || ''}`.toLowerCase();
    let score = 0;

    for (const word of qWords) {
      if (pText.includes(word)) score++;
    }

    // Brand match is worth 2 extra points — ensures brand-specific searches rank correctly
    if (brand && p.brand && p.brand.toLowerCase().includes(brand.toLowerCase())) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestProduct = p;
    }
  }

  // Need at least 2 meaningful word matches (brand match alone = 2, needs 1 more)
  const minScore = brand ? 3 : 2;
  return bestScore >= minScore ? bestProduct : null;
}

/**
 * Serve PRODUCT_SPECIFIC queries.
 * Priority order (cheapest first):
 * 1. Name-match against top50 Redis snapshot → 0 API calls
 * 2. Fetch from Amazon (1 call) + top50 suggestions
 * 3. Amazon fails but top50 exists → return top50 for category (no mock fallback)
 */
async function serveProductSpecific(intent, query, category, req, res, requestStart, rawQuery, normalizedQuery) {
  const cat = category || intent.category;

  // Load top50 first — needed for name matching AND suggestions regardless of path
  let top50Pool = null;
  if (cat) {
    top50Pool = await getTop50Products(cat);
  }

  // ── PATH A: Name match in top50 (product was in a prior category search) ──
  if (top50Pool && top50Pool.length > 0) {
    const matched = findBestNameMatch(top50Pool, query, intent.brand);
    if (matched) {
      logger.info(`🔍 ProductSpecific: top50 name match — "${matched.name}" for "${query}" (0 API calls)`);

      const primaryProduct = formatTop50AsResult(matched, 1);
      const suggestions = top50Pool
        .filter((p) => p.id !== matched.id)
        .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))
        .slice(0, 5)
        .map((p, i) => formatTop50AsResult(p, i + 1));

      const results = [primaryProduct, ...suggestions.slice(0, 4)];
      cacheResults(query, category, results).catch(() => {});
      saveToMongoCache(query, normalizedQuery, category, results.map((r) => r.asin).filter(Boolean)).catch(() => {});

      req._searchLog.outcome = "redis_top50_product";
      req._searchLog.resultCount = results.length;

      return res.json({
        success: true,
        query: rawQuery,
        normalized: normalizedQuery,
        category: cat || null,
        intent: "PRODUCT_SPECIFIC",
        primaryProduct,
        totalResults: results.length,
        cached: false,
        source: "redis_top50",
        lastUpdated: new Date().toISOString(),
        elapsed_ms: Date.now() - requestStart,
        results,
        suggestions,
      });
    }
  }

  // ── PATH B: Amazon fetch (product not in top50) ───────────────
  logger.info(`🔍 ProductSpecific: Amazon search for "${query}" (model="${intent.model || "-"}")`);

  let amazonProducts = [];
  try {
    amazonProducts = await amazonService.searchProducts(query, category);
    logger.info(`🔍 ProductSpecific: Amazon returned ${amazonProducts.length} products`);
  } catch (err) {
    logger.error(`🔍 ProductSpecific: Amazon failed — ${err.message}`);
  }

  // ── PATH C: Amazon returned 0 but we have top50 → return category products ──
  if (amazonProducts.length === 0) {
    if (top50Pool && top50Pool.length > 0) {
      logger.warn(`🔍 ProductSpecific: Amazon empty — falling back to top50 for category "${cat}"`);
      const fallback = top50Pool
        .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))
        .slice(0, MAX_RESPONSE_RESULTS)
        .map((p, i) => formatTop50AsResult(p, i + 1));

      cacheResults(query, category, fallback).catch(() => {});
      req._searchLog.outcome = "redis_top50_fallback";
      req._searchLog.resultCount = fallback.length;

      return res.json({
        success: true,
        query: rawQuery,
        normalized: normalizedQuery,
        category: cat || null,
        intent: "PRODUCT_SPECIFIC",
        primaryProduct: null,
        totalResults: fallback.length,
        cached: false,
        source: "redis_top50",
        lastUpdated: new Date().toISOString(),
        elapsed_ms: Date.now() - requestStart,
        results: fallback,
        suggestions: fallback,
      });
    }
    return null; // no top50 either — fall through to mock
  }

  // For each product: get affiliate links (non-blocking analysis queued separately)
  const toProcess = amazonProducts.slice(0, 5);
  const processed = await Promise.allSettled(
    toProcess.map(async (p) => {
      const asin = p.asin || p.platformId;
      if (!asin) return null;

      // Check individual product cache
      const cached = await getProductCache(asin);
      if (cached) {
        logger.info(`🔍 ProductSpecific: product cache HIT for ${asin}`);
        return cached;
      }

      // Get affiliate links (fast — Cuelinks API only)
      let affiliateData = { flipkart: null, myntra: null };
      try {
        affiliateData = await getAffiliateLinks(asin, p.name, p.brand, category);
      } catch { /* non-fatal */ }

      const result = formatProductResult(
        {
          ...p,
          flipkartPrice: affiliateData?.flipkart?.price || null,
          flipkartUrl:   affiliateData?.flipkart?.affiliateUrl || affiliateData?.flipkart?.url || null,
          myntraPrice:   affiliateData?.myntra?.price || null,
          myntraUrl:     affiliateData?.myntra?.affiliateUrl || affiliateData?.myntra?.url || null,
        },
        null,
        1,
      );
      if (!result) return null;

      await setProductCache(asin, result).catch(() => {});
      queueAnalysis(asin, p.name, cat, p.brand).catch(() => {});

      return result;
    }),
  );

  const results = processed
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  if (results.length === 0) return null;

  // Suggestions from top50 — exclude any product whose id matches an Amazon result
  let suggestions = [];
  if (top50Pool && top50Pool.length > 0) {
    const resultAsins = new Set(results.map((r) => r.asin));
    suggestions = top50Pool
      .filter((p) => !resultAsins.has(p.id))
      .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))
      .slice(0, 5)
      .map((p, i) => formatTop50AsResult(p, i + 1));
  }

  cacheResults(query, category, results).catch(() => {});
  saveToMongoCache(query, normalizedQuery, category, results.map((p) => p.asin).filter(Boolean)).catch(() => {});

  // Merge into top50:{cat} pool (grows up to 50 as users search)
  if (cat && results.length > 0) {
    const incoming = results.map((p) => enrichedToTop50Shape(p, cat));
    const merged = mergeIntoTop50(top50Pool, incoming);
    if (merged.length !== (top50Pool || []).length) {
      setTop50Products(cat, merged).catch(() => {});
      logger.info(`🔍 ProductSpecific: top50:${cat} grew ${(top50Pool || []).length} → ${merged.length} products`);
    }
  }

  req._searchLog.outcome = "amazon_live_product";
  req._searchLog.resultCount = results.length;

  return res.json({
    success: true,
    query: rawQuery,
    normalized: normalizedQuery,
    category: cat || null,
    intent: "PRODUCT_SPECIFIC",
    primaryProduct: results[0] || null,
    totalResults: results.length,
    cached: false,
    source: "amazon_live",
    lastUpdated: new Date().toISOString(),
    elapsed_ms: Date.now() - requestStart,
    results,
    suggestions: suggestions.length > 0 ? suggestions : results.slice(1),
  });
}

// ═════════════════════════════════════════════════════════════════
// MAIN SEARCH HANDLER
// ═════════════════════════════════════════════════════════════════

async function handleSearch(req, res) {
  const requestStart = Date.now();

  // ── STEP 1: Validate + Sanitize ──────────────────────────────
  const rawQuery = req.query.q || req.query.query || "";
  const rawCategory = req.query.category || req.query.cat || "";

  const validation = validateAndSanitize(rawQuery, rawCategory);

  if (!validation.valid) {
    logger.warn(
      `🔍 Search: invalid query — "${rawQuery}" — ${validation.error}`,
    );
    return res.status(validation.code || 400).json({
      success: false,
      error: validation.error,
      query: rawQuery,
    });
  }

  const { query, category, normalizedQuery } = validation;
  req._searchLog.query = query;
  req._searchLog.category = category;

  logger.info(
    `🔍 Search: validated q="${query}" → normalized="${normalizedQuery}" category="${category}"`,
  );

  // ── STEP 2: Redis Cache Check ─────────────────────────────────
  // getCachedResults() in redis.js uses buildSearchKey() internally
  // and handles all the HIT/MISS logging + hit count update.
  try {
    const redisResults = await checkRedisCache(query, category);

    if (redisResults && redisResults.length > 0) {
      // Apply strict category filter — prevents returning wrong-category cached data
      const redisFiltered = filterByCategory(redisResults, category);
      if (redisFiltered.length === 0 && category) {
        logger.warn(
          `🔍 Category filter: Redis has ${redisResults.length} results but NONE match category="${category}" — cache miss, refetching`,
        );
        // Fall through to MongoDB / live fetch
      } else {
        const catMatched = redisFiltered.length > 0 ? redisFiltered : redisResults;
        // Apply query relevance — prevents e.g. all appliances when searching "washing machines"
        const finalRedis = filterByQueryRelevance(catMatched, query);
        req._searchLog.outcome = "redis_hit";
        return res.json({
          success: true,
          query: rawQuery,
          normalized: normalizedQuery,
          category: category || null,
          totalResults: Math.min(finalRedis.length, MAX_RESPONSE_RESULTS),
          cached: true,
          cacheSource: "redis",
          lastUpdated: new Date().toISOString(),
          elapsed_ms: Date.now() - requestStart,
          results: addRanks(finalRedis.slice(0, MAX_RESPONSE_RESULTS)),
        });
      }
    }
  } catch (cacheErr) {
    // Non-fatal: continue to live fetch
    logger.warn(`🔍 Search: Redis check threw — ${cacheErr.message}`);
  }

  // ── STEP 3: MongoDB SearchCache Check ────────────────────────
  // Second-tier cache: survives Redis flushes, slower than Redis but
  // faster than re-scraping. Uses TTL index for auto-expiry.
  try {
    const mongoResults = await checkMongoCache(normalizedQuery, category);

    if (mongoResults && mongoResults.length > 0) {
      // Apply strict category filter — prevents returning wrong-category cached data
      const mongoFiltered = filterByCategory(mongoResults, category);
      if (mongoFiltered.length === 0 && category) {
        logger.warn(
          `🔍 Category filter: MongoDB has ${mongoResults.length} results but NONE match category="${category}" — cache miss, refetching`,
        );
        // Fall through to live fetch
      } else {
        const catMatchedMongo = mongoFiltered.length > 0 ? mongoFiltered : mongoResults;
        // Apply query relevance — prevents e.g. all appliances when searching "washing machines"
        const finalMongo = filterByQueryRelevance(catMatchedMongo, query);
        req._searchLog.outcome = "mongo_hit";

        // Repopulate Redis while we respond (non-blocking)
        cacheResults(query, category, finalMongo).catch((err) =>
          logger.warn(`🔍 Search: Redis repopulate failed — ${err.message}`),
        );

        return res.json({
          success: true,
          query: rawQuery,
          normalized: normalizedQuery,
          category: category || null,
          totalResults: Math.min(finalMongo.length, MAX_RESPONSE_RESULTS),
          cached: true,
          cacheSource: "mongodb",
          lastUpdated: new Date().toISOString(),
          elapsed_ms: Date.now() - requestStart,
          results: addRanks(finalMongo.slice(0, MAX_RESPONSE_RESULTS)),
        });
      }
    }
  } catch (mongoErr) {
    logger.warn(`🔍 Search: MongoDB check threw — ${mongoErr.message}`);
  }

  // ── STEP 3.5: Intent-based Redis-first routing ───────────────
  // Classify the user's intent and attempt to serve from Redis (top50 / brand index)
  // before touching any external API. Amazon is only called for PRODUCT_SPECIFIC misses.
  //
  // effectiveCategory: URL param takes priority; falls back to intent-detected category.
  // This is critical — users almost never send a `category` URL param, so `category`
  // is usually "". Without the fallback, all Redis seeding and caching uses "" as the
  // key, making top50 completely useless.
  let effectiveCategory = category || null;
  let detectedIntent = null;

  try {
    const intent = classifyIntent(query, category);
    detectedIntent = intent;
    effectiveCategory = category || intent.category || null;
    logger.info(
      `🔍 Intent: ${intent.intent} confidence=${intent.confidence} ` +
        `cat=${intent.category || "-"} brand=${intent.brand || "-"} ` +
        `model=${intent.model || "-"} price=${intent.price_min || "*"}–${intent.price_max || "*"}` +
        ` effectiveCat="${effectiveCategory || "none"}"`,
    );

    if (
      intent.intent === INTENT.CATEGORY ||
      intent.intent === INTENT.BRAND_CATEGORY
    ) {
      // Load raw pool once — reuse for both name-match and category listing
      const rawPool = effectiveCategory ? await getTop50Products(effectiveCategory) : null;

      // ── Name-match check: if query looks like a specific product name (≥4 meaningful
      // words), try to find the exact product in top50 and return it as primaryProduct.
      // This handles: user searched "washing machine" → copied result name → searched again.
      const meaningfulWords = query.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !QUERY_STOP_WORDS.has(w));

      if (meaningfulWords.length >= 4 && rawPool && rawPool.length > 0) {
        const nameMatch = findBestNameMatch(rawPool, query, intent.brand);
        if (nameMatch) {
          logger.info(`🔍 Category→ProductSpecific: name match "${nameMatch.name?.slice(0, 50)}" (0 API calls)`);
          const primaryProduct = formatTop50AsResult(nameMatch, 1);
          const suggestions = rawPool
            .filter((p) => p.id !== nameMatch.id)
            .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))
            .slice(0, 5)
            .map((p, i) => formatTop50AsResult(p, i + 1));
          const results = [primaryProduct, ...suggestions.slice(0, 4)];
          cacheResults(query, effectiveCategory, results).catch(() => {});
          req._searchLog.outcome = "redis_top50_product";
          req._searchLog.resultCount = results.length;
          return res.json({
            success: true,
            query: rawQuery,
            normalized: normalizedQuery,
            category: effectiveCategory || null,
            intent: "PRODUCT_SPECIFIC",
            primaryProduct,
            totalResults: results.length,
            cached: false,
            source: "redis_top50",
            lastUpdated: new Date().toISOString(),
            elapsed_ms: Date.now() - requestStart,
            results,
            suggestions,
          });
        }
      }

      // ── Regular category listing from top50
      const top50Results = rawPool && rawPool.length > 0
        ? await serveFromTop50(intent, query)  // serveFromTop50 re-reads top50 (fast Redis read)
        : null;
      if (top50Results && top50Results.length > 0) {
        const filtered = filterByQueryRelevance(top50Results, query);
        const final = filtered.length >= 3 ? filtered : top50Results;
        cacheResults(query, effectiveCategory, final).catch(() => {});
        req._searchLog.outcome = "redis_top50";
        req._searchLog.resultCount = final.length;
        return res.json({
          success: true,
          query: rawQuery,
          normalized: normalizedQuery,
          category: effectiveCategory || null,
          intent: intent.intent,
          totalResults: final.length,
          cached: false,
          source: "redis_top50",
          lastUpdated: new Date().toISOString(),
          elapsed_ms: Date.now() - requestStart,
          results: addRanks(final),
          suggestions: addRanks(final),
        });
      }
      // top50 empty for this category — try cross-category before Amazon
      logger.info(`🔍 Intent: top50 miss for "${effectiveCategory}" — trying cross-category search`);
      const crossFallback = await searchAcrossAllCategories(query);
      if (crossFallback && crossFallback.length > 0) {
        cacheResults(query, effectiveCategory, crossFallback).catch(() => {});
        req._searchLog.outcome = "redis_cross_category";
        req._searchLog.resultCount = crossFallback.length;
        return res.json({
          success: true,
          query: rawQuery,
          normalized: normalizedQuery,
          category: effectiveCategory || null,
          intent: intent.intent,
          totalResults: crossFallback.length,
          cached: false,
          source: "redis_top50",
          lastUpdated: new Date().toISOString(),
          elapsed_ms: Date.now() - requestStart,
          results: addRanks(crossFallback),
          suggestions: addRanks(crossFallback),
        });
      }
      logger.info(`🔍 Intent: cross-category also empty — falling through to Amazon`);
    } else if (intent.intent === INTENT.PRODUCT_SPECIFIC) {
      // Search Amazon for specific product + queue background analysis
      const productResponse = await serveProductSpecific(
        intent, query, effectiveCategory, req, res, requestStart, rawQuery, normalizedQuery,
      );
      if (productResponse) return productResponse; // response already sent
      // Amazon failed — fall through to mock/error handling below
    } else {
      // GENERIC / LOW_CONFIDENCE / FALLBACK — try keyword filter on top50
      const genericResults = await serveGeneric(intent, query);
      if (genericResults && genericResults.length > 0) {
        cacheResults(query, category, genericResults).catch(() => {});
        req._searchLog.outcome = "redis_generic";
        req._searchLog.resultCount = genericResults.length;
        return res.json({
          success: true,
          query: rawQuery,
          normalized: normalizedQuery,
          category: category || intent.category || null,
          intent: intent.intent,
          totalResults: genericResults.length,
          cached: false,
          source: "redis_top50",
          lastUpdated: new Date().toISOString(),
          elapsed_ms: Date.now() - requestStart,
          results: addRanks(genericResults),
          suggestions: addRanks(genericResults),
        });
      }

      // No category detected or top50 empty — try searching across ALL categories
      // before touching Amazon. Handles queries like "noise cancelling", "inverter ac", etc.
      const crossResults = await searchAcrossAllCategories(query);
      if (crossResults && crossResults.length > 0) {
        cacheResults(query, category, crossResults).catch(() => {});
        req._searchLog.outcome = "redis_cross_category";
        req._searchLog.resultCount = crossResults.length;
        return res.json({
          success: true,
          query: rawQuery,
          normalized: normalizedQuery,
          category: null,
          intent: intent.intent,
          totalResults: crossResults.length,
          cached: false,
          source: "redis_top50",
          lastUpdated: new Date().toISOString(),
          elapsed_ms: Date.now() - requestStart,
          results: addRanks(crossResults),
          suggestions: addRanks(crossResults),
        });
      }
      // Still nothing — fall through to Amazon
    }
  } catch (intentErr) {
    logger.warn(`🔍 Intent routing error — ${intentErr.message} — falling through to Amazon`);
  }

  // ── STEP 4: Cache MISS — Fetch from Amazon PA-API (or mock fallback) ──
  logger.info(
    `🔍 Search: cache miss — fetching from Amazon PA-API for "${query}"`,
  );

  let amazonProducts = [];
  let usingMockData = false;

  try {
    amazonProducts = await amazonService.searchProducts(query, effectiveCategory);
    logger.info(`🔍 Search: Amazon returned ${amazonProducts.length} products`);
  } catch (amazonErr) {
    logger.error(`🔍 Search: Amazon PA-API failed — ${amazonErr.message}`);
  }

  // If Amazon returned nothing (no credentials, API error, or 0 results),
  // fall back to mock_products.json so the full pipeline still runs
  if (amazonProducts.length === 0) {
    logger.warn(
      `🔍 Search: Amazon returned 0 products — falling back to mock data`,
    );
    amazonProducts = getMockProductsForSearch(query, effectiveCategory);
    usingMockData = amazonProducts.length > 0;

    if (usingMockData) {
      logger.info(
        `🔍 Search: mock fallback loaded ${amazonProducts.length} products for "${query}"`,
      );
    }
  }

  if (amazonProducts.length === 0) {
    logger.warn(`🔍 Search: no products from Amazon or mock for "${query}"`);
    return res.status(404).json({
      success: false,
      error: "No products found. Try a different search term.",
      query: rawQuery,
      totalResults: 0,
      results: [],
    });
  }

  // Take top 15 for enrichment (we'll filter to 10 after scoring)
  const toEnrich = amazonProducts.slice(0, MAX_AMAZON_RESULTS);

  // ── STEP 5: Enrich Each Product in Parallel ──────────────────
  // For each product: analysis pipeline + Cuelinks affiliate links
  logger.info(
    `🔍 Search: enriching ${toEnrich.length} products (batched, concurrency=${PARALLEL_CONCURRENCY})`,
  );

  let enrichedProducts;
  try {
    enrichedProducts = await enrichProductsBatched(toEnrich, effectiveCategory);
  } catch (enrichErr) {
    logger.error(`🔍 Search: enrichment batch failed — ${enrichErr.message}`);
    enrichedProducts = [];
  }

  if (enrichedProducts.length === 0) {
    logger.warn(`🔍 Search: all products failed enrichment for "${query}"`);
    return res.status(500).json({
      success: false,
      error: "Product analysis failed. Please try again.",
      query: rawQuery,
      elapsed_ms: Date.now() - requestStart,
    });
  }

  // ── STEP 5.5: Strict category post-filter ────────────────────
  // Uses effectiveCategory (URL param OR intent-detected) so filtering works
  // even when the user didn't send a category URL param.
  if (effectiveCategory) {
    const catFiltered = filterByCategory(enrichedProducts, effectiveCategory);
    if (catFiltered.length > 0) {
      if (catFiltered.length < enrichedProducts.length) {
        logger.info(
          `🔍 Category filter: "${effectiveCategory}" kept ${catFiltered.length}/${enrichedProducts.length} products`,
        );
      }
      enrichedProducts = catFiltered;
    } else {
      logger.warn(
        `🔍 Category filter: all ${enrichedProducts.length} live results failed category="${effectiveCategory}" filter — skipping filter`,
      );
      // Don't return 404 — just skip the filter and show what we have
    }
  }

  // ── STEP 5.6: Query relevance filter ───────────────────────
  // Within the matched category, ensure products match the specific query.
  // e.g. "washing machines" → only washing machines, not fridges + irons.
  enrichedProducts = filterByQueryRelevance(enrichedProducts, query);

  // ── STEP 6: Sort by AI Score, Take Top 10 ────────────────────
  const ranked = enrichedProducts
    .filter((p) => p !== null)
    .sort((a, b) => {
      // Products with aiScore rank first; null scores go to bottom
      if (a.aiScore === null && b.aiScore === null) return 0;
      if (a.aiScore === null) return 1;
      if (b.aiScore === null) return -1;
      return b.aiScore - a.aiScore;
    })
    .slice(0, MAX_RESPONSE_RESULTS)
    .map((product, index) => ({ ...product, rank: index + 1 }));

  logger.info(
    `🔍 Search: ranked ${ranked.length} products. ` +
      `#1: "${ranked[0]?.name?.slice(0, 40)}" aiScore=${ranked[0]?.aiScore}`,
  );

  // ── STEP 7: Save to Caches (non-blocking) ────────────────────
  const asinList = ranked.map((p) => p.asin).filter(Boolean);

  // Redis search cache — use effectiveCategory so the key is meaningful
  cacheResults(query, effectiveCategory, ranked).catch((err) =>
    logger.warn(`🔍 Search: Redis save failed — ${err.message}`),
  );

  // MongoDB SearchCache — ASINs only, TTL index handles expiry
  saveToMongoCache(query, normalizedQuery, effectiveCategory, asinList).catch((err) =>
    logger.warn(`🔍 Search: MongoDB cache save failed — ${err.message}`),
  );

  // Merge Amazon results into top50:{effectiveCategory} pool (max 50).
  // Cron seeds only 10; pool grows organically as users search.
  // Deduplicates by id so repeat searches don't bloat the pool.
  // Skip if mock data or no detected category.
  if (effectiveCategory && ranked.length > 0 && !usingMockData) {
    getTop50Products(effectiveCategory).then((existing) => {
      if (!existing || existing.length < TOP50_MAX) {
        const incoming = ranked.map((p) => enrichedToTop50Shape(p, effectiveCategory));
        const merged = mergeIntoTop50(existing, incoming);
        if (merged.length !== (existing || []).length) {
          setTop50Products(effectiveCategory, merged).catch(() => {});
          logger.info(`🔍 Search: top50:${effectiveCategory} grew ${(existing || []).length} → ${merged.length} products`);
        }
      }
    }).catch(() => {});
  }

  // ── STEP 8: Return Response ───────────────────────────────────
  const elapsed = Date.now() - requestStart;
  req._searchLog.outcome = usingMockData ? "mock_fallback" : "live";
  req._searchLog.resultCount = ranked.length;

  logger.info(
    `🔍 Search: complete — ${ranked.length} results in ${elapsed}ms` +
      (usingMockData ? " (mock fallback)" : ""),
  );

  return res.json({
    success: true,
    query: rawQuery,
    normalized: normalizedQuery,
    category: effectiveCategory || null,
    totalResults: ranked.length,
    cached: false,
    cacheSource: null,
    source: usingMockData ? "mock_fallback" : "live",
    lastUpdated: new Date().toISOString(),
    elapsed_ms: elapsed,
    results: ranked,
  });
}

// ═════════════════════════════════════════════════════════════════
// SUGGESTIONS ENDPOINT
// ═════════════════════════════════════════════════════════════════
// GET /api/search/suggestions?q=sony
// Autocomplete — currently static list, can be upgraded to:
//   - Top N queries from MongoDB SearchCache (real user data)
//   - Amazon autocomplete API proxy

async function handleSuggestions(req, res) {
  const q = (req.query.q || "").toLowerCase().trim();

  if (q.length < 2) {
    return res.json({ suggestions: [] });
  }

  // Try to serve from MongoDB SearchCache first (real search history)
  let suggestions = [];
  try {
    if (mongoose.connection.readyState === 1) {
      const recentSearches = await SearchCache.find({
        normalizedQuery: { $regex: q, $options: "i" },
      })
        .sort({ createdAt: -1 })
        .limit(6)
        .select("query")
        .lean()
        .exec();

      suggestions = recentSearches.map((s) => s.query).filter(Boolean);
    }
  } catch (err) {
    logger.warn(`🔍 Suggestions: MongoDB query failed — ${err.message}`);
  }

  // Fall back to static list if MongoDB returned nothing
  if (suggestions.length === 0) {
    const STATIC_SUGGESTIONS = [
      "Sony WH-1000XM5 headphones",
      "iPhone 15 Pro",
      "Samsung Galaxy S24",
      "MacBook Air M3",
      "Nike Air Max",
      "Adidas Ultraboost running shoes",
      "boAt Rockerz wireless headphones",
      "Bose QuietComfort 45",
      "Apple AirPods Pro",
      "Logitech MX Master gaming mouse",
      "mechanical keyboard",
      "running shoes",
      "air fryer",
      "robot vacuum cleaner",
      "The Ordinary niacinamide serum",
      "OnePlus 12",
      "Realme GT Neo 5",
      "Samsung Galaxy Buds",
      "JBL Flip speaker",
      "Kindle Paperwhite",
    ];

    suggestions = STATIC_SUGGESTIONS.filter((s) =>
      s.toLowerCase().includes(q),
    ).slice(0, 6);
  }

  return res.json({ suggestions: suggestions.slice(0, 6) });
}

// ═════════════════════════════════════════════════════════════════
// UTILITIES
// ═════════════════════════════════════════════════════════════════

// Promise with timeout — prevents hung requests
function withTimeout(promise, ms, label) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} (${ms}ms)`)), ms),
  );
  return Promise.race([promise, timeout]);
}

// Add rank numbers to cached results that may have lost theirs
function addRanks(results) {
  return results.map((r, i) => ({
    ...r,
    rank: r.rank || i + 1,
  }));
}

// Compute price trend from history array
function computePriceTrend(priceHistory, currentPrice) {
  if (!priceHistory || priceHistory.length < 2) return "stable";

  // Compare the current price vs 14 days ago
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const oldEntries = priceHistory.filter(
    (h) => new Date(h.date).getTime() < fourteenDaysAgo,
  );

  if (oldEntries.length === 0) return "stable";

  const oldPrice = oldEntries[oldEntries.length - 1].price;
  const latestPrice =
    currentPrice || priceHistory[priceHistory.length - 1]?.price;

  if (!oldPrice || !latestPrice) return "stable";

  const changePct = (latestPrice - oldPrice) / oldPrice;

  if (changePct < -0.03) return "dropping"; // >3% drop
  if (changePct > 0.03) return "rising"; // >3% rise
  return "stable";
}

// ═════════════════════════════════════════════════════════════════
// ROUTE DEFINITIONS
// ═════════════════════════════════════════════════════════════════
// Matches the existing pattern in routes/search.js:
//   router.post('/')      → controller.search
//   router.get('/suggestions') → controller.suggestions
//
// This file replaces the controller pattern with inline handlers
// (matching the style of routes/admin.js and routes/analytics.js
// which also inline their logic directly in the route file).

// Suggestions — no rate limit (lightweight, no external API calls)
router.get("/suggestions", handleSuggestions);

// Main search — with rate limiter + request logger
router.get("/", searchRateLimiter, requestLogger, handleSearch);

// Keep backward compatibility: the old route was POST
// Some frontend code may still call POST — redirect to GET handler
router.post("/", searchRateLimiter, requestLogger, (req, res, next) => {
  // Normalize POST body to GET query params and re-run handler
  req.query.q = req.query.q || req.body?.query || req.body?.q || "";
  req.query.category = req.query.category || req.body?.category || "";
  return handleSearch(req, res, next);
});

// Job status polling endpoint (async live-fetch jobs)
// GET /api/search/status/:jobId
router.get("/status/:jobId", async (req, res) => {
  const { jobStatus } = require("../controllers/searchController");
  return jobStatus(req, res);
});

module.exports = router;
