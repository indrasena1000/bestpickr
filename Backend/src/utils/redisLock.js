// src/utils/redisLock.js
// Redis NX/EX distributed lock — prevents duplicate live-scrape race conditions.
// Rule 6: "Redis Lock Before Any Live Fetch"
// Lock key: fetch_lock:{normalizedQuery}  NX EX 60
'use strict'

const logger = require('./logger')

const LOCK_TTL = 60          // seconds — scrape must complete within this window
const POLL_INTERVAL = 2000   // ms between poll attempts
const POLL_MAX_WAIT = 55000  // ms — bail just before lock expires

/**
 * acquireLock(redis, key) → true if lock acquired, false if already locked
 * Uses SET key value NX EX ttl — atomic, no race condition.
 */
async function acquireLock(redis, key) {
  if (!redis) return true   // Redis offline → allow fetch (degraded mode)
  const lockKey = `fetch_lock:${key}`
  // SET ... NX returns 'OK' on success, null if already set
  const result = await redis.set(lockKey, '1', 'NX', 'EX', LOCK_TTL)
  const acquired = result === 'OK'
  if (acquired) {
    logger.info(`RedisLock: acquired "${lockKey}"`)
  } else {
    logger.info(`RedisLock: "${lockKey}" already held — concurrent fetch in progress`)
  }
  return acquired
}

/**
 * releaseLock(redis, key) — always call in finally block
 */
async function releaseLock(redis, key) {
  if (!redis) return
  const lockKey = `fetch_lock:${key}`
  try {
    await redis.del(lockKey)
    logger.info(`RedisLock: released "${lockKey}"`)
  } catch (err) {
    logger.warn(`RedisLock: failed to release "${lockKey}": ${err.message}`)
  }
}

/**
 * isLocked(redis, key) → bool
 * Used by job polling: check if a fetch is still in progress.
 */
async function isLocked(redis, key) {
  if (!redis) return false
  const lockKey = `fetch_lock:${key}`
  const val = await redis.exists(lockKey)
  return val === 1
}

/**
 * waitForUnlock(redis, key, onPoll) → resolves when lock is released
 * Polls every POLL_INTERVAL ms; rejects after POLL_MAX_WAIT ms.
 * onPoll(elapsedMs) — optional callback for each poll tick.
 */
function waitForUnlock(redis, key, onPoll) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const timer = setInterval(async () => {
      const elapsed = Date.now() - start
      if (onPoll) onPoll(elapsed)

      const locked = await isLocked(redis, key)
      if (!locked) {
        clearInterval(timer)
        resolve(elapsed)
        return
      }
      if (elapsed > POLL_MAX_WAIT) {
        clearInterval(timer)
        reject(new Error(`RedisLock: waitForUnlock timed out after ${elapsed}ms for "${key}"`))
      }
    }, POLL_INTERVAL)
  })
}

module.exports = { acquireLock, releaseLock, isLocked, waitForUnlock, LOCK_TTL }
