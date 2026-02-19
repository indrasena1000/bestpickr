// src/utils/queryNormalizer.js — Smart Query Normalization
// ─────────────────────────────────────────────────────────────────
// PURPOSE:
//   "Best Sony headphones under 5000" and "sony headphones"
//   should hit the SAME Redis cache key. This saves ScraperAPI credits.
//
// HOW:
//   1. Lowercase + trim + collapse spaces
//   2. Remove stop words ("best", "top", "under ₹5000", "in india")
//   3. Map common synonyms ("earbuds" → "earphones", "mobile" → "phone")
//   4. Sort remaining words alphabetically (optional, for order-invariance)
//
// RESULT:
//   "Best Sony headphones under 5000"  → "headphones sony"
//   "sony headphones"                  → "headphones sony"
//   "top headphones sony"              → "headphones sony"
//   Same key → same cache → 0 credits burned
// ─────────────────────────────────────────────────────────────────
'use strict'

// Words that don't change search intent — removed before caching
const STOP_WORDS = new Set([
  'best', 'top', 'good', 'great', 'cheap', 'cheapest', 'affordable',
  'premium', 'latest', 'new', 'popular', 'trending', 'rated', 'highest',
  'lowest', 'most', 'recommended', 'review', 'reviews', 'comparison',
  'compare', 'vs', 'versus', 'or', 'and', 'the', 'a', 'an', 'for',
  'in', 'india', 'online', 'buy', 'price', 'deal', 'deals', 'offer',
  'offers', 'discount', 'sale', 'budget', 'value', 'quality',
  '2024', '2025', '2026', '2027',
])

// Price patterns to strip: "under 5000", "below ₹10000", "upto 20k"
const PRICE_PATTERNS = [
  /under\s*[₹rs.]?\s*\d+k?/gi,
  /below\s*[₹rs.]?\s*\d+k?/gi,
  /upto\s*[₹rs.]?\s*\d+k?/gi,
  /above\s*[₹rs.]?\s*\d+k?/gi,
  /[₹rs.]\s*\d+[\s-]*(?:to|-)?\s*[₹rs.]?\s*\d*k?/gi,
  /\d+k?\s*(?:to|-)\s*\d+k?/gi,
  /range\s*\d+/gi,
]

// Synonyms: map variations to a single canonical term
const SYNONYMS = {
  // Audio
  'earbuds':     'earphones',
  'earbud':      'earphones',
  'earphone':    'earphones',
  'headset':     'headphones',
  'tws':         'earphones',
  'neckband':    'earphones',

  // Phones
  'mobile':      'phone',
  'mobiles':     'phone',
  'smartphone':  'phone',
  'smartphones': 'phone',
  'phones':      'phone',
  'cellphone':   'phone',
  'iphone':      'apple phone',

  // Computers
  'notebook':    'laptop',
  'laptops':     'laptop',
  'macbook':     'apple laptop',
  'chromebook':  'laptop',

  // Footwear
  'shoes':       'shoe',
  'sneakers':    'shoe',
  'sneaker':     'shoe',
  'running':     'shoe',
  'trainers':    'shoe',

  // Skincare
  'moisturiser': 'moisturizer',
  'face wash':   'cleanser',
  'facewash':    'cleanser',

  // Generic
  'television':  'tv',
  'fridge':      'refrigerator',
  'ac':          'air conditioner',
  'wm':          'washing machine',
}

/**
 * Normalize a search query for cache key matching.
 *
 * @param {string} query - Raw user search query
 * @returns {string}     - Normalized query (lowercase, sorted, cleaned)
 *
 * @example
 *   normalize("Best Sony headphones under 5000") → "headphones sony"
 *   normalize("sony headphones")                 → "headphones sony"
 *   normalize("Top wireless earbuds 2025")       → "earphones wireless"
 */
function normalize(query) {
  if (!query) return ''

  let q = query.toLowerCase().trim()

  // Step 1: Remove price patterns
  for (const pattern of PRICE_PATTERNS) {
    q = q.replace(pattern, ' ')
  }

  // Step 2: Remove special characters (keep letters, numbers, spaces)
  q = q.replace(/[^a-z0-9\s]/g, ' ')

  // Step 3: Split into words
  let words = q.split(/\s+/).filter(w => w.length > 0)

  // Step 4: Remove stop words
  words = words.filter(w => !STOP_WORDS.has(w))

  // Step 5: Apply synonyms
  words = words.map(w => SYNONYMS[w] || w)

  // Step 6: Deduplicate
  words = [...new Set(words)]

  // Step 7: Sort alphabetically (order-invariant matching)
  words.sort()

  return words.join(' ')
}

/**
 * Build a Redis cache key from a query and category.
 * Uses normalized query so variations hit the same key.
 *
 * @param {string} query    - Raw user query
 * @param {string} category - Category slug (optional)
 * @returns {string}        - Redis key like "bestpickr:search:headphones sony:"
 */
function buildSearchKey(query, category) {
  const nq = normalize(query)
  const nc = (category || '').toLowerCase().trim()
  return `bestpickr:search:${nq}:${nc}`
}

/**
 * Build a Redis key for a pre-loaded category.
 *
 * @param {string} categorySlug - e.g., "headphones", "smartphones"
 * @returns {string}            - Redis key like "bestpickr:category:headphones"
 */
function buildCategoryKey(categorySlug) {
  return `bestpickr:category:${categorySlug.toLowerCase().trim()}`
}

module.exports = { normalize, buildSearchKey, buildCategoryKey }
