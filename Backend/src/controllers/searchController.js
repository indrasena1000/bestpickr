// src/controllers/searchController.js
// ─────────────────────────────────────────────────────────────────
// v2.0: Confidence-gated search with 3-tier internal matching.
//
// Flow:
//   1. Normalize → extractAttributes → classifyIntent
//   2. Redis confidence match (top50 cache) — if ≥ 85% → return
//   3. PostgreSQL weighted search — if ≥ 85% → return
//   4. Amazon API live fetch — ONLY if no high-confidence match
//
// Paths:
//   A: PRODUCT_SPECIFIC  → Redis → DB → live fetch (last resort)
//   B: CATEGORY/BRAND_CATEGORY/GENERIC → Redis top50 + filter
//   C: LOW_CONFIDENCE    → run A + B in parallel
//   D: FALLBACK          → trending multi-category
// ─────────────────────────────────────────────────────────────────
'use strict'

const { validationResult }       = require('express-validator')
const logger                     = require('../utils/logger')
const { getClient }              = require('../utils/redis')
const { normalizeQuery }         = require('../utils/queryNormalizer')
const { classifyIntent, INTENT } = require('../services/searchIntentService')
const { findFromRedis, weightedSearch, findTopMatches, isStale, formatForResponse, CONFIDENCE }
                                 = require('../services/productMatchService')
const { getRelated }             = require('../services/relatedProductService')
const { getFallback }            = require('../services/fallbackService')
const { startLiveFetch }         = require('../services/liveProductFetchService')
const { createJob, getJob }      = require('../services/jobStatusService')
const { enrichWithAnalysis, enrichFromCache, enrichAll } = require('../services/productEnricher')
const { triggerCategoryEnrichment } = require('../services/backgroundCategoryEnricher')

const SEARCH_CACHE_TTL = 600   // 10 min per spec

// ── Helpers ───────────────────────────────────────────────────────
function makeResponse(overrides) {
  return {
    intent: null, confidence: null, matchType: null,
    primaryProduct: null, suggestions: [], source: null,
    status: 'ready', jobId: null, executionTimeMs: 0,
    wasSpellingCorrected: false, correctedQuery: null,
    ...overrides,
  }
}

async function getCached(redis, key) {
  if (!redis) return null
  try { const r = await redis.get(key); return r ? JSON.parse(r) : null } catch (_) { return null }
}

async function setCached(redis, key, data) {
  if (!redis) return
  try { await redis.set(key, JSON.stringify(data), 'EX', SEARCH_CACHE_TTL) } catch (_) {}
}

function applyFilters(products, { brand, price_min, price_max, features }) {
  let f = [...products]
  if (price_max) f = f.filter(p => !p.price || p.price <= price_max)
  if (price_min) f = f.filter(p => !p.price || p.price >= price_min)
  if (brand)     f = f.filter(p => `${p.brand} ${p.name}`.toLowerCase().includes(brand))
  if (features?.length) f = f.filter(p =>
    features.some(ft => `${p.name} ${p.brand}`.toLowerCase().includes(ft))
  )
  return f
}

async function getTop50(redis, category) {
  if (!redis || !category) return []
  try { const r = await redis.get(`top50:${category}`); return r ? JSON.parse(r) : [] }
  catch (_) { return [] }
}

