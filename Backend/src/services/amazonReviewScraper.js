// src/services/amazonReviewScraper.js — Amazon India Review Scraper
// ─────────────────────────────────────────────────────────────────
// Fetches up to 50 reviews (5 pages × 10 reviews) from amazon.in
// for a given ASIN. Used ONLY by the AI analysis pipeline.
//
// ARCHITECTURE:
//   Reviews are TEMPORARY. This service is called by the analysis
//   pipeline, which feeds reviews to GPT-4o-mini and then discards
//   the raw text. Raw reviews are NEVER stored in MongoDB.
//
//   Flow: fetchReviews(ASIN)
//         → ScraperAPI (Indian IP)
//         → cheerio parse
//         → return { reviews[], starDistribution, meta }
//         → AI pipeline consumes and discards
//
// COST:
//   5 pages × 1 credit = 5 ScraperAPI credits per ASIN analysis.
//   With 100K monthly credits, that's ~20,000 product analyses/month.
//
// SELECTORS:
//   Amazon review page HTML is relatively stable, but they do A/B test.
//   If reviews return empty, check selectors by inspecting:
//     https://www.amazon.in/product-reviews/{ASIN}
//   Last verified: Feb 2026
// ─────────────────────────────────────────────────────────────────
"use strict";

const cheerio = require("cheerio");
const { fetchViaScraperAPI } = require("../utils/scraperApi");
const logger = require("../utils/logger");

// ── CONFIG ──────────────────────────────────────────────────────
const MAX_PAGES = 5; // 5 pages × 10 reviews = 50 reviews max
const REVIEWS_PER_PAGE = 10; // Amazon shows 10 reviews per page
const DELAY_BETWEEN_PAGES = 2000; // 2 seconds between requests
const REQUEST_TIMEOUT = 30000; // 30s per page (ScraperAPI can be slow)

// ── AMAZON REVIEW PAGE URL BUILDER ──────────────────────────────
// sortBy=recent gives us the freshest reviews — better for analysis.
// filterByStar=all ensures we get the full distribution.
// reviewerType=all_reviews includes both verified and unverified.
function buildReviewUrl(asin, pageNumber = 1) {
  const params = new URLSearchParams({
    ie: "UTF8",
    reviewerType: "all_reviews",
    filterByStar: "all_stars",
    pageNumber: String(pageNumber),
    sortBy: "recent",
  });
  return `https://www.amazon.in/product-reviews/${asin}/?${params.toString()}`;
}

// ── SELECTORS ───────────────────────────────────────────────────
// Amazon review page DOM structure (verified Feb 2026).
// Each review is a div with data-hook="review".
// Update these if amazon.in changes their HTML.
const SEL = {
  // Individual review container
  reviewCard: 'div[data-hook="review"]',

  // Star rating — inside an <i> tag, the text is like "4.0 out of 5 stars"
  starRating:
    'i[data-hook="review-star-rating"] span.a-icon-alt, ' +
    'i[data-hook="cmps-review-star-rating"] span.a-icon-alt',

  // Review title — the bold headline
  title:
    'a[data-hook="review-title"] span:not(.a-letter-space), ' +
    'span[data-hook="review-title"] span:not(.a-letter-space)',

  // Review body text
  body: 'span[data-hook="review-body"] span',

  // Review date — "Reviewed in India on 15 January 2026"
  date: 'span[data-hook="review-date"]',

  // Verified purchase badge
  verified: 'span[data-hook="avp-badge"], ' + 'a[data-hook="avp-badge"]',

  // Helpful votes — "45 people found this helpful"
  helpfulVotes: 'span[data-hook="helpful-vote-statement"]',

  // ── Star distribution (histogram on page 1) ───────────────────
  // The histogram table shows: "5 star  72%", "4 star  15%", etc.
  histogramRow:
    '#histogramTable tr, table[data-hook="review-count-histogram"] tr, ' +
    ".a-histogram-row",

  // Total review count at the top — "4,235 global ratings"
  totalRatings:
    'div[data-hook="total-review-count"] span, ' +
    'span[data-hook="total-review-count"]',

  // Overall star rating at the top — "4.3 out of 5"
  overallRating:
    'span[data-hook="rating-out-of-text"], ' +
    'i[data-hook="average-star-rating"] span.a-icon-alt',
};

