// src/controllers/searchController.js
// ─────────────────────────────────────────────────────────────────
// Path router — orchestrates the 4 search paths:
//   A: PRODUCT_SPECIFIC  → DB lookup → live fetch on miss
//   B: CATEGORY / BRAND_CATEGORY / GENERIC → Redis top50 + filter
//   C: LOW_CONFIDENCE    → run A + B in parallel, pick winner
//   D: FALLBACK          → trending multi-category
// ─────────────────────────────────────────────────────────────────
'use strict'

const { validationResult }       = require('express-validator')
const logger                     = require('../utils/logger')
const { getClient }              = require('../utils/redis')
const { normalizeQuery }         = require('../utils/queryNormalizer')
const { classifyIntent, INTENT } = require('../services/searchIntentService')
const { findProduct, isStale, formatForResponse } = require('../services/productMatchService')
const { getRelated }             = require('../services/relatedProductService')
const { getFallback }            = require('../services/fallbackService')
const { startLiveFetch }         = require('../services/liveProductFetchService')
const { createJob, getJob }      = require('../services/jobStatusService')

const SEARCH_CACHE_TTL = 600   // 10 min per spec

// ── Helpers ───────────────────────────────────────────────────────
function makeResponse(overrides) {
  return {
    intent: null, confidence: null, primaryProduct: null,
    suggestions: [], source: null, status: 'ready', jobId: null,
    executionTimeMs: 0, ...overrides,
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

// ── PATH A: PRODUCT_SPECIFIC ──────────────────────────────────────
async function pathA(redis, query, intentResult, startTime) {
  const match = await findProduct(query)

  if (match) {
    const product  = formatForResponse(match.product)
    const category = match.product.category || intentResult.category

    // Rule 8: background re-analysis if stale (non-blocking)
    if (isStale(match.product)) {
      logger.info(`PathA: "${product.name}" stale — background re-analysis triggered`)
      // analysisPipeline handles refresh; we return existing score immediately
    }

    const suggestions = await getRelated(redis, category, product.id, product.name)
    return makeResponse({
      intent: intentResult.intent, confidence: intentResult.confidence,
      primaryProduct: product, suggestions, source: match.source,
      status: 'ready', executionTimeMs: Date.now() - startTime,
    })
  }

  // DB miss → async live fetch
  const jobId = await createJob(redis, normalizeQuery(query))
  setImmediate(() => startLiveFetch(redis, jobId, query, intentResult))
  logger.info(`PathA: DB miss for "${query}" — job ${jobId} started`)

  return makeResponse({
    intent: intentResult.intent, confidence: intentResult.confidence,
    status: 'fetching', jobId, source: 'pending',
    executionTimeMs: Date.now() - startTime,
  })
}

// ── PATH B: CATEGORY / BRAND_CATEGORY / GENERIC ───────────────────
async function pathB(redis, intentResult, startTime, prisma) {
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

  return makeResponse({
    intent, confidence: intentResult.confidence,
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

  // Step 2: Classify intent
  const intentResult = classifyIntent(rawQuery, rawCat)
  logger.info(`Search: "${rawQuery}" → ${intentResult.intent} conf=${intentResult.confidence} cat=${intentResult.category}`)

  // Rule 10: Analytics on every search
  logger.info('ANALYTICS ' + JSON.stringify({
    query: rawQuery, normalizedQuery: normalized,
    intent: intentResult.intent, confidence: intentResult.confidence,
    timestamp: new Date().toISOString(),
  }))

  try {
    const { intent, confidence } = intentResult
    let result

    if (intent === INTENT.FALLBACK || confidence < 0.5) {
      const fb = await getFallback(redis, rawQuery)
      result = makeResponse({ ...fb, intent: INTENT.FALLBACK, confidence, executionTimeMs: Date.now() - startTime })

    } else if (intent === INTENT.LOW_CONFIDENCE) {
      const [aResult, bResult] = await Promise.all([
        pathA(redis, rawQuery, intentResult, startTime).catch(() => null),
        pathB(redis, intentResult, startTime, prismaClient).catch(() => null),
      ])
      const winner = aResult?.primaryProduct ? aResult : (bResult || aResult)
      result = { ...winner, intent: INTENT.LOW_CONFIDENCE, confidence }

    } else if (intent === INTENT.PRODUCT_SPECIFIC) {
      result = await pathA(redis, rawQuery, intentResult, startTime)

    } else {
      result = await pathB(redis, intentResult, startTime, prismaClient)
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