// ── PATH A: PRODUCT_SPECIFIC (confidence-gated) ──────────────────
// Flow:
//  1. Redis top50 confidence match → ≥ 85% = done (no Amazon)
//  2. PostgreSQL weighted search → ≥ 85% = done (no Amazon)
//  3. Legacy DB findTopMatches + enrich (backward compat)
//  4. DB miss → async live fetch (Amazon API as last resort)
async function pathA(redis, query, intentResult, startTime) {

  // ── Step 1: Redis confidence match ─────────────────────────────
  const redisResult = await findFromRedis(redis, intentResult)

  if (redisResult.confidence >= CONFIDENCE.HIGH && redisResult.products.length > 0) {
    // HIGH confidence from Redis → skip Amazon entirely
    const primary    = await enrichFromCache(redisResult.products[0])
    const rawRelated = redisResult.products.length > 1
      ? redisResult.products.slice(1, 10)
      : await getRelated(redis, intentResult.category, primary.id, primary.name)
    const suggestions = await enrichAll(rawRelated, { scrapeLimit: 0 })

    logger.info(`PathA: Redis HIGH confidence (${redisResult.confidence}) — "${primary.name}" — skipping Amazon`)
    return makeResponse({
      intent: intentResult.intent, confidence: redisResult.confidence,
      matchType: intentResult.matchType,
      primaryProduct: primary, suggestions,
      source: 'redis_high', status: 'ready',
      executionTimeMs: Date.now() - startTime,
    })
  }

  // ── Step 2: PostgreSQL weighted search ─────────────────────────
  const dbResult = await weightedSearch(intentResult, 10)

  if (dbResult.confidence >= CONFIDENCE.HIGH && dbResult.products.length > 0) {
    // HIGH confidence from DB → skip Amazon
    const formatted = dbResult.products.map(p => ({
      ...formatForResponse(p),
      asin: p.platform === 'AMAZON' ? p.platformId : null,
    }))
    const enriched    = await enrichAll(formatted, { scrapeLimit: 1 })
    const primary     = enriched[0]
    const suggestions = enriched.slice(1)

    logger.info(`PathA: DB HIGH confidence (${dbResult.confidence}) — "${primary.name}" — skipping Amazon`)
    return makeResponse({
      intent: intentResult.intent, confidence: dbResult.confidence,
      matchType: intentResult.matchType,
      primaryProduct: primary, suggestions,
      source: 'db_high', status: 'ready',
      executionTimeMs: Date.now() - startTime,
    })
  }

  // ── Step 3: Medium confidence — use DB results but consider refresh
  if (dbResult.confidence >= CONFIDENCE.MEDIUM && dbResult.products.length > 0) {
    const formatted = dbResult.products.map(p => ({
      ...formatForResponse(p),
      asin: p.platform === 'AMAZON' ? p.platformId : null,
    }))
    const enriched    = await enrichAll(formatted, { scrapeLimit: 1 })
    const primary     = enriched[0]
    const suggestions = enriched.slice(1)

    if (isStale(dbResult.products[0])) {
      logger.info(`PathA: DB MEDIUM conf (${dbResult.confidence}), stale — background refresh queued`)
    }

    return makeResponse({
      intent: intentResult.intent, confidence: dbResult.confidence,
      matchType: intentResult.matchType,
      primaryProduct: primary, suggestions,
      source: dbResult.source, status: 'ready',
      executionTimeMs: Date.now() - startTime,
    })
  }

  // ── Step 3b: Partial Redis results (< HIGH confidence) ────────
  if (redisResult.products.length > 0 && redisResult.confidence >= CONFIDENCE.MEDIUM) {
    const primary    = await enrichFromCache(redisResult.products[0])
    const suggestions = await enrichAll(redisResult.products.slice(1, 10), { scrapeLimit: 0 })

    return makeResponse({
      intent: intentResult.intent, confidence: redisResult.confidence,
      matchType: intentResult.matchType,
      primaryProduct: primary, suggestions,
      source: 'redis_partial', status: 'ready',
      executionTimeMs: Date.now() - startTime,
    })
  }

  // ── Step 4: Legacy findTopMatches fallback ─────────────────────
  const dbMatches = await findTopMatches(query, 10)

  if (dbMatches.length > 0) {
    const formatted = dbMatches.map(p => ({
      ...formatForResponse(p),
      asin: p.platform === 'AMAZON' ? p.platformId : null,
    }))
    const enriched    = await enrichAll(formatted, { scrapeLimit: 1 })
    const primary     = enriched[0]
    const suggestions = enriched.slice(1)

    logger.info(`PathA: legacy DB hit — ${enriched.length} enriched results`)
    return makeResponse({
      intent: intentResult.intent, confidence: intentResult.confidence,
      matchType: intentResult.matchType,
      primaryProduct: primary, suggestions,
      source: 'db_legacy', status: 'ready',
      executionTimeMs: Date.now() - startTime,
    })
  }

  // ── Step 5: DB miss → async live fetch (Amazon as LAST RESORT) ─
  const jobId = await createJob(redis, normalizeQuery(query))
  setImmediate(() => startLiveFetch(redis, jobId, query, intentResult))
  logger.info(`PathA: all internal sources miss for "${query}" — job ${jobId} → Amazon`)

  return makeResponse({
    intent: intentResult.intent, confidence: intentResult.confidence,
    matchType: intentResult.matchType,
    status: 'fetching', jobId, source: 'pending',
    executionTimeMs: Date.now() - startTime,
  })
}

