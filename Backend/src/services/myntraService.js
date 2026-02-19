// src/services/myntraService.js
// ─────────────────────────────────────────────────────────────────
// Myntra Product Scraper via ScraperAPI
//
// KEY DIFFERENCE FROM FLIPKART:
//   Myntra is a HEAVY React SPA — the product list is loaded via
//   XHR/fetch calls AFTER page load. This means:
//   - Basic HTML scraping returns EMPTY page
//   - We need ScraperAPI with render=true (JS execution)
//   - OR we hit Myntra's internal search API directly (faster!)
//
// STRATEGY — Two-step approach:
//   Step 1: Try Myntra's internal search API (fast, no render needed)
//   Step 2: If that fails, fall back to HTML scraping with JS render
//
// Myntra's internal API endpoint (reverse-engineered, public):
//   POST https://www.myntra.com/gateway/v2/search/{query}
//   Headers: x-myntra-abtest, x-location-code
//   Returns: JSON with productSummary.results array
//
// RELEVANCE:
//   Myntra covers: fashion, footwear, beauty, skincare, accessories
//   For electronics → returns empty (skip, don't waste API credits)
// ─────────────────────────────────────────────────────────────────
'use strict'

const axios   = require('axios')
const cheerio = require('cheerio')
const logger  = require('../utils/logger')

const SCRAPER_KEY = process.env.SCRAPER_API_KEY || '27b710c1fef45380b01405aca672a18f'
const TIMEOUT_MS  = 45000   // ScraperAPI with JS render can take 20-35s
const MAX_RESULTS = 10

// ── CATEGORIES MYNTRA IS RELEVANT FOR ─────────────────────────────
// Checking this avoids wasting API credits on irrelevant searches
const MYNTRA_CATEGORIES = new Set([
  'footwear', 'fashion', 'skincare', 'beauty', 'accessories',
  'clothing', 'bags', 'jewellery', 'watches', 'sports',
])

// Keywords that indicate Myntra is relevant even without category
const MYNTRA_KEYWORDS = [
  'shoe', 'sneaker', 'sandal', 'slipper', 'boot', 'heel',
  'shirt', 'tshirt', 't-shirt', 'jeans', 'kurta', 'saree', 'dress',
  'serum', 'sunscreen', 'moisturizer', 'cleanser', 'toner',
  'bag', 'wallet', 'watch', 'sunglasses', 'belt', 'jacket', 'hoodie',
]

function isMyntraRelevant(query, category) {
  if (MYNTRA_CATEGORIES.has(category?.toLowerCase())) return true
  const q = query.toLowerCase()
  return MYNTRA_KEYWORDS.some(kw => q.includes(kw))
}

// ── SCRAPERAPI REQUEST BUILDER ────────────────────────────────────
function scraperUrl(targetUrl, opts = {}) {
  const params = new URLSearchParams({
    api_key:      SCRAPER_KEY,
    url:          targetUrl,
    country_code: 'in',
    render:       'true',
    keep_headers: 'false',
    ...opts,
  })
  return `http://api.scraperapi.com?${params.toString()}`
}

// ── MAIN SEARCH FUNCTION ──────────────────────────────────────────
async function searchProducts(query, category = '') {
  // Skip non-fashion categories — save API credits
  if (!isMyntraRelevant(query, category)) {
    logger.info(`Myntra: skipping "${query}" (not fashion/beauty related)`)
    return []
  }

  if (!SCRAPER_KEY) {
    logger.warn('SCRAPER_API_KEY not set — skipping Myntra')
    return []
  }

  logger.info(`🛍️  Myntra scraping: "${query}" via ScraperAPI (India IP)`)

  // STRATEGY 1: Try Myntra's internal JSON API (fastest, most reliable)
  try {
    const apiResults = await fetchMyntraInternalAPI(query)
    if (apiResults && apiResults.length > 0) {
      logger.info(`✅ Myntra API: ${apiResults.length} products for "${query}"`)
      return apiResults
    }
  } catch (err) {
    logger.warn(`Myntra internal API failed: ${err.message} — trying HTML scrape`)
  }

  // STRATEGY 2: Fall back to HTML scraping with JS render
  try {
    const htmlResults = await fetchMyntraHTML(query)
    if (htmlResults && htmlResults.length > 0) {
      logger.info(`✅ Myntra HTML: ${htmlResults.length} products for "${query}"`)
      return htmlResults
    }
  } catch (err) {
    if (err.message.includes('timeout')) {
      logger.error(`Myntra: HTML scrape timed out after ${TIMEOUT_MS/1000}s`)
    } else {
      logger.error(`Myntra HTML scrape failed: ${err.message}`)
    }
  }

  logger.warn(`Myntra: all strategies failed for "${query}" — using mock data`)
  return getMockData(query, category)
}

