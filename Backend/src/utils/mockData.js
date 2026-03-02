// src/utils/mockData.js — Mock product fallback from mock_products.json
// Used when all platform APIs fail AND caches are empty.
// Ensures users always see results while testing or when APIs are down.
'use strict'

const path   = require('path')
const logger = require('./logger')

let mockDb = null

function loadMockData() {
  if (mockDb) return mockDb
  try {
    mockDb = require(path.join(__dirname, '../../mock_products.json'))
    logger.info(`[MockData] Loaded ${mockDb.categories?.length || 0} categories from mock_products.json`)
  } catch (err) {
    logger.warn(`[MockData] Could not load mock_products.json: ${err.message}`)
    mockDb = { categories: [] }
  }
  return mockDb
}

// Category keyword mapping (mirrors rankingAgent's CATEGORY_KEYWORDS)
const QUERY_TO_SLUG = {
  headphones:  ['headphone', 'headphones', 'earphone', 'earphones', 'earbuds', 'earbud', 'headset', 'tws', 'neckband', 'airpods', 'audio', 'speaker'],
  smartphones: ['phone', 'phones', 'mobile', 'smartphone', 'smartphones', 'iphone', 'android', 'samsung galaxy', 'oneplus', 'pixel', 'redmi', 'realme', 'vivo', 'oppo'],
  laptops:     ['laptop', 'laptops', 'macbook', 'notebook', 'chromebook', 'ultrabook'],
  appliances:  ['appliance', 'appliances', 'mixer', 'grinder', 'microwave', 'oven', 'toaster', 'blender', 'juicer', 'washing', 'fridge', 'refrigerator', 'ac ', 'air conditioner', 'iron', 'vacuum', 'purifier', 'geyser', 'heater', 'cooker', 'induction'],
  gaming:      ['gaming', 'game', 'gamer', 'controller', 'gamepad', 'console', 'playstation', 'xbox', 'ps5', 'ps4', 'nintendo', 'keyboard', 'mouse', 'monitor', 'mousepad', 'rgb keyboard', 'rgb mouse', 'logitech', 'razer', 'corsair', 'steelseries', 'hyperx'],
  footwear:    ['footwear', 'shoe', 'shoes', 'sneaker', 'sneakers', 'sandal', 'slipper', 'boot', 'boots', 'running shoe', 'trainer', 'trainers', 'clogs', 'loafer', 'nike', 'adidas', 'puma', 'reebok', 'skechers', 'crocs'],
  skincare:    ['skincare', 'skin care', 'beauty', 'cosmetic', 'serum', 'sunscreen', 'moisturizer', 'moisturiser', 'cleanser', 'face wash', 'facewash', 'toner', 'spf', 'mamaearth', 'ordinary', 'minimalist'],
  fashion:     ['fashion', 'clothing', 'clothes', 'apparel', 'wear', 'shirt', 'tshirt', 't-shirt', 'jeans', 'kurta', 'dress', 'jacket', 'hoodie', 'trouser', 'saree', 'lehenga', 'kurti', 'salwar'],
}

// ── Query stop words for relevance filtering
const QUERY_STOP = new Set([
  'best','top','good','great','cheap','affordable','latest','new','popular',
  'buy','online','india','price','deal','discount','budget','review','reviews',
  'under','below','the','a','an','for','in','and','or','vs',
])

// Synonym map for product term expansion
const MOCK_SYNONYM_MAP = {
  'machine':   ['machine','washer','washing machine'],
  'machines':  ['machine','washer','washing machine'],
  'washer':    ['washer','washing'],
  'washing':   ['washing','washer'],
  'purifier':  ['purifier','purification'],
  'fridge':    ['fridge','refrigerator'],
  'refrigerator': ['refrigerator','fridge'],
  'iron':      ['steam iron','garment','ironing'],
  'vacuum':    ['vacuum','robovac'],
  'fryer':     ['fryer','air fryer'],
  'airfryer':  ['airfryer','air fryer'],
  'cooker':    ['cooker','pressure cooker'],
}