// ── PATH B: CATEGORY / BRAND_CATEGORY / GENERIC ───────────────────
async function pathB(redis, intentResult, startTime, prisma, rawQuery) {
  const { category, intent } = intentResult
  const products  = await getTop50(redis, category)
  let   filtered  = applyFilters(products, intentResult)

  // DB fallback expansion if < 5 results
  if (filtered.length < 5 && prisma && category) {
    try {
      const dbProducts = await prisma.product.findMany({
        where: { category, inStock: true }, orderBy: { aiScore: 'desc' }, take: 100,
        select: { id: true, name: true, brand: true, category: true, imageUrl: true,
                  currentPrice: true, aiScore: true, affiliateUrl: true, platformUrl: true },
      })
      const dbFmt = dbProducts.map(p => ({
        ...p, price: p.currentPrice, rankingScore: p.aiScore,
        affiliateLink: p.affiliateUrl || p.platformUrl,
      }))
      const dbFiltered = applyFilters(dbFmt, intentResult)
      const seen = new Set(filtered.map(p => p.name))
      for (const p of dbFiltered) {
        if (!seen.has(p.name)) { filtered.push(p); seen.add(p.name) }
        if (filtered.length >= 10) break
      }
    } catch (err) { logger.warn(`PathB: DB fallback: ${err.message}`) }
  }

  // ── Fire background enrichment if results are thin ─────────────
  // This populates Redis top50:{category} + PostgreSQL for future queries
  if (filtered.length < 5 && category) {
    const hint = rawQuery || `best ${category}`
    logger.info(`PathB: thin results (${filtered.length}) for "${category}" — triggering background enrichment`)
    triggerCategoryEnrichment(redis, category, hint)
  }

  // ── If ZERO results, fall through to pathA live fetch ──────────
  // So the user gets immediate results instead of an empty page
  if (filtered.length === 0 && rawQuery) {
    logger.info(`PathB: zero results for "${category}" — falling through to pathA live fetch`)
    return pathA(redis, rawQuery, intentResult, startTime)
  }

  return makeResponse({
    intent, confidence: intentResult.confidence,
    matchType: intentResult.matchType,
    suggestions: filtered.slice(0, 10),
    source: products.length > 0 ? 'cache' : 'database',
    status: 'ready', executionTimeMs: Date.now() - startTime,
  })
}

// ── MAIN HANDLER ─────────────────────────────────────────────────
let prismaClient = null
function setPrisma(client) { prismaClient = client }

