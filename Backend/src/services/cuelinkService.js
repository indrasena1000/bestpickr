// src/services/cuelinksService.js — Cuelinks Affiliate Integration
// ─────────────────────────────────────────────────────────────────
// PURPOSE:
//   Get Flipkart + Myntra affiliate links and pricing for products
//   already found on Amazon. Cuelinks acts as a single affiliate
//   network covering both platforms under one API.
//
// ARCHITECTURE:
//   This service is called AFTER Amazon PA-API returns product data.
//   It takes an Amazon product and tries to find the matching product
//   on Flipkart/Myntra for price comparison + affiliate revenue.
//
// FLOW:
//   getAffiliateLinks(asin, productName, brand, category)
//     ├── searchFlipkart(productName, brand)
//     │     └── matchProduct() → confidence check → affiliate link
//     ├── searchMyntra(productName, brand, category)  [fashion only]
//     │     └── matchProduct() → confidence check → affiliate link
//     └── Return { flipkart, myntra, bestDeal }
//
// CACHING:
//   Redis key: bestpickr:cuelinks:{asin}
//   TTL: 6 hours (prices change, but not hourly)
//   Matches your existing bestpickr:* key convention in redis.js
//
// COST:
//   Cuelinks API is free with their affiliate program.
//   ScraperAPI credits used only if Cuelinks doesn't have direct search.
//
// ENVIRONMENT VARIABLES:
//   CUELINKS_API_KEY     — From your Cuelinks publisher dashboard
//   CUELINKS_WEBSITE_ID  — Your registered website ID on Cuelinks
//   SCRAPER_API_KEY      — Already used in flipkartService.js
// ─────────────────────────────────────────────────────────────────
"use strict";

const axios = require("axios");
const logger = require("../utils/logger");
const { getClient: getRedis } = require("../utils/redis");

// ── CONFIG ────────────────────────────────────────────────────────
const CUELINKS_API_KEY = process.env.CUELINKS_API_KEY;
const CUELINKS_WEBSITE_ID = process.env.CUELINKS_WEBSITE_ID;
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

const CACHE_TTL = 6 * 60 * 60; // 6 hours in seconds
const REDIS_KEY_PREFIX = "bestpickr:cuelinks"; // Matches your key convention
const REQUEST_TIMEOUT = 15000; // 15s — Cuelinks API is fast
const MIN_MATCH_CONFIDENCE = 70; // Below this → return null (wrong product)

// ── MYNTRA-RELEVANT CATEGORIES ────────────────────────────────────
// Only search Myntra for fashion/beauty — saves API credits for electronics
const MYNTRA_CATEGORIES = new Set([
  "footwear",
  "fashion",
  "skincare",
  "beauty",
  "accessories",
  "clothing",
  "bags",
  "jewellery",
  "watches",
  "sports",
]);

const MYNTRA_KEYWORDS = [
  "shoe",
  "sneaker",
  "sandal",
  "boot",
  "heel",
  "shirt",
  "tshirt",
  "t-shirt",
  "jeans",
  "kurta",
  "saree",
  "dress",
  "serum",
  "sunscreen",
  "moisturizer",
  "cleanser",
  "bag",
  "wallet",
  "watch",
  "sunglasses",
  "belt",
  "jacket",
];

function isMyntraRelevant(productName, category) {
  if (MYNTRA_CATEGORIES.has(category?.toLowerCase())) return true;
  const q = (productName || "").toLowerCase();
  return MYNTRA_KEYWORDS.some((kw) => q.includes(kw));
}

