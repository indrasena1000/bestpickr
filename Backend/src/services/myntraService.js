// src/services/myntraService.js — Myntra Web Scraper
// ─────────────────────────────────────────────────────────────────
// Myntra has no public affiliate API, so we scrape respectfully.
//
// HOW IT WORKS:
//   1. Launch a headless browser (Playwright)
//   2. Navigate to Myntra search results page
//   3. Extract product data from the DOM
//   4. Return normalized product array
//
// IMPORTANT: Be respectful with scraping.
//   - Add delays between requests (MYNTRA_SCRAPE_DELAY_MS in .env)
//   - Don't run this in a tight loop
//   - Cache results aggressively
//   - Myntra may update their site structure — update selectors as needed
// ─────────────────────────────────────────────────────────────────
const logger = require('../utils/logger');

const DELAY_MS = parseInt(process.env.MYNTRA_SCRAPE_DELAY_MS) || 1500;

// ── SEARCH PRODUCTS ───────────────────────────────────────────────
async function searchProducts(query, category = '') {
  // For fashion/apparel/footwear queries, Myntra is very relevant
  // For electronics, Myntra has limited inventory — return empty
  if (!isMyntraRelevant(category)) {
    logger.info(`Myntra: skipping for non-fashion category "${category}"`);
    return [];
  }

  try {
    // Playwright is loaded dynamically to avoid startup cost when not needed
    const { chromium } = require('playwright');

    const browser = await chromium.launch({ headless: true });
    const page    = await browser.newPage();

    // Set a real user agent to avoid bot detection
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    });

    const searchUrl = `https://www.myntra.com/${encodeURIComponent(query)}`;
    logger.info(`Myntra scraping: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 15000 });

    // Wait for product cards to load
    await page.waitForSelector('.product-base', { timeout: 8000 }).catch(() => null);

    // Extract product data from DOM
    const products = await page.evaluate(() => {
      const cards   = Array.from(document.querySelectorAll('.product-base')).slice(0, 10);

      return cards.map(card => {
        const nameEl    = card.querySelector('.product-brand');
        const titleEl   = card.querySelector('.product-product');
        const priceEl   = card.querySelector('.product-discountedPrice');
        const ratingEl  = card.querySelector('.product-ratingsCount');
        const ratingNum = card.querySelector('.index-overallRating span');
        const imgEl     = card.querySelector('img.img-responsive');
        const linkEl    = card.closest('a');

        const ratingText = ratingEl?.textContent?.replace(/[(),]/g, '').trim() || '0';
        const countMatch = ratingText.match(/[\d,]+/);

        return {
          brand:       nameEl?.textContent?.trim() || null,
          name:        [nameEl?.textContent?.trim(), titleEl?.textContent?.trim()].filter(Boolean).join(' '),
          price:       priceEl?.textContent?.replace(/[^0-9]/g, '') || null,
          rating:      ratingNum?.textContent?.trim() || null,
          reviewCount: countMatch ? parseInt(countMatch[0].replace(/,/g, '')) : 0,
          imageUrl:    imgEl?.src || null,
          url:         linkEl?.href ? `https://www.myntra.com${linkEl.getAttribute('href')}` : null,
        };
      });
    });

    await browser.close();

    // Polite delay before next request
    await new Promise(r => setTimeout(r, DELAY_MS));

    return products
      .filter(p => p.name && p.price)
      .map(normalizeMyntraItem);

  } catch (err) {
    logger.error('Myntra scrape error:', { message: err.message });
    // Return mock data for development
    return getMockData(query, category);
  }
}

// ── NORMALIZE: Myntra → bestpickr format ──────────────────────────
function normalizeMyntraItem(item) {
  return {
    platform:    'Myntra',
    platformId:  item.url?.split('/')?.slice(-1)?.[0] || `myntra-${Date.now()}`,
    name:        item.name     || 'Unknown Product',
    brand:       item.brand    || null,
    price:       item.price    ? parseFloat(item.price) : null,
    currency:    'INR',
    rating:      item.rating   ? parseFloat(item.rating) : null,
    reviewCount: item.reviewCount || 0,
    imageUrl:    item.imageUrl || null,
    url:         item.url      || 'https://myntra.com',
    affiliateUrl:item.url      || 'https://myntra.com',
    inStock:     true,
    positivePct: null,
  };
}

// ── RELEVANCE CHECK ───────────────────────────────────────────────
// Myntra specializes in fashion, footwear, beauty, accessories
function isMyntraRelevant(category) {
  const myntraCategories = ['footwear', 'fashion', 'skincare', 'beauty', 'accessories', 'clothing'];
  return myntraCategories.includes(category?.toLowerCase());
}

// ── MOCK DATA ─────────────────────────────────────────────────────
function getMockData(query, category) {
  logger.info(`Myntra mock data for: "${query}" in "${category}"`);

  if (category === 'footwear') {
    return [
      { platform:'Myntra', platformId:'MYN001', name:'Nike Air Max 270 Running Shoes',      brand:'Nike',   price:9995,  rating:4.3, reviewCount:2340, imageUrl:null, url:'https://myntra.com', affiliateUrl:'https://myntra.com', inStock:true, positivePct:72, currency:'INR' },
      { platform:'Myntra', platformId:'MYN002', name:'Adidas Ultraboost 22 Running Shoes',  brand:'Adidas', price:14999, rating:4.4, reviewCount:1820, imageUrl:null, url:'https://myntra.com', affiliateUrl:'https://myntra.com', inStock:true, positivePct:74, currency:'INR' },
      { platform:'Myntra', platformId:'MYN003', name:'Puma RS-X Running Sneakers',          brand:'Puma',   price:7999,  rating:4.2, reviewCount:980,  imageUrl:null, url:'https://myntra.com', affiliateUrl:'https://myntra.com', inStock:true, positivePct:70, currency:'INR' },
    ];
  }

  if (category === 'skincare') {
    return [
      { platform:'Myntra', platformId:'MYN010', name:'The Ordinary Niacinamide 10% Serum',  brand:'The Ordinary', price:699,  rating:4.5, reviewCount:5600, imageUrl:null, url:'https://myntra.com', affiliateUrl:'https://myntra.com', inStock:true, positivePct:85, currency:'INR' },
      { platform:'Myntra', platformId:'MYN011', name:'Minimalist SPF 50 Sunscreen',         brand:'Minimalist',   price:399,  rating:4.4, reviewCount:3200, imageUrl:null, url:'https://myntra.com', affiliateUrl:'https://myntra.com', inStock:true, positivePct:82, currency:'INR' },
    ];
  }

  return [];
}

module.exports = { searchProducts };
