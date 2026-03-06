// src/utils/scorer.js — bestpickr AI Ranking Algorithm
// ─────────────────────────────────────────────────────────────────
// SCORING FORMULA:
//   AI Score (0–10) =
//     Platform Rating Score  × 35%   (normalized star ratings)
//   + Review Sentiment Score × 25%   (% positive reviews)
//   + Value for Money Score  × 15%   (price vs category average)
//   + Review Volume Score    × 15%   (confidence from review count)
//   + Freshness Score        × 10%   (how recently the product was indexed)
//
// Each sub-score is normalized to 0–10 before weighting.
// ─────────────────────────────────────────────────────────────────

const WEIGHTS = {
  platformRating: 0.35, // slightly reduced to make room for freshness
  sentiment: 0.25, // slightly reduced
  valueForMoney: 0.15,
  reviewVolume: 0.15,
  freshness: 0.1, // new: prefer recently-indexed products
};

/**
 * Freshness score: products indexed/refreshed recently score higher.
 * Avoids surfacing discontinued or stale-priced products.
 *
 * @param {Date|string|null} lastUpdated
 * @returns {number} 0–10
 */
function computeFreshnessScore(lastUpdated) {
  if (!lastUpdated) return 7.0; // neutral when unknown (live-fetched products)
  const daysOld = (Date.now() - new Date(lastUpdated).getTime()) / 86_400_000;
  if (daysOld < 0) return 10.0; // clock skew guard
  if (daysOld < 30) return 10.0; // indexed within 30 days — fully fresh
  if (daysOld < 90) return 7.5; // 1–3 months
  if (daysOld < 180) return 5.5; // 3–6 months
  if (daysOld < 365) return 4.0; // 6–12 months
  return 2.5; // over a year old
}

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
  // ── 1. PLATFORM RATING SCORE (35%) ──────────────────────────────
  // Normalize: stars are 0–5, we need 0–10
  const rawRating = productData.avgRating || 0;
  const ratingScore = (rawRating / 5) * 10;

  // ── 2. SENTIMENT SCORE (25%) ─────────────────────────────────────
  // positive% directly maps to 0–10
  // 90% positive → 9.0, 70% positive → 7.0
  const sentimentScore = ((productData.positivePct || 70) / 100) * 10;

  // ── 3. VALUE FOR MONEY SCORE (15%) ──────────────────────────────
  // Compare product price to category average.
  // If no category avg available, give neutral 7.0
  let valueScore = 7.0;
  if (categoryAvgPrice && productData.lowestPrice) {
    const ratio = productData.lowestPrice / categoryAvgPrice;
    if (ratio < 0.6)
      valueScore = 10.0; // Very cheap vs category → great value
    else if (ratio < 0.8) valueScore = 8.5;
    else if (ratio < 1.0) valueScore = 7.5;
    else if (ratio < 1.2) valueScore = 6.5;
    else if (ratio < 1.5) valueScore = 5.5;
    else valueScore = 4.0; // Very expensive vs category
  }

  // ── 4. REVIEW VOLUME SCORE (15%) ─────────────────────────────────
  // More reviews = more confidence. Uses log scale.
  // 0 reviews → 0,  100 → ~5.0,  1000 → ~7.5,  10000+ → ~10
  const reviews = productData.totalReviews || 0;
  const volumeScore =
    reviews === 0
      ? 0
      : Math.min(10, (Math.log10(reviews + 1) / Math.log10(10001)) * 10);

  // ── 5. FRESHNESS SCORE (10%) ──────────────────────────────────────
  // Prefer recently-indexed products. Avoids surfacing discontinued items.
  // Live-fetched products (no lastUpdated) get a neutral 7.0.
  const freshnessScore = computeFreshnessScore(productData.lastUpdated);

  // ── FINAL WEIGHTED SCORE ──────────────────────────────────────────
  const finalScore =
    ratingScore * WEIGHTS.platformRating +
    sentimentScore * WEIGHTS.sentiment +
    valueScore * WEIGHTS.valueForMoney +
    volumeScore * WEIGHTS.reviewVolume +
    freshnessScore * WEIGHTS.freshness;

  return {
    score: Math.round(finalScore * 10) / 10, // e.g., 9.5
    breakdown: {
      ratingScore: Math.round(ratingScore * 10) / 10,
      sentimentScore: Math.round(sentimentScore * 10) / 10,
      valueScore: Math.round(valueScore * 10) / 10,
      volumeScore: Math.round(volumeScore * 10) / 10,
      freshnessScore: Math.round(freshnessScore * 10) / 10,
      weights: WEIGHTS,
    },
  };
}