// ═════════════════════════════════════════════════════════════════
// MAIN EXPORT: getAffiliateLinks()
// ═════════════════════════════════════════════════════════════════
/**
 * Get Flipkart + Myntra affiliate links and pricing for a product.
 *
 * This is the primary function called by the search pipeline.
 * Always returns an object (never throws) — failures return null fields.
 *
 * @param {string} asin        — Amazon ASIN (used as cache key)
 * @param {string} productName — e.g. "Sony WH-1000XM5"
 * @param {string} brand       — e.g. "Sony"
 * @param {string} category    — e.g. "headphones"
 * @returns {Object} {
 *   flipkart: { price, affiliateUrl, url, inStock, rating } | null,
 *   myntra:   { price, affiliateUrl, url, inStock, rating } | null,
 *   bestDeal: { platform, price, saving } | null,
 *   cached:   boolean,
 *   error:    string | null
 * }
 */
async function getAffiliateLinks(asin, productName, brand, category) {
  const startTime = Date.now();
  logger.info(
    `🔗 Cuelinks: getAffiliateLinks for ASIN=${asin} ` +
      `"${productName}" brand="${brand}" category="${category}"`,
  );

  // ── STEP 1: Check Redis cache first ─────────────────────────
  const cached = await getCachedLinks(asin);
  if (cached) {
    logger.info(
      `🔗 Cuelinks: Redis HIT for ${asin} (${Date.now() - startTime}ms)`,
    );
    return { ...cached, cached: true, error: null };
  }

  // ── STEP 2: Fetch from Cuelinks + matching in parallel ──────
  const result = {
    flipkart: null,
    myntra: null,
    bestDeal: null,
    cached: false,
    error: null,
  };

  try {
    // Run Flipkart and Myntra searches in parallel — saves time
    const [flipkartResult, myntraResult] = await Promise.allSettled([
      searchFlipkart(productName, brand),
      isMyntraRelevant(productName, category)
        ? searchMyntra(productName, brand, category)
        : Promise.resolve(null),
    ]);

    // Process Flipkart result
    if (flipkartResult.status === "fulfilled" && flipkartResult.value) {
      result.flipkart = flipkartResult.value;
      logger.info(
        `🔗 Cuelinks: Flipkart match found — ₹${result.flipkart.price} ` +
          `confidence=${result.flipkart._confidence}%`,
      );
    } else if (flipkartResult.status === "rejected") {
      logger.warn(
        `🔗 Cuelinks: Flipkart search failed — ${flipkartResult.reason?.message}`,
      );
    }

    // Process Myntra result
    if (myntraResult.status === "fulfilled" && myntraResult.value) {
      result.myntra = myntraResult.value;
      logger.info(
        `🔗 Cuelinks: Myntra match found — ₹${result.myntra.price} ` +
          `confidence=${result.myntra._confidence}%`,
      );
    } else if (myntraResult.status === "rejected") {
      logger.warn(
        `🔗 Cuelinks: Myntra search failed — ${myntraResult.reason?.message}`,
      );
    }

    // ── STEP 3: Calculate best deal ─────────────────────────────
    result.bestDeal = computeBestDeal(result.flipkart, result.myntra);

    // ── STEP 4: Cache the result ─────────────────────────────────
    // Clean internal fields before caching
    const cachePayload = {
      flipkart: result.flipkart ? cleanForCache(result.flipkart) : null,
      myntra: result.myntra ? cleanForCache(result.myntra) : null,
      bestDeal: result.bestDeal,
    };
    await setCachedLinks(asin, cachePayload);

    const elapsed = Date.now() - startTime;
    logger.info(
      `🔗 Cuelinks: COMPLETE for ${asin} — ` +
        `flipkart=${result.flipkart ? "✅" : "❌"} ` +
        `myntra=${result.myntra ? "✅" : "❌"} (${elapsed}ms)`,
    );

    return result;
  } catch (err) {
    // This catch is a last resort — individual functions handle their own errors
    logger.error(`🔗 Cuelinks: unexpected error for ${asin} — ${err.message}`);
    return {
      flipkart: null,
      myntra: null,
      bestDeal: null,
      cached: false,
      error: err.message,
    };
  }
}

