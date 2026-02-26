// src/services/amazonService.js — Amazon Creators API Integration
// ─────────────────────────────────────────────────────────────────
// Uses: Amazon Creators API (OAuth2 client_credentials)
// Endpoint: https://creatorsapi.amazon/catalog/v1/searchItems
//
// HOW IT WORKS:
//   1. Exchange AMAZON_CREDENTIAL_ID + SECRET for a Bearer token
//   2. Send search request to Creators API with Bearer token
//   3. Normalize response to bestpickr product format
//   4. Falls back to PA-API v5 (SigV4) if AMAZON_ACCESS_KEY is set
//
// ENV VARS (Creators API — primary):
//   AMAZON_CREDENTIAL_ID      — Cognito client_id
//   AMAZON_CREDENTIAL_SECRET  — Cognito client_secret
//   AMAZON_TOKEN_ENDPOINT     — https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token
//   AMAZON_TOKEN_SCOPE        — creatorsapi/default
//   AMAZON_CREDENTIAL_VERSION — 2.2
//
// ENV VARS (PA-API v5 — legacy fallback):
//   AMAZON_ACCESS_KEY  — AWS access key (starts with AKIA)
//   AMAZON_SECRET_KEY  — AWS secret key
//
// ENV VARS (both paths):
//   AMAZON_ASSOCIATE_TAG  — e.g. bestpickr-21
//   AMAZON_MARKETPLACE    — www.amazon.in
// ─────────────────────────────────────────────────────────────────
'use strict';

const axios  = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

// ── Creators API credentials (OAuth2) ───────────────────────────
const CLIENT_ID      = process.env.AMAZON_CREDENTIAL_ID;
const CLIENT_SECRET  = process.env.AMAZON_CREDENTIAL_SECRET;
const TOKEN_ENDPOINT = process.env.AMAZON_TOKEN_ENDPOINT;
const TOKEN_SCOPE    = process.env.AMAZON_TOKEN_SCOPE    || 'creatorsapi/default';
const CRED_VERSION   = process.env.AMAZON_CREDENTIAL_VERSION || '2.2';

// ── PA-API v5 legacy keys ────────────────────────────────────────
const AMAZON_ACCESS_KEY = process.env.AMAZON_ACCESS_KEY;
const AMAZON_SECRET_KEY = process.env.AMAZON_SECRET_KEY;

// ── Shared ───────────────────────────────────────────────────────
const ASSOCIATE_TAG = process.env.AMAZON_ASSOCIATE_TAG || 'bestpickr-21';
const MARKETPLACE   = process.env.AMAZON_MARKETPLACE   || 'www.amazon.in';

// ── Creators API config ──────────────────────────────────────────
const CREATORS_API_URL = 'https://creatorsapi.amazon/catalog/v1/searchItems';

// ── PA-API v5 config ─────────────────────────────────────────────
const PAAPI_HOST   = process.env.AMAZON_HOST   || 'webservices.amazon.in';
const PAAPI_REGION = process.env.AMAZON_REGION || 'eu-west-1';
const PAAPI_SERVICE = 'ProductAdvertisingAPI';
const PAAPI_PATH    = '/paapi5/searchitems';

// ═════════════════════════════════════════════════════════════════
// CREATORS API — OAuth2 TOKEN CACHE WITH MUTEX
// ═════════════════════════════════════════════════════════════════
// - Token is cached for 1 hour (expires_in=3600s), refreshed 5 min early
// - Mutex (_tokenFetchPromise) prevents concurrent Cognito requests:
//   if two searches hit an expired token simultaneously, only ONE
//   token fetch fires — the second awaits the first's result.

let _cachedToken       = null;
let _tokenExpires      = 0;     // epoch ms
let _tokenFetchPromise = null;  // in-flight promise (mutex)

async function getAccessToken() {
  // Fast path: valid cached token
  if (_cachedToken && Date.now() < _tokenExpires - 300_000) {
    return _cachedToken;
  }

  // Mutex: if a fetch is already in-flight, share it instead of racing
  if (_tokenFetchPromise) {
    logger.info('Amazon token: reusing in-flight fetch (concurrent request)');
    return _tokenFetchPromise;
  }

  if (!CLIENT_ID || !CLIENT_SECRET || !TOKEN_ENDPOINT) {
    throw new Error('Creators API creds not set (AMAZON_CREDENTIAL_ID/SECRET/TOKEN_ENDPOINT)');
  }

  _tokenFetchPromise = (async () => {
    const body = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope:         TOKEN_SCOPE,
    });

    const res = await axios.post(TOKEN_ENDPOINT, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    _cachedToken  = res.data.access_token;
    _tokenExpires = Date.now() + ((res.data.expires_in || 3600) * 1000);
    logger.info(`Amazon Creators API: token acquired, expires_in=${res.data.expires_in}s, next refresh at ${new Date(_tokenExpires - 300_000).toISOString()}`);
    return _cachedToken;
  })().finally(() => {
    _tokenFetchPromise = null; // release mutex
  });

  return _tokenFetchPromise;
}

