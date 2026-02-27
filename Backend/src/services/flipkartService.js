// src/services/flipkartService.js
// ─────────────────────────────────────────────────────────────────
// Flipkart Product Scraper via ScraperAPI
// ScraperAPI handles: rotating proxies, CAPTCHAs, JS rendering,
//                     India geotargeting (country_code=in)
//
// SCRAPER API KEY: stored in SCRAPER_API_KEY env var
// DOCS: https://www.scraperapi.com/documentation/
//
// DATA FLOW:
//   1. Build Flipkart search URL for the query
//   2. Send it through ScraperAPI (Indian IP, JS rendered)
//   3. Parse HTML with cheerio (like jQuery for Node)
//   4. Extract product name, price, rating, reviews, image, URL
//   5. Normalize to bestpickr format
//   6. Return top 10 results
// ─────────────────────────────────────────────────────────────────
'use strict'

const axios   = require('axios')
const cheerio = require('cheerio')
const logger  = require('../utils/logger')

const SCRAPER_KEY = process.env.SCRAPER_API_KEY || '27b710c1fef45380b01405aca672a18f'
const TIMEOUT_MS  = 45000   // ScraperAPI with JS render can take 20-35s
const MAX_RESULTS = 10

// ── SCRAPERAPI REQUEST BUILDER ────────────────────────────────────
// country_code=in → Indian residential IP (critical for INR prices)
// render=true     → Executes JavaScript (Flipkart is React-rendered)
// premium=true    → Uses premium proxies — higher success rate on Flipkart
function scraperUrl(targetUrl, opts = {}) {
  const params = new URLSearchParams({
    api_key:      SCRAPER_KEY,
    url:          targetUrl,
    country_code: 'in',          // ← India IP — gets INR prices
    render:       'true',        // ← JS rendering for React pages
    keep_headers: 'false',
    ...opts,
  })
  return `http://api.scraperapi.com?${params.toString()}`
}

// ── SEARCH URL BUILDER ─────────────────────────────────────────────
// Flipkart sort options:
//   popularity  → Most bought (best for our ranking — mirrors real user choice)
//   recency     → Newest first
//   price_asc   → Cheapest first
function buildFlipkartUrl(query, sortBy = 'popularity') {
  return `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&sort=${sortBy}&p%5B%5D=facets.brand%255B%255D%3D`
}