// ── MAIN EXPORT: FETCH REVIEWS ──────────────────────────────────
/**
 * Fetch and parse Amazon India reviews for a given ASIN.
 *
 * @param {string} asin — Amazon Standard Identification Number
 * @param {Object} options
 * @param {number} options.maxPages — Override max pages (1-5, default 5)
 * @returns {Object} {
 *   reviews: Array<ReviewObject>,
 *   starDistribution: { 1: n, 2: n, 3: n, 4: n, 5: n },
 *   meta: { asin, totalReviews, overallRating, pagesScraped, ... }
 * }
 */
async function fetchReviews(asin, options = {}) {
  const maxPages = Math.min(
    Math.max(options.maxPages || MAX_PAGES, 1),
    MAX_PAGES,
  );

  if (!asin || typeof asin !== "string") {
    throw new Error("fetchReviews: valid ASIN string is required");
  }

  const cleanAsin = asin.trim().toUpperCase();
  logger.info(
    `📖 ReviewScraper: starting for ASIN=${cleanAsin} (up to ${maxPages} pages)`,
  );

  const allReviews = [];
  let starDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRatingsCount = null;
  let overallRating = null;
  let pagesScraped = 0;
  let pagesErrored = 0;
  let hasMorePages = true;

  for (let page = 1; page <= maxPages && hasMorePages; page++) {
    const url = buildReviewUrl(cleanAsin, page);
    logger.info(
      `📖 ReviewScraper: fetching page ${page}/${maxPages} — ${url.slice(0, 80)}...`,
    );

    try {
      const { data: html, fromCache } = await fetchViaScraperAPI(url, {
        render: false, // Review pages are server-rendered, no JS needed
        timeout: REQUEST_TIMEOUT,
        cacheKey: `amz-reviews:${cleanAsin}:page${page}`,
      });

      if (!html || typeof html !== "string") {
        logger.warn(
          `📖 ReviewScraper: page ${page} returned empty/non-string response`,
        );
        pagesErrored++;
        continue;
      }

      const pageResult = parseReviewPage(html, page);

      // Page 1: extract star distribution histogram + overall stats
      if (page === 1) {
        starDistribution = pageResult.starDistribution;
        totalRatingsCount = pageResult.totalRatingsCount;
        overallRating = pageResult.overallRating;

        // If Amazon says 0 reviews exist, stop immediately
        if (totalRatingsCount !== null && totalRatingsCount === 0) {
          logger.info(
            `📖 ReviewScraper: ASIN=${cleanAsin} has 0 reviews — stopping`,
          );
          hasMorePages = false;
          break;
        }
      }

      allReviews.push(...pageResult.reviews);
      pagesScraped++;

      const cacheLabel = fromCache ? "(cached)" : "(live)";
      logger.info(
        `📖 ReviewScraper: page ${page} → ${pageResult.reviews.length} reviews parsed ${cacheLabel} ` +
          `| running total: ${allReviews.length}`,
      );

      // If this page returned fewer than expected reviews, we've hit the last page
      if (pageResult.reviews.length < REVIEWS_PER_PAGE) {
        logger.info(
          `📖 ReviewScraper: page ${page} had ${pageResult.reviews.length} reviews (<${REVIEWS_PER_PAGE}) — no more pages`,
        );
        hasMorePages = false;
      }

      // Delay between pages to be respectful (except after last page)
      if (page < maxPages && hasMorePages) {
        logger.info(
          `📖 ReviewScraper: waiting ${DELAY_BETWEEN_PAGES}ms before next page...`,
        );
        await sleep(DELAY_BETWEEN_PAGES);
      }
    } catch (err) {
      pagesErrored++;
      logger.error(`📖 ReviewScraper: page ${page} FAILED — ${err.message}`);
      // Continue with remaining pages — don't abort the whole job
      if (page < maxPages) {
        logger.info(
          `📖 ReviewScraper: continuing to page ${page + 1} despite error`,
        );
        await sleep(DELAY_BETWEEN_PAGES);
      }
    }
  }

  // ── Compute star distribution from reviews if histogram wasn't found ──
  if (
    starDistribution[1] === 0 &&
    starDistribution[5] === 0 &&
    allReviews.length > 0
  ) {
    logger.info(
      "📖 ReviewScraper: histogram not found — computing from scraped reviews",
    );
    starDistribution = computeDistributionFromReviews(allReviews);
  }

  // ── Final summary ────────────────────────────────────────────────
  const verifiedCount = allReviews.filter((r) => r.verifiedPurchase).length;
  const verifiedPct =
    allReviews.length > 0
      ? Math.round((verifiedCount / allReviews.length) * 100)
      : 0;

  logger.info(
    `📖 ReviewScraper: DONE for ASIN=${cleanAsin} — ` +
      `${allReviews.length} reviews from ${pagesScraped} pages ` +
      `(${pagesErrored} errored) | ` +
      `verified: ${verifiedPct}% | ` +
      `stars: 5★=${starDistribution[5]} 4★=${starDistribution[4]} ` +
      `3★=${starDistribution[3]} 2★=${starDistribution[2]} 1★=${starDistribution[1]}`,
  );

  return {
    reviews: allReviews,
    starDistribution,
    meta: {
      asin: cleanAsin,
      totalReviews: allReviews.length,
      totalRatingsCount, // Amazon's reported total (may be much higher than 50)
      overallRating, // Amazon's overall star rating (e.g. 4.3)
      verifiedPurchaseCount: verifiedCount,
      verifiedPurchasePct: verifiedPct,
      pagesScraped,
      pagesErrored,
      maxPagesRequested: maxPages,
      scrapedAt: new Date().toISOString(),
    },
  };
}

