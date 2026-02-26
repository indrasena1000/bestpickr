// src/services/amazonService.js — Amazon Creators API Integration
// ─────────────────────────────────────────────────────────────────
// Migrated from: Amazon Product Advertising API v5 (PA API)
// Migrated to:   Amazon Creators API (OAuth 2.0 Bearer tokens)
//
// KEY CHANGES FROM PA API:
//   - Auth: AWS Signature V4 removed → OAuth 2.0 Bearer token (Basic Auth for token)
//   - Credentials: ACCESS_KEY + SECRET_KEY → CREDENTIAL_ID + CREDENTIAL_SECRET + VERSION
//   - Token endpoint: creatorsapi.auth.eu-south-2.amazoncognito.com (Basic Auth)
//   - API endpoint: creatorsapi.amazon/catalog/v1/* (new URL)
//   - API auth header: "Bearer TOKEN, Version 2.2" (includes credential version)
//   - x-marketplace header required for all API calls
//   - Request fields: PascalCase → lowerCamelCase
//   - Response fields: PascalCase → lowerCamelCase
//   - offersV2 replaces old Offers resource
//   - Token auto-refreshed in-memory (expires every ~3600s)
//
// COMMON 429 CAUSES:
//   1. Account has fewer than 10 shipped sales in last 30 days (hard block)
//   2. Newly created credentials not yet activated (wait 24-72 hours)
//   3. TPS exceeded (1 req/sec free tier) — handled by retry/backoff below
// ─────────────────────────────────────────────────────────────────
const axios  = require('axios')
const logger = require('../utils/logger')

const {
  AMAZON_CREDENTIAL_ID,
  AMAZON_CREDENTIAL_SECRET,
  AMAZON_CREDENTIAL_VERSION = '2.2',   // 2.1=NA, 2.2=EU/India, 2.3=FE
  AMAZON_ASSOCIATE_TAG,
  AMAZON_MARKETPLACE = 'www.amazon.in',
} = process.env

// New Creators API endpoint (replaces webservices.amazon.com/paapi5/*)
const CREATORS_API_HOST = 'https://creatorsapi.amazon'
const SEARCH_PATH       = '/catalog/v1/searchItems'
const GET_ITEMS_PATH    = '/catalog/v1/getItems'

// ── OAuth 2.0 TOKEN MANAGEMENT ────────────────────────────────────
// Token endpoint uses HTTP Basic Auth (Credential ID:Secret base64 encoded).
const TOKEN_ENDPOINTS_TO_TRY = process.env.AMAZON_TOKEN_ENDPOINT
  ? [process.env.AMAZON_TOKEN_ENDPOINT]
  : [
      'https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token',
      'https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token',
      'https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token',
    ]
const TOKEN_SCOPE = process.env.AMAZON_TOKEN_SCOPE || 'creatorsapi/default'

let _cachedToken     = null
let _tokenExpiresAt  = 0          // epoch ms
let _workingEndpoint = null       // endpoint that succeeded (skips retry next time)

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiresAt) return _cachedToken

  const endpoints = _workingEndpoint
    ? [_workingEndpoint]
    : TOKEN_ENDPOINTS_TO_TRY

  // Build Basic Auth header: base64(credential_id:credential_secret)
  const basicAuth = Buffer.from(
    `${AMAZON_CREDENTIAL_ID}:${AMAZON_CREDENTIAL_SECRET}`
  ).toString('base64')

  for (const endpoint of endpoints) {
    try {
      const { data } = await axios.post(
        endpoint,
        `grant_type=client_credentials&scope=${TOKEN_SCOPE}`,
        {
          headers: {
            'Content-Type':  'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`,
          },
          timeout: 8000,
        }
      )

      _cachedToken     = data.access_token
      _tokenExpiresAt  = Date.now() + (data.expires_in - 300) * 1000
      _workingEndpoint = endpoint
      logger.info(`[Amazon] OAuth token obtained via ${endpoint}. Expires in ${data.expires_in}s`)
      return _cachedToken
    } catch (err) {
      const status = err.response ? err.response.status : 'ERR'
      const detail = JSON.stringify(err.response ? err.response.data : err.message)
      logger.warn(`[Amazon] Token endpoint failed: ${endpoint} → HTTP ${status} ${detail}`)
    }
  }

  throw new Error(
    '[Amazon] All token endpoints failed. Verify AMAZON_CREDENTIAL_ID and ' +
    'AMAZON_CREDENTIAL_SECRET are from Associates Central → Creators API section. ' +
    'If Amazon provided a specific token URL, set AMAZON_TOKEN_ENDPOINT in .env'
  )
}

