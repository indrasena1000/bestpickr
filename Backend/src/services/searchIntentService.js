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
  // ── Brand → default category (for brand-only queries) ──────────
  // When a user types just a brand name with no category keyword
  // (e.g. "samsung", "apple", "boat"), we infer the most-searched
  // category for that brand rather than returning a random mixed result.
  // Only applied when attrs.category is null — explicit keywords always win.
  const BRAND_DEFAULT_CATEGORY = {
    // Mobile-first brands
    samsung:    'mobile',   // samsung → phones (TVs/appliances need explicit keyword)
    apple:      'mobile',   // apple → iPhones
    oneplus:    'mobile',
    redmi:      'mobile',
    xiaomi:     'mobile',
    realme:     'mobile',
    vivo:       'mobile',
    oppo:       'mobile',
    poco:       'mobile',
    iqoo:       'mobile',
    motorola:   'mobile',
    moto:       'mobile',
    nokia:      'mobile',
    google:     'mobile',   // google → pixel phones
    nothing:    'mobile',   // nothing phone
    // Laptop-first brands
    dell:       'laptop',
    hp:         'laptop',
    lenovo:     'laptop',
    asus:       'laptop',
    acer:       'laptop',
    msi:        'laptop',
    // Audio-first brands
    boat:       'headphones',
    bose:       'headphones',
    sony:       'headphones', // sony headphones >> sony TVs in search volume
    jbl:        'headphones',
    sennheiser: 'headphones',
    skullcandy: 'headphones',
    jabra:      'headphones',
    anker:      'headphones',
    ptron:      'headphones',
    noise:      'headphones', // noise buds
    // TV-first brands
    lg:         'televisions', // LG → TVs more than appliances
    tcl:        'televisions',
    hisense:    'televisions',
    vu:         'televisions',
    // Smartwatch-first brands
    fitbit:     'smartwatch',
    garmin:     'smartwatch',
    fossil:     'smartwatch',
    // Camera-first brands
    canon:      'camera',
    nikon:      'camera',
    fujifilm:   'camera',
    gopro:      'camera',
    // Footwear-first brands
    nike:       'footwear',
    adidas:     'footwear',
    puma:       'footwear',
    reebok:     'footwear',
    skechers:   'footwear',
    crocs:      'footwear',
  }

  const brand    = attrs.brand
  const rawCat   = categoryHint || attrs.category
  // Apply brand default ONLY when no category keyword was detected
  const category = rawCat || (brand ? (BRAND_DEFAULT_CATEGORY[brand.toLowerCase()] || null) : null)
  const _usedBrandDefault = !rawCat && !!category && category !== rawCat

  const { model, capacity, rating, features,
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
    // "Samsung phone", "Sony headphones", or brand-only "samsung" with inferred default category
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
    // Brand name with no detectable category at all
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
    category:          category || null,
    subType:           subType  || null,
    brand:             brand    || null,
    model:             model    || null,
    capacity,
    rating,
    price_min,
    price_max,
    features,
    confidence,
    cleanQuery,
    correctedQuery,
    wasSpellingCorrected,
    usedBrandDefaultCategory: _usedBrandDefault,
  }
}

module.exports = { classifyIntent, INTENT, MATCH_TYPE }