// ═════════════════════════════════════════════════════════════════
// CREATORS API — PRODUCT SEARCH
// ═════════════════════════════════════════════════════════════════

async function searchViaCreatorsAPI(query, category, retries = 2) {
  const token = await getAccessToken();

  const payload = {
    keywords:   query,
    marketplace: MARKETPLACE,
    partnerTag:  ASSOCIATE_TAG,
    limit:       10,
    resources: [
      'images.primary.large',
      'itemInfo.title',
      'itemInfo.byLineInfo',
      'itemInfo.features',
      'offersV2.listings.price',
      'offersV2.listings.availability',
    ],
  };

  // Optional: map category to a browse node for more relevant results
  const browseNode = mapToBrowseNode(category);
  if (browseNode) payload.browseNodeId = browseNode;

  logger.info(`Amazon Creators API: searching "${query}" category="${category}"`);

  try {
    const res = await axios.post(CREATORS_API_URL, payload, {
      headers: {
        'Authorization': `Bearer ${token}, Version ${CRED_VERSION}`,
        'Content-Type':  'application/json',
        'x-marketplace': MARKETPLACE,
      },
      timeout: 15000,
    });

    const items = res.data?.searchResult?.items || [];
    logger.info(`Amazon Creators API: ${items.length} items returned`);
    return items.map(normalizeCreatorsItem);
  } catch (err) {
    if (err.response?.status === 429 && retries > 0) {
      const retryAfter = parseInt(err.response.headers['retry-after'] || '2', 10);
      logger.warn(`Amazon Creators API: 429 rate limited — retrying in ${retryAfter}s (${retries} retries left)`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return searchViaCreatorsAPI(query, category, retries - 1);
    }
    throw err;
  }
}

// ── Normalize Creators API item → bestpickr format ───────────────
function normalizeCreatorsItem(item) {
  const listing  = item.offersV2?.listings?.[0] || {};
  const price    = listing.price?.money?.amount || null;       // integer paise? no, INR rupees as integer
  const mrp      = listing.price?.savingBasis?.money?.amount || null;
  const discount = listing.price?.savings?.percentage || null;
  const inStock  = listing.availability?.type === 'IN_STOCK';

  const asin        = item.asin;
  const affiliateUrl = item.detailPageURL; // already has tag=bestpickr-21

  return {
    platform:    'Amazon',
    platformId:  asin,
    name:        item.itemInfo?.title?.displayValue || 'Unknown Product',
    brand:       item.itemInfo?.byLineInfo?.brand?.displayValue || null,
    price:       price,
    currency:    'INR',
    mrp,
    discountPct: discount,
    rating:      null,   // Creators API does not expose review ratings
    reviewCount: 0,
    imageUrl:    item.images?.primary?.large?.url || item.images?.primary?.medium?.url || null,
    url:         affiliateUrl,
    affiliateUrl,
    inStock,
    positivePct: null,
    features:    item.itemInfo?.features?.displayValues || [],
  };
}

// ═════════════════════════════════════════════════════════════════
// PA-API v5 — SigV4 SIGNED SEARCH (legacy fallback)
// ═════════════════════════════════════════════════════════════════

function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}
function getSignatureKey(secretKey, dateStamp, region, service) {
  return sign(sign(sign(sign(`AWS4${secretKey}`, dateStamp), region), service), 'aws4_request');
}

async function searchViaPaApi(query, category) {
  const TARGET = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems';

  const payload = {
    Keywords:    query,
    SearchIndex: mapToAmazonIndex(category),
    Resources: [
      'ItemInfo.Title', 'ItemInfo.ByLineInfo',
      'Offers.Listings.Price', 'Offers.Listings.Availability.Type',
      'CustomerReviews.Count', 'CustomerReviews.StarRating',
      'Images.Primary.Large',
    ],
    PartnerTag:  ASSOCIATE_TAG,
    PartnerType: 'Associates',
    Marketplace: MARKETPLACE,
    ItemCount:   10,
  };

  const now        = new Date();
  const amzDate    = now.toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z';
  const dateStamp  = amzDate.slice(0, 8);
  const payloadStr = JSON.stringify(payload);
  const payloadHash = crypto.createHash('sha256').update(payloadStr).digest('hex');

  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Host':          PAAPI_HOST,
    'X-Amz-Date':    amzDate,
    'X-Amz-Target':  TARGET,
  };

  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
    .join('\n') + '\n';

  const signedHeaders  = Object.keys(headers).map(k => k.toLowerCase()).sort().join(';');
  const canonicalReq   = ['POST', PAAPI_PATH, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credScope      = `${dateStamp}/${PAAPI_REGION}/${PAAPI_SERVICE}/aws4_request`;
  const stringToSign   = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n` +
    crypto.createHash('sha256').update(canonicalReq).digest('hex');

  const signingKey  = getSignatureKey(AMAZON_SECRET_KEY, dateStamp, PAAPI_REGION, PAAPI_SERVICE);
  const signature   = sign(signingKey, stringToSign).toString('hex');
  const authHeader  = `AWS4-HMAC-SHA256 Credential=${AMAZON_ACCESS_KEY}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  logger.info(`Amazon PA-API (SigV4): searching "${query}"`);

  const res = await axios.post(`https://${PAAPI_HOST}${PAAPI_PATH}`, payload, {
    headers: { ...headers, Authorization: authHeader },
    timeout: 15000,
  });

  const items = res.data?.SearchResult?.Items || [];
  logger.info(`Amazon PA-API (SigV4): ${items.length} items returned`);
  return items.map(normalizePaapiItem);
}

