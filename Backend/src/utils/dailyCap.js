// src/utils/dailyCap.js
// Daily scrape cap counter — prevents RunAway ScraperAPI credit burn.
// Rule 8 (Cost Control): ScraperAPI only when within daily cap.
// Key: cap:newproducts:{YYYY-MM-DD}  — auto-expires in 24h
'use strict'

const logger = require('./logger')

const DEFAULT_MAX = parseInt(process.env.DAILY_SCRAPE_CAP) || 500

/**
 * checkAndIncrement(redis) → { count, allowed }
 * Increments today's counter. Throws if cap exceeded.
 * Returns { count, allowed: true } if within cap.
 */
async function checkAndIncrement(redis, max = DEFAULT_MAX) {
  if (!redis) {
    // Redis offline — allow scrape in degraded mode (logged separately)
    logger.warn('DailyCap: Redis offline — scrape allowed in degraded mode')
    return { count: 0, allowed: true }
  }

  const key = `cap:newproducts:${new Date().toISOString().split('T')[0]}`

  try {
    const count = await redis.incr(key)
    await redis.expire(key, 86400)   // 24h TTL — auto-reset at midnight

    if (count > max) {
      logger.warn(`DailyCap: EXCEEDED — ${count}/${max} scrapes today`)
      throw new Error('DAILY_CAP_EXCEEDED')
    }

    logger.info(`DailyCap: ${count}/${max} scrapes today`)
    return { count, allowed: true }
  } catch (err) {
    if (err.message === 'DAILY_CAP_EXCEEDED') throw err
    // Redis error — allow scrape rather than block all new products
    logger.warn(`DailyCap: Redis error — allowing scrape: ${err.message}`)
    return { count: 0, allowed: true }
  }
}

/**
 * getCount(redis) → current count for today (read-only)
 */
async function getCount(redis) {
  if (!redis) return 0
  const key = `cap:newproducts:${new Date().toISOString().split('T')[0]}`
  const val = await redis.get(key)
  return parseInt(val) || 0
}

module.exports = { checkAndIncrement, getCount, DEFAULT_MAX }
