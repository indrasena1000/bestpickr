// src/pipeline/analysisPipeline.js — Product Analysis Orchestrator
// ─────────────────────────────────────────────────────────────────
// THE CENTRAL NERVE OF BESTPICKR'S AI SYSTEM.
//
// Orchestrates the full analysis flow for a single product:
//   MongoDB check → review scrape → authenticity → AI analysis
//   → score → save to MongoDB → cache in Redis → respond
//
// CALLED IN TWO SCENARIOS:
//   1. Cache miss during user search (real-time, latency matters)
//   2. Nightly cron job refresh (background, can be slower)
//
// DEPENDENCIES (all previously built):
//   amazonReviewScraper    → Fetches 50 reviews from amazon.in
//   reviewAuthenticityService → Statistical fake review detection
//   aiAnalysisService      → GPT-4o-mini review analysis
//   models/index.js        → ProductAnalysis + ProductListing Mongoose models
//   redis.js               → Speed layer caching
//
// COST PER PRODUCT:
//   ScraperAPI: ~5 credits (5 review pages)
//   OpenAI:     ~$0.002 (GPT-4o-mini, ~2000 tokens)
//   Total:      ~$0.003 per product analysis
// ─────────────────────────────────────────────────────────────────
"use strict";

const { fetchReviews } = require("../services/amazonReviewScraper");
const { analyzeProduct } = require("../services/aiAnalysisService");
const { ProductAnalysis, ProductListing } = require("../models");
const { getClient: getRedis } = require("../utils/redis");
const logger = require("../utils/logger");

// ── CONFIG ──────────────────────────────────────────────────────
const ANALYSIS_CACHE_TTL = 24 * 60 * 60; // 24 hours in Redis
const ANALYSIS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in MongoDB
const REVIEW_JUMP_THRESHOLD = 100; // Re-analyze when +100 reviews
const REDIS_KEY_PREFIX = "bestpickr:analysis"; // Matches existing key convention

// ═════════════════════════════════════════════════════════════════
// MAIN EXPORT: runAnalysisPipeline()
// ═════════════════════════════════════════════════════════════════
/**
 * Run the full analysis pipeline for a product.
 *
 * @param {string} asin         — Amazon ASIN
 * @param {string} productName  — e.g. "Sony WH-1000XM5"
 * @param {string} category     — Category slug e.g. "headphones"
 * @param {Object} options
 * @param {number} options.currentReviewCount — Known review count (from PA-API), avoids extra lookup
 * @param {boolean} options.forceRefresh      — Skip freshness check, force re-analysis
 * @param {string} options.brand              — Product brand for MongoDB record
 * @returns {Object|null} Analysis result or null on total failure
 */