// ── COMMON API CALL WITH RETRY + EXPONENTIAL BACKOFF ─────────────
// Handles 429 ThrottleException with up to MAX_RETRIES retries.
// Backs off exponentially: 1s → 2s → 4s between retries.
//
// NOTE: A 429 on the very first request usually means one of:
//   - Associates account has < 10 qualified sales in last 30 days
//   - Credentials created < 24-72 hours ago (not yet propagated)
//   - Genuine TPS limit hit (retry will resolve this)
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1000

async function callCreatorsApi(path, payload) {
  const token = await getAccessToken()
  const url   = `${CREATORS_API_HOST}${path}`

  let attempt = 0
  while (attempt <= MAX_RETRIES) {
    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type':  'application/json; charset=UTF-8',
          'Authorization': `Bearer ${token}, Version ${AMAZON_CREDENTIAL_VERSION}`,
          'x-marketplace': AMAZON_MARKETPLACE,
        },
        timeout: 12000,
      })
      return response.data
    } catch (err) {
      const status = err.response ? err.response.status : null
      const body   = err.response ? err.response.data : null

      if (status === 429 && attempt < MAX_RETRIES) {
        const delayMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt)
        logger.warn(
          `[Amazon] 429 ThrottleException on ${path} (attempt ${attempt + 1}/${MAX_RETRIES + 1}) — ` +
          `retrying in ${delayMs}ms. ` +
          `If this persists: check Associates account has ≥10 shipped sales in last 30 days, ` +
          `and credentials are >72h old.`
        )
        await sleep(delayMs)
        attempt++
        continue
      }

      if (status === 429) {
        // All retries exhausted
        logger.error(
          '[Amazon] 429 ThrottleException — all retries exhausted. ' +
          'Root causes to check:\n' +
          '  1. Associates account must have ≥10 SHIPPED sales in the last 30 days\n' +
          '  2. Newly created credentials take 24-72 hours to activate\n' +
          '  3. TPS limit (1 req/sec free tier) — spread requests further apart\n' +
          '  Check: affiliate-program.amazon.in → Reports → Earnings Report'
        )
        throw err
      }

      // Non-429 error: log and rethrow
      logger.error('[Amazon] Creators API error:', {
        path,
        status,
        body: JSON.stringify(body).slice(0, 500),
        message: err.message,
      })
      throw err
    }
  }
}

// ── SEARCH PRODUCTS ───────────────────────────────────────────────
/**
 * Search Amazon for products matching the query.
 * Returns normalized product array (empty array on any error).
 *
 * @param {string} query     - Search term (e.g., "Sony headphones")
 * @param {string} category  - Category hint (e.g., "Electronics")
 * @returns {Array}          - Normalized products
 */
async function searchProducts(query, category = 'All') {
  if (!AMAZON_CREDENTIAL_ID || !AMAZON_CREDENTIAL_SECRET) {
    logger.warn('[Amazon] Creators API credentials not configured — returning mock data')
    return getMockData(query)
  }

  try {
    const payload = {
      keywords:    query,
      searchIndex: mapToAmazonIndex(category),
      resources: [
        'itemInfo.title',
        'itemInfo.byLineInfo',
        'images.primary.large',
        'offersV2.listings.price',
        'offersV2.listings.availability',
      ],
      partnerTag:  AMAZON_ASSOCIATE_TAG,
      marketplace: AMAZON_MARKETPLACE,
      itemCount:   10,
    }

    const data = await callCreatorsApi(SEARCH_PATH, payload)
    const sr    = data && data.searchResult
    const items = (sr && sr.items) || []

    if (!items.length) {
      logger.warn('[Amazon] SearchItems returned 0 results for:', { query })
    } else {
      logger.info(`[Amazon] SearchItems returned ${items.length} results for: "${query}"`)
    }

    return items.map(normalizeItem)
  } catch (err) {
    logger.error(`[Amazon] searchProducts failed for "${query}": ${err.message}`)
    return []
  }
}

// ── GET ITEMS BY ASIN ─────────────────────────────────────────────
/**
 * Fetch specific products by their ASINs using GetItems operation.
 * Useful for product detail pages and refreshing known products.
 *
 * @param {string[]} asins   - Array of ASINs (max 10 per request)
 * @returns {Array}          - Normalized products
 */
