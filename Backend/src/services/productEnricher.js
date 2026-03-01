// src/services/productEnricher.js
// ─────────────────────────────────────────────────────────────────
// Enriches product objects with review analysis data following
// the cache-first chain:
//   1. Redis   (bestpickr:analysis:{ASIN})  — fastest, 24h TTL
//   2. MongoDB (ProductAnalysis collection) — persistent, no scrape
//   3. ScraperAPI + GPT-4o mini             — only when NOT found above
//
// Rules:
//   • Never call ScraperAPI if analysis exists in Redis or MongoDB.
//   • For alternatives (indices 1–9): cache-only, no new scrape.
//   • For primary (index 0): full pipeline allowed if cache miss.
// ─────────────────────────────────────────────────────────────────
'use strict'

const logger = require('../utils/logger')
const { lookupAnalysis, runAnalysisPipeline } = require('../pipeline/analysisPipeline')

// ── Extract ASIN from a product object (multiple shapes) ─────────
function getAsin(product) {
  if (!product) return null
  // Direct field (set during live fetch)
  if (product.asin) return product.asin
  // Prisma row  → platform === 'AMAZON' stores ASIN in platformId
  if (product.platform === 'AMAZON' && product.platformId) return product.platformId
  // Aggregated scraped product → platforms array
  if (Array.isArray(product.platforms)) {
    const amz = product.platforms.find(p =>
      (p.name || '').toLowerCase() === 'amazon'
    )
    if (amz?.platformId) return amz.platformId
  }
  return null
}

// ── Merge analysis data into a product object ─────────────────────
function mergeAnalysis(product, analysis) {
  if (!analysis) return product

  // Map analysis fields onto the unified product shape
  const positivePct = (
    analysis.overallSentiment?.positive ??
    analysis.positivePct ??
    null
  )

  return {
    ...product,
    // Score — prefer analysis result over scorer estimate
    aiScore:           analysis.aiScore          ?? product.aiScore,
    positivePct:       positivePct               ?? product.positivePct,
    // Rich insights (only present after GPT analysis)
    aiSummary:         analysis.buyRecommendation ?? null,
    pros:              analysis.whatPeopleLove   ?? [],
    cons:              analysis.commonComplaints ?? [],
    redFlags:          analysis.redFlags         ?? [],
    aspectScores:      analysis.aspectScores     ?? {},
    authenticityBadge: analysis.authenticityBadge ?? null,
    confidenceLevel:   analysis.confidenceLevel  ?? null,
    reviewsAnalyzed:   analysis.reviewsAnalyzed  ?? 0,
    analysisDate:      analysis.analysisDate      ?? null,
    // Metadata
    analysisSource:    analysis._analysisSource  ?? 'fresh',
    hasAnalysis:       true,
  }
}

// ── Enrich single product from cache ONLY (no scrape) ────────────
async function enrichFromCache(product) {
  const asin = getAsin(product)
  if (!asin) return { ...product, hasAnalysis: false }

  try {
    const analysis = await lookupAnalysis(asin)
    if (analysis) {
      logger.info(`Enricher: cache HIT [${analysis._analysisSource}] for ASIN=${asin}`)
      return mergeAnalysis(product, analysis)
    }
  } catch (err) {
    logger.warn(`Enricher: lookupAnalysis error for ${asin}: ${err.message}`)
  }

  return { ...product, hasAnalysis: false }
}

// ── Enrich single product: cache first, then ScraperAPI if allowed
async function enrichWithAnalysis(product, { allowScrape = false } = {}) {
  const asin = getAsin(product)
  if (!asin) return { ...product, hasAnalysis: false }

  // Step 1: Redis → MongoDB (no scrape cost)
  try {
    const cached = await lookupAnalysis(asin)
    if (cached) {
      logger.info(`Enricher: cache HIT [${cached._analysisSource}] for ASIN=${asin} — skipping ScraperAPI`)
      return mergeAnalysis(product, cached)
    }
  } catch (err) {
    logger.warn(`Enricher: lookupAnalysis error for ${asin}: ${err.message}`)
  }

  // Step 2: Cache miss — only scrape if permitted
  if (!allowScrape) {
    logger.info(`Enricher: cache MISS for ASIN=${asin} — scrape not allowed (alternative product)`)
    return { ...product, hasAnalysis: false }
  }

  // Step 3: Full pipeline (ScraperAPI + GPT-4o mini)
  logger.info(`Enricher: cache MISS for ASIN=${asin} — calling ScraperAPI + GPT analysis pipeline`)
  try {
    const analysis = await runAnalysisPipeline(
      asin,
      product.name,
      product.category || null,
      { brand: product.brand || null }
    )
    if (analysis) {
      return mergeAnalysis(product, analysis)
    }
  } catch (err) {
    logger.warn(`Enricher: pipeline failed for ASIN=${asin}: ${err.message}`)
  }

  return { ...product, hasAnalysis: false }
}

// ── Enrich an array of products ───────────────────────────────────
// scrapeLimit: how many products (from the front) may trigger the
//              ScraperAPI + GPT pipeline on cache miss.
//              Default 1 → only the primary product.
async function enrichAll(products, { scrapeLimit = 1 } = {}) {
  if (!Array.isArray(products) || products.length === 0) return products

  const results = await Promise.all(
    products.map((p, i) =>
      enrichWithAnalysis(p, { allowScrape: i < scrapeLimit })
        .catch(err => {
          logger.warn(`Enricher: enrichAll[${i}] failed: ${err.message}`)
          return { ...p, hasAnalysis: false }
        })
    )
  )

  const hits    = results.filter(p => p.hasAnalysis).length
  const misses  = results.length - hits
  logger.info(`Enricher: enrichAll complete — ${hits} cache hits, ${misses} misses (scrapeLimit=${scrapeLimit})`)

  return results
}

module.exports = { enrichFromCache, enrichWithAnalysis, enrichAll, getAsin }
