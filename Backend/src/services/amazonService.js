// src/services/amazonService.js — Amazon PA5 API Integration
// ─────────────────────────────────────────────────────────────────
// Uses: Amazon Product Advertising API v5
// Docs: https://webservices.amazon.in/paapi5/documentation/
//
// HOW IT WORKS:
//   1. We send a signed HTTP request to Amazon's API
//   2. Amazon returns product data (name, price, rating, reviews, image)
//   3. We normalize it to our standard format
//   4. Affiliate links include our Associate Tag → we earn commission
// ─────────────────────────────────────────────────────────────────
const axios  = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

const {
  AMAZON_ACCESS_KEY,
  AMAZON_SECRET_KEY,
  AMAZON_ASSOCIATE_TAG,
  AMAZON_HOST     = 'webservices.amazon.in',
  AMAZON_REGION   = 'eu-west-1',
} = process.env;

const SERVICE = 'ProductAdvertisingAPI';
const PATH    = '/paapi5/searchitems';

// ── AWS SIGNATURE V4 (required by Amazon API) ─────────────────────
// Amazon requires every request to be signed with your secret key.
// This proves you're authorized and prevents tampering.
function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}
function getSignatureKey(secretKey, dateStamp, region, service) {
  const kDate    = sign(`AWS4${secretKey}`, dateStamp);
  const kRegion  = sign(kDate, region);
  const kService = sign(kRegion, service);
  return sign(kService, 'aws4_request');
}

function buildSignedRequest(payload) {
  const now         = new Date();
  const amzDate     = now.toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z';
  const dateStamp   = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Host':         AMAZON_HOST,
    'X-Amz-Date':  amzDate,
    'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
  };

  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
    .join('\n') + '\n';

  const signedHeaders = Object.keys(headers)
    .map(k => k.toLowerCase())
    .sort()
    .join(';');

  const canonicalRequest = [
    'POST', PATH, '',
    canonicalHeaders, signedHeaders, payloadHash,
  ].join('\n');

  const credentialScope  = `${dateStamp}/${AMAZON_REGION}/${SERVICE}/aws4_request`;
  const stringToSign     = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n`
    + crypto.createHash('sha256').update(canonicalRequest).digest('hex');

  const signingKey = getSignatureKey(AMAZON_SECRET_KEY, dateStamp, AMAZON_REGION, SERVICE);
  const signature  = sign(signingKey, stringToSign).toString('hex');

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${AMAZON_ACCESS_KEY}/${credentialScope}, `
    + `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    headers: { ...headers, Authorization: authorizationHeader },
    url:     `https://${AMAZON_HOST}${PATH}`,
  };
}

// ── SEARCH PRODUCTS ───────────────────────────────────────────────
/**
 * Search Amazon for products matching the query.
 * Returns normalized product array.
 *
 * @param {string} query     - Search term (e.g., "Sony headphones")
 * @param {string} category  - Amazon search index (e.g., "Electronics")
 * @returns {Array}          - Normalized products
 */
async function searchProducts(query, category = 'All') {
  if (!AMAZON_ACCESS_KEY || !AMAZON_SECRET_KEY) {
    logger.warn('Amazon API keys not configured — returning mock data');
    return getMockData(query);
  }

  const payload = {
    Keywords:    query,
    SearchIndex: mapToAmazonIndex(category),
    Resources: [
      'ItemInfo.Title',
      'ItemInfo.ByLineInfo',
      'ItemInfo.Features',
      'Offers.Listings.Price',
      'Offers.Listings.Availability.Type',
      'CustomerReviews.Count',
      'CustomerReviews.StarRating',
      'Images.Primary.Large',
    ],
    PartnerTag:  AMAZON_ASSOCIATE_TAG,
    PartnerType: 'Associates',
    Marketplace: 'www.amazon.in',
    ItemCount:   10,
  };

  try {
    const { headers, url } = buildSignedRequest(payload);
    const response = await axios.post(url, payload, { headers, timeout: 10000 });
    const items    = response.data?.SearchResult?.Items || [];
    return items.map(normalizeAmazonItem);
  } catch (err) {
    logger.error('Amazon API error:', { message: err.message, status: err.response?.status });
    // Return mock data so the app still works during development
    return getMockData(query);
  }
}

// ── NORMALIZE: Amazon → bestpickr format ─────────────────────────
function normalizeAmazonItem(item) {
  const price   = item.Offers?.Listings?.[0]?.Price?.Amount;
  const reviews = item.CustomerReviews;

  return {
    platform:    'Amazon',
    platformId:  item.ASIN,
    name:        item.ItemInfo?.Title?.DisplayValue || 'Unknown Product',
    brand:       item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue,
    price:       price ? parseFloat(price) : null,
    currency:    'INR',
    rating:      reviews?.StarRating?.Value   ? parseFloat(reviews.StarRating.Value) : null,
    reviewCount: reviews?.Count?.Value        ? parseInt(reviews.Count.Value) : 0,
    imageUrl:    item.Images?.Primary?.Large?.URL,
    url:         item.DetailPageURL,
    affiliateUrl:item.DetailPageURL,  // Already includes associate tag
    inStock:     item.Offers?.Listings?.[0]?.Availability?.Type === 'Now',
    positivePct: null,  // Amazon doesn't give this directly; estimated in scorer
  };
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
  };
  return map[category?.toLowerCase()] || 'All';
}

// ── MOCK DATA (when API keys not available) ───────────────────────
function getMockData(query) {
  logger.info(`Amazon mock data for: "${query}"`);
  return [
    { platform:'Amazon', platformId:'B09XS7JWHH', name:'Sony WH-1000XM5 Wireless Noise Cancelling Headphones', brand:'Sony',   price:24990, rating:4.8, reviewCount:820,  imageUrl:null, url:'https://amazon.in', affiliateUrl:'https://amazon.in', inStock:true, positivePct:84, currency:'INR' },
    { platform:'Amazon', platformId:'B0756CYWWD', name:'Bose QuietComfort 45 Wireless Headphones',             brand:'Bose',   price:26500, rating:4.7, reviewCount:540,  imageUrl:null, url:'https://amazon.in', affiliateUrl:'https://amazon.in', inStock:true, positivePct:79, currency:'INR' },
    { platform:'Amazon', platformId:'B09JQMJHXY', name:'Apple AirPods Max Space Grey',                        brand:'Apple',  price:59900, rating:4.6, reviewCount:1050, imageUrl:null, url:'https://amazon.in', affiliateUrl:'https://amazon.in', inStock:true, positivePct:76, currency:'INR' },
    { platform:'Amazon', platformId:'B09RJHM3YH', name:'Samsung Galaxy Buds 2 Pro Wireless',                  brand:'Samsung',price:14990, rating:4.5, reviewCount:640,  imageUrl:null, url:'https://amazon.in', affiliateUrl:'https://amazon.in', inStock:true, positivePct:71, currency:'INR' },
  ];
}

module.exports = { searchProducts };