// ── Normalize PA-API v5 item → bestpickr format ──────────────────
function normalizePaapiItem(item) {
  const price   = item.Offers?.Listings?.[0]?.Price?.Amount;
  const reviews = item.CustomerReviews;
  const asin    = item.ASIN;

  return {
    platform:    'Amazon',
    platformId:  asin,
    name:        item.ItemInfo?.Title?.DisplayValue || 'Unknown Product',
    brand:       item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue || null,
    price:       price ? parseFloat(price) : null,
    currency:    'INR',
    rating:      reviews?.StarRating?.Value ? parseFloat(reviews.StarRating.Value) : null,
    reviewCount: reviews?.Count?.Value      ? parseInt(reviews.Count.Value, 10) : 0,
    imageUrl:    item.Images?.Primary?.Large?.URL || null,
    url:         item.DetailPageURL || null,
    affiliateUrl: buildPaapiAffiliateUrl(asin, item.DetailPageURL),
    inStock:     item.Offers?.Listings?.[0]?.Availability?.Type === 'Now',
    positivePct: null,
  };
}

// ── Manual affiliate URLs for PA-API path ─────────────────────────
const MANUAL_AFFILIATE_URLS = {
  B0CCLMLRY8: 'https://www.amazon.in/dp/B0CCLMLRY8?tag=bestpickr-21&linkCode=ll2&linkId=3224d39e3ae39a53dc87cfaca0257221&ref_=as_li_ss_tl',
  B0C591TT8F: 'https://www.amazon.in/dp/B0C591TT8F?tag=bestpickr-21&linkCode=ll2&linkId=2657a6de8c2932c182b76deb8e749024&ref_=as_li_ss_tl',
  B07DQXH8JZ: 'https://www.amazon.in/dp/B07DQXH8JZ?tag=bestpickr-21&linkCode=ll2&linkId=87747a090d2be209a3f34aed820729aa&ref_=as_li_ss_tl',
};

function buildPaapiAffiliateUrl(asin, detailPageUrl) {
  if (MANUAL_AFFILIATE_URLS[asin]) return MANUAL_AFFILIATE_URLS[asin];
  if (asin && ASSOCIATE_TAG) {
    return `https://www.amazon.in/dp/${asin}?tag=${ASSOCIATE_TAG}&linkCode=ll1&ref_=as_li_ss_tl`;
  }
  return detailPageUrl;
}

// ═════════════════════════════════════════════════════════════════
// MAIN EXPORT — searchProducts()
// ═════════════════════════════════════════════════════════════════

async function searchProducts(query, category = 'All') {
  // Path 1: Creators API (OAuth2) — primary when credentials are present
  if (CLIENT_ID && CLIENT_SECRET && TOKEN_ENDPOINT) {
    try {
      return await searchViaCreatorsAPI(query, category);
    } catch (err) {
      const status = err.response?.status;
      const msg    = err.response?.data ? JSON.stringify(err.response.data).slice(0, 200) : err.message;
      logger.error(`Amazon Creators API error: status=${status} — ${msg}`);
      // Fall through to PA-API if available
    }
  }

  // Path 2: PA-API v5 (SigV4) — legacy fallback when AMAZON_ACCESS_KEY is set
  if (AMAZON_ACCESS_KEY && AMAZON_SECRET_KEY) {
    try {
      return await searchViaPaApi(query, category);
    } catch (err) {
      const status = err.response?.status;
      logger.error(`Amazon PA-API (SigV4) error: status=${status} — ${err.message}`);
    }
  }

  if (!CLIENT_ID && !AMAZON_ACCESS_KEY) {
    logger.warn('Amazon: no credentials configured (set AMAZON_CREDENTIAL_ID or AMAZON_ACCESS_KEY)');
  }

  return [];
}

// ═════════════════════════════════════════════════════════════════
// CATEGORY MAPPINGS
// ═════════════════════════════════════════════════════════════════

// Browse node IDs for Creators API (Amazon India category nodes)
function mapToBrowseNode(category) {
  const map = {
    headphones:  '1388921031',  // Electronics > Headphones
    smartphones: '1805560031',  // Electronics > Smartphones
    laptops:     '1375424031',  // Computers > Laptops
    cameras:     '1389175031',  // Electronics > Cameras
  };
  return map[category?.toLowerCase()] || null;
}

// SearchIndex for PA-API v5 (legacy)
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
    cameras:     'Electronics',
  };
  return map[category?.toLowerCase()] || 'All';
}

// ═════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════

module.exports = {
  searchProducts,
  getAccessToken, // exported for testing
};