async function getItems(asins) {
  if (!AMAZON_CREDENTIAL_ID || !AMAZON_CREDENTIAL_SECRET) {
    logger.warn('[Amazon] Creators API credentials not configured — getItems skipped')
    return []
  }
  if (!asins || asins.length === 0) return []

  // API allows max 10 ASINs per call
  const batch = asins.slice(0, 10)

  try {
    const payload = {
      itemIds:    batch,
      itemIdType: 'ASIN',
      resources: [
        'itemInfo.title',
        'itemInfo.byLineInfo',
        'itemInfo.features',
        'images.primary.large',
        'offersV2.listings.price',
        'offersV2.listings.availability',
        'offersV2.listings.isBuyBoxWinner',
      ],
      partnerTag:  AMAZON_ASSOCIATE_TAG,
      marketplace: AMAZON_MARKETPLACE,
    }

    const data  = await callCreatorsApi(GET_ITEMS_PATH, payload)
    const items = (data && data.itemResults && data.itemResults.items) || []

    if (data && data.errors && data.errors.length > 0) {
      logger.warn('[Amazon] GetItems partial errors:', data.errors)
    }

    logger.info(`[Amazon] GetItems returned ${items.length}/${batch.length} items`)
    return items.map(normalizeItem)
  } catch (err) {
    logger.error(`[Amazon] getItems failed for [${asins.join(',')}]: ${err.message}`)
    return []
  }
}

// ── NORMALIZE: Creators API response → bestpickr format ──────────
// Creators API response shape (all lowerCamelCase):
//   item.asin
//   item.detailPageURL  (capital URL suffix — matches docs)
//   item.itemInfo.title.displayValue
//   item.itemInfo.byLineInfo.brand.displayValue
//   item.itemInfo.features.displayValues  (array of strings)
//   item.images.primary.large.url
//   item.offersV2.listings[0].price.money.amount
//   item.offersV2.listings[0].availability.type   → "IN_STOCK"
//
function normalizeItem(item) {
  const asin = item.asin

  // offersV2 — buy-box winner first, then first listing
  const v2listings = (item.offersV2 && item.offersV2.listings) || []
  const buyBox      = v2listings.find(function(l) { return l.isBuyBoxWinner }) || v2listings[0] || {}
  const priceAmount = buyBox.price && buyBox.price.money && buyBox.price.money.amount
  const availType   = buyBox.availability && buyBox.availability.type

  // ItemInfo
  const itemInfo  = item.itemInfo || {}
  const titleObj  = itemInfo.title || {}
  const byLineObj = itemInfo.byLineInfo || {}
  const brandObj  = byLineObj.brand || {}
  const features  = itemInfo.features && itemInfo.features.displayValues || []

  // Images
  const images  = item.images || {}
  const primary = images.primary || {}
  const large   = primary.large || {}

  // detailPageURL — Creators API uses capital URL (per docs sample response)
  const detailUrl = item.detailPageURL || item.detailPageUrl

  return {
    platform:     'Amazon',
    platformId:   asin,
    name:         titleObj.displayValue  || 'Unknown Product',
    brand:        brandObj.displayValue  || null,
    price:        priceAmount != null ? parseFloat(priceAmount) : null,
    currency:     'INR',
    rating:       null,       // not in Creators API search — from review scraper
    reviewCount:  0,          // not in Creators API search — from review scraper
    features:     features,   // key features array (from GetItems)
    imageUrl:     large.url   || null,
    url:          detailUrl,
    affiliateUrl: buildAffiliateUrl(asin, detailUrl),
    inStock:      availType === 'IN_STOCK',
    positivePct:  null,
  }
}

// ── YOUR AFFILIATE URLS ───────────────────────────────────────────
// Add your Amazon Associates links here, keyed by ASIN.
// Get the full URL from Associates portal, then remove:
//   social_share=..., badgeInsights=..., th=1
// Keep: tag=, linkCode=, linkId=, ref_=
//
const MANUAL_AFFILIATE_URLS = {
  B0CCLMLRY8:
    'https://www.amazon.in/dp/B0CCLMLRY8?tag=bestpickr-21&linkCode=ll2&linkId=3224d39e3ae39a53dc87cfaca0257221&ref_=as_li_ss_tl',
  B0C591TT8F:
    'https://www.amazon.in/dp/B0C591TT8F?tag=bestpickr-21&linkCode=ll2&linkId=2657a6de8c2932c182b76deb8e749024&ref_=as_li_ss_tl',
  B07DQXH8JZ:
    'https://www.amazon.in/dp/B07DQXH8JZ?tag=bestpickr-21&linkCode=ll2&linkId=87747a090d2be209a3f34aed820729aa&ref_=as_li_ss_tl',
  // Add more as you generate links from Amazon Associates portal
}

