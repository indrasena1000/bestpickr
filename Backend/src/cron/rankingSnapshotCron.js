// src/cron/rankingSnapshotCron.js
// Two cron jobs:
//
// JOB 1 — 6h snapshot (existing): reads top10 from Postgres → Redis top50:{category}
//   Cost: ₹0 (reads our own DB)
//   Schedule: 00:00, 06:00, 12:00, 18:00 IST
//
// JOB 2 — 1 AM sub-type seed (new): fetches from Amazon per sub-type
//   Cost: 1 Amazon call per sub-type (~40 sub-types × 10 results = seeded once/day)
//   Principle: analyze once → serve free all day
//   Schedule: 01:00 IST daily
//   Re-analysis rule: only if product is new OR analysis is >7 days stale
//   On success: writes top50:{category}:{subType} with 24h TTL
'use strict'

const cron   = require('node-cron')
const logger = require('../utils/logger')
const { CANONICAL_CATEGORIES, CANONICAL_SUBTYPES } = require('../utils/categoryKeyMap')
const { setBrandProducts, normalizeBrand, setSubTypeProducts } = require('../utils/redis')

const SNAPSHOT_TTL   = 21600   // 6h in seconds
const FAILURE_EXTEND = 7200    // 2h extension on failure
const TOP_N          = 10   // Seed with 10; pool grows to 50 as users search

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

  // Build brand index — groups top50 products by brand for O(1) brand lookups
  await buildBrandIndex(category, snapshot)

  return snapshot.length
}

// ── BRAND INDEX BUILDER ────────────────────────────────────────────
// Called after every top50 write. Groups products by brand and stores
// in bestpickr:brand:{category}:{normalizedBrand} (TTL 6h).
// Zero extra API calls — derived entirely from already-fetched top50 data.
async function buildBrandIndex(category, products) {
  const brandMap = {}
  for (const p of products) {
    if (!p.brand) continue
    const key = normalizeBrand(p.brand)
    if (!brandMap[key]) brandMap[key] = []
    brandMap[key].push(p)
  }

  const brands = Object.keys(brandMap)
  for (const brand of brands) {
    await setBrandProducts(category, brand, brandMap[brand])
  }

  logger.info(`SnapshotCron: built ${brands.length} brand indexes for "${category}"`)
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

  // Refresh dynamic brand list — picks up any newly-added brands without restart
  try {
    if (prisma) {
      const brandRecords = await prisma.product.findMany({
        select:   { brand: true },
        distinct: ['brand'],
        where:    { brand: { not: null } },
      })
      const { setDynamicBrands } = require('../utils/productNameNormalizer')
      setDynamicBrands(brandRecords.map(b => b.brand).filter(Boolean))
      logger.info(`SnapshotCron: dynamic brand list refreshed (${brandRecords.length} brands)`)
    }
  } catch (err) {
    logger.warn(`SnapshotCron: brand refresh failed (non-fatal): ${err.message}`)
  }

  return summary
}

// ═════════════════════════════════════════════════════════════════
// JOB 2 — 1 AM SUB-TYPE SEED CRON
// Fetches fresh products from Amazon for each sub-type once per day.
// Principle: pay the Amazon API cost once at 1 AM, serve all day free.
// Re-analysis: only for new products or those with stale analysis (>7 days).
// ═════════════════════════════════════════════════════════════════

const ANALYSIS_STALE_DAYS = 7    // Re-analyze if older than this (aligned with 7-day weekly cycle)

// Lazy-load to avoid circular deps and startup cost on unused services
let _amazonService = null
let _ProductAnalysis = null
let _queueAnalysis = null

function getAmazonService() {
  if (!_amazonService) _amazonService = require('../services/amazonService')
  return _amazonService
}

function getProductAnalysis() {
  if (!_ProductAnalysis) {
    try { _ProductAnalysis = require('../models').ProductAnalysis } catch { /* MongoDB not ready */ }
  }
  return _ProductAnalysis
}

function getQueueAnalysis() {
  if (!_queueAnalysis) _queueAnalysis = require('../services/backgroundAnalysis').queueAnalysis
  return _queueAnalysis
}

/**
 * Seed one sub-type from Amazon.
 * Returns count of products stored, 0 on failure.
 */
