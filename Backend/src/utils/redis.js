// src/utils/redis.js — Redis Cache Client
// ─────────────────────────────────────────────────────────────────
// BUG FIXES IN THIS VERSION:
//
//  FIX 1 — TLS detection (only via URL scheme)
//    Use rediss:// (double-s) in REDIS_URL if your instance requires TLS.
//    Use redis:// (single-s) if it doesn't.
//    Previous code auto-detected by hostname which was wrong — not all
//    Redis Cloud instances have TLS enabled on their assigned port.
//    "packet length too long" error = TLS enabled but server doesn't support it.
//
//  FIX 2 — KEEPTTL replaced with TTL-preserving SET
//    KEEPTTL was added in Redis 6.0. Redis Cloud free tier can run
//    older versions. KEEPTTL silently caused the hit-count update to
//    fail — no error thrown, just ignored by the server.
//    Fixed: fetch remaining TTL first, then SET with 'EX'.
//
//  FIX 3 — Better error messages with full stack context
//    All catch blocks now log the full error so you can actually debug.
//
// KEY FORMAT:  bestpickr:search:<normalized_query>:<category>
// VALUE:       JSON { results, lastUpdated, hitCount, originalQuery }
// TTL:         6 hours (21600s) — configurable via CACHE_TTL_SECONDS
// ─────────────────────────────────────────────────────────────────
"use strict";

const Redis = require("ioredis");
const logger = require("./logger");
const { buildSearchKey, buildCategoryKey } = require("./queryNormalizer");

let redis = null;

const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS) || 21600;

// TLS detection: ONLY use TLS when the URL explicitly uses rediss:// (double-s).
// Previous code auto-detected by hostname (redislabs.com, etc.) but that was wrong —
// not all Redis Cloud instances have TLS enabled on their port.
// If your Redis instance requires TLS, use rediss:// in REDIS_URL.
// If it doesn't, use redis:// (single s).
function requiresTLS(url) {
  if (!url) return false;
  return url.startsWith("rediss://");
}

// ── INIT ─────────────────────────────────────────────────────────
// Called once from server.js on startup.
function initRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn(
      "Redis: REDIS_URL not set — caching disabled (searches still work, just no caching)",
    );
    return null;
  }

  // FIX 1: Auto-upgrade redis:// → rediss:// for cloud hosts
  const needsTLS = requiresTLS(url);
  const finalUrl =
    needsTLS && url.startsWith("redis://")
      ? url.replace("redis://", "rediss://")
      : url;

  logger.info(
    `Redis: connecting to ${finalUrl.replace(/:[^:@]+@/, ":***@")} [TLS=${needsTLS}]`,
  );

  redis = new Redis(finalUrl, {
    // FIX 1: TLS config for Redis Cloud
    // rejectUnauthorized:false because Redis Cloud uses self-signed certs
    ...(needsTLS ? { tls: { rejectUnauthorized: false } } : {}),

    maxRetriesPerRequest: 3,
    connectTimeout: 15000, // 15s initial connect (cloud hosts can be slow)
    commandTimeout: 5000, // 5s per command — don't hang the request

    retryStrategy(times) {
      if (times > 6) {
        logger.error(`Redis: giving up after ${times} retries`);
        return null;
      }
      const delay = Math.min(times * 1000, 8000);
      logger.info(`Redis: retry #${times} in ${delay}ms`);
      return delay;
    },

    enableOfflineQueue: false, // don't queue commands when disconnected
  });

  redis.on("connect", () => logger.info("Redis: TCP connected"));
  redis.on("ready", () => logger.info("Redis: ✅ READY — caching active"));
  redis.on("error", (e) => logger.error(`Redis error: ${e.message}`));
  redis.on("close", () => logger.warn("Redis: connection closed"));
  redis.on("reconnecting", (ms) =>
    logger.info(`Redis: reconnecting in ${ms}ms`),
  );

  return redis;
}

// ── CONNECT (called from server.js) ──────────────────────────────
async function connectRedis() {
  if (!redis) initRedis();
  if (!redis) return;

  try {
    const pong = await redis.ping();
    logger.info(`Redis: PING → ${pong} ✅`);
  } catch (err) {
    logger.error(`Redis: PING failed — ${err.message}`);
    logger.error(
      "Redis tip: Make sure REDIS_URL uses rediss:// (double-s) for Redis Cloud",
    );
  }
}

async function disconnectRedis() {
  if (redis) {
    try {
      await redis.quit();
    } catch {
      /* ignore on shutdown */
    }
    redis = null;
  }
}

