// src/services/amazonReviewScraper.js — Amazon India Review Scraper (Rainforest API)
// ─────────────────────────────────────────────────────────────────
// Fetches up to 8 top_reviews per ASIN from Rainforest API's
// type=product endpoint. Used ONLY by the AI analysis pipeline.
//
// WHY Rainforest API (replacing ScraperAPI):
//   ScraperAPI returned HTTP 403 on all amazon.in review pages.
//   Amazon.in now requires authenticated sessions — no generic scraper
//   can bypass this. Rainforest API maintains its own Amazon sessions
//   and returns structured JSON directly.
//
// ARCHITECTURE:
//   Reviews are TEMPORARY. This service is called by the analysis
//   pipeline, which feeds reviews to GPT-4o-mini and then discards
//   the raw text. Raw reviews are NEVER stored in MongoDB.
//
//   Flow: fetchReviews(ASIN)
//         → Rainforest API (3 requests, paginated)
//         → map structured JSON to internal review format
//         → return { reviews[], starDistribution, meta }
//         → AI pipeline consumes and discards
//
// COST:
//   1 request/ASIN = ~$0.01 (Starter plan) or free (200 req/month free tier)
//   Previously: 5 ScraperAPI pages × failing with 403 = $0.00 but 0 reviews
//   Note: type=product returns top_reviews (≤8); paginated review endpoint
//   (type=reviews) is on higher-tier plans only.
//
// AUTH:
//   RAINFOREST_API_KEY from .env
//   Sign up + get key at: https://rainforestapi.com/register
//   Free plan: 200 requests/month (= 200 ASIN analyses)
// ─────────────────────────────────────────────────────────────────
"use strict";

const axios = require("axios");
const logger = require("../utils/logger");

// ── CONFIG ──────────────────────────────────────────────────────
const MAX_PAGES = 1; // type=product returns top_reviews in a single request (≤8 reviews)
const REVIEWS_PER_PAGE = 10; // Threshold for detecting last page (top_reviews returns <10, so we stop after page 1)
const DELAY_BETWEEN_PAGES = 1000; // 1 second between requests
const REQUEST_TIMEOUT = 30000; // 30s (Rainforest is ~2-5s per request)
const API_BASE = "https://api.rainforestapi.com/request";

// ── HELPERS ──────────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── MULTI-KEY ROTATION ────────────────────────────────────────────
// Supports up to 3 Rainforest API keys to triple your free monthly quota.
// Set RAINFOREST_API_KEY, RAINFOREST_API_KEY_2, RAINFOREST_API_KEY_3 in .env
// Keys with exhausted credits are skipped automatically until next month.
//
// Reset: exhausted key state resets at the start of each calendar month (UTC)
// so you don't need to restart the server.

const _exhaustedKeys = new Set(); // keys currently exhausted
let _exhaustedResetMonth = new Date().getUTCMonth();

function _getAllKeys() {
  // Check if it's a new month — reset exhausted list
  const currentMonth = new Date().getUTCMonth();
  if (currentMonth !== _exhaustedResetMonth) {
    _exhaustedKeys.clear();
    _exhaustedResetMonth = currentMonth;
    logger.info(
      "📖 ReviewScraper: new month — Rainforest key exhaustion state reset",
    );
  }

  const keys = [
    process.env.RAINFOREST_API_KEY,
    process.env.RAINFOREST_API_KEY_2,
    process.env.RAINFOREST_API_KEY_3,
  ].filter(Boolean); // only include keys that are actually set

  return keys;
}

function _getActiveKey() {
  const keys = _getAllKeys();
  const active = keys.find((k) => !_exhaustedKeys.has(k));
  return active || null;
}

function _markKeyExhausted(key) {
  _exhaustedKeys.add(key);
  const total = _getAllKeys().length;
  const remaining = total - _exhaustedKeys.size;
  logger.warn(
    `📖 ReviewScraper: key ...${key.slice(-6)} exhausted — ` +
      `${remaining}/${total} key(s) still active`,
  );
}

// ── MAIN EXPORT: FETCH REVIEWS ──────────────────────────────────
/**
 * Fetch and parse Amazon India reviews for a given ASIN via Rainforest API.
 *
 * @param {string} asin — Amazon Standard Identification Number
 * @param {Object} options
 * @param {number} options.maxPages — Override max pages (1-3, default 3)
 * @returns {Object} {
 *   reviews: Array<ReviewObject>,
 *   starDistribution: { 1: n, 2: n, 3: n, 4: n, 5: n },
 *   meta: { asin, totalReviews, totalRatingsCount, overallRating, pagesScraped, ... }
 * }
 */
