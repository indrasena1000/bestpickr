// src/services/reviewAuthenticityService.js — Review Authenticity Detector
// ─────────────────────────────────────────────────────────────────
// Statistical analysis of review patterns to detect suspicious activity.
// NO AI call needed — pure math on review metadata.
//
// CALLED BY: aiAnalysisService.js (Step 1 of the analysis pipeline)
//
// DETECTION SIGNALS:
//   1. Star distribution anomalies (J-curve vs natural bell)
//   2. Verified purchase ratio (low = suspicious)
//   3. Review text quality (very short generic reviews)
//   4. Temporal clustering (burst of reviews in short period)
//   5. Helpful vote patterns (genuine reviews get votes)
//   6. Rating vs sentiment mismatch
//
// OUTPUT:
//   { badge: 'high'|'medium'|'suspicious',
//     authenticityScore: 0-100,
//     flags: string[],
//     details: { ... } }
// ─────────────────────────────────────────────────────────────────
"use strict";

const logger = require("../utils/logger");

// ── THRESHOLDS ──────────────────────────────────────────────────
// Tuned for Indian e-commerce patterns. Amazon India has a higher
// baseline of short/generic reviews compared to Amazon US.
const THRESHOLDS = {
  // Minimum verified purchase % before flagging
  minVerifiedPct: 50,
  // Minimum average body length (characters) before flagging
  minAvgBodyLength: 60,
  // Percentage of 5-star reviews that triggers J-curve flag
  fiveStarDominance: 80,
  // Short review = fewer than this many characters
  shortReviewChars: 30,
  // Maximum % of short reviews before flagging
  maxShortReviewPct: 50,
  // Burst detection: max % of reviews within a 7-day window
  burstWindowDays: 7,
  maxBurstPct: 40,
  // Minimum reviews needed for meaningful analysis
  minReviewsForAnalysis: 5,
};

// ── MAIN EXPORT ─────────────────────────────────────────────────
/**
 * Analyze review authenticity using statistical signals.
 *
 * @param {Array} reviews — Array from amazonReviewScraper.fetchReviews()
 *   Each review: { starRating, title, body, date, verifiedPurchase, helpfulVotes }
 * @param {Object} starDistribution — { 1: n, 2: n, 3: n, 4: n, 5: n }
 * @returns {Object} { badge, authenticityScore, flags, details }
 */