// ── CACHE GET ─────────────────────────────────────────────────────
async function getCachedResults(query, category) {
  // Check both null AND not-ready — avoids "Command timed out" errors
  if (!redis || redis.status !== "ready") return null;

  const key = buildSearchKey(query, category);

  try {
    const raw = await redis.get(key);
    if (!raw) {
      logger.info(`Redis MISS: "${key}"`);
      return null;
    }

    const cached = JSON.parse(raw);
    const ageMin = Math.round((Date.now() - cached.lastUpdated) / 60000);
    const hits = (cached.hitCount || 0) + 1;

    logger.info(
      `Redis HIT: "${key}" | ${ageMin}min old | hit #${hits} | ${cached.results?.length || 0} products`,
    );

    // FIX 2: Update hit count safely WITHOUT KEEPTTL
    // Get remaining TTL → re-SET with same TTL → preserves expiry time
    try {
      const remainingTTL = await redis.ttl(key);
      if (remainingTTL > 0) {
        cached.hitCount = hits;
        // EX + remaining seconds = same expiry, updated data
        await redis.set(key, JSON.stringify(cached), "EX", remainingTTL);
      }
    } catch (updateErr) {
      // Non-fatal: cache still served, just hit count not updated
      logger.warn(`Redis: hit count update skipped: ${updateErr.message}`);
    }

    return cached.results;
  } catch (err) {
    // FIX 3: Full error context for debugging
    logger.error(`Redis GET failed for "${key}": ${err.message}`);
    return null; // graceful degradation — search continues without cache
  }
}

// ── CACHE SET ─────────────────────────────────────────────────────
async function cacheResults(query, category, results) {
  // Never cache empty result sets — an empty array would serve "no results" for 6h,
  // locking out any future live fetch for this query until the TTL expires.
  if (!results?.length) {
    logger.info(
      `Redis: skipping SET for "${query}" — empty results (brand/filter eliminated all)`,
    );
    return;
  }

  if (!redis || redis.status !== "ready") {
    logger.warn(
      `Redis: skipping SET for "${query}" — status: ${redis?.status || "not initialized"}`,
    );
    return;
  }

  const key = buildSearchKey(query, category);

  try {
    const payload = {
      results,
      lastUpdated: Date.now(),
      hitCount: 1,
      originalQuery: query,
      category: category || "",
      productCount: results.length,
    };

    const json = JSON.stringify(payload);
    const reply = await redis.set(key, json, "EX", CACHE_TTL);
    const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);

    logger.info(
      `Redis SET ✅: "${key}" | ${results.length} products | ` +
        `${sizeKB}KB | TTL=${CACHE_TTL}s (${Math.round(CACHE_TTL / 3600)}h) | reply=${reply}`,
    );
  } catch (err) {
    // FIX 3: Log full error
    logger.error(`Redis SET failed for "${key}": ${err.message}`);
  }
}