// ── HTML PARSER ─────────────────────────────────────────────────
/**
 * Parse a single Amazon review page HTML.
 *
 * @param {string} html — Raw HTML from ScraperAPI
 * @param {number} pageNum — Current page number (1-based)
 * @returns {Object} { reviews[], starDistribution, totalRatingsCount, overallRating }
 */
function parseReviewPage(html, pageNum = 1) {
  const $ = cheerio.load(html);
  const reviews = [];

  // ── Parse individual reviews ────────────────────────────────
  $(SEL.reviewCard).each((i, el) => {
    const card = $(el);

    try {
      // Star rating: "4.0 out of 5 stars" → 4
      const ratingText = card.find(SEL.starRating).first().text().trim();
      const starRating = parseStarRating(ratingText);

      // Title: the bold headline of the review
      // Amazon nests the title in multiple spans — grab the meaningful one
      let title = "";
      card.find(SEL.title).each((_, span) => {
        const text = $(span).text().trim();
        if (text && text.length > 1) {
          title = text;
          return false; // break after first meaningful span
        }
      });

      // Body: the main review text
      const body = card.find(SEL.body).first().text().trim();

      // Date: "Reviewed in India on 15 January 2026"
      const dateText = card.find(SEL.date).first().text().trim();
      const reviewDate = parseReviewDate(dateText);

      // Verified purchase badge
      const verifiedText = card
        .find(SEL.verified)
        .first()
        .text()
        .trim()
        .toLowerCase();
      const verifiedPurchase = verifiedText.includes("verified");

      // Helpful votes: "45 people found this helpful" → 45
      const helpfulText = card.find(SEL.helpfulVotes).first().text().trim();
      const helpfulVotes = parseHelpfulVotes(helpfulText);

      // Skip reviews with no content at all (sometimes Amazon includes empty cards)
      if (!body && !title) {
        return; // continue to next review
      }

      reviews.push({
        starRating,
        title: title || null,
        body: body || null,
        date: reviewDate,
        dateText: dateText || null,
        verifiedPurchase,
        helpfulVotes,
        page: pageNum,
      });
    } catch (parseErr) {
      logger.warn(
        `📖 ReviewScraper: failed to parse review #${i + 1} on page ${pageNum}: ${parseErr.message}`,
      );
      // Skip this review, continue with others
    }
  });

  // ── Parse star distribution histogram (page 1 only) ─────────
  let starDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRatingsCount = null;
  let overallRating = null;

  if (pageNum === 1) {
    starDistribution = parseStarHistogram($);
    totalRatingsCount = parseTotalRatings($);
    overallRating = parseOverallRating($);
  }

  return { reviews, starDistribution, totalRatingsCount, overallRating };
}

// ── PARSING HELPERS ─────────────────────────────────────────────

/**
 * Parse "4.0 out of 5 stars" → 4
 * Also handles: "5.0 out of 5 stars", "3.0 out of 5 stars"
 */
function parseStarRating(text) {
  if (!text) return null;
  // Match the first decimal number
  const match = text.match(/(\d+(?:\.\d+)?)\s*out\s*of/i);
  if (match) {
    const rating = parseFloat(match[1]);
    return rating >= 1 && rating <= 5 ? rating : null;
  }
  // Fallback: just grab first number
  const numMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const rating = parseFloat(numMatch[1]);
    return rating >= 1 && rating <= 5 ? rating : null;
  }
  return null;
}

/**
 * Parse "Reviewed in India on 15 January 2026" → Date object
 * Also handles: "Reviewed in India on January 15, 2026"
 */