async function runAnalysisPipeline(asin, productName, category, options = {}) {
  const pipelineStart = Date.now();
  const cleanAsin = asin.trim().toUpperCase();
  const {
    currentReviewCount = null,
    forceRefresh = false,
    brand = null,
  } = options;

  logger.info(
    `🔬 Pipeline: START asin=${cleanAsin} product="${productName}" ` +
      `category=${category} force=${forceRefresh}`,
  );

  try {
    // ── STEP 1: Check existing analysis freshness ───────────────
    const step1Start = Date.now();
    logger.info(`🔬 Pipeline [1/7]: checking MongoDB for existing analysis`);

    const existing = await getExistingAnalysis(cleanAsin);

    if (existing && !forceRefresh) {
      const fresh = !shouldReanalyze(existing, currentReviewCount);

      if (fresh) {
        // Try returning from Redis first (faster), fall back to MongoDB doc
        const cached = await getAnalysisFromRedis(cleanAsin);
        const source = cached ? "Redis" : "MongoDB";
        const result = cached || mongoDocToResult(existing);

        const elapsed = Date.now() - pipelineStart;
        logger.info(
          `🔬 Pipeline: FRESH analysis found in ${source} — ` +
            `aiScore=${result.aiScore} age=${daysSince(existing.analysisDate)}d ` +
            `(${elapsed}ms total)`,
        );

        return { ...result, _pipelineMeta: { source, fresh: true, elapsed } };
      }

      logger.info(
        `🔬 Pipeline [1/7]: existing analysis is STALE — ` +
          `age=${daysSince(existing.analysisDate)}d ` +
          `reviews=${existing.reviewsAnalyzed} → re-analyzing ` +
          `(${Date.now() - step1Start}ms)`,
      );
    } else if (!existing) {
      logger.info(
        `🔬 Pipeline [1/7]: no existing analysis found — first time for this ASIN (${Date.now() - step1Start}ms)`,
      );
    } else {
      logger.info(
        `🔬 Pipeline [1/7]: forceRefresh=true — skipping freshness check (${Date.now() - step1Start}ms)`,
      );
    }

    // ── STEP 2: Fetch reviews from Amazon India ─────────────────
    const step2Start = Date.now();
    logger.info(`🔬 Pipeline [2/7]: scraping reviews from amazon.in`);

    let reviewData;
    try {
      reviewData = await fetchReviews(cleanAsin);
    } catch (scrapeErr) {
      logger.error(
        `🔬 Pipeline [2/7]: review scrape FAILED — ${scrapeErr.message} (${Date.now() - step2Start}ms)`,
      );

      // Scrape failed — return existing analysis if we have one
      if (existing) {
        logger.info(
          `🔬 Pipeline: returning STALE analysis as fallback (scrape failed)`,
        );
        const fallback = mongoDocToResult(existing);
        return {
          ...fallback,
          _pipelineMeta: {
            source: "MongoDB-fallback",
            fresh: false,
            error: `Review scrape failed: ${scrapeErr.message}`,
            elapsed: Date.now() - pipelineStart,
          },
        };
      }

      // No existing analysis + scrape failed = total failure
      logger.error(
        `🔬 Pipeline: TOTAL FAILURE — no existing analysis and scrape failed`,
      );
      return null;
    }

    const { reviews, starDistribution, meta: reviewMeta } = reviewData;
    logger.info(
      `🔬 Pipeline [2/7]: scraped ${reviews.length} reviews ` +
        `(overall=${reviewMeta.overallRating}/5, ` +
        `verified=${reviewMeta.verifiedPurchasePct}%, ` +
        `pages=${reviewMeta.pagesScraped}) (${Date.now() - step2Start}ms)`,
    );

    // Edge case: 0 reviews scraped but product exists
    if (reviews.length === 0) {
      logger.warn(`🔬 Pipeline: 0 reviews scraped — returning minimal result`);

      if (existing) {
        const fallback = mongoDocToResult(existing);
        return {
          ...fallback,
          _pipelineMeta: {
            source: "MongoDB-fallback",
            fresh: false,
            reason: "zero-reviews",
            elapsed: Date.now() - pipelineStart,
          },
        };
      }

      return buildMinimalResult(
        cleanAsin,
        productName,
        category,
        starDistribution,
      );
    }

    // ── STEP 3: Run AI analysis (includes authenticity check) ───
    // analyzeProduct() internally runs:
    //   Step 3a: checkReviewAuthenticity (statistical, fast)
    //   Step 3b: buildPrompt (category-aware, dynamic)
    //   Step 3c: callGPT (GPT-4o-mini, JSON mode)
    //   Step 3d: calculateFinalScore (weighted formula)
    const step3Start = Date.now();
    logger.info(`🔬 Pipeline [3/7]: running AI analysis (GPT-4o-mini)`);

    const analysis = await analyzeProduct(
      reviews,
      productName,
      category,
      starDistribution,
    );

    if (!analysis) {
      logger.error(
        `🔬 Pipeline [3/7]: AI analysis returned null (${Date.now() - step3Start}ms)`,
      );

      if (existing) {
        logger.info(
          `🔬 Pipeline: returning STALE analysis as fallback (AI failed)`,
        );
        const fallback = mongoDocToResult(existing);
        return {
          ...fallback,
          _pipelineMeta: {
            source: "MongoDB-fallback",
            fresh: false,
            error: "AI analysis failed",
            elapsed: Date.now() - pipelineStart,
          },
        };
      }

      return null;
    }

    logger.info(
      `🔬 Pipeline [3/7]: AI analysis complete — aiScore=${analysis.aiScore} ` +
        `badge=${analysis.authenticityBadge} confidence=${analysis.confidenceLevel} ` +
        `(${Date.now() - step3Start}ms)`,
    );

    // Reviews are now consumed by the AI — they will NOT be saved or returned.
    // This is the point of discard per architecture rules.

    // ── STEP 4: Save to MongoDB (upsert by ASIN) ───────────────
    const step4Start = Date.now();
    logger.info(`🔬 Pipeline [4/7]: saving analysis to MongoDB`);

    const savedDoc = await saveAnalysisToMongo(
      cleanAsin,
      productName,
      category,
      brand,
      analysis,
    );

    if (savedDoc) {
      logger.info(
        `🔬 Pipeline [4/7]: MongoDB upsert complete (${Date.now() - step4Start}ms)`,
      );
    } else {
      logger.warn(
        `🔬 Pipeline [4/7]: MongoDB save failed — analysis still returned but not persisted`,
      );
    }

    // ── STEP 5: Cache in Redis (24h TTL) ────────────────────────
    const step5Start = Date.now();
    logger.info(`🔬 Pipeline [5/7]: caching analysis in Redis`);

    await cacheAnalysisInRedis(cleanAsin, analysis);
    logger.info(
      `🔬 Pipeline [5/7]: Redis cache set (${Date.now() - step5Start}ms)`,
    );

    // ── STEP 6: Build final result ──────────────────────────────
    const elapsed = Date.now() - pipelineStart;
    logger.info(`🔬 Pipeline [6/7]: assembling response`);

    const result = {
      ...analysis,
      _pipelineMeta: {
        source: "fresh-analysis",
        fresh: true,
        elapsed,
        reviewsScraped: reviews.length,
        amazonTotalRatings: reviewMeta.totalRatingsCount,
        pagesScraped: reviewMeta.pagesScraped,
      },
    };

    // ── STEP 7: Done ────────────────────────────────────────────
    logger.info(
      `🔬 Pipeline: COMPLETE for ${cleanAsin} "${productName}" — ` +
        `aiScore=${analysis.aiScore} | badge=${analysis.authenticityBadge} | ` +
        `${reviews.length} reviews analyzed | ${elapsed}ms total`,
    );

    return result;
  } catch (err) {
    const elapsed = Date.now() - pipelineStart;
    logger.error(
      `🔬 Pipeline: UNHANDLED ERROR for ${cleanAsin} — ${err.message} (${elapsed}ms)`,
    );
    logger.error(
      `🔬 Pipeline: stack: ${err.stack?.split("\n").slice(1, 4).join(" | ")}`,
    );

    // Last resort: try returning stale analysis
    try {
      const fallback = await getExistingAnalysis(cleanAsin);
      if (fallback) {
        logger.info(
          `🔬 Pipeline: returning STALE fallback after unhandled error`,
        );
        return {
          ...mongoDocToResult(fallback),
          _pipelineMeta: {
            source: "MongoDB-fallback",
            fresh: false,
            error: err.message,
            elapsed,
          },
        };
      }
    } catch {
      // Give up
    }

    return null;
  }
}

