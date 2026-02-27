// src/services/productMatchService.js
// PATH A: DB lookup for PRODUCT_SPECIFIC queries.
// Step 1: Exact match on { brand + model }
// Step 2: Fuzzy match on model (simple substring, no external libs)
// Prisma client is injected via setPrisma() from server.js (shared instance).
'use strict'

const logger   = require('../utils/logger')
const { normalize } = require('../utils/productNameNormalizer')

let prisma = null
function setPrisma(client) { prisma = client }

/**
 * Levenshtein distance — used for fuzzy model matching.
 * Only used on short strings (model tokens ≤ 30 chars).
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    }
  }
  return dp[m][n]
}

/**
 * fuzzyScore(query, candidate) → 0–1
 * Combines substring containment + Levenshtein similarity.
 */
function fuzzyScore(query, candidate) {
  if (!query || !candidate) return 0
  const q = query.toLowerCase()
  const c = candidate.toLowerCase()
  if (c.includes(q) || q.includes(c)) return 1.0
  const dist = levenshtein(q, c)
  const maxLen = Math.max(q.length, c.length)
  return Math.max(0, 1 - dist / maxLen)
}

/**
 * findProduct(rawQuery) → { product, score } | null
 *
 * Returns the best DB match with its confidence score.
 * product shape: Prisma Product record
 */
async function findProduct(rawQuery) {
  if (!prisma) {
    logger.warn('ProductMatchSvc: prisma not injected — skipping DB lookup')
    return null
  }

  const { brand, model, normalized } = normalize(rawQuery)

  if (!normalized) return null

  try {
    // Step 1: Exact match on normalized name (fastest)
    const exact = await prisma.product.findFirst({
      where: {
        name: { contains: model || normalized, mode: 'insensitive' },
        ...(brand ? { brand: { equals: brand, mode: 'insensitive' } } : {}),
      },
      orderBy: { aiScore: 'desc' },
    })

    if (exact) {
      const score = fuzzyScore(normalized, exact.name)
      logger.info(`ProductMatchSvc: exact match "${exact.name}" (score=${score.toFixed(2)})`)
      if (score >= 0.5) return { product: exact, score, source: 'db_exact' }
    }

    // Step 2: Broader search — fetch top 20 candidates and fuzzy rank
    const candidates = await prisma.product.findMany({
      where: {
        OR: [
          ...(brand ? [{ brand: { contains: brand, mode: 'insensitive' } }] : []),
          ...(model ? [{ name:  { contains: model, mode: 'insensitive' } }] : []),
        ],
      },
      orderBy: { aiScore: 'desc' },
      take: 20,
    })

    if (candidates.length === 0) {
      logger.info(`ProductMatchSvc: no candidates found for "${rawQuery}"`)
      return null
    }

    // Rank by fuzzy score
    const scored = candidates
      .map(p => ({ product: p, score: fuzzyScore(normalized, p.name) }))
      .sort((a, b) => b.score - a.score)

    const best = scored[0]
    logger.info(
      `ProductMatchSvc: best fuzzy match "${best.product.name}" (score=${best.score.toFixed(2)})`
    )

    // Reject if similarity is too low (likely irrelevant)
    if (best.score < 0.35) {
      logger.info(`ProductMatchSvc: best score ${best.score.toFixed(2)} below threshold — DB miss`)
      return null
    }

    return { ...best, source: 'db_fuzzy' }
  } catch (err) {
    logger.error(`ProductMatchSvc: DB error: ${err.message}`)
    return null
  }
}

/**
 * isStale(product) → bool
 * Returns true if product's analysis is older than 7 days.
 */
function isStale(product) {
  if (!product?.lastScored) return true
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  return (Date.now() - new Date(product.lastScored).getTime()) > sevenDaysMs
}

/**
 * formatForResponse(product) → unified response object
 * Maps Prisma Product → response schema shape
 */
function formatForResponse(product) {
  return {
    id:           product.id,
    name:         product.name,
    brand:        product.brand,
    price:        product.currentPrice,
    category:     product.category,
    rankingScore: product.aiScore,
    affiliateLink:product.affiliateUrl || product.platformUrl,
    imageUrl:     product.imageUrl,
    analysedAt:   product.lastScored,
    platform:     product.platform,
  }
}

module.exports = { findProduct, isStale, formatForResponse, setPrisma }