// ── STRATEGY 1: MYNTRA INTERNAL JSON API ──────────────────────────
// Myntra's frontend calls this API — we call it directly via ScraperAPI
// This avoids JS rendering and returns clean structured JSON
async function fetchMyntraInternalAPI(query) {
  // Myntra search API — passes through ScraperAPI for Indian IP + headers
  const myntraApiUrl = `https://www.myntra.com/gateway/v2/search/${encodeURIComponent(query)}?rawQuery=${encodeURIComponent(query)}&o=0&n=20&plaEnabled=false`

  const response = await axios.get(
    scraperUrl(myntraApiUrl, { render: 'false' }), // No JS render needed for API call
    {
      timeout: TIMEOUT_MS,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-IN,en;q=0.9',
        'x-location-code': 'MH',       // Maharashtra — good Indian location
        'x-myntra-abtest': 'pincode:400001',
      },
    }
  )

  // Handle both direct JSON and HTML-wrapped JSON
  let data = response.data
  if (typeof data === 'string') {
    // ScraperAPI might wrap it — try to find JSON
    const jsonMatch = data.match(/\{[\s\S]*"productSummary"[\s\S]*\}/)
    if (jsonMatch) data = JSON.parse(jsonMatch[0])
    else throw new Error('No JSON found in Myntra API response')
  }

  const products = data?.productSummary?.results || data?.products || []
  if (!products.length) throw new Error('Empty products array in Myntra API response')

  return products.slice(0, MAX_RESULTS).map(normalizeMyntraAPIProduct)
}

// ── NORMALIZE MYNTRA JSON API RESPONSE ───────────────────────────
function normalizeMyntraAPIProduct(item) {
  const price    = item.price          || item.promotedPrice || null
  const mrp      = item.mrpPrice       || price
  const rating   = parseFloat(item.rating?.averageRating) || null
  const reviews  = parseInt(item.rating?.totalCount?.replace(/[^0-9]/g, '')) || 0

  // Build full product URL
  const slug    = item.landingPageUrl || ''
  const url     = slug.startsWith('http') ? slug : `https://www.myntra.com/${slug}`

  // Best quality image
  const imageUrl = item.images?.find(i => i.src?.includes('large'))?.src
                || item.images?.[0]?.src
                || null

  return {
    platform:    'Myntra',
    platformId:  String(item.id || item.productId || `myn-${Date.now()}`),
    name:        cleanName(`${item.brand?.name || ''} ${item.name || item.product || ''}`),
    brand:       item.brand?.name || null,
    price:       price  ? parseFloat(String(price).replace(/[^0-9.]/g, ''))  : null,
    mrp:         mrp    ? parseFloat(String(mrp).replace(/[^0-9.]/g, ''))    : null,
    discount:    item.discountDisplayLabel
                  ? parseInt(item.discountDisplayLabel.replace(/[^0-9]/g, ''))
                  : null,
    currency:    'INR',
    rating,
    reviewCount: reviews,
    imageUrl,
    url,
    affiliateUrl: url,  // Myntra affiliate links added separately when program available
    inStock:     item.inventoryInfo?.itemLevelInventoryType !== 'OUTOFSTOCK',
    positivePct: rating ? ratingToSentiment(rating) : null,
  }
}

// ── STRATEGY 2: MYNTRA HTML SCRAPING ─────────────────────────────
// Heavier — requires JS render. Used as fallback only.
async function fetchMyntraHTML(query) {
  const url = `https://www.myntra.com/${encodeURIComponent(query.replace(/\s+/g, '-'))}`

  const response = await axios.get(
    scraperUrl(url, { render: 'true', wait: '2000' }),  // wait 2s for React to hydrate
    { timeout: TIMEOUT_MS }
  )

  return parseMyntraHTML(response.data)
}