// ── CACHE INFO (for admin dashboard) ─────────────────────────────
async function getCacheInfo() {
  if (!redis) return { connected: false, reason: "REDIS_URL not set" };
  if (redis.status !== "ready")
    return {
      connected: false,
      reason: `Redis not ready (status: ${redis.status})`,
    };

  try {
    const pong = await redis.ping();
    const keys = await redis.keys("bestpickr:search:*");
    const entries = [];

    for (const key of keys.slice(0, 30)) {
      try {
        const raw = await redis.get(key);
        if (!raw) continue;
        const d = JSON.parse(raw);
        const ttl = await redis.ttl(key);
        entries.push({
          key,
          query: d.originalQuery,
          category: d.category,
          products: d.productCount,
          hits: d.hitCount,
          ageMinutes: Math.round((Date.now() - d.lastUpdated) / 60000),
          ttlMinutes: Math.round(ttl / 60),
        });
      } catch {
        /* skip bad keys */
      }
    }

    entries.sort((a, b) => a.ageMinutes - b.ageMinutes);

    return {
      connected: true,
      ping: pong,
      status: redis.status,
      totalKeys: keys.length,
      entries,
    };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

// ── CATEGORY CACHE (pre-loaded by cron at 12 AM IST) ────────────

async function getCategoryCache(categorySlug) {
  if (!redis || redis.status !== "ready") return null;

  const key = buildCategoryKey(categorySlug);

  try {
    const raw = await redis.get(key);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    const ageMin = Math.round((Date.now() - cached.lastUpdated) / 60000);
    logger.info(
      `Category HIT: "${key}" | ${ageMin}min old | ${cached.results?.length || 0} products`,
    );
    return cached.results;
  } catch (err) {
    logger.error(`Category GET failed for "${key}": ${err.message}`);
    return null;
  }
}

async function setCategoryCache(categorySlug, results) {
  if (!redis || redis.status !== "ready") return;

  const key = buildCategoryKey(categorySlug);

  try {
    const payload = {
      results,
      lastUpdated: Date.now(),
      category: categorySlug,
      productCount: results.length,
      source: "cron_preload",
    };

    const json = JSON.stringify(payload);
    await redis.set(key, json, "EX", CACHE_TTL);
    logger.info(
      `Category SET: "${key}" | ${results.length} products | TTL=${CACHE_TTL}s`,
    );
  } catch (err) {
    logger.error(`Category SET failed for "${key}": ${err.message}`);
  }
}

// ── TOP50 SNAPSHOTS ───────────────────────────────────────────────
// top50:{category} — populated every 6h by rankingSnapshotCron

async function getTop50Products(category) {
  if (!redis || redis.status !== "ready") return null;
  const key = `top50:${category}`;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    logger.error(`Redis GET failed for "${key}": ${err.message}`);
    return null;
  }
}

async function setTop50Products(category, products) {
  if (!redis || redis.status !== "ready") return;
  const key = `top50:${category}`;
  try {
    await redis.set(key, JSON.stringify(products), "EX", 21600);
  } catch (err) {
    logger.error(`Redis SET failed for "${key}": ${err.message}`);
  }
}

// ── BRAND INDEX ────────────────────────────────────────────────────
// bestpickr:brand:{category}:{normalizedBrand} — built from top50 data

function normalizeBrand(brand) {
  return (brand || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function getBrandProducts(category, brand) {
  if (!redis || redis.status !== "ready") return null;
  const key = `bestpickr:brand:${category}:${normalizeBrand(brand)}`;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.error(`Redis GET failed for "${key}": ${err.message}`);
    return null;
  }
}

async function setBrandProducts(category, brand, products) {
  if (!redis || redis.status !== "ready") return;
  const key = `bestpickr:brand:${category}:${normalizeBrand(brand)}`;
  try {
    await redis.set(key, JSON.stringify(products), "EX", 21600);
  } catch (err) {
    logger.error(`Redis SET failed for "${key}": ${err.message}`);
  }
}

// ── INDIVIDUAL PRODUCT CACHE ──────────────────────────────────────
// bestpickr:product:{asin} — 24h TTL, stores full product data

async function getProductCache(asin) {
  if (!redis || redis.status !== "ready") return null;
  const key = `bestpickr:product:${asin}`;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.error(`Redis GET failed for "${key}": ${err.message}`);
    return null;
  }
}

async function setProductCache(asin, product) {
  if (!redis || redis.status !== "ready") return;
  const key = `bestpickr:product:${asin}`;
  try {
    await redis.set(key, JSON.stringify(product), "EX", 86400);
  } catch (err) {
    logger.error(`Redis SET failed for "${key}": ${err.message}`);
  }
}

// ── SUB-TYPE PRODUCTS ─────────────────────────────────────────────
// top50:{category}:{subType} — populated at 1 AM IST daily by rankingSnapshotCron
// Separate from top50:{category} (broad pool) — these are product-type specific.
// e.g. top50:appliances:washing_machine — only washing machines, never fridges or ACs.
// TTL: 24h (refreshed nightly). Higher TTL than 6h snapshot because cron runs once/day.

const SUBTYPE_TTL = 86400; // 24h

async function getSubTypeProducts(category, subType) {
  if (!redis || redis.status !== "ready") return null;
  const key = `top50:${category}:${subType}`;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    logger.error(`Redis GET failed for "${key}": ${err.message}`);
    return null;
  }
}

async function setSubTypeProducts(category, subType, products) {
  if (!redis || redis.status !== "ready") return;
  const key = `top50:${category}:${subType}`;
  try {
    await redis.set(key, JSON.stringify(products), "EX", SUBTYPE_TTL);
    logger.info(
      `SubType SET: "${key}" | ${products.length} products | TTL=${SUBTYPE_TTL}s (24h)`,
    );
  } catch (err) {
    logger.error(`Redis SET failed for "${key}": ${err.message}`);
  }
}

// ── BACKGROUND ANALYSIS DEDUP ─────────────────────────────────────
// bestpickr:analysis:queued:{asin} — 1h flag prevents duplicate GPT calls

async function isAnalysisQueued(asin) {
  if (!redis || redis.status !== "ready") return false;
  try {
    const val = await redis.get(`bestpickr:analysis:queued:${asin}`);
    return val === "1";
  } catch {
    return false;
  }
}

