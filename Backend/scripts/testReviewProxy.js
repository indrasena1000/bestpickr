// Test Rainforest API Amazon Reviews integration
// Usage: node scripts/testReviewProxy.js [ASIN]
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { fetchReviews } = require("../src/services/amazonReviewScraper");

const asin = process.argv[2] || "B0G5G25YBQ";

console.log(`\n🔍 Testing Rainforest API Amazon Reviews for ASIN: ${asin}\n`);
console.log(
  `   API Key: ${process.env.RAINFOREST_API_KEY ? "(set)" : "(NOT SET)"}\n`,
);

if (!process.env.RAINFOREST_API_KEY) {
  console.error("❌ RAINFOREST_API_KEY must be set in .env");
  console.error(
    "   Sign up at https://rainforestapi.com/register (free 200 req/month)",
  );
  process.exit(1);
}

const start = Date.now();

fetchReviews(asin)
  .then(({ reviews, starDistribution, meta }) => {
    const elapsed = Date.now() - start;

    console.log("═".repeat(60));
    console.log("✅ SUCCESS — Rainforest API returned reviews!");
    console.log("═".repeat(60));
    console.log(`\n📊 META:`);
    console.log(`   ASIN              : ${meta.asin}`);
    console.log(`   Reviews fetched   : ${meta.totalReviews}`);
    console.log(
      `   Total on Amazon   : ${meta.totalRatingsCount ?? "unknown"}`,
    );
    console.log(`   Overall rating    : ${meta.overallRating ?? "unknown"}/5`);
    console.log(`   Verified purchase : ${meta.verifiedPurchasePct}%`);
    console.log(
      `   Pages fetched     : ${meta.pagesScraped} (${meta.pagesErrored} errors)`,
    );
    console.log(`   Elapsed           : ${elapsed}ms`);
    console.log(`   Source            : ${meta.source}`);

    console.log(`\n⭐ STAR DISTRIBUTION:`);
    for (let star = 5; star >= 1; star--) {
      const count = starDistribution[star];
      const pct = meta.totalRatingsCount
        ? Math.round((count / meta.totalRatingsCount) * 100)
        : count;
      const bar = "█".repeat(Math.min(Math.round(pct / 2.5), 40));
      console.log(`   ${star}★  ${bar} (${count})`);
    }

    if (reviews.length > 0) {
      console.log(`\n📝 SAMPLE REVIEWS (first 3):`);
      reviews.slice(0, 3).forEach((r, i) => {
        console.log(
          `\n   [${i + 1}] ${r.starRating}★ — ${r.title || "(no title)"}`,
        );
        console.log(`       ${(r.body || "").slice(0, 120)}...`);
        console.log(
          `       Verified: ${r.verifiedPurchase} | Helpful: ${r.helpfulVotes} | Date: ${r.date?.slice(0, 10)}`,
        );
      });
    }

    const costPer = meta.pagesScraped * 0.01; // ~$0.01/request on Starter plan
    console.log(
      `\n💰 COST ESTIMATE: ~$${costPer.toFixed(3)}/ASIN (${meta.pagesScraped} requests × $0.01)\n`,
    );
  })
  .catch((err) => {
    console.error(`\n❌ FAILED: ${err.message}\n`);
    process.exit(1);
  });