// ═════════════════════════════════════════════════════════════════
// HELPER: shouldReanalyze()
// ═════════════════════════════════════════════════════════════════
/**
 * Determine if an existing analysis should be refreshed.
 *
 * Returns true if:
 *   - No existing analysis (null)
 *   - Analysis older than 7 days
 *   - Review count increased by 100+ since last analysis
 *   - Previous confidence was 'low' (we can probably do better now)
 *
 * @param {Object} existingAnalysis — Mongoose document or plain object
 * @param {number|null} currentReviewCount — Known current review count
 * @returns {boolean}
 */
function shouldReanalyze(existingAnalysis, currentReviewCount = null) {
  // No existing = definitely analyze
  if (!existingAnalysis) return true;

  // Check age: 7+ days old
  const analysisDate = existingAnalysis.analysisDate;
  if (!analysisDate) return true;

  const ageMs = Date.now() - new Date(analysisDate).getTime();
  if (ageMs > ANALYSIS_MAX_AGE_MS) {
    logger.info(
      `🔬 shouldReanalyze: analysis is ${daysSince(analysisDate)}d old (>7d threshold)`,
    );
    return true;
  }

  // Check review count jump: +100 new reviews
  if (currentReviewCount !== null && existingAnalysis.reviewsAnalyzed) {
    const delta = currentReviewCount - existingAnalysis.reviewsAnalyzed;
    if (delta >= REVIEW_JUMP_THRESHOLD) {
      logger.info(
        `🔬 shouldReanalyze: review count jumped +${delta} ` +
          `(${existingAnalysis.reviewsAnalyzed} → ${currentReviewCount})`,
      );
      return true;
    }
  }

  // Check confidence: 'low' confidence = worth retrying
  if (existingAnalysis.confidenceLevel === "low") {
    logger.info(`🔬 shouldReanalyze: previous confidence was 'low' — retrying`);
    return true;
  }

  return false;
}

