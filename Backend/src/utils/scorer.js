// src/utils/scorer.js — bestpickr AI Ranking Algorithm
// ─────────────────────────────────────────────────────────────────
// SCORING FORMULA:
//   AI Score (0–10) =
//     Platform Rating Score  × 40%   (normalized star ratings)
//   + Review Sentiment Score × 30%   (% positive reviews)
//   + Value for Money Score  × 15%   (price vs category average)
//   + Review Volume Score    × 15%   (confidence from review count)
//
// Each sub-score is normalized to 0–10 before weighting.
// ─────────────────────────────────────────────────────────────────

const WEIGHTS = {
  platformRating: 0.40,
  sentiment:      0.30,
  valueForMoney:  0.15,
  reviewVolume:   0.15,
};

/**
 * Calculate AI score for a single product across all platforms.
 *
 * @param {Object} productData - Aggregated product data
 * @param {number} productData.avgRating      - Weighted avg star rating (e.g., 4.7)
 * @param {number} productData.totalReviews   - Total review count
 * @param {number} productData.positivePct    - % of positive reviews (0-100)
 * @param {number} productData.lowestPrice    - Best price across platforms
 * @param {number} categoryAvgPrice          - Average price in this category
 * @returns {{ score: number, breakdown: Object }}
 */
function calculateAiScore(productData, categoryAvgPrice = null) {
  // ── 1. PLATFORM RATING SCORE (40%) ──────────────────────────────
  // Normalize: stars are 0–5, we need 0–10
  // A 4.5 star product → 9.0 out of 10 (× 2)
  // Apply a slight penalty for very low review counts (less trust)
  const rawRating = productData.avgRating || 0;
  const ratingScore = (rawRating / 5) * 10;

  // ── 2. SENTIMENT SCORE (30%) ─────────────────────────────────────
  // positive% directly maps to 0–10
  // 90% positive → 9.0, 70% positive → 7.0
  const sentimentScore = ((productData.positivePct || 70) / 100) * 10;

  // ── 3. VALUE FOR MONEY SCORE (15%) ──────────────────────────────
  // Compare product price to category average.
  // If no category avg available, give neutral 7.0
  let valueScore = 7.0;
  if (categoryAvgPrice && productData.lowestPrice) {
    const ratio = productData.lowestPrice / categoryAvgPrice;
    if      (ratio < 0.6) valueScore = 10.0;  // Very cheap vs category → great value
    else if (ratio < 0.8) valueScore = 8.5;
    else if (ratio < 1.0) valueScore = 7.5;
    else if (ratio < 1.2) valueScore = 6.5;
    else if (ratio < 1.5) valueScore = 5.5;
    else                  valueScore = 4.0;   // Very expensive vs category
  }

  // ── 4. REVIEW VOLUME SCORE (15%) ─────────────────────────────────
  // More reviews = more confidence. Uses log scale.
  // 0 reviews → 0,  100 → ~5.0,  1000 → ~7.5,  10000+ → ~10
  const reviews = productData.totalReviews || 0;
  const volumeScore = reviews === 0 ? 0
    : Math.min(10, (Math.log10(reviews + 1) / Math.log10(10001)) * 10);

  // ── FINAL WEIGHTED SCORE ──────────────────────────────────────────
  const finalScore =
    (ratingScore   * WEIGHTS.platformRating) +
    (sentimentScore * WEIGHTS.sentiment)      +
    (valueScore     * WEIGHTS.valueForMoney)  +
    (volumeScore    * WEIGHTS.reviewVolume);

  return {
    score: Math.round(finalScore * 10) / 10,  // e.g., 9.5
    breakdown: {
      ratingScore:    Math.round(ratingScore   * 10) / 10,
      sentimentScore: Math.round(sentimentScore * 10) / 10,
      valueScore:     Math.round(valueScore     * 10) / 10,
      volumeScore:    Math.round(volumeScore    * 10) / 10,
      weights:        WEIGHTS,
    },
  };
}

/**
 * Group platform results for the same physical product.
 * Matches by product name similarity + brand.
 * In production you'd use an ASIN/barcode matching service.
 */
