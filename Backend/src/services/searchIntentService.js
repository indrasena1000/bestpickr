// src/services/searchIntentService.js
// Rule-based intent + confidence classifier. Zero GPT/LLM calls.
// Returns: { intent, category, brand, price_min, price_max, features, confidence }
'use strict'

const { KEYWORD_TO_CATEGORY, getCategory } = require('../utils/categoryKeyMap')
const { detectBrand }                       = require('../utils/productNameNormalizer')

// ── INTENT LEVELS ────────────────────────────────────────────────
const INTENT = {
  PRODUCT_SPECIFIC: 'PRODUCT_SPECIFIC',   // "Sony WH-1000XM5"
  CATEGORY:         'CATEGORY',           // "headphones under 2000"
  BRAND_CATEGORY:   'BRAND_CATEGORY',     // "best samsung 5g phone"
  GENERIC:          'GENERIC',            // "headphones"
  LOW_CONFIDENCE:   'LOW_CONFIDENCE',     // ambiguous
  FALLBACK:         'FALLBACK',           // no signal
}

// Model number patterns — strong signal for PRODUCT_SPECIFIC
// Matches: WH-1000XM5, Galaxy S24+, iPhone 15 Pro Max, OnePlus 12R
const MODEL_PATTERNS = [
  /\b[a-z]{1,5}[-_]?\d{3,6}[a-z+]?\b/i,   // WH-1000XM5, S24+
  /\b\d+\s?(?:pro|ultra|max|plus|lite|r|s|t|x|e|fe)\b/i, // 15 Pro, 12R
  /\b(?:iphone|ipad|macbook|galaxy|pixel|oneplus)\s+\w+\b/i,
]

// Feature keywords — detected and passed through to filter
const FEATURE_KEYWORDS = [
  '5g', '4g', 'wifi', 'bluetooth', 'nfc', 'waterproof',
  'gaming', 'camera', 'amoled', 'oled', 'lcd', 'fast charging',
  'noise cancelling', 'noise canceling', 'anc',
  'wireless', 'wired', 'true wireless',
]

// Price extraction: "under 15000", "below ₹10k", "upto 20,000"
const PRICE_RE = [
  { re: /(?:under|below|upto|less than|max)\s*[₹rs.]?\s*([\d,]+)k?/i, type: 'max' },
  { re: /(?:above|over|minimum|min|atleast|at least)\s*[₹rs.]?\s*([\d,]+)k?/i, type: 'min' },
  { re: /[₹rs.]?\s*([\d,]+)k?\s*(?:to|-)\s*[₹rs.]?\s*([\d,]+)k?/i, type: 'range' },
]

function parsePrice(val, isK) {
  const n = parseInt(String(val).replace(/,/g, ''))
  return isK ? n * 1000 : n
}

function extractPrice(query) {
  const q = query.toLowerCase()
  for (const { re, type } of PRICE_RE) {
    const m = q.match(re)
    if (!m) continue
    const isK = m[0].includes('k')
    if (type === 'range') {
      return { price_min: parsePrice(m[1], isK), price_max: parsePrice(m[2], isK) }
    }
    if (type === 'max') return { price_min: null, price_max: parsePrice(m[1], isK) }
    if (type === 'min') return { price_min: parsePrice(m[1], isK), price_max: null }
  }
  return { price_min: null, price_max: null }
}

function extractFeatures(query) {
  const q = query.toLowerCase()
  return FEATURE_KEYWORDS.filter(f => q.includes(f))
}

function detectCategory(query) {
  const q = query.toLowerCase()
  // Check multi-word keywords first
  for (const [kw, cat] of Object.entries(KEYWORD_TO_CATEGORY)) {
    if (kw.includes(' ') && q.includes(kw)) return cat
  }
  for (const word of q.split(/\s+/)) {
    const cat = getCategory(word)
    if (cat) return cat
  }
  return null
}

function hasModelPattern(query) {
  return MODEL_PATTERNS.some(re => re.test(query))
}

/**
 * classifyIntent(query, category?)
 * @returns {{ intent, category, brand, price_min, price_max, features, confidence }}
 */
function classifyIntent(rawQuery, categoryHint = '') {
  const query   = (rawQuery || '').trim()
  const brand   = detectBrand(query)
  const cat     = categoryHint || detectCategory(query)
  const { price_min, price_max } = extractPrice(query)
  const features = extractFeatures(query)
  const hasModel = hasModelPattern(query)

  // ── Scoring ────────────────────────────────────────────────────
  // Each signal adds to confidence independently.
  let score = 0
  let intent = INTENT.FALLBACK

  // PRODUCT_SPECIFIC signals
  if (hasModel)  score += 0.55
  if (brand)     score += 0.20
  if (cat)       score += 0.10

  if (score >= 0.7) {
    intent = INTENT.PRODUCT_SPECIFIC
  } else if (score >= 0.5) {
    // Might be product-specific — run both paths
    intent = INTENT.LOW_CONFIDENCE
  } else {
    // Reset and try CATEGORY path
    score = 0
    if (cat)               score += 0.50
    if (brand && cat)      score += 0.20
    if (price_min || price_max) score += 0.15
    if (features.length)   score += 0.10

    if (score >= 0.7 && brand) {
      intent = INTENT.BRAND_CATEGORY
    } else if (score >= 0.7) {
      intent = INTENT.CATEGORY
    } else if (score >= 0.5) {
      intent = INTENT.GENERIC
    } else if (score >= 0.3) {
      intent = INTENT.LOW_CONFIDENCE
    } else {
      intent = INTENT.FALLBACK
      score  = 0.1
    }
  }

  return {
    intent,
    category:    cat    || null,
    brand:       brand  || null,
    price_min:   price_min  || null,
    price_max:   price_max  || null,
    features,
    confidence:  Math.min(parseFloat(score.toFixed(2)), 1.0),
  }
}

module.exports = { classifyIntent, INTENT }