// ═════════════════════════════════════════════════════════════════
// HELPER: buildProductResponse()
// ═════════════════════════════════════════════════════════════════
/**
 * Combine ProductListing + ProductAnalysis into a clean API response.
 * This is the final shape the React frontend receives.
 *
 * Includes: product details, AI score, aspects, price comparison, buy links
 * Excludes: MongoDB _id, __v, internal flags, raw pipeline metadata
 *
 * @param {Object} listing  — ProductListing Mongoose document or plain object
 * @param {Object} analysis — ProductAnalysis Mongoose document, pipeline result, or null
 * @returns {Object} — Clean API response
 */
function buildProductResponse(listing, analysis) {
  if (!listing) return null;

  // Convert Mongoose doc to plain object if needed
  const l = listing.toObject ? listing.toObject() : { ...listing };
  const a = analysis
    ? analysis.toObject
      ? analysis.toObject()
      : { ...analysis }
    : null;

  // ── Price comparison ────────────────────────────────────────
  const platforms = [];
  if (l.amazonPrice) {
    platforms.push({
      name: "Amazon",
      price: l.amazonPrice,
      url: l.amazonUrl || null,
      isBestPrice: l.bestPlatform === "amazon",
    });
  }
  if (l.flipkartPrice) {
    platforms.push({
      name: "Flipkart",
      price: l.flipkartPrice,
      url: l.flipkartUrl || null,
      isBestPrice: l.bestPlatform === "flipkart",
    });
  }
  if (l.myntraPrice) {
    platforms.push({
      name: "Myntra",
      price: l.myntraPrice,
      url: l.myntraUrl || null,
      isBestPrice: l.bestPlatform === "myntra",
    });
  }

  // Sort platforms: best price first
  platforms.sort((x, y) => x.price - y.price);

  // ── Price history (last 30 entries for chart) ───────────────
  const priceHistory = (l.priceHistory || []).slice(-30).map((entry) => ({
    price: entry.price,
    date: entry.date,
    platform: entry.platform,
  }));

  // ── Aspect scores: convert Map to plain object if needed ────
  let aspectScores = {};
  if (a?.aspectScores) {
    if (a.aspectScores instanceof Map) {
      aspectScores = Object.fromEntries(a.aspectScores);
    } else if (typeof a.aspectScores === "object") {
      aspectScores = { ...a.aspectScores };
    }
  }

  // ── Build response ──────────────────────────────────────────
  const response = {
    // Product identity
    asin: l.asin,
    title: l.title,
    brand: l.brand || null,
    category: l.category || null,
    imageUrl: l.imageUrl || null,
    inStock: l.inStock !== false,

    // Pricing
    bestPrice: l.bestPrice || null,
    bestPlatform: l.bestPlatform || null,
    platforms,
    priceSavings:
      platforms.length >= 2
        ? platforms[platforms.length - 1].price - platforms[0].price
        : 0,
    priceHistory,

    // Amazon stats
    amazonRating: l.amazonRating || null,
    amazonReviewCount: l.amazonReviewCount || 0,

    // AI Analysis (null if never analyzed)
    aiScore: a?.aiScore ?? null,
    confidenceLevel: a?.confidenceLevel || null,
    aspectScores,
    overallSentiment: a?.overallSentiment || null,

    // AI insights
    whatPeopleLove: a?.whatPeopleLove || [],
    commonComplaints: a?.commonComplaints || [],
    redFlags: a?.redFlags || [],
    buyRecommendation: a?.buyRecommendation || null,
    avoidIf: a?.avoidIf || null,

    // Authenticity
    authenticityBadge: a?.authenticityBadge || null,

    // Metadata
    reviewsAnalyzed: a?.reviewsAnalyzed || 0,
    analysisDate: a?.analysisDate || null,
    lastPriceUpdate: l.lastPriceUpdate || null,
  };

  return response;
}

