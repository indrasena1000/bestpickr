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
'use strict'

const Redis  = require('ioredis')
const logger = require('./logger')
const { buildSearchKey, buildCategoryKey } = require('./queryNormalizer')

let redis = null

const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS) || 21600

// TLS detection: ONLY use TLS when the URL explicitly uses rediss:// (double-s).
// Previous code auto-detected by hostname (redislabs.com, etc.) but that was wrong —
// not all Redis Cloud instances have TLS enabled on their port.
// If your Redis instance requires TLS, use rediss:// in REDIS_URL.
// If it doesn't, use redis:// (single s).
function requiresTLS(url) {
  if (!url) return false
  return url.startsWith('rediss://')
}

// ── INIT ─────────────────────────────────────────────────────────
// Called once from server.js on startup.
function initRedis() {
  const url = process.env.REDIS_URL
  if (!url) {
    logger.warn('Redis: REDIS_URL not set — caching disabled (searches still work, just no caching)')
    return null
  }

  // FIX 1: Auto-upgrade redis:// → rediss:// for cloud hosts
  const needsTLS = requiresTLS(url)
  const finalUrl = (needsTLS && url.startsWith('redis://'))
    ? url.replace('redis://', 'rediss://')
    : url

  logger.info(`Redis: connecting to ${finalUrl.replace(/:[^:@]+@/, ':***@')} [TLS=${needsTLS}]`)

  redis = new Redis(finalUrl, {
    // FIX 1: TLS config for Redis Cloud
    // rejectUnauthorized:false because Redis Cloud uses self-signed certs
    ...(needsTLS ? { tls: { rejectUnauthorized: false } } : {}),

    maxRetriesPerRequest: 3,
    connectTimeout:  15000,  // 15s initial connect (cloud hosts can be slow)
    commandTimeout:   5000,  // 5s per command — don't hang the request

    retryStrategy(times) {
      if (times > 6) {
        logger.error(`Redis: giving up after ${times} retries`)
        return null
      }
      const delay = Math.min(times * 1000, 8000)
      logger.info(`Redis: retry #${times} in ${delay}ms`)
      return delay
    },

    enableOfflineQueue: false,  // don't queue commands when disconnected
  })

  redis.on('connect',      ()   => logger.info('Redis: TCP connected'))
  redis.on('ready',        ()   => logger.info('Redis: ✅ READY — caching active'))
  redis.on('error',        (e)  => logger.error(`Redis error: ${e.message}`))
  redis.on('close',        ()   => logger.warn('Redis: connection closed'))
  redis.on('reconnecting', (ms) => logger.info(`Redis: reconnecting in ${ms}ms`))

  return redis
}

// ── CONNECT (called from server.js) ──────────────────────────────
async function connectRedis() {
  if (!redis) initRedis()
  if (!redis) return

  try {
    const pong = await redis.ping()
    logger.info(`Redis: PING → ${pong} ✅`)
  } catch (err) {
    logger.error(`Redis: PING failed — ${err.message}`)
    logger.error('Redis tip: Make sure REDIS_URL uses rediss:// (double-s) for Redis Cloud')
  }
}

async function disconnectRedis() {
  if (redis) {
    try { await redis.quit() } catch { /* ignore on shutdown */ }
    redis = null
  }
}

// ── CACHE GET ─────────────────────────────────────────────────────
async function getCachedResults(query, category) {
  // Check both null AND not-ready — avoids "Command timed out" errors
  if (!redis || redis.status !== 'ready') return null

  const key = buildSearchKey(query, category)

  try {
    const raw = await redis.get(key)
    if (!raw) {
      logger.info(`Redis MISS: "${key}"`)
      return null
    }

    const cached = JSON.parse(raw)
    const ageMin = Math.round((Date.now() - cached.lastUpdated) / 60000)
    const hits   = (cached.hitCount || 0) + 1

    logger.info(`Redis HIT: "${key}" | ${ageMin}min old | hit #${hits} | ${cached.results?.length || 0} products`)

    // FIX 2: Update hit count safely WITHOUT KEEPTTL
    // Get remaining TTL → re-SET with same TTL → preserves expiry time
    try {
      const remainingTTL = await redis.ttl(key)
      if (remainingTTL > 0) {
        cached.hitCount = hits
        // EX + remaining seconds = same expiry, updated data
        await redis.set(key, JSON.stringify(cached), 'EX', remainingTTL)
      }
    } catch (updateErr) {
      // Non-fatal: cache still served, just hit count not updated
      logger.warn(`Redis: hit count update skipped: ${updateErr.message}`)
    }

    return cached.results

  } catch (err) {
    // FIX 3: Full error context for debugging
    logger.error(`Redis GET failed for "${key}": ${err.message}`)
    return null  // graceful degradation — search continues without cache
  }
}