function groupByProduct(allResults) {
  const groups = {};

  for (const item of allResults) {
    // Simple key: lowercase brand + first 4 words of name
    const nameWords = (item.name || '').toLowerCase().split(' ').slice(0, 4).join(' ');
    const brand     = (item.brand || '').toLowerCase().trim();
    const key       = `${brand}__${nameWords}`;

    if (!groups[key]) {
      groups[key] = {
        key,
        name:      item.name,
        brand:     item.brand,
        category:  item.category,
        imageUrl:  item.imageUrl,
        platforms: [],
      };
    }
    groups[key].platforms.push(item);
  }

  return Object.values(groups);
}

/**
 * Aggregate platform data into a single ranked product object.
 */
function aggregateGroup(group, categoryAvgPrice) {
  const platforms = group.platforms;

  // Weighted average rating (weight by review count)
  const totalReviews = platforms.reduce((s, p) => s + (p.reviewCount || 0), 0);
  const weightedRating = totalReviews === 0 ? 0
    : platforms.reduce((s, p) => s + ((p.rating || 0) * (p.reviewCount || 0)), 0) / totalReviews;

  // Best (lowest) price across platforms
  const prices     = platforms.map(p => p.price).filter(Boolean);
  const lowestPrice  = prices.length ? Math.min(...prices) : null;
  const highestPrice = prices.length ? Math.max(...prices) : null;

  // Sentiment: average across platforms (or estimate from rating)
  const positivePct = platforms.reduce((s, p) => s + (p.positivePct || ratingToSentiment(p.rating)), 0)
    / platforms.length;

  const { score, breakdown } = calculateAiScore({
    avgRating:    weightedRating,
    totalReviews,
    positivePct,
    lowestPrice,
  }, categoryAvgPrice);

  return {
    name:        group.name,
    brand:       group.brand,
    category:    group.category,
    imageUrl:    group.imageUrl,
    aiScore:     score,
    breakdown,
    avgRating:   Math.round(weightedRating * 10) / 10,
    totalReviews,
    positivePct: Math.round(positivePct),
    lowestPrice,
    highestPrice,
    platforms: platforms.map(p => ({
      name:       p.platform,
      price:      p.price,
      rating:     p.rating,
      reviewCount:p.reviewCount,
      url:        ensureProductUrl(p.affiliateUrl || p.url, p.platform, group.name),
      inStock:    p.inStock !== false,
    })),
  };
}

/** Estimate sentiment from star rating when we don't have review text */
function ratingToSentiment(rating) {
  if (!rating) return 65;
  if (rating >= 4.5) return 88;
  if (rating >= 4.0) return 78;
  if (rating >= 3.5) return 65;
  if (rating >= 3.0) return 50;
  return 35;
}

/**
 * Safety net: if a URL is just a homepage (no product path), replace it
 * with a search URL so "Buy Now" at least takes the user to relevant results.
 * This catches bad URLs from mock data or failed scraping.
 */
const HOMEPAGE_PATTERNS = [
  /^https?:\/\/(www\.)?flipkart\.com\/?$/i,
  /^https?:\/\/(www\.)?myntra\.com\/?$/i,
  /^https?:\/\/(www\.)?amazon\.(in|com)\/?$/i,
];

function ensureProductUrl(url, platformName, productName) {
  if (!url) return buildSearchUrl(platformName, productName);
  // Check if it's just a homepage with no product path
  for (const pattern of HOMEPAGE_PATTERNS) {
    if (pattern.test(url)) {
      return buildSearchUrl(platformName, productName);
    }
  }
  return url;
}

function buildSearchUrl(platform, productName) {
  const q = encodeURIComponent(productName || '');
  const name = (platform || '').toLowerCase();
  if (name === 'flipkart')  return `https://www.flipkart.com/search?q=${q}`;
  if (name === 'myntra')    return `https://www.myntra.com/${q.replace(/%20/g, '-')}`;
  if (name === 'amazon')    return `https://www.amazon.in/s?k=${q}&tag=bestpickr-21`;
  return `https://www.google.com/search?q=${q}`;
}

module.exports = { calculateAiScore, groupByProduct, aggregateGroup, ensureProductUrl };
