// src/cron/rankingSnapshotCron.js
// 6-hour snapshot cron — Rule 1, Rule 9
// Every 6h: recalculate rankings in DB → replace top50:{category} in Redis
// ON FAILURE: extend TTL by 2h (never let keys expire to empty)
'use strict'

const cron   = require('node-cron')
const logger = require('../utils/logger')
const { CANONICAL_CATEGORIES } = require('../utils/categoryKeyMap')

const SNAPSHOT_TTL   = 21600   // 6h in seconds
const FAILURE_EXTEND = 7200    // 2h extension on failure
const TOP_N          = 50

let redis  = null
let prisma = null

function init(redisClient, prismaClient) {
  redis  = redisClient
  prisma = prismaClient
}

// ── SNAPSHOT LOGIC ────────────────────────────────────────────────
async function snapshotCategory(category) {
  if (!prisma || !redis) return

  // Fetch top 50 products by aiScore for this category
  const products = await prisma.product.findMany({
    where:   { category, inStock: true },
    orderBy: { aiScore: 'desc' },
    take:    TOP_N,
    select: {
      id:            true,
      name:          true,
      brand:         true,
      category:      true,
      imageUrl:      true,
      currentPrice:  true,
      platformRating:true,
      reviewCount:   true,
      aiScore:       true,
      affiliateUrl:  true,
      platformUrl:   true,
      lastScored:    true,
      platform:      true,
    },
  })

  if (products.length === 0) {
    logger.warn(`SnapshotCron: no products found for category "${category}" — skipping`)
    return 0
  }

  // Normalize to unified shape for Redis
  const snapshot = products.map((p, i) => ({
    id:           p.id,
    rank:         i + 1,
    name:         p.name,
    brand:        p.brand,
    category:     p.category,
    imageUrl:     p.imageUrl,
    price:        p.currentPrice,
    lowestPrice:  p.currentPrice,
    rating:       p.platformRating,
    reviewCount:  p.reviewCount,
    rankingScore: p.aiScore,
    aiScore:      p.aiScore,
    affiliateLink:p.affiliateUrl || p.platformUrl,
    platform:     p.platform,
    analysedAt:   p.lastScored,
  }))

  const key = `top50:${category}`
  // Rule 1: ALWAYS replace, never append
  await redis.set(key, JSON.stringify(snapshot), 'EX', SNAPSHOT_TTL)

  logger.info(`SnapshotCron: "${key}" → ${snapshot.length} products (TTL=${SNAPSHOT_TTL}s)`)
  return snapshot.length
}

async function runSnapshot() {
  const start = Date.now()
  logger.info('SnapshotCron: starting 6h category snapshot run')

  const results = {}
  let totalSaved = 0
  let failed     = 0

  for (const category of CANONICAL_CATEGORIES) {
    try {
      const count = await snapshotCategory(category)
      results[category] = count || 0
      totalSaved += count || 0
    } catch (err) {
      failed++
      results[category] = 'ERROR'
      logger.error(`SnapshotCron: FAILED for "${category}": ${err.message}`)

      // Rule 9: Failure guard — extend TTL rather than let key expire
      if (redis) {
        try {
          await redis.expire(`top50:${category}`, FAILURE_EXTEND)
          logger.warn(`SnapshotCron: extended TTL for "top50:${category}" by ${FAILURE_EXTEND}s`)
        } catch (extErr) {
          logger.error(`SnapshotCron: could not extend TTL for "${category}": ${extErr.message}`)
        }
      }
    }
  }

  const elapsed = Date.now() - start
  const summary = { totalSaved, failed, elapsed, results, timestamp: new Date().toISOString() }

  if (failed > 0) {
    logger.error(`SnapshotCron: completed with ${failed} failures — ${JSON.stringify(summary)}`)
  } else {
    logger.info(`SnapshotCron: completed OK — ${totalSaved} records across ${CANONICAL_CATEGORIES.length} categories in ${elapsed}ms`)
  }

  return summary
}

// ── SCHEDULE ──────────────────────────────────────────────────────
// Every 6 hours: 00:00, 06:00, 12:00, 18:00 IST
function start() {
  if (!redis || !prisma) {
    logger.warn('SnapshotCron: not started — redis or prisma not injected. Call init() first.')
    return
  }

  // Run immediately on startup to seed Redis
  runSnapshot().catch(err => logger.error(`SnapshotCron: startup run failed: ${err.message}`))

  // Then every 6 hours
  cron.schedule('0 */6 * * *', () => {
    runSnapshot().catch(err => logger.error(`SnapshotCron: scheduled run failed: ${err.message}`))
  }, { timezone: 'Asia/Kolkata' })

  logger.info('SnapshotCron: scheduled every 6 hours (IST)')
}

module.exports = { start, runSnapshot, init }