// ── MAIN SEARCH FUNCTION ──────────────────────────────────────────
async function searchProducts(query, category = '') {
  if (!SCRAPER_KEY) {
    logger.warn('SCRAPER_API_KEY not set — skipping Flipkart')
    return []
  }

  const url = buildFlipkartUrl(query)
  logger.info(`🔵 Flipkart scraping: "${query}" via ScraperAPI (India IP)`)

  try {
    const response = await axios.get(scraperUrl(url), {
      timeout: TIMEOUT_MS,
      headers: {
        'Accept-Language': 'en-IN,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })

    const results = parseFlipkartHTML(response.data, query)

    if (results.length === 0) {
      logger.warn(`Flipkart: 0 products parsed for "${query}" — selectors may be outdated`)
      return []
    }

    logger.info(`✅ Flipkart: ${results.length} products found for "${query}"`)
    return results

  } catch (err) {
    const status = err.response?.status
    const msg    = err.message

    if (status === 403)              logger.error('Flipkart: 403 — site blocking ScraperAPI (try premium=true)')
    else if (status === 429)         logger.error('Flipkart: 429 — rate limited, slow down requests')
    else if (msg.includes('timeout'))logger.error(`Flipkart: timed out after ${TIMEOUT_MS/1000}s — ScraperAPI slow`)
    else                             logger.error(`Flipkart scrape error: ${msg}`)

    // Return empty — the ranking agent's 3-tier cache (Tier 2 category cache)
    // will serve preloaded data if available
    return []
  }
}

// ── HTML PARSER ──────────────────────────────────────────────────
// Flipkart's current (2025-26) HTML class structure.
// They change classes periodically — update selectors if 0 results returned.
//
// HOW TO UPDATE SELECTORS:
//   1. Open flipkart.com/search?q=sony+headphones in Chrome
//   2. Right-click a product card → Inspect
//   3. Find the repeating container div and update SELECTORS.card
//   4. Find each data element and update accordingly
//
// CURRENT SELECTORS (updated Feb 2026 — Flipkart refreshes classes ~quarterly):
// To re-derive: open flipkart.com/search?q=headphones in Chrome DevTools,
// inspect a product card, note the repeating container class and child classes.
const SELECTORS = {
  // Product card container — ranked by reliability; [data-id] is the most stable
  card:       'div[data-id], ._75nlfW, ._1AtVbE, ._2kHMtA, ._13oc-S',
  // Product name — .KzDlHZ is the current primary class (2025/26), others are fallbacks
  name:       '.KzDlHZ, ._4rR01T, .s1Q9rs, .IRpwTa, a.wjcEIp',
  // Brand element (often omitted; brand is usually the first word of name)
  brand:      '.hCKiLj, .syl9yP, ._2WkVRV',
  // Sale/current price — .Nx9bqj is current (2025/26), ._30jeq3 is the 2024 fallback
  price:      '.Nx9bqj, ._30jeq3, ._25b18h .Nx9bqj',
  // Struck-through MRP
  mrp:        '.yRaY8j, ._3I9_wc, ._3tbKJL',
  // Discount percentage badge
  discount:   '.UkUFwK, ._3Ay6Sb',
  // Star rating number — .XQDdHH is current, ._3LWZlK is 2024 fallback
  rating:     '.XQDdHH, ._3LWZlK, ._1lRcqv .XQDdHH',
  // Ratings/reviews count (e.g. "1,240 Ratings & 340 Reviews")
  reviewCount:'.Wphh3N, ._2_R_DZ span, ._2y7Z71',
  // Product thumbnail image
  image:      '.DByuf4, img.DByuf4, ._396cs4, img._2r_T1I',
  // Product page anchor — CGtC98 is current (2025/26), others are fallbacks
  link:       'a.CGtC98, a.WKTcLC, a._1fQZEK, a._2UzuFa, a[href*="/p/"]',
}

function parseFlipkartHTML(html, query) {
  const $ = cheerio.load(html)
  const products = []

  // Try to find product cards — Flipkart uses various grid layouts
  let cards = $(SELECTORS.card)

  // Fallback 1: any anchor with a Flipkart product path, walk up one level
  if (cards.length < 3) {
    cards = $('a[href*="/p/"]').closest('div[class]').parent()
  }

  // Fallback 2: any div that contains both a price and a product link
  if (cards.length < 3) {
    cards = $('div').filter((_, el) => {
      const div = $(el)
      return div.find('a[href*="/p/"]').length > 0 &&
             div.find('*').filter((_, n) => /[₹]/.test($(n).text())).length > 0
    })
  }

  cards.each((i, el) => {
    if (i >= MAX_RESULTS) return false

    const card = $(el)

    // ── Extract each field ────────────────────────────────────────

    // Name: try multiple selectors
    let name = card.find(SELECTORS.name).first().text().trim()
    if (!name) name = card.find('a[title]').attr('title') || ''
    if (!name || name.length < 4) return // skip non-product cards

    // Price: remove ₹, commas, spaces → parse as number
    const priceText = card.find(SELECTORS.price).first().text()
    const price = parseRupees(priceText)
    if (!price) return // skip cards with no price (ads, banners)

    // MRP for "you save" calculation
    const mrpText = card.find(SELECTORS.mrp).first().text()
    const mrp     = parseRupees(mrpText) || price

    // Discount %
    const discountText = card.find(SELECTORS.discount).first().text()
    const discount     = parseInt(discountText.replace(/[^0-9]/g, '')) || 0

    // Rating (e.g. "4.3")
    const ratingText = card.find(SELECTORS.rating).first().text().trim()
    const rating     = parseFloat(ratingText) || null

    // Review count (e.g. "1,240 Ratings & 340 Reviews" → 1240)
    const reviewText  = card.find(SELECTORS.reviewCount).first().text()
    const reviewCount = parseReviewCount(reviewText)

    // Image URL
    const img = card.find(SELECTORS.image).first()
    let imageUrl = img.attr('src') || img.attr('data-src') || null
    // Upgrade low-res thumbnail to higher resolution
    if (imageUrl) imageUrl = imageUrl.replace('128/128', '416/416').replace('50/50', '416/416')

    // Product URL
    let href = card.find(SELECTORS.link).first().attr('href') || ''
    if (href && !href.startsWith('http')) href = 'https://www.flipkart.com' + href
    if (!href || href === 'https://www.flipkart.com') return

    // Product ID from URL (e.g. /sony-wh1000xm5/p/itm123abc → itm123abc)
    const pidMatch = href.match(/\/p\/(itm[a-zA-Z0-9]+)/)
    const platformId = pidMatch ? pidMatch[1] : `fk-${Date.now()}-${i}`

    // Brand: try to extract from name (first word often is brand)
    // or from dedicated brand element
    let brand = card.find(SELECTORS.brand).first().text().trim()
    if (!brand) brand = extractBrandFromName(name)

    // Affiliate URL: add flipkart affiliate tag if configured
    const affiliateTag = process.env.FLIPKART_AFFILIATE_ID
    const affiliateUrl = affiliateTag
      ? addFlipkartAffiliateTag(href, affiliateTag)
      : href

    // Estimate sentiment from rating (we don't have review text)
    const positivePct = rating ? ratingToSentiment(rating) : null

    products.push({
      platform:    'Flipkart',
      platformId,
      name:        cleanName(name),
      brand:       brand || null,
      price,
      mrp,
      discount,
      currency:    'INR',
      rating,
      reviewCount,
      imageUrl,
      url:         href,
      affiliateUrl,
      inStock:     !card.text().toLowerCase().includes('out of stock'),
      positivePct,
    })
  })

  return products.slice(0, MAX_RESULTS)
}

// ── HELPERS ───────────────────────────────────────────────────────

// Parse "₹26,499" or "26499" → 26499
function parseRupees(text = '') {
  const cleaned = text.replace(/[₹,\s]/g, '').replace(/[^0-9.]/g, '')
  const val     = parseFloat(cleaned)
  return (val && val > 0 && val < 10000000) ? val : null
}

// Parse "1,240 Ratings & 340 Reviews" → 1240
function parseReviewCount(text = '') {
  const match = text.match(/[\d,]+/)
  if (!match) return 0
  return parseInt(match[0].replace(/,/g, '')) || 0
}

// Clean product name — remove extra whitespace, HTML artifacts
function cleanName(name) {
  return name.replace(/\s+/g, ' ').replace(/[|•·]+/g, '-').trim()
}

// Try to extract brand from product name
// "Sony WH-1000XM5 Wireless..." → "Sony"
const KNOWN_BRANDS = [
  'Sony', 'Samsung', 'Apple', 'boAt', 'JBL', 'Bose', 'Sennheiser',
  'Philips', 'OnePlus', 'Xiaomi', 'Realme', 'Vivo', 'Oppo', 'Nokia',
  'LG', 'Panasonic', 'Asus', 'Dell', 'HP', 'Lenovo', 'Acer', 'MI',
  'Noise', 'Zebronics', 'Corsair', 'Logitech', 'Razer', 'HyperX',
  'Skullcandy', 'Jabra', 'Plantronics', 'Audio-Technica',
  'Nike', 'Adidas', 'Puma', 'Reebok', 'New Balance', 'Skechers',
  'Prestige', 'Bajaj', 'Havells', 'Pigeon', 'Butterfly', 'Wonderchef',
]
function extractBrandFromName(name) {
  const lower = name.toLowerCase()
  for (const brand of KNOWN_BRANDS) {
    if (lower.includes(brand.toLowerCase())) return brand
  }
  // Fallback: first word if title-case
  const firstWord = name.split(' ')[0]
  return /^[A-Z][a-z]/.test(firstWord) ? firstWord : null
}

// Estimate sentiment % from star rating
function ratingToSentiment(rating) {
  if (!rating) return 65
  if (rating >= 4.5) return 88
  if (rating >= 4.0) return 78
  if (rating >= 3.5) return 65
  if (rating >= 3.0) return 50
  return 35
}

// Add Flipkart affiliate tag to URL
function addFlipkartAffiliateTag(url, affiliateId) {
  try {
    const u = new URL(url)
    u.searchParams.set('affid', affiliateId)
    return u.toString()
  } catch { return url }
}

// ── CATEGORY → FLIPKART SEARCH HINTS ──────────────────────────────
// We pass extra search terms to improve result quality
const CATEGORY_HINTS = {
  headphones:  'headphones wireless',
  smartphones: 'smartphone mobile',
  laptops:     'laptop notebook',
  gaming:      'gaming',
  footwear:    'shoes sneakers',
  skincare:    'skincare serum moisturizer',
  fashion:     'clothing',
  books:       'book',
  appliances:  'kitchen appliance',
}

module.exports = { searchProducts }
