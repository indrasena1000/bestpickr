// src/services/cuelinkService.js — Cuelinks Affiliate Link Integration
// ─────────────────────────────────────────────────────────────────
// PURPOSE:
//   Convert Flipkart + Myntra search URLs into Cuelinks affiliate
//   tracking links. Cuelinks earns commission when users click and buy.
//
// HOW IT WORKS:
//   Cuelinks does NOT have a product search API.
//   What it does: take any Flipkart/Myntra URL and wrap it with
//   affiliate tracking via the clnk.in link shortener API.
//
//   Flow:
//     getAffiliateLinks(asin, productName, brand, category)
//       ├── searchFlipkart() → build Flipkart search URL → convertToAffiliateLink()
//       ├── searchMyntra()   → build Myntra search URL   → convertToAffiliateLink()
//       └── Return { flipkart, myntra, bestDeal }
//
// CUELINKS API (clnk.in):
//   Base URL:  http://api.clnk.in
//   Endpoint:  POST /api/v1/links/shorten
//   Body:      { long_url: "<target_url>", access_token: "<CUELINKS_WEBSITE_ID>" }
//   Response:  { short_url: "http://clnk.in/xxxxx" }
//
// ENV VARS:
//   CUELINKS_WEBSITE_ID  — Cuelinks access token (long alphanumeric string)
//   CUELINKS_API_KEY     — Numeric channel/publisher ID (optional, for reference)
//
// CACHING:
//   Redis key: bestpickr:cuelinks:{asin}
//   TTL: 6 hours
// ─────────────────────────────────────────────────────────────────
"use strict";

const axios = require("axios");
const logger = require("../utils/logger");
const { getClient: getRedis } = require("../utils/redis");
const flipkartService = require("./flipkartService");

// ── CONFIG ────────────────────────────────────────────────────────
// CUELINKS_WEBSITE_ID is the access token for the clnk.in API (kept for Myntra fallback)
const ACCESS_TOKEN = process.env.CUELINKS_WEBSITE_ID;
const CHANNEL_ID = process.env.CUELINKS_API_KEY; // numeric publisher ID (CID)

// Linkkit: https://linksredirect.com/?cid=<CHANNEL_ID>&source=linkkit&url=<encoded>
const LINKKIT_BASE = "https://linksredirect.com";
const CLNK_BASE_URL = "https://api.clnk.in";
const CACHE_TTL = 6 * 60 * 60; // 6 hours
const STALE_PRICE_TTL = 1 * 60 * 60; // 1 hour — retry sooner when price=null
const REDIS_PREFIX = "bestpickr:cuelinks";
const REQUEST_TIMEOUT = 10000; // 10s

// ── MYNTRA-RELEVANT CATEGORIES ────────────────────────────────────
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
 * Get Flipkart + Myntra affiliate tracking links for a product.
 * Links are Flipkart/Myntra search URLs wrapped with Cuelinks tracking.
 * Returns an object — never throws.
 *
 * @param {string} asin        — Amazon ASIN (used as cache key)
 * @param {string} productName — e.g. "Sony WH-1000XM5"
 * @param {string} brand       — e.g. "Sony"
 * @param {string} category    — e.g. "headphones"
 * @returns {{ flipkart, myntra, bestDeal, cached, error }}
 */