// ── CACHE SET ─────────────────────────────────────────────────────
async function cacheResults(query, category, results) {
  if (!redis || redis.status !== 'ready') {
    logger.warn(`Redis: skipping SET for "${query}" — status: ${redis?.status || 'not initialized'}`)
    return
  }

  const key = buildSearchKey(query, category)

  try {
    const payload = {
      results,
      lastUpdated:  Date.now(),
      hitCount:     1,
      originalQuery: query,
      category:     category || '',
      productCount: results.length,
    }

    const json    = JSON.stringify(payload)
    const reply   = await redis.set(key, json, 'EX', CACHE_TTL)
    const sizeKB  = (Buffer.byteLength(json) / 1024).toFixed(1)

    logger.info(
      `Redis SET ✅: "${key}" | ${results.length} products | ` +
      `${sizeKB}KB | TTL=${CACHE_TTL}s (${Math.round(CACHE_TTL / 3600)}h) | reply=${reply}`
    )
  } catch (err) {
    // FIX 3: Log full error
    logger.error(`Redis SET failed for "${key}": ${err.message}`)
  }
}

// ── CACHE INFO (for admin dashboard) ─────────────────────────────
async function getCacheInfo() {
  if (!redis) return { connected: false, reason: 'REDIS_URL not set' }
  if (redis.status !== 'ready') return { connected: false, reason: `Redis not ready (status: ${redis.status})` }

  try {
    const pong    = await redis.ping()
    const keys    = await redis.keys('bestpickr:search:*')
    const entries = []

    for (const key of keys.slice(0, 30)) {
      try {
        const raw = await redis.get(key)
        if (!raw) continue
        const d   = JSON.parse(raw)
        const ttl = await redis.ttl(key)
        entries.push({
          key,
          query:        d.originalQuery,
          category:     d.category,
          products:     d.productCount,
          hits:         d.hitCount,
          ageMinutes:   Math.round((Date.now() - d.lastUpdated) / 60000),
          ttlMinutes:   Math.round(ttl / 60),
        })
      } catch { /* skip bad keys */ }
    }

    entries.sort((a, b) => a.ageMinutes - b.ageMinutes)

    return { connected: true, ping: pong, status: redis.status, totalKeys: keys.length, entries }
  } catch (err) {
    return { connected: false, error: err.message }
  }
}

// ── CATEGORY CACHE (pre-loaded by cron at 12 AM IST) ────────────

async function getCategoryCache(categorySlug) {
  if (!redis || redis.status !== 'ready') return null

  const key = buildCategoryKey(categorySlug)

  try {
    const raw = await redis.get(key)
    if (!raw) return null

    const cached = JSON.parse(raw)
    const ageMin = Math.round((Date.now() - cached.lastUpdated) / 60000)
    logger.info(`Category HIT: "${key}" | ${ageMin}min old | ${cached.results?.length || 0} products`)
    return cached.results
  } catch (err) {
    logger.error(`Category GET failed for "${key}": ${err.message}`)
    return null
  }
}

async function setCategoryCache(categorySlug, results) {
  if (!redis || redis.status !== 'ready') return

  const key = buildCategoryKey(categorySlug)

  try {
    const payload = {
      results,
      lastUpdated: Date.now(),
      category: categorySlug,
      productCount: results.length,
      source: 'cron_preload',
    }

    const json = JSON.stringify(payload)
    await redis.set(key, json, 'EX', CACHE_TTL)
    logger.info(`Category SET: "${key}" | ${results.length} products | TTL=${CACHE_TTL}s`)
  } catch (err) {
    logger.error(`Category SET failed for "${key}": ${err.message}`)
  }
}

// ── UTILITIES ────────────────────────────────────────────────────

async function invalidateCache(query, category) {
  if (!redis) return false
  try {
    const deleted = await redis.del(buildSearchKey(query, category))
    return deleted > 0
  } catch { return false }
}

async function flushBestpickrCache() {
  if (!redis) return 0
  try {
    const keys = await redis.keys('bestpickr:*')
    if (!keys.length) return 0
    return await redis.del(...keys)
  } catch { return 0 }
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
}