/**
 * Group platform results for the same physical product.
 *
 * Strategy:
 *   1. ASIN-first: Amazon ASIN is a universal product ID. When available,
 *      use it directly — prevents false splits when the same product has
 *      different names across platforms (e.g. "WH-1000XM5" vs "WH 1000XM5").
 *   2. Normalized name key: strip punctuation/hyphens before comparing
 *      so "Galaxy S24+" and "Galaxy S24 Plus" collapse to the same group.
 */
function groupByProduct(allResults) {
  const groups = {};

  for (const item of allResults) {
    // ASIN-first: if Amazon returned an ASIN, use it as the canonical key.
    const asin =
      item.asin ||
      (item.platform === "Amazon" || item.platform === "AMAZON"
        ? item.platformId
        : null);

    // Normalize name: strip hyphens/dots/brackets so variant spellings merge.
    // "WH-1000XM5" → "wh 1000xm5", "Galaxy S24+" → "galaxy s24"
    const normalizedName = (item.name || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ") // strip punctuation
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 5) // use up to 5 words (was 4)
      .join(" ");

    const brand = (item.brand || "").toLowerCase().trim();
    const key = asin || `${brand}__${normalizedName}`;

    if (!groups[key]) {
      groups[key] = {
        key,
        name: item.name,
        brand: item.brand,
        category: item.category,
        imageUrl: item.imageUrl,
        asin: asin || null,
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
  const weightedRating =
    totalReviews === 0
      ? 0
      : platforms.reduce(
          (s, p) => s + (p.rating || 0) * (p.reviewCount || 0),
          0,
        ) / totalReviews;

  // Best (lowest) price across platforms
  const prices = platforms.map((p) => p.price).filter(Boolean);
  const lowestPrice = prices.length ? Math.min(...prices) : null;
  const highestPrice = prices.length ? Math.max(...prices) : null;

  // Sentiment: average across platforms (or estimate from rating)
  const positivePct =
    platforms.reduce(
      (s, p) => s + (p.positivePct || ratingToSentiment(p.rating)),
      0,
    ) / platforms.length;

  // Freshness: most recent lastSeen/updatedAt across all platforms.
  // Live-fetched products won't have this, so it defaults to neutral in calculateAiScore.
  const mostRecentSeen =
    platforms
      .map((p) => p.lastSeen || p.updatedAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null;

  const { score, breakdown } = calculateAiScore(
    {
      avgRating: weightedRating,
      totalReviews,
      positivePct,
      lowestPrice,
      lastUpdated: mostRecentSeen,
    },
    categoryAvgPrice,
  );

  return {
    name: group.name,
    brand: group.brand,
    asin: group.asin || null,
    category: group.category,
    imageUrl: group.imageUrl,
    aiScore: score,
    breakdown,
    avgRating: Math.round(weightedRating * 10) / 10,
    totalReviews,
    positivePct: Math.round(positivePct),
    lowestPrice,
    highestPrice,
    platforms: platforms.map((p) => ({
      name: p.platform,
      price: p.price,
      rating: p.rating,
      reviewCount: p.reviewCount,
      url: ensureProductUrl(p.affiliateUrl || p.url, p.platform, group.name),
      inStock: p.inStock !== false,
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
  const q = encodeURIComponent(productName || "");
  const name = (platform || "").toLowerCase();
  if (name === "flipkart") return `https://www.flipkart.com/search?q=${q}`;
  if (name === "myntra")
    return `https://www.myntra.com/${q.replace(/%20/g, "-")}`;
  if (name === "amazon")
    return `https://www.amazon.in/s?k=${q}&tag=bestpickr-21`;
  return `https://www.google.com/search?q=${q}`;
}

module.exports = {
  calculateAiScore,
  groupByProduct,
  aggregateGroup,
  ensureProductUrl,
};
