// src/utils/queryNormalizer.js — Smart Query Normalization + Attribute Extraction
// ─────────────────────────────────────────────────────────────────
// v2.0:
//   1. Spelling correction (common brand/product misspellings)
//   2. Stopword removal + price strip
//   3. Synonym normalization
//   4. Structured attribute extraction (brand, category, capacity, rating, model)
//   5. Confidence-weighted clean query for DB matching
// ─────────────────────────────────────────────────────────────────
'use strict'

const { detectBrand, extractModel }        = require('./productNameNormalizer')
const { getCategory, KEYWORD_TO_CATEGORY } = require('./categoryKeyMap')

// ── Spelling corrections (common misspellings → correct) ────────
const SPELLING_MAP = {
  // Brands
  'samsug':     'samsung',  'samung':     'samsung',  'smasung':    'samsung',
  'samsng':     'samsung',  'aple':       'apple',    'appple':     'apple',
  'aplle':      'apple',    'soni':       'sony',     'sonny':      'sony',
  'onplus':     'oneplus',  'oneplus':    'oneplus',  'xiomi':      'xiaomi',
  'xaomi':      'xiaomi',   'redme':      'redmi',    'realmi':     'realme',
  'reelme':     'realme',   'opppo':      'oppo',     'motorolla':  'motorola',
  'leenovo':    'lenovo',   'assu':       'asus',     'asuss':      'asus',
  'dell':       'dell',     'baat':       'boat',     'bost':       'bose',
  'bosse':      'bose',     'skullcndy':  'skullcandy', 'jabel':   'jabra',
  'nikee':      'nike',     'addidas':    'adidas',   'addidas':    'adidas',
  'pumma':      'puma',     'rebok':      'reebok',   'ankar':      'anker',
  'senheiser':  'sennheiser', 'senhiser': 'sennheiser',
  // Products
  'headfones':  'headphones', 'headhones': 'headphones', 'hedphones': 'headphones',
  'hphones':    'headphones', 'earfones':  'earphones',  'earpods':   'earphones',
  'latop':      'laptop',     'labtop':    'laptop',     'lapptop':   'laptop',
  'moniter':    'monitor',    'monitar':   'monitor',    'keybord':   'keyboard',
  'kyboard':    'keyboard',   'moues':     'mouse',      'vaccum':    'vacuum',
  'vacum':      'vacuum',     'vacume':    'vacuum',     'frezer':    'freezer',
  'fridg':      'fridge',     'refrigator':'refrigerator',
  'smartwach':  'smartwatch', 'smatwatch': 'smartwatch',
  'snekers':    'sneakers',   'sneekers':  'sneakers',
  'moisturiser':'moisturizer','serom':     'serum',      'shampo':    'shampoo',
  // Compound-word typos (no space between words)
  'washinmachine':  'washing machine', 'washingmachine': 'washing machine',
  'airfryer':       'air fryer',        'airconditioner': 'air conditioner',
  'aircon':         'air conditioner',
}