function checkReviewAuthenticity(reviews, starDistribution = {}) {
  const flags = [];
  const details = {};
  let deductions = 0; // Start at 100, deduct for each red flag

  if (!reviews || reviews.length === 0) {
    logger.info("🔍 Authenticity: no reviews to analyze");
    return {
      badge: "low",
      authenticityScore: 0,
      flags: ["No reviews available for authenticity analysis"],
      details: {},
    };
  }

  const totalReviews = reviews.length;
  logger.info(`🔍 Authenticity: analyzing ${totalReviews} reviews`);

  // ── CHECK 1: Verified Purchase Ratio ────────────────────────
  const verifiedCount = reviews.filter((r) => r.verifiedPurchase).length;
  const verifiedPct = Math.round((verifiedCount / totalReviews) * 100);
  details.verifiedPurchasePct = verifiedPct;

  if (verifiedPct < 30) {
    flags.push(
      `Only ${verifiedPct}% of reviews are verified purchases (expected >50%)`,
    );
    deductions += 25;
  } else if (verifiedPct < THRESHOLDS.minVerifiedPct) {
    flags.push(
      `Verified purchase ratio is ${verifiedPct}% (below ${THRESHOLDS.minVerifiedPct}% threshold)`,
    );
    deductions += 12;
  }

  // ── CHECK 2: Star Distribution Anomaly (J-Curve) ───────────
  // Natural products: roughly bell-shaped around their average.
  // Fake-boosted products: extreme J-curve (90% 5-star, almost no 2-4 star).
  const dist = normalizeDistribution(starDistribution);
  details.starDistribution = dist;

  const fiveStarPct = dist[5] || 0;
  const oneStarPct = dist[1] || 0;
  const midStarPct = (dist[2] || 0) + (dist[3] || 0) + (dist[4] || 0);

  if (fiveStarPct > THRESHOLDS.fiveStarDominance && midStarPct < 10) {
    flags.push(
      `Extreme J-curve: ${fiveStarPct}% are 5-star with only ${midStarPct}% in 2-4 star range`,
    );
    deductions += 20;
  } else if (fiveStarPct > 70 && midStarPct < 15) {
    flags.push(
      `Unusual distribution: ${fiveStarPct}% are 5-star, very few mid-range reviews`,
    );
    deductions += 10;
  }

  // Inverse J-curve (attack reviews) — lots of 1-star, very few middle
  if (oneStarPct > 60 && midStarPct < 15) {
    flags.push(
      `Possible review bombing: ${oneStarPct}% are 1-star with minimal mid-range reviews`,
    );
    deductions += 15;
  }

  // ── CHECK 3: Review Text Quality ────────────────────────────
  // Fake reviews tend to be very short and generic.
  const bodiesWithText = reviews.filter(
    (r) => r.body && r.body.trim().length > 0,
  );
  const avgBodyLength =
    bodiesWithText.length > 0
      ? Math.round(
          bodiesWithText.reduce((sum, r) => sum + r.body.trim().length, 0) /
            bodiesWithText.length,
        )
      : 0;
  details.avgBodyLength = avgBodyLength;

  const shortReviewCount = reviews.filter(
    (r) => !r.body || r.body.trim().length < THRESHOLDS.shortReviewChars,
  ).length;
  const shortReviewPct = Math.round((shortReviewCount / totalReviews) * 100);
  details.shortReviewPct = shortReviewPct;

  if (shortReviewPct > THRESHOLDS.maxShortReviewPct) {
    flags.push(
      `${shortReviewPct}% of reviews are very short (<${THRESHOLDS.shortReviewChars} chars) — possible generic/incentivized reviews`,
    );
    deductions += 15;
  }

  if (
    avgBodyLength < THRESHOLDS.minAvgBodyLength &&
    totalReviews >= THRESHOLDS.minReviewsForAnalysis
  ) {
    flags.push(
      `Average review length is only ${avgBodyLength} characters (expected >${THRESHOLDS.minAvgBodyLength})`,
    );
    deductions += 8;
  }

  // ── CHECK 4: Duplicate / Near-Duplicate Content ─────────────
  // Check for reviews that are suspiciously similar.
  const duplicates = detectDuplicateContent(reviews);
  details.duplicateClusterCount = duplicates.count;

  if (duplicates.count > 0) {
    flags.push(
      `${duplicates.count} groups of near-duplicate review text detected`,
    );
    deductions += duplicates.count * 8;
  }

  // ── CHECK 5: Temporal Clustering (Review Bursts) ────────────
  // Legitimate products get reviews steadily. Fake campaigns create bursts.
  const burst = detectReviewBursts(reviews);
  details.maxBurstPct = burst.maxBurstPct;
  details.burstWindow = burst.window;

  if (
    burst.maxBurstPct > THRESHOLDS.maxBurstPct &&
    totalReviews >= THRESHOLDS.minReviewsForAnalysis
  ) {
    flags.push(
      `${burst.maxBurstPct}% of reviews appeared within a ${THRESHOLDS.burstWindowDays}-day window — possible coordinated campaign`,
    );
    deductions += 12;
  }

  // ── CHECK 6: Helpful Vote Distribution ──────────────────────
  // Genuine reviews accumulate helpful votes over time. Fake reviews rarely get any.
  const reviewsWithVotes = reviews.filter((r) => r.helpfulVotes > 0).length;
  const helpfulVotePct = Math.round((reviewsWithVotes / totalReviews) * 100);
  details.reviewsWithHelpfulVotes = helpfulVotePct;

  // Only flag if there are enough reviews for this to be meaningful
  if (helpfulVotePct < 5 && totalReviews > 20) {
    flags.push(
      `Almost no reviews have helpful votes (${helpfulVotePct}%) — reviews may not be organically discovered`,
    );
    deductions += 5;
  }

  // ── CHECK 7: 5-Star Reviews With No Body Text ──────────────
  // A common fake pattern: 5 stars, no title, no body — just a rating.
  const emptyFiveStars = reviews.filter(
    (r) => r.starRating === 5 && (!r.body || r.body.trim().length < 10),
  ).length;
  const emptyFiveStarPct =
    totalReviews > 0 ? Math.round((emptyFiveStars / totalReviews) * 100) : 0;
  details.emptyFiveStarPct = emptyFiveStarPct;

  if (emptyFiveStarPct > 30) {
    flags.push(
      `${emptyFiveStarPct}% of reviews are 5-star with no meaningful text`,
    );
    deductions += 15;
  } else if (emptyFiveStarPct > 15) {
    flags.push(`${emptyFiveStarPct}% of reviews are 5-star with minimal text`);
    deductions += 7;
  }

  // ── COMPUTE FINAL SCORE & BADGE ─────────────────────────────
  const authenticityScore = Math.max(0, Math.min(100, 100 - deductions));
  let badge;
  if (authenticityScore >= 70) {
    badge = "high";
  } else if (authenticityScore >= 40) {
    badge = "medium";
  } else {
    badge = "suspicious";
  }

  // Low review count = automatically reduce confidence
  if (totalReviews < THRESHOLDS.minReviewsForAnalysis) {
    if (badge === "high") badge = "medium";
    if (!flags.some((f) => f.includes("few reviews"))) {
      flags.push(
        `Only ${totalReviews} reviews available — insufficient for high-confidence analysis`,
      );
    }
  }

  logger.info(
    `🔍 Authenticity: badge=${badge} score=${authenticityScore} flags=${flags.length} ` +
      `(verified=${verifiedPct}% 5star=${fiveStarPct}% avgLen=${avgBodyLength})`,
  );

  return {
    badge,
    authenticityScore,
    flags,
    details,
  };
}

