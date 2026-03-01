// src/services/relatedProductService.js
// ─────────────────────────────────────────────────────────────────
// Fetches 9 alternative/suggestion products for the primary result.
//
// PRIORITY CHAIN (stops at first tier that yields >= SUGGESTIONS_LIMIT):
//   P1 — Redis   top50:{category}         (most recent cron snapshot)
//   P2 — PostgreSQL exact category         (inStock, ranked by aiScore)
//   P3 — PostgreSQL parent/sibling cats    (broader category fallback)
//   P4 — Global trending pool              (cross-category popular items)
//
// If still < MIN_RESULTS after all tiers:
//   → Trigger non-blocking background enrichment for this category
//   → Return whatever slots are filled
//
// Prisma client is injected via setPrisma() from server.js.
// ─────────────────────────────────────────────────────────────────
'use strict'

const logger = require('../utils/logger')
const { getParentCategory, getChildrenOfParent, getSiblingCategories } = require('../utils/categoryHierarchy')
const { triggerCategoryEnrichment } = require('./backgroundCategoryEnricher')

const SUGGESTIONS_LIMIT = 9
const MIN_RESULTS       = 5    // Below this, trigger background enrichment
const TRENDING_PER_CAT  = 3    // Items to pull per trending category
const TRENDING_CATS     = ['mobile', 'laptop', 'headphones', 'footwear', 'appliances']

let prisma = null
function setPrisma(client) { prisma = client }

// ─────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────
/**
 * getRelated(redis, category, excludeId?, excludeName?)
 * Returns up to 9 suggestion products following the 4-priority chain.
 */
async function getRelated(redis, category, excludeId = null, excludeName = null) {
  if (!redis || !category) return []

  // ── Priority 1: Redis top50:{category} ─────────────────────────
  const p1 = await _fromRedisCategory(redis, category, excludeId, excludeName)
  if (p1.length >= SUGGESTIONS_LIMIT) {
    logger.info(`RelatedSvc P1[Redis]: "${category}" → ${p1.length} results`)
    return p1.slice(0, SUGGESTIONS_LIMIT)
  }
  logger.info(`RelatedSvc P1[Redis]: "${category}" → ${p1.length} — escalating to P2`)

  // ── Priority 2: PostgreSQL exact category ──────────────────────
  const existing1 = new Set(p1.map(p => p.id || p.name))
  const p2 = await _fromDbExactCategory(category, excludeId, excludeName, existing1, SUGGESTIONS_LIMIT - p1.length + 5)
  const after2 = _dedupe([...p1, ...p2], SUGGESTIONS_LIMIT)

  if (after2.length >= SUGGESTIONS_LIMIT) {
    logger.info(`RelatedSvc P2[DB exact]: "${category}" → ${after2.length} results`)
    return after2
  }
  logger.info(`RelatedSvc P2[DB exact]: "${category}" → ${after2.length} — escalating to P3`)

  // ── Priority 3: PostgreSQL parent / sibling categories ─────────
  const existing2 = new Set(after2.map(p => p.id || p.name))
  const p3 = await _fromDbBroaderCategory(category, excludeId, excludeName, existing2, SUGGESTIONS_LIMIT - after2.length + 5)
  const after3 = _dedupe([...after2, ...p3], SUGGESTIONS_LIMIT)

  if (after3.length >= SUGGESTIONS_LIMIT) {
    logger.info(`RelatedSvc P3[DB parent]: "${category}" → ${after3.length} results`)
    return after3
  }
  logger.info(`RelatedSvc P3[DB parent]: "${category}" → ${after3.length} — escalating to P4`)

  // ── Priority 4: Global trending pool ───────────────────────────
  const existing3 = new Set(after3.map(p => p.id || p.name))
  const p4 = await _fromTrending(redis, category, existing3, SUGGESTIONS_LIMIT - after3.length)
  const after4 = _dedupe([...after3, ...p4], SUGGESTIONS_LIMIT)

  logger.info(`RelatedSvc P4[Trending]: "${category}" → ${after4.length} total`)

  // ── Background enrichment if results are thin ──────────────────
  if (after4.length < MIN_RESULTS) {
    logger.warn(`RelatedSvc: "${category}" thin (${after4.length}) — background enrichment triggered`)
    triggerCategoryEnrichment(redis, category)
  }

  return after4
}