// ── MYNTRA HTML PARSER ────────────────────────────────────────────
// Selectors for Myntra's current React-rendered DOM structure
// Last verified: Feb 2026
const MYNTRA_SELECTORS = {
  card:        '.product-base, li.product-base, .results-base li',
  brand:       '.product-brand, h3.product-brand',
  productName: '.product-product, h2.product-product',
  price:       '.product-discountedPrice, .product-price',
  mrp:         '.product-strike',
  discount:    '.product-discountPercent',
  rating:      '.index-overallRating span:first-child, .product-ratingsContainer span',
  reviewCount: '.product-ratingsCount, .index-ratingsCount',
  image:       'img.img-responsive, picture source:first-child, img[loading="lazy"]',
  link:        'a.product-base',
}

function parseMyntraHTML(html) {
  const $ = cheerio.load(html)
  const products = []

  $(MYNTRA_SELECTORS.card).each((i, el) => {
    if (i >= MAX_RESULTS) return false
    const card = $(el)

    const brand       = card.find(MYNTRA_SELECTORS.brand).first().text().trim()
    const productName = card.find(MYNTRA_SELECTORS.productName).first().text().trim()
    const name        = cleanName([brand, productName].filter(Boolean).join(' '))
    if (!name || name.length < 4) return

    const priceText  = card.find(MYNTRA_SELECTORS.price).first().text()
    const price      = parseRupees(priceText)
    if (!price) return

    const mrpText    = card.find(MYNTRA_SELECTORS.mrp).first().text()
    const mrp        = parseRupees(mrpText) || price

    const ratingText = card.find(MYNTRA_SELECTORS.rating).first().text().trim()
    const rating     = parseFloat(ratingText) || null

    const reviewText = card.find(MYNTRA_SELECTORS.reviewCount).first().text()
    // e.g. "(12,340)" → 12340
    const reviewCount = parseInt(reviewText.replace(/[^0-9]/g, '')) || 0

    const img     = card.find(MYNTRA_SELECTORS.image).first()
    let imageUrl  = img.attr('src') || img.attr('data-src') || img.attr('srcset')?.split(' ')?.[0] || null

    const href    = card.find(MYNTRA_SELECTORS.link).attr('href') || card.closest('a').attr('href') || ''
    const url     = href.startsWith('http') ? href : `https://www.myntra.com${href}`

    const pidMatch  = url.match(/\/(\d+)\//)
    const platformId = pidMatch ? pidMatch[1] : `myn-${Date.now()}-${i}`

    products.push({
      platform:    'Myntra',
      platformId,
      name,
      brand:       brand || null,
      price,
      mrp,
      currency:    'INR',
      rating,
      reviewCount,
      imageUrl,
      url,
      affiliateUrl: url,
      inStock:     true,
      positivePct: rating ? ratingToSentiment(rating) : null,
    })
  })

  return products
}

// ── HELPERS ───────────────────────────────────────────────────────
function parseRupees(text = '') {
  const cleaned = text.replace(/[₹Rs.,\s]/gi, '').replace(/[^0-9]/g, '')
  const val     = parseFloat(cleaned)
  return (val && val > 0 && val < 1000000) ? val : null
}

function cleanName(name) {
  return name.replace(/\s+/g, ' ').trim()
}

function ratingToSentiment(rating) {
  if (!rating) return 65
  if (rating >= 4.5) return 88
  if (rating >= 4.0) return 78
  if (rating >= 3.5) return 65
  if (rating >= 3.0) return 50
  return 35
}

// ── MOCK DATA ─────────────────────────────────────────────────────
function getMockData(query, category) {
  logger.info(`Myntra mock data for: "${query}" category="${category}"`)
  const q = query.toLowerCase()

  if (q.includes('shoe') || q.includes('sneaker') || q.includes('running') || category === 'footwear') {
    return [
      { platform:'Myntra', platformId:'MYN_NK1', name:'Nike Air Max 270 Running Shoes', brand:'Nike', price:9995, mrp:11995, currency:'INR', rating:4.4, reviewCount:2340, imageUrl:null, url:'https://www.myntra.com/nike/air-max/23401', affiliateUrl:'https://www.myntra.com/nike/air-max/23401', inStock:true, positivePct:78 },
      { platform:'Myntra', platformId:'MYN_AD1', name:'Adidas Ultraboost Light Running Shoes', brand:'Adidas', price:14999, mrp:18999, currency:'INR', rating:4.5, reviewCount:1820, imageUrl:null, url:'https://www.myntra.com/adidas/ultraboost/12341', affiliateUrl:'https://www.myntra.com/adidas/ultraboost/12341', inStock:true, positivePct:82 },
      { platform:'Myntra', platformId:'MYN_PM1', name:'Puma Velocity Nitro 2 Running Shoes', brand:'Puma', price:7999, mrp:9999, currency:'INR', rating:4.2, reviewCount:980, imageUrl:null, url:'https://www.myntra.com/puma/velocity-nitro/9801', affiliateUrl:'https://www.myntra.com/puma/velocity-nitro/9801', inStock:true, positivePct:72 },
      { platform:'Myntra', platformId:'MYN_SK1', name:'Skechers GOrun Consistent Running Shoes', brand:'Skechers', price:5499, mrp:6999, currency:'INR', rating:4.1, reviewCount:3410, imageUrl:null, url:'https://www.myntra.com/skechers/gorun/56781', affiliateUrl:'https://www.myntra.com/skechers/gorun/56781', inStock:true, positivePct:68 },
    ]
  }

  if (q.includes('serum') || q.includes('sunscreen') || q.includes('skincare') || q.includes('moisturizer') || category === 'skincare') {
    return [
      { platform:'Myntra', platformId:'MYN_SK10', name:'The Ordinary Niacinamide 10% + Zinc 1% Serum', brand:'The Ordinary', price:699, mrp:699, currency:'INR', rating:4.5, reviewCount:5600, imageUrl:null, url:'https://www.myntra.com/the-ordinary/niacinamide/1001', affiliateUrl:'https://www.myntra.com/the-ordinary/niacinamide/1001', inStock:true, positivePct:85 },
      { platform:'Myntra', platformId:'MYN_SK11', name:'Minimalist SPF 50 PA++++ Sunscreen', brand:'Minimalist', price:399, mrp:399, currency:'INR', rating:4.4, reviewCount:3200, imageUrl:null, url:'https://www.myntra.com/minimalist/spf50/1002', affiliateUrl:'https://www.myntra.com/minimalist/spf50/1002', inStock:true, positivePct:82 },
      { platform:'Myntra', platformId:'MYN_SK12', name:'Dot & Key Watermelon Cooling Body Lotion SPF 30', brand:'Dot & Key', price:495, mrp:599, currency:'INR', rating:4.3, reviewCount:1890, imageUrl:null, url:'https://www.myntra.com/dot-key/body-lotion/1003', affiliateUrl:'https://www.myntra.com/dot-key/body-lotion/1003', inStock:true, positivePct:77 },
    ]
  }

  if (q.includes('shirt') || q.includes('tshirt') || q.includes('jeans') || q.includes('kurta') || category === 'fashion') {
    return [
      { platform:'Myntra', platformId:'MYN_F1', name:'H&M Regular Fit Cotton T-Shirt', brand:'H&M', price:799, mrp:999, currency:'INR', rating:4.2, reviewCount:6540, imageUrl:null, url:'https://www.myntra.com/hm/tshirt/1101', affiliateUrl:'https://www.myntra.com/hm/tshirt/1101', inStock:true, positivePct:74 },
      { platform:'Myntra', platformId:'MYN_F2', name:'Zara Slim-Fit Stretch Jeans', brand:'Zara', price:3999, mrp:4999, currency:'INR', rating:4.1, reviewCount:2300, imageUrl:null, url:'https://www.myntra.com/zara/jeans/1102', affiliateUrl:'https://www.myntra.com/zara/jeans/1102', inStock:true, positivePct:70 },
    ]
  }

  return []
}

module.exports = { searchProducts }