// Words that don't change search intent — removed before caching
const STOP_WORDS = new Set([
  'best', 'top', 'good', 'great', 'cheap', 'cheapest', 'affordable',
  'premium', 'latest', 'new', 'popular', 'trending', 'rated', 'highest',
  'lowest', 'most', 'recommended', 'review', 'reviews', 'comparison',
  'compare', 'vs', 'versus', 'or', 'and', 'the', 'a', 'an', 'for',
  'in', 'india', 'online', 'buy', 'price', 'deal', 'deals', 'offer',
  'offers', 'discount', 'sale', 'budget', 'value', 'quality',
  'please', 'show', 'me', 'find', 'get', 'want', 'need', 'looking',
  'search', 'which', 'what', 'is', 'are', 'was', 'with',
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

// Price extraction (preserving values before stripping)
const PRICE_EXTRACT_RE = [
  { re: /(?:under|below|upto|less than|max)\s*[₹rs.]?\s*([\d,]+)k?/i, type: 'max' },
  { re: /(?:above|over|minimum|min|atleast|at least)\s*[₹rs.]?\s*([\d,]+)k?/i, type: 'min' },
  { re: /[₹rs.]?\s*([\d,]+)k?\s*(?:to|-)\s*[₹rs.]?\s*([\d,]+)k?/i, type: 'range' },
]

// Capacity patterns (storage, RAM, battery, weight, screen)
const CAPACITY_PATTERNS = [
  { re: /\b(\d+)\s*(?:gb|gigs?)\b/i,        unit: 'GB',   type: 'storage' },
  { re: /\b(\d+)\s*(?:tb|tera)\b/i,          unit: 'TB',   type: 'storage' },
  { re: /\b(\d+)\s*(?:mb)\b/i,               unit: 'MB',   type: 'storage' },
  { re: /\b(\d+)\s*(?:mah)\b/i,              unit: 'mAh',  type: 'battery' },
  { re: /\b(\d+)\s*(?:mp|megapixel)\b/i,     unit: 'MP',   type: 'camera' },
  { re: /\b(\d+(?:\.\d+)?)\s*(?:inch|")\b/i, unit: 'inch', type: 'screen' },
  { re: /\b(\d+)\s*(?:watt|w)\b/i,           unit: 'W',    type: 'power' },
  { re: /\b(\d+)\s*(?:liter|litre|l)\b/i,    unit: 'L',    type: 'capacity' },
  { re: /\b(\d+)\s*(?:kg)\b/i,               unit: 'kg',   type: 'weight' },
]

// Rating patterns: "4 star", "4.5 rated", "above 4 stars"
const RATING_RE = /\b([\d.]+)\s*(?:star|stars|rated|rating)\b/i

// Model number patterns — specific product identifier
const MODEL_PATTERNS = [
  /\b[a-z]{1,5}[-_]?\d{3,6}[a-z+]?\b/i,        // WH-1000XM5, S24+
  /\b\d+\s?(?:pro|ultra|max|plus|lite|r|s|t|x|e|fe)\b/i,  // 15 Pro, 12R
  /\b(?:galaxy)\s+[a-z]\d+/i,                    // Galaxy S24
  /\b(?:iphone|ipad|macbook|pixel)\s+\d+/i,      // iPhone 15
  /\b(?:redmi|poco|realme)\s+(?:note\s+)?\d+/i,  // Redmi Note 13
  /\bgrt?\s*neo\s*\d+/i,                         // GT Neo 5
]

// Synonyms: map variations to a single canonical term
const SYNONYMS = {
  // Audio
  'earbuds':     'earphones', 'earbud':      'earphones',
  'earphone':    'earphones', 'headset':     'headphones',
  'tws':         'earphones', 'neckband':    'earphones',
  // Phones
  'mobile':      'phone',     'mobiles':     'phone',
  'smartphone':  'phone',     'smartphones': 'phone',
  'phones':      'phone',     'cellphone':   'phone',
  // Computers
  'notebook':    'laptop',    'laptops':     'laptop',
  'chromebook':  'laptop',
  // Footwear
  'shoes':       'shoe',      'sneakers':    'shoe',
  'sneaker':     'shoe',      'trainers':    'shoe',
  // Skincare
  'face wash':   'cleanser',  'facewash':    'cleanser',
  // Home
  'television':  'tv',        'fridge':      'refrigerator',
  'ac':          'air conditioner', 'wm':    'washing machine',
}

// ── Spelling Correction ──────────────────────────────────────────
function correctSpelling(query) {
  let q = query.toLowerCase()
  const words = q.split(/\s+/)
  const corrected = words.map(w => SPELLING_MAP[w] || w)
  return corrected.join(' ')
}

// ── Price Extraction (before stripping) ──────────────────────────
function extractPrice(query) {
  const q = query.toLowerCase()
  for (const { re, type } of PRICE_EXTRACT_RE) {
    const m = q.match(re)
    if (!m) continue
    const isK = m[0].includes('k')
    const parse = (v) => { const n = parseInt(String(v).replace(/,/g, '')); return isK ? n * 1000 : n }
    if (type === 'range') return { price_min: parse(m[1]), price_max: parse(m[2]) }
    if (type === 'max')   return { price_min: null, price_max: parse(m[1]) }
    if (type === 'min')   return { price_min: parse(m[1]), price_max: null }
  }
  return { price_min: null, price_max: null }
}

// ── Capacity Extraction ──────────────────────────────────────────
function extractCapacity(query) {
  const caps = []
  for (const { re, unit, type } of CAPACITY_PATTERNS) {
    const m = query.match(re)
    if (m) caps.push({ value: parseFloat(m[1]), unit, type })
  }
  return caps.length > 0 ? caps : null
}

// ── Rating Extraction ────────────────────────────────────────────
function extractRating(query) {
  const m = query.match(RATING_RE)
  if (m) return parseFloat(m[1])
  return null
}

// ── Model Detection ──────────────────────────────────────────────
function detectModel(query) {
  for (const re of MODEL_PATTERNS) {
    const m = query.match(re)
    if (m) return m[0].trim()
  }
  return null
}

// ── Levenshtein distance ──────────────────────────────────────────
// Computes character-level edit distance between two strings.
// Used by detectCategory fuzzy matching — same idea as SPELLING_MAP but
// automatic: no manual entries needed, works for any keyword typo.
function levenshtein(a, b) {
  if (a === b) return 0
  // Early exit: length difference alone exceeds any reasonable threshold
  if (Math.abs(a.length - b.length) > 4) return 99
  const la = a.length, lb = b.length
  let prev = Array.from({ length: lb + 1 }, (_, i) => i)
  for (let i = 1; i <= la; i++) {
    const curr = [i]
    for (let j = 1; j <= lb; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1])
    }
    prev = curr
  }
  return prev[lb]
}

// Precomputed keyword lists (built once at startup, not per-request):
//   _KW_SINGLE  → all single-word keys, sorted longest-first
//   _KW_SUBSTR  → single-word keys ≥6 chars (for substring check)
const _KW_SINGLE = Object.entries(KEYWORD_TO_CATEGORY)
  .filter(([kw]) => !kw.includes(' '))
  .sort((a, b) => b[0].length - a[0].length)
const _KW_SUBSTR = _KW_SINGLE.filter(([kw]) => kw.length >= 6)

// ── Category Detection (from query words) ────────────────────────
// Four-stage fallback so any user input eventually maps to a category:
//   1. Multi-word exact phrase check  (e.g. "washing machine")
//   2. Per-word exact lookup          (e.g. "headphones")
//   3. Substring check                (e.g. "washinmachine" → contains "machine")
//   4. Levenshtein edit-distance      (e.g. "laptopp" → "laptop", dist=1)
//
// Stage 4 is the same idea as the SPELLING_MAP but fully automatic — handles
// any typo of any known keyword without a manual entry.
function detectCategory(query) {
  const q = query.toLowerCase()

  // ── Stage 1: Multi-word phrase ────────────────────────────────
  const multiWord = [
    'air fryer', 'washing machine', 'air conditioner', 'running shoes',
    'gaming mouse', 'mechanical keyboard', 'robot vacuum', 'smart watch',
    'noise cancelling', 'true wireless',
  ]
  for (const kw of multiWord) {
    if (q.includes(kw)) return getCategory(kw) || getCategory(kw.split(' ')[0]) || null
  }

  // ── Stage 2: Exact word match ─────────────────────────────────
  for (const word of q.split(/\s+/)) {
    const cat = getCategory(word)
    if (cat) return cat
  }

  // ── Stage 3: Substring — handles compound-word typos ─────────
  // "washinmachine" → contains "machine" → appliances
  // "earphones"     → contains "earphone" → headphones
  // Longest keywords checked first to prefer specific over short matches.
  for (const word of q.split(/\s+/)) {
    if (word.length < 5) continue
    for (const [kw, cat] of _KW_SUBSTR) {
      if (word.includes(kw)) return cat
    }
  }

  // ── Stage 4: Edit-distance — handles arbitrary typos ─────────
  // Threshold scales with word length: ~1 allowed edit per 4 characters.
  //   5-7 chars  → max 1 edit  (conservative — short words are ambiguous)
  //   8-11 chars → max 2 edits
  //   12+ chars  → max 3 edits
  // Only single-word query tokens are checked here; multi-word already handled above.
  for (const word of q.split(/\s+/)) {
    const wl = word.length
    if (wl < 5) continue
    const maxDist = wl <= 7 ? 1 : wl <= 11 ? 2 : 3
    let bestCat = null, bestDist = maxDist + 1
    for (const [kw, cat] of _KW_SINGLE) {
      if (Math.abs(wl - kw.length) > maxDist) continue  // fast skip
      const dist = levenshtein(word, kw)
      if (dist < bestDist) { bestDist = dist; bestCat = cat }
    }
    if (bestCat) return bestCat
  }

  return null
}

/**
 * extractAttributes(rawQuery) → structured attributes
 *
 * Extracts all identifiable attributes from a raw search query:
 * brand, category, model, capacity, rating, price, and a clean query.
 *
 * @param {string} rawQuery - Raw user search query
 * @returns {{
 *   brand: string|null,
 *   category: string|null,
 *   model: string|null,
 *   capacity: Array|null,
 *   rating: number|null,
 *   price_min: number|null,
 *   price_max: number|null,
 *   features: string[],
 *   cleanQuery: string,
 *   originalQuery: string,
 *   correctedQuery: string,
 *   wasSpellingCorrected: boolean
 * }}
 */
function extractAttributes(rawQuery) {
  if (!rawQuery) return {
    brand: null, category: null, model: null, capacity: null,
    rating: null, price_min: null, price_max: null, features: [],
    cleanQuery: '', originalQuery: '', correctedQuery: '',
    wasSpellingCorrected: false,
  }

  const original = rawQuery.trim()

  // Step 1: Spelling correction
  const corrected = correctSpelling(original)
  const wasSpellingCorrected = corrected !== original.toLowerCase()

  // Step 2: Extract structured fields from corrected query
  const brand      = detectBrand(corrected)
  const category   = detectCategory(corrected)
  const model      = detectModel(corrected)
  const capacity   = extractCapacity(corrected)
  const rating     = extractRating(corrected)
  const { price_min, price_max } = extractPrice(corrected)

  // Step 3: Feature keywords
  const FEATURE_KEYWORDS = [
    '5g', '4g', 'wifi', 'bluetooth', 'nfc', 'waterproof',
    'gaming', 'camera', 'amoled', 'oled', 'lcd', 'fast charging',
    'noise cancelling', 'noise canceling', 'anc',
    'wireless', 'wired', 'true wireless', 'foldable', 'touchscreen',
  ]
  const qLow = corrected.toLowerCase()
  const features = FEATURE_KEYWORDS.filter(f => qLow.includes(f))

  // Step 4: Build clean query (strip stopwords, prices, normalize)
  let clean = corrected
  for (const p of PRICE_PATTERNS) clean = clean.replace(p, ' ')
  clean = clean.replace(/[^a-z0-9\s-]/g, ' ')
  let words = clean.split(/\s+/).filter(w => w.length > 0)
  words = words.filter(w => !STOP_WORDS.has(w))
  words = words.map(w => SYNONYMS[w] || w)
  const cleanQuery = [...new Set(words)].join(' ').trim()

  return {
    brand:       brand || null,
    category:    category || null,
    model:       model || null,
    capacity,
    rating,
    price_min,
    price_max,
    features,
    cleanQuery,
    originalQuery: original,
    correctedQuery: corrected,
    wasSpellingCorrected,
  }
}

/**
 * Normalize a search query for cache key matching.
 * Backward-compatible — returns a sorted, cleaned string for Redis keys.
 *
 * @param {string} query - Raw user search query
 * @returns {string}     - Normalized query (lowercase, sorted, cleaned)
 */
function normalize(query) {
  if (!query) return ''
  const corrected = correctSpelling(query.toLowerCase().trim())
  let q = corrected

  for (const pattern of PRICE_PATTERNS) q = q.replace(pattern, ' ')
  q = q.replace(/[^a-z0-9\s]/g, ' ')

  let words = q.split(/\s+/).filter(w => w.length > 0)
  words = words.filter(w => !STOP_WORDS.has(w))
  words = words.map(w => SYNONYMS[w] || w)
  words = [...new Set(words)]
  words.sort()

  return words.join(' ')
}

// Alias for backward compat (searchController imports normalizeQuery)
const normalizeQuery = normalize

/**
 * Build a Redis cache key from a query and category.
 */
function buildSearchKey(query, category) {
  const nq = normalize(query)
  const nc = (category || '').toLowerCase().trim()
  return `bestpickr:search:${nq}:${nc}`
}

/**
 * Build a Redis key for a pre-loaded category.
 */
function buildCategoryKey(categorySlug) {
  return `bestpickr:category:${categorySlug.toLowerCase().trim()}`
}

module.exports = {
  normalize,
  normalizeQuery,
  extractAttributes,
  buildSearchKey,
  buildCategoryKey,
  correctSpelling,
}