async function snapshotSubType(category, subType, searchQuery) {
  if (!redis) return 0

  logger.info(`SubTypeCron: seeding "${category}:${subType}" — query="${searchQuery}"`)

  // 1. Fetch from Amazon
  let amazonProducts = []
  try {
    amazonProducts = await getAmazonService().searchProducts(searchQuery, category)
  } catch (err) {
    logger.error(`SubTypeCron: Amazon failed for "${subType}": ${err.message}`)
    return 0
  }

  if (!amazonProducts.length) {
    logger.warn(`SubTypeCron: Amazon returned 0 for "${subType}" — skipping`)
    return 0
  }

  const ProductAnalysis = getProductAnalysis()
  const queueAnalysis   = getQueueAnalysis()
  const snapshot = []

  for (const p of amazonProducts.slice(0, 10)) {
    const asin = p.asin || p.platformId
    if (!asin) continue

    // 2. Check MongoDB for existing fresh analysis — pay once, serve forever
    let aiScore = null
    let hasFullAnalysis = false

    if (ProductAnalysis) {
      try {
        const analysis = await ProductAnalysis.findOne({ asin }).lean()
        if (analysis && analysis.lastUpdated) {
          const ageDays = (Date.now() - new Date(analysis.lastUpdated).getTime()) / 86400000
          if (ageDays < ANALYSIS_STALE_DAYS) {
            aiScore         = analysis.aiScore
            hasFullAnalysis = true
          }
        }
      } catch { /* non-fatal — MongoDB may be unavailable */ }
    }

    // 3. Queue background analysis only for new/stale products
    if (!hasFullAnalysis && queueAnalysis) {
      queueAnalysis(asin, p.name || p.title, category, p.brand).catch(() => {})
    }

    // 4. Build snapshot entry — analyzed products get real aiScore,
    //    unanalyzed get a temporary estimate from Amazon rating
    snapshot.push({
      id:             asin,
      name:           p.name || p.title,
      brand:          p.brand || null,
      category,
      subType,
      imageUrl:       p.imageUrl || p.image || null,
      price:          p.price || null,
      rating:         p.rating || null,
      reviewCount:    p.reviewCount || 0,
      aiScore:        aiScore || (p.rating ? parseFloat((p.rating * 1.8).toFixed(1)) : 5),
      affiliateLink:  p.affiliateUrl || p.url || null,
      platform:       'Amazon',
      analysedAt:     new Date().toISOString(),
      hasFullAnalysis,
    })
  }

  if (!snapshot.length) return 0

  // Sort: fully analyzed first (real aiScore), then by estimated score
  snapshot.sort((a, b) => {
    if (a.hasFullAnalysis && !b.hasFullAnalysis) return -1
    if (!a.hasFullAnalysis && b.hasFullAnalysis) return 1
    return (b.aiScore || 0) - (a.aiScore || 0)
  })

  await setSubTypeProducts(category, subType, snapshot)

  logger.info(
    `SubTypeCron: "${category}:${subType}" → ${snapshot.length} products ` +
    `(${snapshot.filter(p => p.hasFullAnalysis).length} analyzed, ` +
    `${snapshot.filter(p => !p.hasFullAnalysis).length} queued for analysis)`
  )

  return snapshot.length
}

/**
 * Run the full 1 AM sub-type seed across all CANONICAL_SUBTYPES.
 * Processes sub-types sequentially to avoid rate-limiting Amazon.
 */
async function runSubTypeSnapshot() {
  const start = Date.now()
  logger.info(`SubTypeCron: starting 1 AM sub-type seed — ${CANONICAL_SUBTYPES.length} sub-types`)

  let totalSeeded = 0
  let failed      = 0
  const results   = {}

  for (const { category, subType, searchQuery } of CANONICAL_SUBTYPES) {
    const key = `${category}:${subType}`
    try {
      // 1.5s pause between calls — respects Amazon rate limits without burning credits
      if (totalSeeded > 0) await new Promise(r => setTimeout(r, 1500))

      const count    = await snapshotSubType(category, subType, searchQuery)
      results[key]   = count
      totalSeeded   += count
    } catch (err) {
      failed++
      results[key] = 'ERROR'
      logger.error(`SubTypeCron: FAILED for "${key}": ${err.message}`)
    }
  }

  const elapsed = Date.now() - start
  logger.info(
    `SubTypeCron: completed — ${totalSeeded} products across ${CANONICAL_SUBTYPES.length} sub-types ` +
    `in ${Math.round(elapsed / 1000)}s (${failed} failures)`
  )

  return { totalSeeded, failed, elapsed, results }
}

// ── SCHEDULE ──────────────────────────────────────────────────────
function start() {
  if (!redis || !prisma) {
    logger.warn('SnapshotCron: not started — redis or prisma not injected. Call init() first.')
    return
  }

  // JOB 1: Run immediately on startup to seed Redis from DB (free)
  runSnapshot().catch(err => logger.error(`SnapshotCron: startup run failed: ${err.message}`))

  // JOB 1: Every 6 hours — refresh top50:{category} from Postgres (free)
  cron.schedule('0 */6 * * *', () => {
    runSnapshot().catch(err => logger.error(`SnapshotCron: scheduled run failed: ${err.message}`))
  }, { timezone: 'Asia/Kolkata' })

  // JOB 2: Every day at 1 AM IST — seed top50:{category}:{subType} from Amazon
  // This is the only time Amazon is called by the cron — all searches served free after this.
  cron.schedule('0 1 * * *', () => {
    runSubTypeSnapshot().catch(err => logger.error(`SubTypeCron: scheduled run failed: ${err.message}`))
  }, { timezone: 'Asia/Kolkata' })

  logger.info('SnapshotCron: JOB 1 scheduled every 6h (IST) | JOB 2 scheduled at 1 AM IST daily')
}

module.exports = { start, runSnapshot, runSubTypeSnapshot, init }