// ═════════════════════════════════════════════════════════════════
// FUNCTION 1: searchFlipkart()
// ═════════════════════════════════════════════════════════════════
/**
 * Search Flipkart for a product and return affiliate link + price.
 *
 * Strategy:
 *   1. Try Cuelinks product search API (if available)
 *   2. Fall back to building a Flipkart search URL + affiliate conversion
 *
 * @param {string} productName
 * @param {string} brand
 * @returns {Object|null} { price, url, affiliateUrl, inStock, rating, _confidence }
 */
async function searchFlipkart(productName, brand) {
  logger.info(`🔗 Cuelinks: searching Flipkart for "${productName}"`);

  // ── APPROACH 1: Cuelinks Product Search API ──────────────────
  // Cuelinks has a product search endpoint that returns affiliate links directly
  if (CUELINKS_API_KEY && CUELINKS_WEBSITE_ID) {
    try {
      const cuelinksResult = await searchViaCuelinks(
        productName,
        brand,
        "flipkart",
      );
      if (cuelinksResult) {
        logger.info(`🔗 Cuelinks: Flipkart result via Cuelinks API`);
        return cuelinksResult;
      }
    } catch (err) {
      logger.warn(
        `🔗 Cuelinks: Cuelinks API search failed — ${err.message} — trying fallback`,
      );
    }
  }

  // ── APPROACH 2: Build Flipkart search URL + convert to affiliate ──
  // This works even without Cuelinks product search
  // The affiliate link redirects through Cuelinks tracking
  try {
    const flipkartSearchUrl = buildFlipkartSearchUrl(productName, brand);
    const affiliateUrl = await convertToAffiliateLink(
      flipkartSearchUrl,
      "flipkart",
    );

    // We don't have real price from a search URL — return null price
    // The frontend shows "Check Price" instead of a specific price
    // This is better than showing wrong price
    if (affiliateUrl) {
      return {
        price: null, // Unknown without scraping
        url: flipkartSearchUrl,
        affiliateUrl,
        inStock: true, // Assume in stock — user will verify
        rating: null,
        reviewCount: null,
        _confidence: 60, // Lower confidence — it's a search URL, not exact product
        _source: "search_url",
      };
    }
  } catch (err) {
    logger.warn(`🔗 Cuelinks: Flipkart URL fallback failed — ${err.message}`);
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════
// FUNCTION 2: searchMyntra()
// ═════════════════════════════════════════════════════════════════
/**
 * Search Myntra for a product (fashion/beauty categories only).
 *
 * @param {string} productName
 * @param {string} brand
 * @param {string} category
 * @returns {Object|null} { price, url, affiliateUrl, inStock, rating, _confidence }
 */
async function searchMyntra(productName, brand, category) {
  if (!isMyntraRelevant(productName, category)) {
    logger.info(
      `🔗 Cuelinks: skipping Myntra for "${productName}" — not fashion/beauty`,
    );
    return null;
  }

  logger.info(`🔗 Cuelinks: searching Myntra for "${productName}"`);

  // ── APPROACH 1: Cuelinks Product Search API ──────────────────
  if (CUELINKS_API_KEY && CUELINKS_WEBSITE_ID) {
    try {
      const cuelinksResult = await searchViaCuelinks(
        productName,
        brand,
        "myntra",
      );
      if (cuelinksResult) {
        logger.info(`🔗 Cuelinks: Myntra result via Cuelinks API`);
        return cuelinksResult;
      }
    } catch (err) {
      logger.warn(
        `🔗 Cuelinks: Cuelinks API Myntra search failed — ${err.message}`,
      );
    }
  }

  // ── APPROACH 2: Build Myntra search URL + convert to affiliate ──
  try {
    const myntraSearchUrl = buildMyntraSearchUrl(productName, brand);
    const affiliateUrl = await convertToAffiliateLink(
      myntraSearchUrl,
      "myntra",
    );

    if (affiliateUrl) {
      return {
        price: null,
        url: myntraSearchUrl,
        affiliateUrl,
        inStock: true,
        rating: null,
        reviewCount: null,
        _confidence: 60,
        _source: "search_url",
      };
    }
  } catch (err) {
    logger.warn(`🔗 Cuelinks: Myntra URL fallback failed — ${err.message}`);
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════
// FUNCTION 3: matchProduct()
// ═════════════════════════════════════════════════════════════════
/**
 * Match an Amazon product to a platform listing with confidence scoring.
 *
 * This is the hardest part — determining if a Flipkart/Myntra result
 * is actually the same physical product as the Amazon listing.
 *
 * Match strategy:
 *   a. Exact model number match → 95% confidence
 *   b. Brand + product name fuzzy match → variable confidence
 *   c. Below 70% → return null (better to show nothing than wrong product)
 *
 * @param {Object} amazonProduct  — { title, brand, asin }
 * @param {Object} platformResult — { name, brand, price, url } from platform
 * @returns {Object} { isMatch, confidence, matchType }
 */
function matchProduct(amazonProduct, platformResult) {
  const amazonTitle = (amazonProduct.title || "").toLowerCase().trim();
  const amazonBrand = (amazonProduct.brand || "").toLowerCase().trim();
  const platformName = (platformResult.name || "").toLowerCase().trim();
  const platformBrand = (platformResult.brand || "").toLowerCase().trim();

  let confidence = 0;
  let matchType = "none";

  // ── MATCH A: Exact model number ──────────────────────────────
  // Extract model numbers (alphanumeric codes like WH-1000XM5, S24+, etc.)
  const amazonModels = extractModelNumbers(amazonTitle);
  const platformModels = extractModelNumbers(platformName);

  const exactModelMatch = amazonModels.some((m) => platformModels.includes(m));
  if (exactModelMatch && amazonModels.length > 0) {
    confidence = 95;
    matchType = "exact_model";
    logger.info(
      `🔗 Match: EXACT model number match — ` +
        `amazon models=[${amazonModels}] platform models=[${platformModels}]`,
    );
    return { isMatch: true, confidence, matchType };
  }

  // ── MATCH B: Brand match + fuzzy name match ──────────────────
  // First check if brands match (quick filter — wrong brand = wrong product)
  const brandMatch =
    amazonBrand &&
    platformBrand &&
    (amazonBrand.includes(platformBrand) ||
      platformBrand.includes(amazonBrand));

  if (!brandMatch && amazonBrand && platformBrand) {
    logger.info(
      `🔗 Match: brand mismatch — amazon="${amazonBrand}" platform="${platformBrand}" → 0%`,
    );
    return { isMatch: false, confidence: 0, matchType: "brand_mismatch" };
  }

  // Brand matches (or brand unknown) — now check name similarity
  const nameSimilarity = computeNameSimilarity(amazonTitle, platformName);
  confidence = brandMatch ? nameSimilarity : nameSimilarity * 0.7; // Penalize unknown brand

  if (confidence >= 85) {
    matchType = "high_confidence_name";
  } else if (confidence >= MIN_MATCH_CONFIDENCE) {
    matchType = "fuzzy_name";
  } else {
    matchType = "low_confidence";
  }

  const isMatch = confidence >= MIN_MATCH_CONFIDENCE;

  logger.info(
    `🔗 Match: name similarity=${nameSimilarity}% brand=${brandMatch ? "yes" : "no"} ` +
      `→ confidence=${confidence}% match=${isMatch}`,
  );

  return { isMatch, confidence, matchType };
}

// ═════════════════════════════════════════════════════════════════
// CUELINKS API INTEGRATION
// ═════════════════════════════════════════════════════════════════

/**
 * Search for a product via Cuelinks' product search API.
 * Returns affiliate link + product data if found.
 *
 * Cuelinks API docs: https://cuelinks.com/publisher/api-docs
 *
 * @param {string} productName
 * @param {string} brand
 * @param {string} platform — 'flipkart' | 'myntra'
 * @returns {Object|null}
 */
async function searchViaCuelinks(productName, brand, platform) {
  if (!CUELINKS_API_KEY || !CUELINKS_WEBSITE_ID) {
    throw new Error("Cuelinks API credentials not configured");
  }

  // Build search query: brand + product name gives best results
  const searchQuery = [brand, productName]
    .filter(Boolean)
    .join(" ")
    .slice(0, 100);

  // Cuelinks affiliate link generation endpoint
  // They provide a product search API and a link conversion API
  const response = await axios.get(
    "https://api.cuelinks.com/v1/products/search",
    {
      timeout: REQUEST_TIMEOUT,
      params: {
        api_key: CUELINKS_API_KEY,
        website_id: CUELINKS_WEBSITE_ID,
        query: searchQuery,
        store: platform, // 'flipkart' or 'myntra'
        country: "IN",
        limit: 5, // Get top 5, we'll pick the best match
      },
      headers: {
        Accept: "application/json",
        "User-Agent": "bestpickr.in/1.0",
      },
    },
  );

  const products = response.data?.products || response.data?.results || [];
  if (!products.length) {
    logger.info(
      `🔗 Cuelinks API: no results for "${searchQuery}" on ${platform}`,
    );
    return null;
  }

  // Find the best matching product from results
  // Use our matchProduct() function to validate the match
  for (const product of products) {
    const match = matchProduct(
      { title: productName, brand },
      { name: product.name || product.title, brand: product.brand },
    );

    if (match.isMatch) {
      logger.info(
        `🔗 Cuelinks API: matched "${product.name}" on ${platform} ` +
          `(${match.confidence}% confidence, ${match.matchType})`,
      );

      return {
        price: parseFloat(product.price || product.sale_price) || null,
        url: product.url || product.product_url,
        affiliateUrl:
          product.affiliate_url || product.tracking_url || product.url,
        inStock: product.in_stock !== false,
        rating: parseFloat(product.rating) || null,
        reviewCount: parseInt(product.review_count || product.reviews) || null,
        _confidence: match.confidence,
        _matchType: match.matchType,
        _source: "cuelinks_api",
      };
    }
  }

  logger.info(
    `🔗 Cuelinks API: no confident match for "${productName}" on ${platform}`,
  );
  return null;
}

/**
 * Convert a regular platform URL to a Cuelinks affiliate tracking URL.
 *
 * Cuelinks link conversion API: wraps any valid Flipkart/Myntra URL
 * with their tracking parameters to earn affiliate commission.
 *
 * @param {string} originalUrl — e.g. https://www.flipkart.com/search?q=sony
 * @param {string} platform    — 'flipkart' | 'myntra'
 * @returns {string|null} Affiliate tracking URL
 */
async function convertToAffiliateLink(originalUrl, platform) {
  if (!CUELINKS_API_KEY || !CUELINKS_WEBSITE_ID) {
    // No Cuelinks credentials — return original URL
    // You still get traffic to the platform, just no affiliate commission
    logger.warn(
      `🔗 Cuelinks: no API credentials — returning non-affiliate URL for ${platform}`,
    );
    return originalUrl;
  }

  try {
    const response = await axios.post(
      "https://api.cuelinks.com/v1/links/convert",
      {
        url: originalUrl,
        website_id: CUELINKS_WEBSITE_ID,
      },
      {
        timeout: REQUEST_TIMEOUT,
        headers: {
          Authorization: `Bearer ${CUELINKS_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
    );

    const affiliateUrl =
      response.data?.affiliate_url ||
      response.data?.tracking_url ||
      response.data?.url;

    if (affiliateUrl) {
      logger.info(`🔗 Cuelinks: converted ${platform} URL → affiliate link`);
      return affiliateUrl;
    }

    logger.warn(`🔗 Cuelinks: link conversion returned no URL for ${platform}`);
    return originalUrl; // Fallback to original
  } catch (err) {
    logger.warn(
      `🔗 Cuelinks: link conversion failed for ${platform} — ${err.message}`,
    );
    return originalUrl; // Fallback to original URL — still useful for traffic
  }
}

// ═════════════════════════════════════════════════════════════════
// URL BUILDERS
// ═════════════════════════════════════════════════════════════════

function buildFlipkartSearchUrl(productName, brand) {
  const query = [brand, productName].filter(Boolean).join(" ");
  return `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&sort=popularity`;
}

function buildMyntraSearchUrl(productName, brand) {
  const query = [brand, productName].filter(Boolean).join(" ");
  const urlSlug = query
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return `https://www.myntra.com/${urlSlug}`;
}

// ═════════════════════════════════════════════════════════════════
// PRODUCT MATCHING HELPERS
// ═════════════════════════════════════════════════════════════════

/**
 * Extract model numbers from a product title.
 * Matches patterns like: WH-1000XM5, S24+, MX Master 3S, 12R Pro
 *
 * @param {string} text
 * @returns {string[]} Array of extracted model numbers (normalized)
 */
function extractModelNumbers(text) {
  if (!text) return [];

  // Match alphanumeric codes of 3+ chars that look like model numbers
  // Patterns: WH-1000XM5, MX-Master-3S, S24+, 12R, ProArt-PA329C
  const patterns = [
    /\b([A-Z]{1,4}[-\s]?\d{3,6}[A-Z0-9]*)\b/gi, // WH-1000XM5, MX-450
    /\b(\d{2,4}[A-Z]{1,3}\+?)\b/g, // S24+, 12R, 870 EVO
    /\b([A-Z]{2,6}\s?\d{1,4}[A-Z0-9\+]*)\b/gi, // XM5, EOS R50
  ];

  const models = new Set();
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const model = match[1].replace(/[\s-]/g, "").toUpperCase();
      if (model.length >= 3 && model.length <= 15) {
        models.add(model);
      }
    }
  }

  // Filter out common non-model words that match the pattern
  const stopModels = new Set([
    "USB",
    "ANC",
    "TWS",
    "LED",
    "LCD",
    "OLED",
    "RAM",
    "SSD",
    "HDD",
  ]);
  return [...models].filter((m) => !stopModels.has(m));
}

/**
 * Compute name similarity between Amazon title and platform product name.
 * Returns 0-100 confidence score.
 *
 * Method: word overlap with key term weighting.
 * Key terms (brand, model numbers) weighted more than common words.
 *
 * @param {string} nameA — Amazon product title
 * @param {string} nameB — Platform product name
 * @returns {number} 0-100 similarity score
 */
function computeNameSimilarity(nameA, nameB) {
  if (!nameA || !nameB) return 0;

  const wordsA = tokenize(nameA);
  const wordsB = tokenize(nameB);

  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);

  // Count overlapping words
  let overlap = 0;
  let weightedOverlap = 0;
  let totalWeight = 0;

  for (const word of setA) {
    const weight = getWordWeight(word);
    totalWeight += weight;
    if (setB.has(word)) {
      overlap++;
      weightedOverlap += weight;
    }
  }

  if (totalWeight === 0) return 0;

  // Weighted Jaccard similarity
  const similarity = (weightedOverlap / totalWeight) * 100;

  return Math.round(Math.min(100, similarity));
}

// Tokenize product name into meaningful words (remove noise)
function tokenize(text) {
  const stopWords = new Set([
    "with",
    "for",
    "and",
    "the",
    "a",
    "an",
    "in",
    "on",
    "at",
    "of",
    "wireless",
    "wired",
    "black",
    "white",
    "silver",
    "gold",
    "blue",
    "red",
    "new",
    "latest",
    "2024",
    "2025",
    "2026",
    "india",
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));
}

// Give more weight to words that look like model numbers or brand names
function getWordWeight(word) {
  if (!word) return 1;

  // Model numbers (mixed alphanumeric) — highest weight
  if (/^[a-z]*\d+[a-z\d]*$/.test(word) && word.length >= 3) return 4;

  // Longer words tend to be more distinctive
  if (word.length >= 6) return 2;

  return 1;
}

// ═════════════════════════════════════════════════════════════════
// BEST DEAL CALCULATOR
// ═════════════════════════════════════════════════════════════════

/**
 * Determine which platform has the best price.
 * Only compares platforms where we have actual prices (not null).
 *
 * @param {Object|null} flipkart
 * @param {Object|null} myntra
 * @param {number|null} amazonPrice — Pass Amazon price for complete comparison
 * @returns {Object|null} { platform, price, saving }
 */
function computeBestDeal(flipkart, myntra, amazonPrice = null) {
  const options = [];

  if (amazonPrice && amazonPrice > 0) {
    options.push({ platform: "amazon", price: amazonPrice });
  }
  if (flipkart?.price && flipkart.price > 0) {
    options.push({ platform: "flipkart", price: flipkart.price });
  }
  if (myntra?.price && myntra.price > 0) {
    options.push({ platform: "myntra", price: myntra.price });
  }

  if (options.length === 0) return null;

  // Sort by price — cheapest first
  options.sort((a, b) => a.price - b.price);

  const best = options[0];
  const highest = options[options.length - 1];
  const saving =
    options.length > 1 ? Math.round(highest.price - best.price) : 0;

  return {
    platform: best.platform,
    price: best.price,
    saving, // How much cheaper than the most expensive platform
  };
}

// ═════════════════════════════════════════════════════════════════
// REDIS CACHING
// ═════════════════════════════════════════════════════════════════

async function getCachedLinks(asin) {
  const redis = getRedis();
  if (!redis || redis.status !== "ready") return null;

  const key = `${REDIS_KEY_PREFIX}:${asin}`;

  try {
    const raw = await redis.get(key);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    logger.info(`🔗 Cuelinks: Redis HIT for ${key}`);
    return cached;
  } catch (err) {
    logger.warn(`🔗 Cuelinks: Redis GET failed for ${key} — ${err.message}`);
    return null;
  }
}

async function setCachedLinks(asin, data) {
  const redis = getRedis();
  if (!redis || redis.status !== "ready") {
    logger.warn(
      `🔗 Cuelinks: Redis not available — skipping cache for ${asin}`,
    );
    return;
  }

  const key = `${REDIS_KEY_PREFIX}:${asin}`;

  try {
    const payload = {
      ...data,
      cachedAt: Date.now(),
    };
    const json = JSON.stringify(payload);
    await redis.set(key, json, "EX", CACHE_TTL);

    const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);
    logger.info(
      `🔗 Cuelinks: Redis SET OK — ${key} | ${sizeKB}KB | TTL=${CACHE_TTL}s (6h)`,
    );
  } catch (err) {
    logger.warn(`🔗 Cuelinks: Redis SET failed for ${key} — ${err.message}`);
    // Non-fatal — the result is still returned to the caller
  }
}

// ── Strip internal fields before caching (clean public data only) ──
function cleanForCache(platformResult) {
  if (!platformResult) return null;
  const { _confidence, _matchType, _source, ...clean } = platformResult;
  return clean;
}

// ═════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════

module.exports = {
  // Primary function — called by search pipeline
  getAffiliateLinks,

  // Individual platform search (useful for testing)
  searchFlipkart,
  searchMyntra,

  // Product matching (exported for testing + external use)
  matchProduct,
  extractModelNumbers,
  computeNameSimilarity,

  // Utilities
  computeBestDeal,
  isMyntraRelevant,
};
