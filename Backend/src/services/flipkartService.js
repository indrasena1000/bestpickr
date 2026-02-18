// src/services/flipkartService.js — Flipkart Affiliate API Integration
// ─────────────────────────────────────────────────────────────────
// Uses: Flipkart Affiliate API
// Docs: https://affiliate.flipkart.com/login → My Account → API
//
// HOW IT WORKS:
//   Flipkart Affiliate API returns a feed of products in a category.
//   We filter by keyword client-side since Flipkart's search API
//   is limited. For a production setup, use their full product feed.
// ─────────────────────────────────────────────────────────────────
const axios  = require('axios');
const logger = require('../utils/logger');

const {
  FLIPKART_AFFILIATE_ID,
  FLIPKART_TOKEN,
} = process.env;

const BASE_URL = 'https://affiliate-api.flipkart.net/affiliate/api';

// ── SEARCH PRODUCTS ───────────────────────────────────────────────
/**
 * Search Flipkart for products matching query.
 * Flipkart API structure:
 *   GET /affiliate/api/{affiliateId}/feeds/{category}/json
 *   Headers: Fk-Affiliate-Id, Fk-Affiliate-Token
 */
async function searchProducts(query, category = 'electronics') {
  if (!FLIPKART_AFFILIATE_ID || !FLIPKART_TOKEN) {
    logger.warn('Flipkart API keys not configured — returning mock data');
    return getMockData(query);
  }

  const endpoint = `${BASE_URL}/${FLIPKART_AFFILIATE_ID}/feeds/${mapToFlipkartCategory(category)}/json`;

  try {
    const response = await axios.get(endpoint, {
      headers: {
        'Fk-Affiliate-Id':    FLIPKART_AFFILIATE_ID,
        'Fk-Affiliate-Token': FLIPKART_TOKEN,
      },
      timeout: 10000,
    });

    const allProducts = response.data?.apiGroups?.affiliate?.apiListings || {};
    const productList = Object.values(allProducts);

    // Filter by search query
    const queryWords = query.toLowerCase().split(' ');
    const filtered   = productList.filter(item => {
      const title = (item.productBaseInfoV1?.title || '').toLowerCase();
      return queryWords.some(word => title.includes(word));
    });

    return filtered.slice(0, 10).map(normalizeFlipkartItem);
  } catch (err) {
    logger.error('Flipkart API error:', { message: err.message, status: err.response?.status });
    return getMockData(query);
  }
}

// ── NORMALIZE: Flipkart → bestpickr format ────────────────────────
function normalizeFlipkartItem(item) {
  const info  = item.productBaseInfoV1 || {};
  const offer = item.productBaseInfoV1?.flipkartSpecialPrice || {};

  return {
    platform:    'Flipkart',
    platformId:  info.productId || '',
    name:        info.title     || 'Unknown Product',
    brand:       info.brand     || null,
    price:       info.flipkartSpecialPrice?.amount
               ? parseFloat(info.flipkartSpecialPrice.amount)
               : (info.maximumRetailPrice?.amount ? parseFloat(info.maximumRetailPrice.amount) : null),
    currency:    'INR',
    rating:      info.averageRating ? parseFloat(info.averageRating) : null,
    reviewCount: info.totalReviewCount ? parseInt(info.totalReviewCount) : 0,
    imageUrl:    info.images?.find(i => i.type === 'primary')?.value,
    url:         info.productUrl,
    affiliateUrl:info.productUrl,  // Affiliate tag added via header token
    inStock:     info.inStock !== false,
    positivePct: null,
  };
}

// ── CATEGORY MAPPING ──────────────────────────────────────────────
function mapToFlipkartCategory(category) {
  const map = {
    headphones:  'electronics',
    smartphones: 'mobiles',
    laptops:     'computers',
    gaming:      'gaming',
    footwear:    'footwear',
    skincare:    'beauty-and-personal-care',
    fashion:     'clothing',
    books:       'books',
    appliances:  'kitchen',
  };
  return map[category?.toLowerCase()] || 'electronics';
}

// ── MOCK DATA ─────────────────────────────────────────────────────
function getMockData(query) {
  logger.info(`Flipkart mock data for: "${query}"`);
  return [
    { platform:'Flipkart', platformId:'ACCFK123', name:'Sony WH-1000XM5 Wireless Noise Cancelling Headphones', brand:'Sony',   price:26499, rating:4.7, reviewCount:540, imageUrl:null, url:'https://flipkart.com', affiliateUrl:'https://flipkart.com', inStock:true, positivePct:80, currency:'INR' },
    { platform:'Flipkart', platformId:'ACCFK124', name:'Bose QuietComfort 45 Wireless Headphones',             brand:'Bose',   price:28500, rating:4.6, reviewCount:310, imageUrl:null, url:'https://flipkart.com', affiliateUrl:'https://flipkart.com', inStock:true, positivePct:75, currency:'INR' },
    { platform:'Flipkart', platformId:'ACCFK125', name:'Samsung Galaxy Buds 2 Pro Wireless',                  brand:'Samsung',price:15990, rating:4.4, reviewCount:420, imageUrl:null, url:'https://flipkart.com', affiliateUrl:'https://flipkart.com', inStock:true, positivePct:69, currency:'INR' },
    { platform:'Flipkart', platformId:'ACCFK126', name:'boAt Rockerz 450 Bluetooth On-Ear Headphones',        brand:'boAt',   price:1299,  rating:4.1, reviewCount:8900,imageUrl:null, url:'https://flipkart.com', affiliateUrl:'https://flipkart.com', inStock:true, positivePct:65, currency:'INR' },
  ];
}

module.exports = { searchProducts };