async function getAffiliateLinks(asin, productName, brand, category) {
  const start = Date.now();

  // ── STEP 1: Redis cache check ─────────────────────────────────
  const cached = await getCachedLinks(asin);
  if (cached) {
    // Return cached only if we have a Flipkart price; otherwise re-fetch to get it
    const hasPrice = cached.flipkart?.price != null;
    if (hasPrice) {
      logger.info(
        `🔗 Cuelinks: cache HIT for ${asin} (${Date.now() - start}ms)`,
      );
      return { ...cached, cached: true, error: null };
    }
    logger.info(
      `🔗 Cuelinks: cache hit but price=null for ${asin} — refreshing`,
    );
  }

  const result = {
    flipkart: null,
    myntra: null,
    bestDeal: null,
    cached: false,
    error: null,
  };

  try {
    // ── STEP 2: Build search URLs + convert to affiliate links ────
    const [flipkartResult, myntraResult] = await Promise.allSettled([
      searchFlipkart(productName, brand),
      isMyntraRelevant(productName, category)
        ? searchMyntra(productName, brand, category)
        : Promise.resolve(null),
    ]);

    if (flipkartResult.status === "fulfilled" && flipkartResult.value) {
      result.flipkart = flipkartResult.value;
      logger.info(
        `🔗 Cuelinks: Flipkart link ready (${result.flipkart._source})`,
      );
    } else if (flipkartResult.status === "rejected") {
      logger.warn(
        `🔗 Cuelinks: Flipkart failed — ${flipkartResult.reason?.message}`,
      );
    }

    if (myntraResult.status === "fulfilled" && myntraResult.value) {
      result.myntra = myntraResult.value;
      logger.info(`🔗 Cuelinks: Myntra link ready (${result.myntra._source})`);
    } else if (myntraResult.status === "rejected") {
      logger.warn(
        `🔗 Cuelinks: Myntra failed — ${myntraResult.reason?.message}`,
      );
    }

    // ── STEP 3: Cache — shorter TTL when price is still null ──────
    const cacheTtl =
      result.flipkart?.price != null ? CACHE_TTL : STALE_PRICE_TTL;
    await setCachedLinks(
      asin,
      {
        flipkart: result.flipkart ? cleanForCache(result.flipkart) : null,
        myntra: result.myntra ? cleanForCache(result.myntra) : null,
        bestDeal: null,
      },
      cacheTtl,
    );

    logger.info(
      `🔗 Cuelinks: done for ${asin} — flipkart=${result.flipkart ? "✅" : "❌"} ` +
        `myntra=${result.myntra ? "✅" : "❌"} price=${result.flipkart?.price ?? null} (${Date.now() - start}ms)`,
    );
    return result;
  } catch (err) {
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
// LINKKIT URL BUILDER (Cuelinks Linkkit / linksredirect.com)
// ═════════════════════════════════════════════════════════════════
/**
 * Wrap any Flipkart or Myntra URL with Cuelinks Linkkit affiliate tracking.
 * Format: https://linksredirect.com/?cid=<CHANNEL_ID>&source=linkkit&url=<encoded_url>
 * No API call required — pure URL construction.
 */
function buildLinkkitAffiliateUrl(url) {
  if (!url) return null;
  if (!CHANNEL_ID) {
    logger.warn(
      "🔗 Cuelinks: CUELINKS_API_KEY (CID) not set — cannot build Linkkit URL",
    );
    return null;
  }
  return `${LINKKIT_BASE}/?cid=${encodeURIComponent(CHANNEL_ID)}&source=linkkit&url=${encodeURIComponent(url)}`;
}

// ═════════════════════════════════════════════════════════════════
// BEST MATCH PICKER
// ═════════════════════════════════════════════════════════════════
/**
 * Score and rank scraped Flipkart products against our target product name/brand.
 * Returns the best-matching product or the first result if nothing scores.
 */
function pickBestMatch(products, productName, brand) {
  if (!products || products.length === 0) return null;
  const nameLower = (productName || "").toLowerCase();
  const brandLower = (brand || "").toLowerCase();
  const queryWords = nameLower.split(/\s+/).filter((w) => w.length > 3);

  const scored = products.map((p) => {
    const pName = (p.name || "").toLowerCase();
    let score = 0;
    if (brandLower && pName.includes(brandLower)) score += 20;
    for (const word of queryWords) {
      if (pName.includes(word)) score += 10;
    }
    if (p.price) score += 5;
    return { ...p, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  return scored[0] || products[0];
}

// ═════════════════════════════════════════════════════════════════
// FLIPKART SEARCH
// ═════════════════════════════════════════════════════════════════
async function searchFlipkart(productName, brand) {
  const query = [brand, productName].filter(Boolean).join(" ");

  // Try scraping Flipkart for actual product + real price
  try {
    const products = await flipkartService.searchProducts(query);
    if (products.length > 0) {
      const best = pickBestMatch(products, productName, brand);
      if (best) {
        const affiliateUrl = buildLinkkitAffiliateUrl(best.url) || best.url;
        return {
          price: best.price,
          url: best.url,
          affiliateUrl,
          inStock: best.inStock !== false,
          rating: best.rating,
          reviewCount: best.reviewCount,
          _source: "linkkit_scraped",
        };
      }
    }
  } catch (err) {
    logger.warn(`🔗 Cuelinks: Flipkart scrape failed — ${err.message}`);
  }

  // Fallback: Flipkart search page URL wrapped with Linkkit
  const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&sort=popularity`;
  const affiliateUrl = buildLinkkitAffiliateUrl(searchUrl) || searchUrl;
  return {
    price: null,
    url: searchUrl,
    affiliateUrl,
    inStock: true,
    rating: null,
    reviewCount: null,
    _source: "linkkit_search",
  };
}

// ═════════════════════════════════════════════════════════════════
// MYNTRA SEARCH
// ═════════════════════════════════════════════════════════════════
async function searchMyntra(productName, brand, category) {
  const query = [brand, productName].filter(Boolean).join(" ");
  const searchUrl = `https://www.myntra.com/search?rawQuery=${encodeURIComponent(query)}`;
  const affiliateUrl = buildLinkkitAffiliateUrl(searchUrl) || searchUrl;

  return {
    price: null,
    url: searchUrl,
    affiliateUrl,
    inStock: true,
    rating: null,
    reviewCount: null,
    _source: "linkkit_myntra",
  };
}

// ═════════════════════════════════════════════════════════════════
// URL → AFFILIATE LINK CONVERSION  (Cuelinks / clnk.in API)
// ═════════════════════════════════════════════════════════════════
/**
 * Wrap a Flipkart or Myntra URL with Cuelinks affiliate tracking.
 *
 * API: POST http://api.clnk.in/api/v1/links/shorten
 * Body: { long_url: "<url>", access_token: "<CUELINKS_WEBSITE_ID>" }
 * Response: { short_url: "http://clnk.in/xxxxx", ... }
 *
 * Falls back to the original URL if API fails or creds missing.
 */
async function convertToAffiliateLink(originalUrl) {
  if (!ACCESS_TOKEN) {
    logger.warn(
      "🔗 Cuelinks: CUELINKS_WEBSITE_ID not set — returning direct URL",
    );
    return originalUrl;
  }

  try {
    // CHANNEL_ID (CUELINKS_API_KEY) is the numeric publisher ID — include if available
    const body = {
      long_url: originalUrl,
      access_token: ACCESS_TOKEN,
      ...(CHANNEL_ID ? { channel_id: CHANNEL_ID } : {}),
    };

    const res = await axios.post(
      `${CLNK_BASE_URL}/api/v1/links/shorten`,
      body,
      {
        timeout: REQUEST_TIMEOUT,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
    );

    // Response field names vary — try common ones
    const shortUrl =
      res.data?.short_url ||
      res.data?.shortUrl ||
      res.data?.data?.short_url ||
      res.data?.url;

    if (shortUrl) {
      logger.info(`🔗 Cuelinks: converted URL → ${shortUrl}`);
      return shortUrl;
    }

    logger.warn(
      `🔗 Cuelinks: API returned no short_url — body: ${JSON.stringify(res.data).slice(0, 200)}`,
    );
    return originalUrl;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data
      ? JSON.stringify(err.response.data).slice(0, 150)
      : err.message;
    logger.warn(
      `🔗 Cuelinks: link conversion failed (status=${status}) — ${msg}`,
    );
    return originalUrl; // Fall back to original — still sends traffic
  }
}

// ═════════════════════════════════════════════════════════════════
// REDIS CACHING
// ═════════════════════════════════════════════════════════════════

async function getCachedLinks(asin) {
  const redis = getRedis();
  if (!redis || redis.status !== "ready") return null;
  const key = `${REDIS_PREFIX}:${asin}`;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn(`🔗 Cuelinks: Redis GET failed for ${key} — ${err.message}`);
    return null;
  }
}

async function setCachedLinks(asin, data, ttl = CACHE_TTL) {
  const redis = getRedis();
  if (!redis || redis.status !== "ready") return;
  const key = `${REDIS_PREFIX}:${asin}`;
  try {
    await redis.set(
      key,
      JSON.stringify({ ...data, cachedAt: Date.now() }),
      "EX",
      ttl,
    );
  } catch (err) {
    logger.warn(`🔗 Cuelinks: Redis SET failed for ${key} — ${err.message}`);
  }
}

function cleanForCache(obj) {
  if (!obj) return null;
  const { _source, ...clean } = obj;
  return clean;
}

// ═════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════

module.exports = {
  getAffiliateLinks,
  searchFlipkart,
  searchMyntra,
  convertToAffiliateLink,
  isMyntraRelevant,
};
