// src/services/searchIntentService.js
// ─────────────────────────────────────────────────────────────────
// v2.0: Structured attribute-aware intent classifier.
//   Uses extractAttributes() for spelling-corrected, parsed queries.
//   Returns confidence score calibrated for DB matching thresholds:
//     exact model  ≥ 0.95
//     brand+model  ≥ 0.85
//     brand+cat    ≥ 0.70
//     category     ≥ 0.50
// ─────────────────────────────────────────────────────────────────
'use strict'

const { extractAttributes } = require('../utils/queryNormalizer')

// ── INTENT LEVELS ────────────────────────────────────────────────
const INTENT = {
  PRODUCT_SPECIFIC: 'PRODUCT_SPECIFIC',   // "Sony WH-1000XM5"
  CATEGORY:         'CATEGORY',           // "headphones under 2000"
  BRAND_CATEGORY:   'BRAND_CATEGORY',     // "best samsung 5g phone"
  GENERIC:          'GENERIC',            // "headphones"
  LOW_CONFIDENCE:   'LOW_CONFIDENCE',     // ambiguous
  FALLBACK:         'FALLBACK',           // no signal
}

// ── MATCH TYPE (for upstream confidence gating) ──────────────────
const MATCH_TYPE = {
  EXACT_MODEL:       'exact_model',       // confidence ≥ 0.95
  BRAND_MODEL:       'brand_model',       // confidence ≥ 0.85
  BRAND_CAP_TYPE:    'brand_cap_type',    // confidence ≥ 0.85
  BRAND_CATEGORY:    'brand_category',    // confidence ≥ 0.70
  CATEGORY_FEATURE:  'category_feature',  // confidence ≥ 0.60
  CATEGORY_ONLY:     'category_only',     // confidence ≥ 0.50
  GENERIC:           'generic',           // confidence < 0.50
}

/**
 * classifyIntent(rawQuery, categoryHint?)
 *
 * @returns {{
 *   intent: string,
 *   matchType: string,
 *   category: string|null,
 *   brand: string|null,
 *   model: string|null,
 *   capacity: Array|null,
 *   rating: number|null,
 *   price_min: number|null,
 *   price_max: number|null,
 *   features: string[],
 *   confidence: number,
 *   cleanQuery: string,
 *   correctedQuery: string,
 *   wasSpellingCorrected: boolean
 * }}
 */
function classifyIntent(rawQuery, categoryHint = '') {
  const attrs = extractAttributes(rawQuery)

  // Override category from hint if provided
  const category = categoryHint || attrs.category
  const { brand, model, capacity, rating, features,
          price_min, price_max, cleanQuery, subType,
          correctedQuery, wasSpellingCorrected } = attrs

  // ── Confidence scoring ─────────────────────────────────────────
  // Each signal adds to confidence independently, calibrated to
  // match the DB weighted search thresholds.
  let confidence = 0
  let intent     = INTENT.FALLBACK
  let matchType  = MATCH_TYPE.GENERIC

  const hasModel    = !!model
  const hasCapacity = capacity && capacity.length > 0
  const hasFeatures = features && features.length > 0
  const hasPrice    = !!(price_min || price_max)

  // ── PRODUCT_SPECIFIC scoring ───────────────────────────────────
  if (hasModel && brand) {
    // "Sony WH-1000XM5" → exact model + brand = highest confidence
    confidence = 0.95
    intent     = INTENT.PRODUCT_SPECIFIC
    matchType  = MATCH_TYPE.EXACT_MODEL
  } else if (hasModel) {
    // "WH-1000XM5" → model without brand, still product-specific
    confidence = 0.85
    intent     = INTENT.PRODUCT_SPECIFIC
    matchType  = MATCH_TYPE.BRAND_MODEL
  } else if (brand && hasCapacity && category) {
    // "Samsung 128GB phone" → brand + capacity + type
    confidence = 0.85
    intent     = INTENT.PRODUCT_SPECIFIC
    matchType  = MATCH_TYPE.BRAND_CAP_TYPE
  } else if (brand && category) {
    // "Samsung phone" or "Sony headphones"
    confidence = 0.70
    intent     = INTENT.BRAND_CATEGORY
    matchType  = MATCH_TYPE.BRAND_CATEGORY
    if (hasFeatures) confidence += 0.05
    if (hasPrice)    confidence += 0.05
  } else if (category && hasFeatures) {
    // "wireless headphones under 2000"
    confidence = 0.65
    intent     = INTENT.CATEGORY
    matchType  = MATCH_TYPE.CATEGORY_FEATURE
    if (hasPrice) confidence += 0.05
  } else if (category) {
    // "headphones"
    confidence = 0.55
    intent     = INTENT.CATEGORY
    matchType  = MATCH_TYPE.CATEGORY_ONLY
    if (hasPrice) confidence += 0.05
  } else if (brand) {
    // Just a brand name: "Sony"
    confidence = 0.45
    intent     = INTENT.GENERIC
    matchType  = MATCH_TYPE.GENERIC
  } else if (cleanQuery.length > 2) {
    // Something typed but no recognizable signal
    confidence = 0.30
    intent     = INTENT.LOW_CONFIDENCE
    matchType  = MATCH_TYPE.GENERIC
  } else {
    confidence = 0.10
    intent     = INTENT.FALLBACK
    matchType  = MATCH_TYPE.GENERIC
  }

  // Clamp confidence
  confidence = Math.min(parseFloat(confidence.toFixed(2)), 1.0)

  return {
    intent,
    matchType,
    category:    category || null,
    subType:     subType  || null,
    brand:       brand    || null,
    model:       model    || null,
    capacity,
    rating,
    price_min,
    price_max,
    features,
    confidence,
    cleanQuery,
    correctedQuery,
    wasSpellingCorrected,
  }
}

module.exports = { classifyIntent, INTENT, MATCH_TYPE }