// ═════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═════════════════════════════════════════════════════════════════

// ── MongoDB: Get existing analysis ──────────────────────────────
async function getExistingAnalysis(asin) {
  try {
    const doc = await ProductAnalysis.findOne({ asin }).lean().exec();
    return doc;
  } catch (err) {
    logger.error(
      `🔬 Pipeline: MongoDB lookup failed for ${asin} — ${err.message}`,
    );
    return null;
  }
}

// ── MongoDB: Save / upsert analysis ─────────────────────────────
async function saveAnalysisToMongo(
  asin,
  productName,
  category,
  brand,
  analysis,
) {
  try {
    const updateData = {
      asin,
      productName,
      category: category?.toLowerCase() || null,
      brand: brand || null,

      // AI scores
      aiScore: analysis.aiScore,
      aspectScores: analysis.aspectScores || {},

      // Sentiment
      overallSentiment: analysis.overallSentiment || {},

      // Insights
      whatPeopleLove: analysis.whatPeopleLove || [],
      commonComplaints: analysis.commonComplaints || [],
      redFlags: analysis.redFlags || [],
      buyRecommendation: analysis.buyRecommendation || null,
      avoidIf: analysis.avoidIf || null,

      // Authenticity
      authenticityBadge: analysis.authenticityBadge || "medium",
      authenticityFlags: analysis.authenticityFlags || [],

      // Metadata
      reviewsAnalyzed: analysis.reviewsAnalyzed || 0,
      confidenceLevel: analysis.confidenceLevel || "medium",
      analysisDate: analysis.analysisDate || new Date(),
      lastUpdated: new Date(),
    };

    const doc = await ProductAnalysis.findOneAndUpdate(
      { asin },
      { $set: updateData },
      {
        upsert: true,
        new: true, // Return the updated document
        runValidators: true, // Enforce schema validation on update
        setDefaultsOnInsert: true,
      },
    ).exec();

    logger.info(
      `🔬 Pipeline: MongoDB upsert OK — asin=${asin} ` +
        `aiScore=${doc.aiScore} confidence=${doc.confidenceLevel}`,
    );

    return doc;
  } catch (err) {
    // Handle duplicate key race condition gracefully
    if (err.code === 11000) {
      logger.warn(
        `🔬 Pipeline: MongoDB duplicate key for ${asin} — concurrent upsert race, retrying`,
      );
      try {
        return await ProductAnalysis.findOneAndUpdate(
          { asin },
          { $set: { aiScore: analysis.aiScore, lastUpdated: new Date() } },
          { new: true },
        ).exec();
      } catch (retryErr) {
        logger.error(
          `🔬 Pipeline: MongoDB retry also failed — ${retryErr.message}`,
        );
      }
    }

    logger.error(
      `🔬 Pipeline: MongoDB save failed for ${asin} — ${err.message}`,
    );
    return null;
  }
}

// ── Redis: Get cached analysis ──────────────────────────────────
async function getAnalysisFromRedis(asin) {
  const redis = getRedis();
  if (!redis || redis.status !== "ready") return null;

  const key = `${REDIS_KEY_PREFIX}:${asin}`;

  try {
    const raw = await redis.get(key);
    if (!raw) {
      logger.info(`🔬 Pipeline: Redis MISS for ${key}`);
      return null;
    }

    const cached = JSON.parse(raw);
    logger.info(
      `🔬 Pipeline: Redis HIT for ${key} — aiScore=${cached.aiScore}`,
    );
    return cached;
  } catch (err) {
    logger.warn(`🔬 Pipeline: Redis GET failed for ${key} — ${err.message}`);
    return null;
  }
}