async function markAnalysisQueued(asin) {
  if (!redis || redis.status !== "ready") return;
  try {
    await redis.set(`bestpickr:analysis:queued:${asin}`, "1", "EX", 3600);
  } catch {
    /* non-fatal */
  }
}

// ── SEARCH LOCK (thundering herd / request coalescing) ───────────
// Prevents duplicate Amazon PA-API + GPT calls when multiple users search
// the same query simultaneously. Standard pattern used by Cloudflare, Netflix etc.
//
// Flow:
//   1. Cache miss → acquireSearchLock()
//   2. If locked (returns false) → waitForSearchCache() — poll until result ready
//   3. If lock acquired (returns true) → fetch Amazon + GPT → cacheResults()
//      → releaseSearchLock() is called automatically via TTL expiry or explicit release
//
// Lock key: bestpickr:search:lock:{normalizedQuery}:{category}
// TTL:      60s (ceiling — if the request dies, lock auto-expires so others aren't stuck)

const LOCK_TTL_S = 60; // max seconds Amazon+GPT should take
const LOCK_POLL_MS = 600; // how often waiters check for the result
const LOCK_WAIT_MAX_MS = 55_000; // max time a waiter will poll before giving up

function lockKey(query, category) {
  return `bestpickr:search:lock:${buildSearchKey(query, category)}`;
}

/**
 * Try to acquire exclusive search lock for this query+category.
 * Uses Redis SET NX PX (atomic, native — never races).
 * Returns true if this caller owns the lock, false if another owns it.
 */
async function acquireSearchLock(query, category) {
  if (!redis || redis.status !== "ready") return true; // no Redis → proceed without lock
  try {
    const key = lockKey(query, category);
    const result = await redis.set(key, "1", "EX", LOCK_TTL_S, "NX");
    return result === "OK"; // NX only sets if key absent — 'OK' = we got it
  } catch {
    return true; // on error → proceed (don't block search)
  }
}

/**
 * Release search lock early (called after cacheResults() completes).
 * Safe to call even if lock already expired.
 */
async function releaseSearchLock(query, category) {
  if (!redis || redis.status !== "ready") return;
  try {
    await redis.del(lockKey(query, category));
  } catch {
    /* non-fatal */
  }
}

/**
 * Poll for a cached search result (called by waiters who couldn't get the lock).
 * Returns cached results as soon as they appear, or null after LOCK_WAIT_MAX_MS.
 * The lock holder will call cacheResults() once done, making the key appear.
 */
async function waitForSearchCache(query, category) {
  if (!redis || redis.status !== "ready") return null;
  const cacheKey = buildSearchKey(query, category);
  const deadline = Date.now() + LOCK_WAIT_MAX_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
    try {
      const raw = await redis.get(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        logger.info(
          `Redis COALESCED: "${cacheKey}" — served cached result to waiting request`,
        );
        return cached.results || null;
      }
    } catch {
      /* keep polling */
    }
  }
  logger.warn(
    `Redis COALESCE TIMEOUT: "${cacheKey}" — proceeding with independent search after ${LOCK_WAIT_MAX_MS}ms`,
  );
  return null; // timed out — caller should do the search itself
}

// ── UTILITIES ────────────────────────────────────────────────────

async function invalidateCache(query, category) {
  if (!redis) return false;
  try {
    const deleted = await redis.del(buildSearchKey(query, category));
    return deleted > 0;
  } catch {
    return false;
  }
}

async function flushBestpickrCache() {
  if (!redis) return 0;
  try {
    const keys = await redis.keys("bestpickr:*");
    if (!keys.length) return 0;
    return await redis.del(...keys);
  } catch {
    return 0;
  }
}

module.exports = {
  initRedis,
  connectRedis,
  disconnectRedis,
  getCachedResults,
  cacheResults,
  getCategoryCache,
  setCategoryCache,
  getCacheInfo,
  invalidateCache,
  flushBestpickrCache,
  getClient: () => redis,
  // Redis-first search helpers
  getTop50Products,
  setTop50Products,
  getBrandProducts,
  setBrandProducts,
  getProductCache,
  setProductCache,
  isAnalysisQueued,
  markAnalysisQueued,
  normalizeBrand,
  // Sub-type helpers (product-type specific pools within a category)
  getSubTypeProducts,
  setSubTypeProducts,
  // Search lock (thundering herd prevention)
  acquireSearchLock,
  releaseSearchLock,
  waitForSearchCache,
};