function parseReviewDate(text) {
  if (!text) return null;
  // Remove the "Reviewed in India on " prefix
  const cleaned = text.replace(/reviewed\s+in\s+\w+\s+on\s+/i, "").trim();
  try {
    const date = new Date(cleaned);
    // Validate the date is reasonable (not NaN, not before Amazon existed)
    if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) {
      return date.toISOString();
    }
  } catch {
    // Fall through
  }
  return null;
}

/**
 * Parse "45 people found this helpful" → 45
 * Also handles: "One person found this helpful" → 1
 */
function parseHelpfulVotes(text) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  if (lower.includes("one person")) return 1;
  const match = text.match(/([\d,]+)\s*(?:people|person)/i);
  if (match) {
    return parseInt(match[1].replace(/,/g, ""), 10) || 0;
  }
  return 0;
}

/**
 * Parse the star distribution histogram from page 1.
 * Amazon shows a table/bar chart:
 *   5 star  72%
 *   4 star  15%
 *   3 star   6%
 *   2 star   3%
 *   1 star   4%
 *
 * We convert percentages to approximate counts using totalRatingsCount.
 */
function parseStarHistogram($) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const percentages = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  // Strategy 1: Parse histogram rows
  $(SEL.histogramRow).each((_, row) => {
    const rowText = $(row).text().trim();
    // Match patterns like "5 star  72%" or "5 star 72 %"
    const match = rowText.match(/(\d)\s*star[s]?\s+(\d+)\s*%/i);
    if (match) {
      const star = parseInt(match[1], 10);
      const pct = parseInt(match[2], 10);
      if (star >= 1 && star <= 5 && pct >= 0 && pct <= 100) {
        percentages[star] = pct;
      }
    }
  });

  // Strategy 2: Look for aria-labels on histogram bars
  if (Object.values(percentages).every((v) => v === 0)) {
    $('a[title*="star"], a[aria-label*="star"]').each((_, el) => {
      const label = $(el).attr("title") || $(el).attr("aria-label") || "";
      // "5 stars represent 72% of rating"
      const match = label.match(/(\d)\s*star[s]?\s*represent[s]?\s*(\d+)\s*%/i);
      if (match) {
        const star = parseInt(match[1], 10);
        const pct = parseInt(match[2], 10);
        if (star >= 1 && star <= 5) {
          percentages[star] = pct;
        }
      }
    });
  }

  // Convert percentages to counts (or use percentages directly if no total)
  // The AI pipeline can work with either — it mainly needs the ratio
  const hasPercentages = Object.values(percentages).some((v) => v > 0);

  if (hasPercentages) {
    // Try to get total count for converting % → absolute numbers
    const totalText = $(
      'div[data-hook="total-review-count"] span, span[data-hook="total-review-count"]',
    )
      .first()
      .text();
    const totalMatch = totalText.match(/([\d,]+)/);
    const total = totalMatch
      ? parseInt(totalMatch[1].replace(/,/g, ""), 10)
      : 0;

    for (const star of [1, 2, 3, 4, 5]) {
      if (total > 0) {
        distribution[star] = Math.round((percentages[star] / 100) * total);
      } else {
        // No total count — store percentages as-is (the AI can still use ratios)
        distribution[star] = percentages[star];
      }
    }
  }

  return distribution;
}

/**
 * Parse total ratings count: "4,235 global ratings" → 4235
 */
function parseTotalRatings($) {
  const text = $(SEL.totalRatings).first().text().trim();
  if (!text) return null;
  const match = text.match(/([\d,]+)\s*(global\s*)?rating/i);
  if (match) {
    return parseInt(match[1].replace(/,/g, ""), 10) || null;
  }
  // Fallback: just grab any number
  const numMatch = text.match(/([\d,]+)/);
  if (numMatch) {
    return parseInt(numMatch[1].replace(/,/g, ""), 10) || null;
  }
  return null;
}

/**
 * Parse overall rating: "4.3 out of 5" → 4.3
 */
function parseOverallRating($) {
  const text = $(SEL.overallRating).first().text().trim();
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s*out\s*of\s*5/i);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

/**
 * Compute star distribution from the scraped reviews themselves
 * (fallback when the histogram isn't parseable).
 */
function computeDistributionFromReviews(reviews) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const review of reviews) {
    const star = Math.round(review.starRating);
    if (star >= 1 && star <= 5) {
      dist[star]++;
    }
  }
  return dist;
}

// ── UTILITY ─────────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── EXPORTS ─────────────────────────────────────────────────────
module.exports = {
  fetchReviews,
  // Exported for testing / direct use
  buildReviewUrl,
  parseReviewPage,
};