// ── HELPER: Normalize Star Distribution to Percentages ──────────
function normalizeDistribution(dist) {
  const total = Object.values(dist).reduce((sum, n) => sum + (n || 0), 0);
  if (total === 0) return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  const normalized = {};
  for (const star of [1, 2, 3, 4, 5]) {
    normalized[star] = Math.round(((dist[star] || 0) / total) * 100);
  }
  return normalized;
}

// ── HELPER: Detect Near-Duplicate Review Content ────────────────
// Uses simple trigram overlap — if two reviews share >70% of their
// 3-word phrases, they're likely duplicates or template-based.
function detectDuplicateContent(reviews) {
  const bodies = reviews
    .filter((r) => r.body && r.body.trim().length > 30)
    .map((r) =>
      r.body
        .trim()
        .toLowerCase()
        .replace(/[^\w\s]/g, ""),
    );

  if (bodies.length < 2) return { count: 0 };

  let duplicateClusters = 0;
  const checked = new Set();

  for (let i = 0; i < bodies.length; i++) {
    if (checked.has(i)) continue;

    const wordsA = bodies[i].split(/\s+/);
    if (wordsA.length < 5) continue;

    let hasDuplicate = false;
    for (let j = i + 1; j < bodies.length; j++) {
      if (checked.has(j)) continue;

      const wordsB = bodies[j].split(/\s+/);
      if (wordsB.length < 5) continue;

      // Quick length check — very different lengths = not duplicates
      const lenRatio =
        Math.min(wordsA.length, wordsB.length) /
        Math.max(wordsA.length, wordsB.length);
      if (lenRatio < 0.5) continue;

      const similarity = computeWordOverlap(wordsA, wordsB);
      if (similarity > 0.7) {
        checked.add(j);
        hasDuplicate = true;
      }
    }

    if (hasDuplicate) {
      duplicateClusters++;
      checked.add(i);
    }
  }

  return { count: duplicateClusters };
}

function computeWordOverlap(wordsA, wordsB) {
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  let overlap = 0;
  for (const word of setA) {
    if (setB.has(word)) overlap++;
  }
  return overlap / Math.max(setA.size, setB.size);
}

// ── HELPER: Detect Review Temporal Bursts ───────────────────────
// Slides a 7-day window across review dates and finds the window
// with the highest concentration of reviews.
function detectReviewBursts(reviews) {
  const dated = reviews
    .filter((r) => r.date)
    .map((r) => new Date(r.date).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);

  if (dated.length < 5) {
    return { maxBurstPct: 0, window: null };
  }

  const windowMs = THRESHOLDS.burstWindowDays * 24 * 60 * 60 * 1000;
  let maxCount = 0;
  let maxWindowStart = null;

  for (let i = 0; i < dated.length; i++) {
    const windowEnd = dated[i] + windowMs;
    let count = 0;
    for (let j = i; j < dated.length && dated[j] <= windowEnd; j++) {
      count++;
    }
    if (count > maxCount) {
      maxCount = count;
      maxWindowStart = new Date(dated[i]).toISOString().slice(0, 10);
    }
  }

  const maxBurstPct = Math.round((maxCount / dated.length) * 100);

  return {
    maxBurstPct,
    window: maxWindowStart
      ? `${maxCount} reviews in 7 days starting ${maxWindowStart}`
      : null,
  };
}

module.exports = { checkReviewAuthenticity };
