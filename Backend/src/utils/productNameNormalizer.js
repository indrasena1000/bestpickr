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

  // ── Entries below are ONLY for brands that need aliases or spelling variants.
  // All other brands are auto-detected from the DB via setDynamicBrands().
  // Do NOT add single-name brands here — the dynamic system handles them.

  // Aliases / multi-word variants (these can't be auto-derived from a single DB column)
  ptron:     ['ptron', 'p-tron'],
  prestige:  ['prestige', 'ttk prestige', 'ttk'],
  bluestar:  ['blue star', 'bluestar'],
  vguard:    ['v-guard', 'vguard'],
  morphy:    ['morphy', 'morphy richards'],
  zebronics: ['zebronics', 'zebster'],
  logitech:  ['logitech', 'logi'],
  razer:     ['razer'],
  corsair:   ['corsair'],
  hyperx:    ['hyperx', 'hyper x'],
  steelseries:['steelseries', 'steel series'],
}

// Build reverse map: variant → canonical
const VARIANT_TO_BRAND = {}
for (const [canonical, variants] of Object.entries(BRAND_ALIAS_MAP)) {
  for (const v of variants) VARIANT_TO_BRAND[v] = canonical
}

// ── DYNAMIC BRAND SYSTEM ──────────────────────────────────────────
// Auto-loaded from Postgres at startup (and refreshed every 6h).
// Eliminates the need to manually add every brand to the static map.
//
// Common English words that happen to also be brand names — skip
// single-word detection for these to avoid false positives.
// e.g., "noise cancelling headphones" should NOT match brand "Noise"
const AMBIGUOUS_BRAND_WORDS = new Set([
  'noise', 'wings', 'hammer', 'pigeon', 'butterfly', 'carrier',
  'orient', 'signal', 'flash', 'surge', 'boost', 'prime',
  'ultra', 'mini', 'plus', 'lite', 'air', 'go', 'fit', 'pro',
  'max', 'edge', 'infinity', 'fusion', 'legend', 'titan',
])

let _dynSingleBrands = new Set()    // single-word brands from DB
let _dynMultiBrands  = []           // multi-word brands from DB, longest first

/**
 * setDynamicBrands(brandNames)
 * Called at startup + every 6h by snapshot cron.
 * Builds optimised lookup structures from raw DB brand strings.
 */
function setDynamicBrands(brandNames) {
  _dynSingleBrands = new Set()
  _dynMultiBrands  = []

  for (const raw of brandNames) {
    if (!raw) continue
    const name = raw.toLowerCase().trim()
    if (!name) continue

    if (name.includes(' ')) {
      // Multi-word: always safe ("ttk prestige", "blue star")
      _dynMultiBrands.push(name)
    } else if (name.length >= 3 && !AMBIGUOUS_BRAND_WORDS.has(name)) {
      // Single-word: skip common English words to avoid false positives
      _dynSingleBrands.add(name)
    }
  }

  // Longest multi-word brand first (more specific wins)
  _dynMultiBrands.sort((a, b) => b.length - a.length)
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
 *
 * Priority:
 *   1. Static BRAND_ALIAS_MAP  — handles aliases + misspellings (e.g., "samsug" → samsung)
 *   2. Dynamic DB brands       — any brand in our Postgres product table (auto-loaded)
 */
function detectBrand(query) {
  const q = query.toLowerCase()

  // ── 1. Static map — multi-word first ─────────────────────────
  for (const [variant, canonical] of Object.entries(VARIANT_TO_BRAND)) {
    if (variant.includes(' ') && q.includes(variant)) return canonical
  }
  for (const word of q.split(/\s+/)) {
    if (VARIANT_TO_BRAND[word]) return VARIANT_TO_BRAND[word]
  }

  // ── 2. Dynamic brands from DB — multi-word first ──────────────
  for (const brand of _dynMultiBrands) {
    if (q.includes(brand)) return brand
  }
  for (const word of q.split(/\s+/)) {
    if (_dynSingleBrands.has(word)) return word
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

/**
 * addDynamicBrand(brandName)
 * Immediately adds a single brand to the in-memory dynamic brand set.
 * Called when a live Amazon fetch teaches us a new brand (e.g. "Safari"),
 * so subsequent searches within the same server process benefit right away
 * without waiting for the next 6h setDynamicBrands() cron refresh.
 */
function addDynamicBrand(brandName) {
  if (!brandName) return
  const name = brandName.toLowerCase().trim()
  if (!name || name.length < 3 || AMBIGUOUS_BRAND_WORDS.has(name)) return

  if (name.includes(' ')) {
    if (!_dynMultiBrands.includes(name)) {
      _dynMultiBrands.push(name)
      _dynMultiBrands.sort((a, b) => b.length - a.length)
    }
  } else {
    _dynSingleBrands.add(name)
  }
}

module.exports = { normalize, detectBrand, extractModel, setDynamicBrands, addDynamicBrand, BRAND_ALIAS_MAP, VARIANT_TO_BRAND }
