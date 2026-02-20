#!/usr/bin/env node
// scripts/testReviewScraper.js — Test the Amazon India Review Scraper
// ─────────────────────────────────────────────────────────────────
// USAGE:
//   node scripts/testReviewScraper.js                  # uses default ASIN
//   node scripts/testReviewScraper.js B09G9FPHY6       # Sony WH-1000XM5
//   node scripts/testReviewScraper.js B0CHX1W1XY 2     # 2 pages only
//
// REQUIREMENTS:
//   SCRAPER_API_KEY must be set in .env or environment
//
// WHAT IT TESTS:
//   1. Fetches reviews for the given ASIN
//   2. Prints star distribution
//   3. Prints first 3 reviews as sample
//   4. Prints metadata summary
//   5. Validates data structure
// ─────────────────────────────────────────────────────────────────
"use strict";

require("dotenv").config();

const { fetchReviews } = require("../src/services/amazonReviewScraper");

// ── CONFIG ──────────────────────────────────────────────────────
// Default test ASIN: Sony WH-1000XM5 — popular product with lots of reviews
const DEFAULT_ASIN = "B09G9FPHY6";

const testAsin = process.argv[2] || DEFAULT_ASIN;
const maxPages = parseInt(process.argv[3]) || 2; // Default 2 pages for quick test

// ── MAIN ────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  bestpickr — Amazon Review Scraper Test");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  ASIN:       ${testAsin}`);
  console.log(`  Max Pages:  ${maxPages}`);
  console.log(
    `  API Key:    ${process.env.SCRAPER_API_KEY ? "✅ set" : "❌ MISSING"}`,
  );
  console.log(`  Product:    https://www.amazon.in/dp/${testAsin}`);
  console.log(
    `  Reviews:    https://www.amazon.in/product-reviews/${testAsin}`,
  );
  console.log("═══════════════════════════════════════════════════════\n");

  if (!process.env.SCRAPER_API_KEY) {
    console.error("❌ ERROR: SCRAPER_API_KEY is not set.");
    console.error("   Set it in your .env file or run:");
    console.error(
      `   SCRAPER_API_KEY=your_key node scripts/testReviewScraper.js ${testAsin}`,
    );
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    const result = await fetchReviews(testAsin, { maxPages });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // ── META SUMMARY ──────────────────────────────────────────
    console.log("\n┌──────────────────────────────────────────────────┐");
    console.log("│  📊 RESULTS SUMMARY                              │");
    console.log("├──────────────────────────────────────────────────┤");
    console.log(`│  ASIN:              ${result.meta.asin}`);
    console.log(`│  Reviews scraped:   ${result.meta.totalReviews}`);
    console.log(
      `│  Amazon total:      ${result.meta.totalRatingsCount || "unknown"}`,
    );
    console.log(
      `│  Overall rating:    ${result.meta.overallRating || "unknown"} / 5`,
    );
    console.log(
      `│  Verified:          ${result.meta.verifiedPurchaseCount} (${result.meta.verifiedPurchasePct}%)`,
    );
    console.log(`│  Pages scraped:     ${result.meta.pagesScraped}`);
    console.log(`│  Pages errored:     ${result.meta.pagesErrored}`);
    console.log(`│  Time elapsed:      ${elapsed}s`);
    console.log("└──────────────────────────────────────────────────┘");

    // ── STAR DISTRIBUTION ─────────────────────────────────────
    console.log("\n⭐ Star Distribution:");
    const dist = result.starDistribution;
    const maxCount = Math.max(...Object.values(dist), 1);
    for (const star of [5, 4, 3, 2, 1]) {
      const count = dist[star] || 0;
      const barLen = Math.round((count / maxCount) * 30);
      const bar = "█".repeat(barLen) + "░".repeat(30 - barLen);
      console.log(`  ${star}★  ${bar}  ${count}`);
    }

    // ── SAMPLE REVIEWS ────────────────────────────────────────
    console.log(
      `\n📝 Sample Reviews (first ${Math.min(3, result.reviews.length)} of ${result.reviews.length}):\n`,
    );
    const sample = result.reviews.slice(0, 3);
    for (const [i, review] of sample.entries()) {
      console.log(`  ── Review #${i + 1} ──────────────────────────────────`);
      console.log(
        `  Stars:    ${"★".repeat(review.starRating || 0)}${"☆".repeat(5 - (review.starRating || 0))} (${review.starRating})`,
      );
      console.log(`  Title:    ${review.title || "(none)"}`);
      console.log(
        `  Verified: ${review.verifiedPurchase ? "✅ Yes" : "❌ No"}`,
      );
      console.log(`  Helpful:  ${review.helpfulVotes} votes`);
      console.log(`  Date:     ${review.dateText || review.date || "unknown"}`);
      console.log(`  Body:     ${truncate(review.body, 150)}`);
      console.log("");
    }

    // ── VALIDATION ────────────────────────────────────────────
    console.log("🔍 Validation:");
    const checks = [
      ["result.reviews is array", Array.isArray(result.reviews)],
      [
        "result.starDistribution has 5 keys",
        Object.keys(result.starDistribution).length === 5,
      ],
      [
        "result.meta.asin matches input",
        result.meta.asin === testAsin.toUpperCase(),
      ],
      [
        "result.meta.scrapedAt is ISO date",
        /^\d{4}-\d{2}-\d{2}T/.test(result.meta.scrapedAt),
      ],
      [
        "reviews have starRating field",
        result.reviews.length === 0 ||
          result.reviews[0].starRating !== undefined,
      ],
      [
        "reviews have body field",
        result.reviews.length === 0 || result.reviews[0].body !== undefined,
      ],
      [
        "reviews have verifiedPurchase field",
        result.reviews.length === 0 ||
          typeof result.reviews[0].verifiedPurchase === "boolean",
      ],
    ];

    let passed = 0;
    for (const [label, ok] of checks) {
      console.log(`  ${ok ? "✅" : "❌"} ${label}`);
      if (ok) passed++;
    }
    console.log(`\n  ${passed}/${checks.length} checks passed\n`);

    // ── RAW JSON OUTPUT (for debugging) ───────────────────────
    if (process.argv.includes("--json")) {
      console.log("\n📦 Full JSON output:");
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n❌ SCRAPER FAILED after ${elapsed}s`);
    console.error(`   Error: ${err.message}`);
    console.error(
      `   Stack: ${err.stack?.split("\n").slice(1, 3).join("\n         ")}`,
    );
    process.exit(1);
  }
}

function truncate(str, maxLen) {
  if (!str) return "(empty)";
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}

main();