// ── Redis: Cache analysis result ────────────────────────────────
async function cacheAnalysisInRedis(asin, analysis) {
  const redis = getRedis();
  if (!redis || redis.status !== "ready") {
    logger.warn(
      `🔬 Pipeline: Redis not available — skipping cache for ${asin}`,
    );
    return;
  }

  const key = `${REDIS_KEY_PREFIX}:${asin}`;

  try {
    // Build a clean cacheable object (no Mongoose internals, no _id)
    const cachePayload = {
      asin,
      aiScore: analysis.aiScore,
      aspectScores: analysis.aspectScores || {},
      overallSentiment: analysis.overallSentiment || {},
      whatPeopleLove: analysis.whatPeopleLove || [],
      commonComplaints: analysis.commonComplaints || [],
      redFlags: analysis.redFlags || [],
      buyRecommendation: analysis.buyRecommendation || null,
      avoidIf: analysis.avoidIf || null,
      authenticityBadge: analysis.authenticityBadge || "medium",
      authenticityFlags: analysis.authenticityFlags || [],
      reviewsAnalyzed: analysis.reviewsAnalyzed || 0,
      confidenceLevel: analysis.confidenceLevel || "medium",
      analysisDate: analysis.analysisDate || new Date().toISOString(),
      cachedAt: Date.now(),
    };

    const json = JSON.stringify(cachePayload);
    await redis.set(key, json, "EX", ANALYSIS_CACHE_TTL);

    const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);
    logger.info(
      `🔬 Pipeline: Redis SET OK — ${key} | ${sizeKB}KB | TTL=${ANALYSIS_CACHE_TTL}s (24h)`,
    );
  } catch (err) {
    logger.warn(`🔬 Pipeline: Redis SET failed for ${key} — ${err.message}`);
    // Non-fatal: analysis is still saved to MongoDB
  }
}

// ── Convert Mongoose document to plain result ───────────────────
// Strips _id, __v, and converts Map types to plain objects.
function mongoDocToResult(doc) {
  if (!doc) return null;

  const plain = doc.toObject ? doc.toObject() : { ...doc };

  // Convert aspectScores Map → plain object
  let aspectScores = {};
  if (plain.aspectScores) {
    if (plain.aspectScores instanceof Map) {
      aspectScores = Object.fromEntries(plain.aspectScores);
    } else if (typeof plain.aspectScores === "object") {
      aspectScores = { ...plain.aspectScores };
    }
  }

  // Strip MongoDB internals
  delete plain._id;
  delete plain.__v;
  delete plain.id; // virtual

  return {
    ...plain,
    aspectScores,
  };
}

// ── Build minimal result (0 reviews, never analyzed) ────────────
function buildMinimalResult(asin, productName, category, starDistribution) {
  logger.info(`🔬 Pipeline: building minimal result for ${asin} (no reviews)`);

  return {
    asin,
    productName,
    category,
    aiScore: null,
    aspectScores: {},
    overallSentiment: { positive: 0, neutral: 0, negative: 0 },
    whatPeopleLove: [],
    commonComplaints: [],
    redFlags: [],
    buyRecommendation: null,
    avoidIf: null,
    authenticityBadge: "medium",
    authenticityFlags: ["No reviews available for analysis"],
    reviewsAnalyzed: 0,
    confidenceLevel: "low",
    reviewQualitySummary: "No reviews found on Amazon India for this product.",
    analysisDate: new Date(),
    _pipelineMeta: {
      source: "minimal",
      fresh: true,
      reason: "zero-reviews",
    },
  };
}

// ── Utility ─────────────────────────────────────────────────────
function daysSince(date) {
  if (!date) return Infinity;
  return Math.round(
    (Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000),
  );
}