// ─────────────────────────────────────────────────────────────────
// P1: Redis
// ─────────────────────────────────────────────────────────────────
async function _fromRedisCategory(redis, category, excludeId, excludeName) {
  try {
    const raw = await redis.get(`top50:${category}`)
    if (!raw) return []
    const products = JSON.parse(raw)
    if (!Array.isArray(products)) return []
    return products.filter(p => !_isExcluded(p, excludeId, excludeName))
  } catch (err) {
    logger.warn(`RelatedSvc P1: Redis error: ${err.message}`)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────
// P2: PostgreSQL exact category
// ─────────────────────────────────────────────────────────────────
async function _fromDbExactCategory(category, excludeId, excludeName, existingIds, limit) {
  if (!prisma) return []
  try {
    const rows = await prisma.product.findMany({
      where:   { category, inStock: true },
      orderBy: { aiScore: 'desc' },
      take:    limit + 10,
      select:  _dbSelect(),
    })
    return rows
      .filter(p => !_isExcluded(p, excludeId, excludeName) && !existingIds.has(p.id || p.name))
      .slice(0, limit)
      .map(_dbToProduct)
  } catch (err) {
    logger.warn(`RelatedSvc P2: DB exact error for "${category}": ${err.message}`)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────
// P3: PostgreSQL parent / sibling categories
// ─────────────────────────────────────────────────────────────────
async function _fromDbBroaderCategory(category, excludeId, excludeName, existingIds, limit) {
  if (!prisma) return []

  const parentCat   = getParentCategory(category)
  const siblings    = getSiblingCategories(category)
  const allChildren = parentCat ? getChildrenOfParent(parentCat) : siblings
  const broaderCats = [...new Set([...siblings, ...allChildren])].filter(c => c !== category)

  if (broaderCats.length === 0) return []

  try {
    const rows = await prisma.product.findMany({
      where:   { category: { in: broaderCats }, inStock: true },
      orderBy: { aiScore: 'desc' },
      take:    limit + 10,
      select:  _dbSelect(),
    })
    return rows
      .filter(p => !_isExcluded(p, excludeId, excludeName) && !existingIds.has(p.id || p.name))
      .slice(0, limit)
      .map(_dbToProduct)
  } catch (err) {
    logger.warn(`RelatedSvc P3: DB broader error for "${category}": ${err.message}`)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────
// P4: Global trending pool
// ─────────────────────────────────────────────────────────────────
async function _fromTrending(redis, skipCategory, existingIds, limit) {
  const pool = []

  // Attempt 1: trending:global Redis key (if populated by a trending cron)
  try {
    const globalRaw = await redis.get('trending:global')
    if (globalRaw) {
      const globalProducts = JSON.parse(globalRaw)
      const picks = globalProducts
        .filter(p => p.category !== skipCategory && !existingIds.has(p.id || p.name))
        .slice(0, limit)
      if (picks.length >= limit) return picks
      pool.push(...picks)
    }
  } catch (_) {}

  // Attempt 2: top-N from each high-traffic category's Redis snapshot
  for (const cat of TRENDING_CATS) {
    if (cat === skipCategory || pool.length >= limit) break
    try {
      const catRaw = await redis.get(`top50:${cat}`)
      if (catRaw) {
        const picks = JSON.parse(catRaw)
          .filter(p => !existingIds.has(p.id || p.name) && !pool.some(x => x.name === p.name))
          .slice(0, TRENDING_PER_CAT)
        pool.push(...picks)
      }
    } catch (_) {}
  }

  if (pool.length >= limit) return pool.slice(0, limit)

  // Attempt 3: PostgreSQL cross-category top products (last resort)
  if (prisma) {
    try {
      const rows = await prisma.product.findMany({
        where:   { category: { not: skipCategory }, inStock: true },
        orderBy: { aiScore: 'desc' },
        take:    (limit - pool.length) * 3,
        select:  _dbSelect(),
      })
      const dbFill = rows
        .filter(p => !existingIds.has(p.id || p.name) && !pool.some(x => x.name === p.name))
        .slice(0, limit - pool.length)
        .map(_dbToProduct)
      pool.push(...dbFill)
    } catch (err) {
      logger.warn(`RelatedSvc P4: DB global error: ${err.message}`)
    }
  }

  return pool.slice(0, limit)
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
function _isExcluded(product, excludeId, excludeName) {
  if (excludeId   && product.id   === excludeId)   return true
  if (excludeName && product.name === excludeName)  return true
  return false
}

function _dedupe(products, limit) {
  const seen = new Set()
  const out  = []
  for (const p of products) {
    const key = p.id || p.name
    if (!seen.has(key)) { seen.add(key); out.push(p) }
    if (out.length >= limit) break
  }
  return out
}

function _dbSelect() {
  return {
    id: true, name: true, brand: true, category: true, imageUrl: true,
    currentPrice: true, platformRating: true, reviewCount: true,
    aiScore: true, affiliateUrl: true, platformUrl: true,
    platform: true, platformId: true,
  }
}

function _dbToProduct(p) {
  return {
    id:            p.id,
    name:          p.name,
    brand:         p.brand,
    category:      p.category,
    imageUrl:      p.imageUrl,
    price:         p.currentPrice,
    rankingScore:  p.aiScore,
    aiScore:       p.aiScore,
    rating:        p.platformRating,
    reviewCount:   p.reviewCount,
    affiliateLink: p.affiliateUrl || p.platformUrl,
    asin:          p.platform === 'AMAZON' ? p.platformId : null,
  }
}

module.exports = { getRelated, setPrisma }
