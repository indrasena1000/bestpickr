// src/services/relatedProductService.js
// Fetches related products from Redis top50:{category}.
// Rule 7: Only called AFTER category is confirmed (DB or analysisPipeline).
// Rule: Never return the primaryProduct in suggestions.
'use strict'

const logger = require('../utils/logger')

const SUGGESTIONS_COUNT = 9

/**
 * getRelated(redis, category, excludeId?, excludeName?)
 * → array of up to 9 products from top50:{category}, ranked by rankingScore
 */
async function getRelated(redis, category, excludeId = null, excludeName = null) {
  if (!redis || !category) return []

  const key = `top50:${category}`

  try {
    const raw = await redis.get(key)
    if (!raw) {
      logger.warn(`RelatedSvc: no data for key "${key}"`)
      return []
    }

    const products = JSON.parse(raw)
    if (!Array.isArray(products) || products.length === 0) return []

    // Exclude the primary product to avoid duplicate
    const filtered = products.filter(p => {
      if (excludeId   && p.id   === excludeId)   return false
      if (excludeName && p.name === excludeName)  return false
      return true
    })

    // Already sorted by rankingScore desc from cron — just slice
    const suggestions = filtered.slice(0, SUGGESTIONS_COUNT)

    logger.info(`RelatedSvc: returning ${suggestions.length} related from "${key}"`)
    return suggestions
  } catch (err) {
    logger.error(`RelatedSvc: error reading "${key}": ${err.message}`)
    return []
  }
}

module.exports = { getRelated }
