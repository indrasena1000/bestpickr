// src/utils/productNameNormalizer.js
// Extracts a { brand, model } tuple from a raw product query.
// Used by productMatchService for DB fuzzy lookup.
// No NPM deps — pure string operations.
'use strict'

// Brand alias map — maps any variant to canonical brand name
const BRAND_ALIAS_MAP = {
  apple:    ['apple', 'apl', 'iphone', 'macbook', 'imac', 'ipad', 'airpods'],
  samsung:  ['samsung', 'smsng', 'galaxy'],
  sony:     ['sony'],
  oneplus:  ['oneplus', '1+', '1 plus'],
  xiaomi:   ['xiaomi', 'mi', 'redmi', 'poco'],
  realme:   ['realme'],
  vivo:     ['vivo'],
  oppo:     ['oppo'],
  motorola: ['motorola', 'moto'],
  nokia:    ['nokia'],
  lg:       ['lg'],
  hp:       ['hp', 'hewlett'],
  dell:     ['dell'],
  lenovo:   ['lenovo', 'thinkpad', 'ideapad'],
  asus:     ['asus', 'zenbook', 'vivobook', 'rog'],
  acer:     ['acer', 'aspire', 'nitro', 'swift'],
  msi:      ['msi'],
  boat:     ['boat'],
  jbl:      ['jbl'],
  bose:     ['bose'],
  sennheiser:['sennheiser'],
  skullcandy:['skullcandy'],
  jabra:    ['jabra'],
  anker:    ['anker', 'soundcore'],
  nike:     ['nike'],
  adidas:   ['adidas'],
  puma:     ['puma'],
  reebok:   ['reebok'],
  newbalance:['new balance', 'newbalance'],
}

// Build reverse map: variant → canonical
const VARIANT_TO_BRAND = {}
for (const [canonical, variants] of Object.entries(BRAND_ALIAS_MAP)) {
  for (const v of variants) VARIANT_TO_BRAND[v] = canonical
}

// Words that never form part of a model number
const STOP_WORDS = new Set([
  'best', 'top', 'good', 'cheap', 'latest', 'new', 'buy', 'review',
  'price', 'india', 'online', 'under', 'below', 'upto', 'above',
  'the', 'a', 'an', 'for', 'in', 'of', 'and', 'or', 'vs', 'with',
  'inch', 'gen', 'generation', 'nd', 'rd', 'th', 'series',
])

/**
 * detectBrand(query) → canonical brand string or null
 */
function detectBrand(query) {
  const q = query.toLowerCase()
  // Check multi-word variants first (e.g., "new balance")
  for (const [variant, canonical] of Object.entries(VARIANT_TO_BRAND)) {
    if (variant.includes(' ') && q.includes(variant)) return canonical
  }
  // Then single-word
  for (const word of q.split(/\s+/)) {
    if (VARIANT_TO_BRAND[word]) return VARIANT_TO_BRAND[word]
  }
  return null
}

/**
 * extractModel(query, brand) → model string
 * Strips brand name + stop words, leaves model tokens (alphanumeric, dashes).
 */
function extractModel(query, brand) {
  let q = query.toLowerCase()

  // Remove all brand alias variants
  if (brand) {
    const variants = BRAND_ALIAS_MAP[brand] || [brand]
    for (const v of variants) {
      q = q.replace(new RegExp(`\\b${v}\\b`, 'gi'), '')
    }
  }

  // Remove stop words
  const tokens = q.split(/\s+/).filter(t => t && !STOP_WORDS.has(t))

  // Remove price patterns
  const modelTokens = tokens.filter(t => !/^\d+k?$/.test(t))

  return modelTokens.join(' ').trim()
}

/**
 * normalize(query) → { brand, model, normalized }
 *
 * Example:
 *   "Best Sony WH-1000XM5 under 30000" →
 *   { brand: 'sony', model: 'wh-1000xm5', normalized: 'sony wh-1000xm5' }
 */
function normalize(query) {
  if (!query) return { brand: null, model: '', normalized: '' }

  const brand = detectBrand(query)
  const model = extractModel(query, brand)
  const normalized = [brand, model].filter(Boolean).join(' ').trim()

  return { brand, model, normalized }
}

module.exports = { normalize, detectBrand, extractModel, BRAND_ALIAS_MAP, VARIANT_TO_BRAND }