/**
 * Filter a list of products (raw mock_products.json items) by query relevance.
 * Only applies when the query contains specific product keywords.
 * Safe: returns unfiltered if fewer than 2 products would remain.
 */
function queryFilterProducts(products, query) {
  const words = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !QUERY_STOP.has(w))
  if (words.length === 0) return products

  const terms = new Set()
  for (const word of words) {
    const syns = MOCK_SYNONYM_MAP[word]
    if (syns) syns.forEach(s => terms.add(s))
    else terms.add(word)
  }
  const termArr = Array.from(terms)

  const filtered = products.filter(p => {
    const text = (p.title || p.name || '').toLowerCase()
    return termArr.some(t => text.includes(t))
  })

  // Safety: never return fewer than 1 match
  return filtered.length >= 1 ? filtered : products
}

function detectSlug(query, category) {
  if (category) {
    const slug = category.toLowerCase().trim()
    const data = loadMockData()
    if (data.categories.some(c => c.slug === slug)) return slug
  }
  const q = query.toLowerCase()
  for (const [slug, keywords] of Object.entries(QUERY_TO_SLUG)) {
    if (keywords.some(kw => q.includes(kw))) return slug
  }
  return null
}

/**
 * Get mock products formatted as ranked results (same shape as rankingAgent output).
 * @param {string} query - User search query
 * @param {string} category - Category slug (optional)
 * @returns {Array} Ranked product results ready to return from the search API
 */
function getMockResults(query, category) {
  const data = loadMockData()
  const slug = detectSlug(query, category)

  if (!slug) {
    logger.info(`[MockData] No matching category for "${query}" — returning first category`)
  }

  if (!slug) {
    logger.info(`[MockData] No matching category for query="${query}" — returning empty (no cross-category fallback)`)
    return []
  }

  const cat = data.categories.find(c => c.slug === slug)

  if (!cat || !cat.products || cat.products.length === 0) {
    logger.info(`[MockData] Category "${slug}" has no products — returning empty`)
    return []
  }

  // Transform mock_products.json format → rankingAgent output format
  const filtered = queryFilterProducts(cat.products, query)
  const results = filtered
    .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))
    .slice(0, 10)
    .map((p, i) => {
      const amazonPrice   = p.amazon_price || null
      const flipkartPrice = p.flipkart_price || null
      const prices        = [amazonPrice, flipkartPrice].filter(Boolean)
      const lowestPrice   = prices.length ? Math.min(...prices) : null
      const highestPrice  = prices.length ? Math.max(...prices) : null

      const platforms = []
      if (flipkartPrice) {
        platforms.push({
          name:        'Flipkart',
          price:       flipkartPrice,
          rating:      p.rating || null,
          reviewCount: 0,
          url:         p.product_url || `https://www.flipkart.com/search?q=${encodeURIComponent(p.title)}`,
          inStock:     true,
        })
      }
      if (amazonPrice) {
        platforms.push({
          name:        'Amazon',
          price:       amazonPrice,
          rating:      p.rating || null,
          reviewCount: 0,
          url:         `https://www.amazon.in/dp/${p.asin}?tag=bestpickr-21`,
          inStock:     true,
        })
      }

      return {
        rank:         i + 1,
        name:         p.title,
        brand:        p.brand || null,
        category:     cat.slug,
        imageUrl:     p.image || null,
        aiScore:      p.aiScore ? Math.round(p.aiScore) / 10 : 7.0,
        breakdown:    { ratingScore: (p.rating || 4) * 2, sentimentScore: 7, valueScore: 7, volumeScore: 5, weights: { platformRating: 0.4, sentiment: 0.3, valueForMoney: 0.15, reviewVolume: 0.15 } },
        avgRating:    p.rating || 4.0,
        totalReviews: 0,
        positivePct:  p.rating >= 4.5 ? 88 : p.rating >= 4.0 ? 78 : 65,
        lowestPrice,
        highestPrice,
        platforms,
      }
    })

  logger.info(`[MockData] Returning ${results.length} mock products for "${query}" (category: ${cat.slug})`)
  return results
}