async function search(req, res) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

  const rawQuery = String(req.body.query  || '').slice(0, 200).replace(/<[^>]*>/g, '').trim()
  const rawCat   = String(req.body.category || '').slice(0, 50).trim()
  if (!rawQuery) return res.status(400).json({ success: false, error: 'query is required' })

  req.setTimeout(60000)
  const startTime  = Date.now()
  const redis      = getClient()
  const normalized = normalizeQuery(rawQuery)
  const cacheKey   = `search:${normalized}`

  // Step 1: Search cache (10 min TTL)
  const cached = await getCached(redis, cacheKey)
  if (cached) {
    logger.info(`Search: cache HIT for "${rawQuery}" (${Date.now() - startTime}ms)`)
    return res.json({ success: true, ...cached, fromCache: true })
  }

  // Step 2: Classify intent (now with structured attributes)
  const intentResult = classifyIntent(rawQuery, rawCat)
  logger.info(
    `Search: "${rawQuery}" → ${intentResult.intent} ` +
    `conf=${intentResult.confidence} cat=${intentResult.category} ` +
    `brand=${intentResult.brand} model=${intentResult.model} ` +
    `match=${intentResult.matchType}` +
    (intentResult.wasSpellingCorrected ? ` corrected="${intentResult.correctedQuery}"` : '')
  )

  // Analytics
  logger.info('ANALYTICS ' + JSON.stringify({
    query: rawQuery, normalizedQuery: normalized,
    intent: intentResult.intent, confidence: intentResult.confidence,
    matchType: intentResult.matchType,
    brand: intentResult.brand, model: intentResult.model,
    category: intentResult.category,
    wasSpellingCorrected: intentResult.wasSpellingCorrected,
    timestamp: new Date().toISOString(),
  }))

  try {
    const { intent, confidence, wasSpellingCorrected, correctedQuery } = intentResult
    let result

    // Spelling correction metadata — attached to all responses
    const spellingMeta = wasSpellingCorrected
      ? { wasSpellingCorrected: true, correctedQuery }
      : { wasSpellingCorrected: false }

    if (intent === INTENT.FALLBACK || confidence < 0.30) {
      const fb = await getFallback(redis, rawQuery)
      result = makeResponse({
        ...fb, ...spellingMeta,
        intent: INTENT.FALLBACK, confidence,
        executionTimeMs: Date.now() - startTime,
      })

    } else if (intent === INTENT.LOW_CONFIDENCE) {
      const [aResult, bResult] = await Promise.all([
        pathA(redis, rawQuery, intentResult, startTime).catch(() => null),
        pathB(redis, intentResult, startTime, prismaClient, rawQuery).catch(() => null),
      ])
      const winner = aResult?.primaryProduct ? aResult : (bResult || aResult)
      result = { ...winner, ...spellingMeta, intent: INTENT.LOW_CONFIDENCE, confidence }

    } else if (intent === INTENT.PRODUCT_SPECIFIC) {
      result = await pathA(redis, rawQuery, intentResult, startTime)
      result = { ...result, ...spellingMeta }

    } else {
      result = await pathB(redis, intentResult, startTime, prismaClient, rawQuery)
      result = { ...result, ...spellingMeta }
    }

    if (result.status === 'ready') setCached(redis, cacheKey, result).catch(() => {})
    res.json({ success: true, query: rawQuery, ...result })

  } catch (err) {
    logger.error(`Search: "${rawQuery}": ${err.message}`)
    res.status(500).json({ success: false, error: 'Search failed. Please try again.' })
  }
}

// ── JOB STATUS ENDPOINT ───────────────────────────────────────────
async function jobStatus(req, res) {
  const { jobId } = req.params
  if (!jobId || !jobId.startsWith('bp_')) {
    return res.status(400).json({ success: false, error: 'Invalid jobId' })
  }
  const redis = getClient()
  const job   = await getJob(redis, jobId)
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' })
  if (job.status === 'ready') {
    const norm = normalizeQuery(job.normalizedQuery || '')
    if (norm) setCached(redis, `search:${norm}`, job).catch(() => {})
  }
  res.json({ success: true, ...job })
}

// ── SUGGESTIONS ENDPOINT ──────────────────────────────────────────
async function suggestions(req, res) {
  const q = (req.query.q || '').toLowerCase().trim()
  if (q.length < 2) return res.json({ suggestions: [] })
  const all = [
    'Sony WH-1000XM5 headphones', 'iPhone 15 Pro', 'Samsung Galaxy S24',
    'MacBook Air M3', 'Nike Air Max', 'Adidas Ultraboost', 'boAt headphones',
    'Bose QuietComfort', 'Apple AirPods', 'gaming mouse', 'mechanical keyboard',
    'running shoes', 'air fryer', 'robot vacuum', 'skincare serum',
    'OnePlus 12', 'Realme GT Neo 5',
  ]
  res.json({ suggestions: all.filter(s => s.toLowerCase().includes(q)).slice(0, 6) })
}

module.exports = { search, suggestions, jobStatus, setPrisma }
