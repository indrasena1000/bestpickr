// src/services/fallbackService.js
// Path D: confidence < 0.5 or completely unresolvable queries.
// Rule 4: Never return empty results.
// Returns trending picks from top 3 categories + category suggestion links.
'use strict'

const logger            = require('../utils/logger')
const { getCategory }   = require('../utils/categoryKeyMap')

// Trending categories to always show on fallback
const TRENDING_CATEGORIES = ['mobile', 'laptop', 'headphones']
const TRENDING_PER_CAT    = 5

// Category suggestion links shown in FallbackView
const CATEGORY_SUGGESTIONS = [
  { label: 'Mobiles',     slug: 'mobile',      icon: '📱' },
  { label: 'Laptops',     slug: 'laptop',      icon: '💻' },
  { label: 'Headphones',  slug: 'headphones',  icon: '🎧' },
  { label: 'Smartwatch',  slug: 'smartwatch',  icon: '⌚' },
  { label: 'Cameras',     slug: 'camera',      icon: '📷' },
  { label: 'Gaming',      slug: 'gaming',      icon: '🎮' },
  { label: 'Fashion',     slug: 'fashion',     icon: '👕' },
  { label: 'Skincare',    slug: 'skincare',    icon: '✨' },
]

/**
 * getFallback(redis, rawQuery?)
 *
 * Step 1: Try fuzzy category match on the raw query
 * Step 2: If matched → return top10 from that category
 * Step 3: No match → return trending top5 from each of the 3 default categories
 *
 * @returns {{ intent:'FALLBACK', suggestions, categorySuggestions, source }}
 */
async function getFallback(redis, rawQuery = '') {
  const q = (rawQuery || '').toLowerCase().trim()

  // Step 1: Fuzzy category match
  if (q && redis) {
    const words = q.split(/\s+/)
    for (const word of words) {
      const cat = getCategory(word)
      if (cat) {
        try {
          const raw = await redis.get(`top50:${cat}`)
          if (raw) {
            const products = JSON.parse(raw)
            if (Array.isArray(products) && products.length > 0) {
              logger.info(`FallbackSvc: fuzzy match "${word}" → "${cat}", returning top 10`)
              return {
                intent:             'FALLBACK',
                source:             'cache',
                matchedCategory:    cat,
                suggestions:        products.slice(0, 10),
                categorySuggestions: CATEGORY_SUGGESTIONS,
              }
            }
          }
        } catch (err) {
          logger.warn(`FallbackSvc: fuzzy match read error: ${err.message}`)
        }
      }
    }
  }

  // Step 2: No match → multi-category trending
  const trending = []

  if (redis) {
    for (const cat of TRENDING_CATEGORIES) {
      try {
        const raw = await redis.get(`top50:${cat}`)
        if (raw) {
          const products = JSON.parse(raw)
          if (Array.isArray(products)) {
            trending.push(...products.slice(0, TRENDING_PER_CAT).map(p => ({
              ...p,
              _trendingCategory: cat,
            })))
          }
        }
      } catch (err) {
        logger.warn(`FallbackSvc: trending read error for "${cat}": ${err.message}`)
      }
    }
  }

  logger.info(`FallbackSvc: returning trending (${trending.length} items) + category links`)

  return {
    intent:              'FALLBACK',
    source:              trending.length > 0 ? 'cache' : 'empty',
    suggestions:         trending,
    categorySuggestions: CATEGORY_SUGGESTIONS,
  }
}

module.exports = { getFallback, CATEGORY_SUGGESTIONS }