/**
 * Get mock products in Amazon PA-API format (same shape as amazonService.searchProducts()).
 * Used by search.js to feed mock products through the full enrichment pipeline
 * (GPT analysis + Cuelinks + MongoDB save) — identical to real Amazon flow.
 *
 * @param {string} query - User search query
 * @param {string} category - Category slug (optional)
 * @returns {Array} Products shaped like Amazon PA-API output
 */
function getMockProductsForSearch(query, category) {
  const data = loadMockData()
  const slug = detectSlug(query, category)

  if (!slug) {
    logger.info(`[MockData] No matching category for query="${query}" (PA-API shape) — returning empty`)
    return []
  }

  const cat = data.categories.find(c => c.slug === slug)

  if (!cat || !cat.products || cat.products.length === 0) {
    logger.info(`[MockData] Category "${slug}" has no products (PA-API shape) — returning empty`)
    return []
  }

  // Transform mock_products.json → Amazon PA-API normalizeAmazonItem() shape
  // NOTE: mock_products.json has Flipkart URLs in product_url.
  // We generate Amazon search URLs for the Amazon platform entry,
  // and pass the real Flipkart URL as _flipkartUrl for the Flipkart platform.
  const filteredProducts = queryFilterProducts(cat.products, query)
  const products = filteredProducts
    .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))
    .slice(0, 15) // match MAX_AMAZON_RESULTS in search.js
    .map(p => {
      const amazonSearchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(p.title)}&tag=bestpickr-21`
      return {
        platform:     'Amazon',
        platformId:   p.asin,
        asin:         p.asin,
        name:         p.title,
        title:        p.title,
        brand:        p.brand || null,
        category:     cat.slug,
        price:        p.amazon_price || null,
        currency:     'INR',
        rating:       p.rating || null,
        reviewCount:  0,
        imageUrl:     p.image || null,
        url:          amazonSearchUrl,
        affiliateUrl: amazonSearchUrl,
        inStock:      true,
        positivePct:  null,
        // Extra fields for mock tracking
        _mockSource:      true,
        _flipkartPrice:   p.flipkart_price || null,
        _flipkartUrl:     p.product_url || null,
        _mockAiScore:     p.aiScore ? Math.round(p.aiScore) / 10 : null,
      }
    })

  logger.info(`[MockData] Returning ${products.length} mock products (PA-API shape) for "${query}" (category: ${cat.slug})`)
  return products
}

// Category-specific aspect scores + insights for mock analysis
const CATEGORY_MOCK_ANALYSIS = {
  headphones: {
    aspects: { 'Sound Quality': 8.2, 'Noise Cancellation': 7.8, 'Comfort': 8.0, 'Battery Life': 8.5, 'Build Quality': 7.5, 'Bluetooth Connectivity': 8.0 },
    love: [
      'Deep bass and clear audio quality praised by ~75% of users',
      'Battery lasts through long commutes and work sessions',
      'Lightweight design makes them comfortable for extended use',
    ],
    complaints: [
      'Ear cushions can get warm during summer use',
      'Call quality through built-in mic could be better in noisy environments',
    ],
    buyRec: 'Perfect for commuters and remote workers who need reliable audio with long battery life. Great value in this price segment for the Indian market.',
    avoidIf: 'You primarily need headphones for making calls in noisy environments — the microphone picks up background noise.',
  },
  smartphones: {
    aspects: { 'Display Quality': 8.5, 'Camera Quality': 8.0, 'Battery Life': 7.8, 'Performance Speed': 8.2, 'Build Quality': 7.5, 'Software Experience': 7.0 },
    love: [
      'Vibrant AMOLED display praised by ~80% of users for media consumption',
      'Camera performs well in daylight, solid for social media photos',
      'Smooth performance for daily tasks and moderate gaming',
    ],
    complaints: [
      'Night mode camera quality could be better compared to flagships',
      'Software updates arrive slower than competing brands',
    ],
    buyRec: 'Ideal for users who want a solid all-rounder with good display and camera for social media. Great value for the price in India.',
    avoidIf: 'You need flagship-level night photography or guaranteed long-term software updates.',
  },
  laptops: {
    aspects: { 'Performance': 8.3, 'Display Quality': 8.0, 'Battery Life': 7.5, 'Build Quality': 8.2, 'Keyboard': 7.8, 'Value for Money': 7.5 },
    love: [
      'Fast boot times and smooth multitasking praised by ~70% of users',
      'Display quality excellent for both work and content consumption',
      'Solid build quality feels premium at this price point',
    ],
    complaints: [
      'Fan noise noticeable under heavy workloads',
      'Limited port selection may require a USB hub for some users',
    ],
    buyRec: 'Great choice for students and professionals who need a reliable daily driver for productivity and light creative work.',
    avoidIf: 'You need a laptop for heavy video editing or 3D rendering — consider a workstation instead.',
  },
  appliances: {
    aspects: { 'Performance': 8.0, 'Build Quality': 7.5, 'Ease of Use': 8.3, 'Energy Efficiency': 7.8, 'Noise Level': 7.0, 'Value for Money': 8.0 },
    love: [
      'Easy to set up and use right out of the box',
      'Energy efficient — users report lower electricity bills',
      'Solid performance for daily household tasks',
    ],
    complaints: [
      'Can be noisy during operation at higher settings',
      'Replacement parts can be hard to find in smaller cities',
    ],
    buyRec: 'Reliable household appliance that does its job well. Good choice for Indian homes looking for energy-efficient options.',
    avoidIf: 'You live in a small apartment where noise could be an issue — check the decibel rating.',
  },
  gaming: {
    aspects: { 'Performance': 8.5, 'Build Quality': 8.0, 'Responsiveness': 8.3, 'Comfort': 7.5, 'RGB/Design': 7.8, 'Value for Money': 7.5 },
    love: [
      'Excellent responsiveness praised by competitive gamers',
      'Build quality feels durable and premium',
      'RGB lighting adds a nice aesthetic to the setup',
    ],
    complaints: [
      'Software for customization can be buggy on first setup',
      'Price is slightly higher than competing brands with similar specs',
    ],
    buyRec: 'Ideal for competitive and casual gamers who want reliable, responsive gear. Solid choice for Indian gaming setups.',
    avoidIf: 'You are on a tight budget — there are cheaper alternatives that perform similarly for casual gaming.',
  },
  footwear: {
    aspects: { 'Comfort': 8.5, 'Durability': 7.5, 'Design': 8.0, 'Cushioning': 8.2, 'Breathability': 7.8, 'Value for Money': 7.5 },
    love: [
      'Extremely comfortable for all-day wear, praised by ~80% of buyers',
      'Cushioning provides excellent support during walks and runs',
      'Modern design that works with both casual and sporty outfits',
    ],
    complaints: [
      'Sizing runs slightly small — users recommend ordering half size up',
      'Sole durability on rough Indian roads could be better',
    ],
    buyRec: 'Great everyday footwear for people who walk or stand a lot. The comfort-to-price ratio is excellent for Indian buyers.',
    avoidIf: 'You need shoes specifically for trail running or rough terrain — these are best for roads and treadmills.',
  },
  skincare: {
    aspects: { 'Skin Improvement': 8.0, 'Texture & Feel': 8.3, 'Ingredients': 7.8, 'Packaging': 7.5, 'Fragrance': 7.0, 'Value for Money': 8.0 },
    love: [
      'Visible improvement in skin texture within 2-3 weeks for ~65% of users',
      'Lightweight formula absorbs quickly without feeling greasy',
      'Works well in Indian humid climate without clogging pores',
    ],
    complaints: [
      'Fragrance might not suit those with very sensitive skin',
      'Results vary significantly based on skin type',
    ],
    buyRec: 'Good choice for those starting a skincare routine or looking for an affordable yet effective product. Works well for Indian skin types and climate.',
    avoidIf: 'You have extremely sensitive or acne-prone skin — patch test first as the fragrance ingredients may cause irritation.',
  },
  fashion: {
    aspects: { 'Fabric Quality': 7.8, 'Fit': 7.5, 'Design': 8.0, 'Comfort': 8.0, 'Durability': 7.0, 'Value for Money': 7.5 },
    love: [
      'Comfortable fabric that breathes well in Indian summers',
      'Trendy design that looks great for both casual and semi-formal occasions',
      'Color stays vibrant even after multiple washes',
    ],
    complaints: [
      'Sizing chart can be inconsistent — check measurements carefully',
      'Stitching quality at seams could be more durable',
    ],
    buyRec: 'Solid everyday wear with good comfort and style. Suitable for Indian weather conditions and versatile enough for multiple occasions.',
    avoidIf: 'You need formal or premium-quality garments — this is better suited for casual everyday use.',
  },
}

/**
 * Build a mock analysis result that matches the shape of runAnalysisPipeline() output.
 * Skips review scraping + GPT entirely — saves ScraperAPI credits and OpenAI costs.
 * Used for mock products (non-real ASINs) during testing.
 *
 * @param {Object} mockProduct - Product from getMockProductsForSearch() with _mockSource: true
 * @returns {Object} Analysis result matching analysisPipeline output shape
 */
function buildMockAnalysis(mockProduct) {
  const category = mockProduct.category || 'headphones'
  const rating = mockProduct.rating || 4.0
  const rawAiScore = mockProduct._mockAiScore || 7.0

  // Get category-specific mock data (fallback to headphones)
  const catData = CATEGORY_MOCK_ANALYSIS[category] || CATEGORY_MOCK_ANALYSIS.headphones

  // Scale aspect scores based on the product's rating (higher rated = higher scores)
  const ratingFactor = rating / 4.5 // normalize around 4.5 star baseline
  const aspectScores = {}
  for (const [aspect, baseScore] of Object.entries(catData.aspects)) {
    // Scale ±1.5 around base, clamped to 0-10
    const scaled = baseScore * ratingFactor
    aspectScores[aspect] = Math.round(Math.max(1, Math.min(10, scaled)) * 10) / 10
  }

  // Sentiment distribution based on rating
  const positive = Math.round(Math.min(95, rating * 18))
  const negative = Math.round(Math.max(2, (5 - rating) * 12))
  const neutral = Math.max(3, 100 - positive - negative)

  return {
    aiScore: rawAiScore,
    aspectScores,
    positivePct: positive,
    overallSentiment: { positive, neutral, negative },
    whatPeopleLove: catData.love,
    commonComplaints: catData.complaints,
    redFlags: [],
    buyRecommendation: catData.buyRec,
    avoidIf: catData.avoidIf,
    breakdown: {
      ratingScore: +(rating * 2).toFixed(1),
      sentimentScore: +(positive / 10).toFixed(1),
      valueScore: +(rawAiScore * 0.85).toFixed(1),
      volumeScore: 5,
    },
    confidenceLevel: 'medium',
    reviewQualitySummary: `Analysis based on curated product data for ${mockProduct.brand || 'this brand'}. Full AI review analysis will be available when Amazon PA-API credentials are configured.`,
    authenticityBadge: 'medium',
    authenticityFlags: [],
    reviewsAnalyzed: 0,
    analysisDate: new Date(),
    _pipelineMeta: {
      source: 'mock-analysis',
      fresh: true,
      elapsed: 0,
    },
  }
}

module.exports = { getMockResults, getMockProductsForSearch, buildMockAnalysis }