// ═════════════════════════════════════════════════════════════════
// BATCH PIPELINE (for cron use)
// ═════════════════════════════════════════════════════════════════
/**
 * Run analysis pipeline for multiple ASINs sequentially.
 * Used by the nightly cron job to refresh stale analyses.
 *
 * @param {Array<Object>} products — Array of { asin, productName, category, brand }
 * @param {Object} options
 * @param {number} options.delayBetween — ms between products (default 3000)
 * @param {boolean} options.forceRefresh — Force re-analysis regardless of freshness
 * @returns {Object} — { success, failed, skipped, elapsed }
 */
async function runBatchAnalysis(products, options = {}) {
  const { delayBetween = 3000, forceRefresh = false } = options;
  const batchStart = Date.now();

  logger.info(
    `🔬 Batch: starting analysis of ${products.length} products ` +
      `(delay=${delayBetween}ms, force=${forceRefresh})`,
  );

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < products.length; i++) {
    const { asin, productName, category, brand } = products[i];

    if (!asin) {
      logger.warn(`🔬 Batch [${i + 1}/${products.length}]: skipping — no ASIN`);
      skipped++;
      continue;
    }

    logger.info(
      `🔬 Batch [${i + 1}/${products.length}]: ${asin} "${productName}"`,
    );

    try {
      const result = await runAnalysisPipeline(
        asin,
        productName || asin,
        category || "unknown",
        {
          forceRefresh,
          brand,
        },
      );

      if (result && result.aiScore !== null) {
        success++;
        logger.info(
          `🔬 Batch [${i + 1}/${products.length}]: ✅ ${asin} → aiScore=${result.aiScore}`,
        );
      } else {
        failed++;
        logger.warn(
          `🔬 Batch [${i + 1}/${products.length}]: ⚠️ ${asin} — analysis returned null/no-score`,
        );
      }
    } catch (err) {
      failed++;
      logger.error(
        `🔬 Batch [${i + 1}/${products.length}]: ❌ ${asin} — ${err.message}`,
      );
    }

    // Delay between products to respect ScraperAPI + OpenAI rate limits
    if (i < products.length - 1) {
      await sleep(delayBetween);
    }
  }

  const elapsed = Math.round((Date.now() - batchStart) / 1000);

  logger.info(
    `🔬 Batch: COMPLETE — ${success} success, ${failed} failed, ${skipped} skipped in ${elapsed}s`,
  );

  return {
    success,
    failed,
    skipped,
    total: products.length,
    elapsed_seconds: elapsed,
  };
}

// ═════════════════════════════════════════════════════════════════
// STALE ANALYSIS FINDER (for cron)
// ═════════════════════════════════════════════════════════════════
/**
 * Find products with stale analyses that need refreshing.
 * Used by the nightly cron to decide what to re-analyze.
 *
 * @param {number} limit — Max number of stale products to return
 * @returns {Array<Object>} — Products needing re-analysis
 */
async function findStaleAnalyses(limit = 20) {
  try {
    const cutoff = new Date(Date.now() - ANALYSIS_MAX_AGE_MS);

    const stale = await ProductAnalysis.find({
      $or: [{ analysisDate: { $lt: cutoff } }, { confidenceLevel: "low" }],
    })
      .select(
        "asin productName category brand analysisDate confidenceLevel reviewsAnalyzed",
      )
      .sort({ analysisDate: 1 }) // Oldest first
      .limit(limit)
      .lean()
      .exec();

    logger.info(
      `🔬 Stale finder: ${stale.length} products need re-analysis (cutoff=${cutoff.toISOString().slice(0, 10)})`,
    );

    return stale;
  } catch (err) {
    logger.error(`🔬 Stale finder: MongoDB query failed — ${err.message}`);
    return [];
  }
}

// ── Utility ─────────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ═════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════

module.exports = {
  // Main pipeline
  runAnalysisPipeline,

  // Batch operations (cron)
  runBatchAnalysis,
  findStaleAnalyses,

  // API response builder
  buildProductResponse,

  // Freshness check (exported for testing + external use)
  shouldReanalyze,
};