// Build the affiliate URL: manual link first, then auto-generated fallback
function buildAffiliateUrl(asin, detailPageUrl) {
  if (MANUAL_AFFILIATE_URLS[asin]) return MANUAL_AFFILIATE_URLS[asin]
  if (asin && AMAZON_ASSOCIATE_TAG) {
    return 'https://www.amazon.in/dp/' + asin + '?tag=' + AMAZON_ASSOCIATE_TAG + '&linkCode=ll1&ref_=as_li_ss_tl'
  }
  return detailPageUrl
}

// ── CATEGORY MAPPING ──────────────────────────────────────────────
function mapToAmazonIndex(category) {
  const map = {
    headphones:  'Electronics',
    smartphones: 'Electronics',
    laptops:     'Computers',
    gaming:      'VideoGames',
    footwear:    'Shoes',
    skincare:    'Beauty',
    fashion:     'Apparel',
    books:       'Books',
    appliances:  'Kitchen',
  }
  return map[category ? category.toLowerCase() : ''] || 'All'
}

// ── MOCK DATA (when credentials not configured) ───────────────────
function getMockData(query) {
  logger.info('[Amazon] Mock data for: "' + query + '"')
  const tag = AMAZON_ASSOCIATE_TAG || 'bestpickr-21'
  return [
    {
      platform:    'Amazon',
      platformId:  'B0CCLMLRY8',
      name:        'LEMBOSE Plastic Fridge Storage Refrigerator Organizer Container with Lid - 5L, Transparent',
      brand:       'LEMBOSE',
      price:       249,
      rating:      4.5,
      reviewCount: 41200,
      imageUrl:    'https://m.media-amazon.com/images/I/71WqBJFa2TL._SX342_SY445_.jpg',
      url:         'https://www.amazon.in/dp/B0CCLMLRY8',
      affiliateUrl:'https://www.amazon.in/dp/B0CCLMLRY8?tag=' + tag + '&linkCode=ll2&linkId=3224d39e3ae39a53dc87cfaca0257221&ref_=as_li_ss_tl',
      inStock:     true,
      positivePct: 84,
      currency:    'INR',
    },
    {
      platform:    'Amazon',
      platformId:  'B07DQXH8JZ',
      name:        'Scotch-Brite Microfiber Polishing Wipe for cleaning TV, Mobile, Laptop, Tablet screens & Spectacles (Pack of 1, Grey)',
      brand:       'Scotch-Brite',
      price:       169,
      rating:      4.2,
      reviewCount: 3665,
      imageUrl:    'https://m.media-amazon.com/images/I/61RI+lFf3HL._SX342_SY445_.jpg',
      url:         'https://www.amazon.in/dp/B07DQXH8JZ',
      affiliateUrl:'https://www.amazon.in/dp/B07DQXH8JZ?tag=' + tag + '&linkCode=ll2&linkId=87747a090d2be209a3f34aed820729aa&ref_=as_li_ss_tl',
      inStock:     true,
      positivePct: 79,
      currency:    'INR',
    },
    {
      platform:    'Amazon',
      platformId:  'B0C591TT8F',
      name:        'Cubic Classic A5 Journal – 160 Pages, 80 gsm | PU Leather Hardbound Notebook with Pen Loop | Black Diary',
      brand:       'Cubic',
      price:       167,
      rating:      4.2,
      reviewCount: 780,
      imageUrl:    'https://m.media-amazon.com/images/I/71k3o+gJgFL._SX342_SY445_.jpg',
      url:         'https://www.amazon.in/dp/B0C591TT8F',
      affiliateUrl:'https://www.amazon.in/dp/B0C591TT8F?tag=' + tag + '&linkCode=ll2&linkId=2657a6de8c2932c182b76deb8e749024&ref_=as_li_ss_tl',
      inStock:     true,
      positivePct: 76,
      currency:    'INR',
    },
  ]
}

// ── UTILITY ──────────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

module.exports = { searchProducts, getItems }