async function fetchReviews(asin, options = {}) {
  if (!asin || typeof asin !== "string") {
    throw new Error("fetchReviews: valid ASIN string is required");
  }

  const apiKey = _getActiveKey();
  if (!apiKey) {
    const total = _getAllKeys().length;
    if (total === 0) {
      throw new Error(
        "RAINFOREST_API_KEY must be set in .env — sign up at https://rainforestapi.com",
      );
    }
    throw new Error(
      `All ${total} Rainforest API key(s) are exhausted for this month. ` +
        "Add more keys (RAINFOREST_API_KEY_2, _3) or wait for next month.",
    );
  }

  const maxPages = Math.min(
    Math.max(options.maxPages || MAX_PAGES, 1),
    MAX_PAGES,
  );

  const cleanAsin = asin.trim().toUpperCase();
  const startTime = Date.now();
  const keyLabel = `...${apiKey.slice(-6)}`;
  logger.info(
    `📖 ReviewScraper [Rainforest]: starting for ASIN=${cleanAsin} (up to ${maxPages} pages) key=${keyLabel}`,
  );

  const allReviews = [];
  let starDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRatingsCount = null;
  let overallRating = null;
  let pagesScraped = 0;
  let pagesErrored = 0;

  for (let page = 1; page <= maxPages; page++) {
    logger.info(
      `📖 ReviewScraper [Rainforest]: fetching page ${page}/${maxPages} for ASIN=${cleanAsin}`,
    );

    try {
      const params = {
        api_key: apiKey,
        type: "product",
        asin: cleanAsin,
        amazon_domain: "amazon.in",
        reviews_page: page,
      };

      const response = await axios.get(API_BASE, {
        params,
        timeout: REQUEST_TIMEOUT,
      });

      const data = response.data;

      // Verify success
      if (!data?.request_info?.success) {
        const reqInfo = data?.request_info || {};
        const msg = reqInfo.message || "";

        // Detect credit exhaustion — rotate to next key and retry the whole ASIN
        if (
          reqInfo.credits_remaining === 0 ||
          msg.toLowerCase().includes("used up your free credits") ||
          msg.toLowerCase().includes("please consider upgrading")
        ) {
          _markKeyExhausted(apiKey);
          const nextKey = _getActiveKey();
          if (nextKey) {
            logger.info(
              `📖 ReviewScraper [Rainforest]: rotating to next key and retrying ASIN=${cleanAsin}`,
            );
            return fetchReviews(asin, options); // retry with next active key
          }
          // All keys exhausted
          logger.warn(
            `📖 ReviewScraper [Rainforest]: ALL keys exhausted — returning 0 reviews for ${cleanAsin}`,
          );
          break;
        }

        logger.warn(
          `📖 ReviewScraper [Rainforest]: page ${page} unsuccessful — ${JSON.stringify(reqInfo)}`,
        );
        pagesErrored++;
        continue;
      }

      const product = data.product || {};

      // Page 1: extract global stats + star distribution
      if (page === 1) {
        overallRating =
          typeof product.rating === "number"
            ? product.rating
            : typeof product.rating === "string"
              ? parseFloat(product.rating) || null
              : null;

        totalRatingsCount =
          product.ratings_total ?? product.reviews_total ?? null;

        starDistribution = extractStarDistribution(product, totalRatingsCount);

        // No reviews at all — stop immediately
        if (totalRatingsCount === 0) {
          logger.info(
            `📖 ReviewScraper [Rainforest]: ASIN=${cleanAsin} has 0 reviews`,
          );
          break;
        }
      }

      const rawReviews =
        product.top_reviews ||
        product.customer_reviews ||
        product.reviews ||
        [];
      const mappedReviews = rawReviews
        .map((item, i) => mapReview(item, page))
        .filter(Boolean);

      allReviews.push(...mappedReviews);
      pagesScraped++;

      logger.info(
        `📖 ReviewScraper [Rainforest]: page ${page} → ${mappedReviews.length} reviews | ` +
          `running total: ${allReviews.length}`,
      );

      // If fewer than expected reviews returned, we've hit the last page
      if (rawReviews.length < REVIEWS_PER_PAGE) {
        logger.info(
          `📖 ReviewScraper [Rainforest]: page ${page} had ${rawReviews.length} reviews — no more pages`,
        );
        break;
      }

      // Delay between pages (except after last page)
      if (page < maxPages) {
        await sleep(DELAY_BETWEEN_PAGES);
      }
    } catch (err) {
      pagesErrored++;
      const detail = err.response?.data
        ? JSON.stringify(err.response.data)
        : err.message;
      logger.error(
        `📖 ReviewScraper [Rainforest]: page ${page} FAILED — ${detail}`,
      );
      if (page < maxPages) await sleep(DELAY_BETWEEN_PAGES);
    }
  }

  // Fall back to counting from reviews if distribution not found
  if (
    starDistribution[1] === 0 &&
    starDistribution[5] === 0 &&
    allReviews.length > 0
  ) {
    starDistribution = computeDistributionFromReviews(allReviews);
  }

  const verifiedCount = allReviews.filter((r) => r.verifiedPurchase).length;
  const verifiedPct =
    allReviews.length > 0
      ? Math.round((verifiedCount / allReviews.length) * 100)
      : 0;

  logger.info(
    `📖 ReviewScraper [Rainforest]: DONE for ASIN=${cleanAsin} — ` +
      `${allReviews.length} reviews from ${pagesScraped} pages ` +
      `(${pagesErrored} errored) | verified: ${verifiedPct}% | ` +
      `elapsed: ${Date.now() - startTime}ms | ` +
      `stars: 5★=${starDistribution[5]} 4★=${starDistribution[4]} ` +
      `3★=${starDistribution[3]} 2★=${starDistribution[2]} 1★=${starDistribution[1]}`,
  );

  return {
    reviews: allReviews,
    starDistribution,
    meta: {
      asin: cleanAsin,
      totalReviews: allReviews.length,
      totalRatingsCount,
      overallRating,
      verifiedPurchaseCount: verifiedCount,
      verifiedPurchasePct: verifiedPct,
      pagesScraped,
      pagesErrored,
      maxPagesRequested: maxPages,
      scrapedAt: new Date().toISOString(),
      source: "rainforest",
    },
  };
}

// ── REVIEW MAPPER ────────────────────────────────────────────────
/**
 * Map a Rainforest API review item to our internal review format.
 * Rainforest fields: title, rating, body, date, verified_purchase, helpful_votes
 */
function mapReview(item, page) {
  try {
    const title = item.title?.trim() || null;
    const body = item.body?.trim() || null;

    // Skip completely empty reviews
    if (!body && !title) return null;

    // Rating: Rainforest returns integer 1-5
    const starRating =
      typeof item.rating === "number"
        ? item.rating
        : parseFloat(item.rating) || null;

    // Date: Rainforest returns { raw: "Reviewed in India on 15 January 2026" } or a plain string
    let reviewDate = null;
    const dateRaw = typeof item.date === "object" ? item.date?.raw : item.date;
    if (dateRaw) {
      const cleaned = dateRaw
        .replace(/reviewed\s+in\s+\w+\s+on\s+/i, "")
        .trim();
      const parsed = new Date(cleaned);
      if (!isNaN(parsed.getTime())) reviewDate = parsed.toISOString();
    }

    return {
      starRating,
      title,
      body,
      date: reviewDate,
      dateText: dateRaw || null,
      verifiedPurchase: item.verified_purchase === true,
      helpfulVotes:
        typeof item.helpful_votes === "number" ? item.helpful_votes : 0,
      page,
    };
  } catch (err) {
    logger.warn(
      `📖 ReviewScraper [Rainforest]: failed to map review: ${err.message}`,
    );
    return null;
  }
}

// ── STAR DISTRIBUTION EXTRACTOR ──────────────────────────────────
/**
 * Extract star distribution from Rainforest API rating_breakdown.
 * Rainforest returns: { five_star: { percentage: 64, count: 3200 }, ... }
 */
function extractStarDistribution(reviewsResult, totalRatingsCount) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const breakdown = reviewsResult.rating_breakdown || {};

  const starKeys = {
    5: ["five_star", "5_star", "5"],
    4: ["four_star", "4_star", "4"],
    3: ["three_star", "3_star", "3"],
    2: ["two_star", "2_star", "2"],
    1: ["one_star", "1_star", "1"],
  };

  for (const [star, keys] of Object.entries(starKeys)) {
    for (const key of keys) {
      if (breakdown[key]) {
        const entry = breakdown[key];
        // Rainforest gives count directly if available, otherwise compute from percentage
        if (typeof entry.count === "number") {
          dist[star] = entry.count;
        } else if (typeof entry.percentage === "number" && totalRatingsCount) {
          dist[star] = Math.round((entry.percentage / 100) * totalRatingsCount);
        }
        break;
      }
    }
  }

  return dist;
}

module.exports = { fetchReviews };
