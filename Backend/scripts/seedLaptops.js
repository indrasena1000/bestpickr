#!/usr/bin/env node
// scripts/seedLaptops.js
// ─────────────────────────────────────────────────────────────────
// Fetches 10 real laptops from Amazon, upserts them into PostgreSQL,
// scrapes their reviews, and runs GPT-4o-mini analysis.
//
// After this runs, searching "laptops" or "laptop" shows real products
// and "View Details" shows real AI analysis.
//
// USAGE:
//   cd Backend
//   node scripts/seedLaptops.js                     # full run
//   node scripts/seedLaptops.js --skip-analysis     # skip review scraping (faster)
//   node scripts/seedLaptops.js --force             # re-analyse even if fresh
//
// REQUIREMENTS:
//   SCRAPER_API_KEY in .env  — needed for review scraping
//   OPENAI_API_KEY  in .env  — needed for GPT analysis
//   AMAZON_* creds  in .env  — needed for product fetch
// ─────────────────────────────────────────────────────────────────
"use strict";

require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { connectMongoDB, disconnectMongoDB } = require("../src/utils/mongodb");
const amazonService = require("../src/services/amazonService");
const { runAnalysisPipeline } = require("../src/pipeline/analysisPipeline");

// ── CLI FLAGS ──────────────────────────────────────────────────────
const SKIP_ANALYSIS = process.argv.includes("--skip-analysis");
const FORCE_REFRESH = process.argv.includes("--force");
const CATEGORY = "laptops";
// Use a broader query to get established models with existing reviews.
// Avoid "2025" in the query - brand new launches have 0 reviews for GPT analysis.
const SEARCH_QUERY = "best laptop thin light";
const TARGET_COUNT = 10;

// ── COLOUR HELPERS ─────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  grey: "\x1b[90m",
};
const ok = (msg) => console.log(`${c.green}  ✓${c.reset}  ${msg}`);
const fail = (msg) => console.log(`${c.red}  ✗${c.reset}  ${msg}`);
const info = (msg) => console.log(`${c.cyan}  →${c.reset}  ${msg}`);
const warn = (msg) => console.log(`${c.yellow}  ⚠${c.reset}  ${msg}`);
const hr = () => console.log(`${c.grey}${"─".repeat(60)}${c.reset}`);

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════
async function main() {
  const totalStart = Date.now();

  console.log(
    `\n${c.bold}╔════════════════════════════════════════════════════╗${c.reset}`,
  );
  console.log(
    `${c.bold}║   bestpickr — Laptop Seeder                        ║${c.reset}`,
  );
  console.log(
    `${c.bold}╚════════════════════════════════════════════════════╝${c.reset}\n`,
  );

  info(`Query:          "${SEARCH_QUERY}"`);
  info(`Category:       ${CATEGORY}`);
  info(
    `Skip analysis:  ${SKIP_ANALYSIS ? "YES (--skip-analysis)" : "NO — will scrape reviews + run GPT"}`,
  );
  info(`Force refresh:  ${FORCE_REFRESH ? "YES" : "NO"}`);
  info(
    `ScraperAPI key: ${process.env.SCRAPER_API_KEY ? "✅ set" : "⚠  not set (using built-in fallback)"}`,
  );
  info(
    `OpenAI key:     ${process.env.OPENAI_API_KEY ? "✅ set" : "❌ MISSING — analysis will fail"}`,
  );
  console.log();

  if (!process.env.OPENAI_API_KEY && !SKIP_ANALYSIS) {
    fail(
      "OPENAI_API_KEY is not set — run with --skip-analysis to skip GPT, or add the key to .env",
    );
    process.exit(1);
  }

  // ── CONNECT DBS ────────────────────────────────────────────────
  hr();
  console.log(`\n${c.bold}STEP 1 — Connect databases${c.reset}\n`);

  const prisma = new PrismaClient({ log: [] });

  try {
    await prisma.$connect();
    ok("PostgreSQL connected (Neon)");
  } catch (e) {
    fail(`PostgreSQL connection failed: ${e.message}`);
    process.exit(1);
  }

  if (!SKIP_ANALYSIS) {
    try {
      await connectMongoDB();
      ok("MongoDB connected (Atlas)");
    } catch (e) {
      warn(`MongoDB connection failed: ${e.message}`);
      warn("Analysis will not save — continuing anyway");
    }
  }

  // ── FETCH AMAZON PRODUCTS ──────────────────────────────────────
  hr();
  console.log(`\n${c.bold}STEP 2 — Fetch laptops from Amazon${c.reset}\n`);

  let products = [];
  try {
    info(`Calling Amazon API: "${SEARCH_QUERY}"…`);
    const raw = await amazonService.searchProducts(SEARCH_QUERY, CATEGORY);
    products = raw.slice(0, TARGET_COUNT);
    ok(`Fetched ${products.length} products from Amazon`);
  } catch (e) {
    fail(`Amazon API error: ${e.message}`);
    if (e.response?.data) {
      console.error(
        "  Response:",
        JSON.stringify(e.response.data).slice(0, 300),
      );
    }
    await cleanup(prisma);
    process.exit(1);
  }

  if (products.length === 0) {
    fail("Amazon returned 0 products. Check your Amazon credentials in .env");
    await cleanup(prisma);
    process.exit(1);
  }

  // Print what we fetched
  console.log();
  products.forEach((p, i) => {
    const price = p.price ? `₹${p.price.toLocaleString("en-IN")}` : "no price";
    const asin = p.platformId || "no ASIN";
    console.log(
      `  ${c.cyan}${String(i + 1).padStart(2)}.${c.reset} ${p.name?.slice(0, 55).padEnd(55)} ${c.grey}${asin}  ${price}${c.reset}`,
    );
  });

  // ── UPSERT INTO POSTGRESQL ─────────────────────────────────────
  hr();
  console.log(
    `\n${c.bold}STEP 3 — Upsert into PostgreSQL (Products table)${c.reset}\n`,
  );

  const upserted = [];
  const upsertFailed = [];

  for (const p of products) {
    const asin = p.platformId;
    if (!asin) {
      warn(`Skipping product with no ASIN: "${p.name}"`);
      continue;
    }

    const data = {
      name: p.name || "Unknown Laptop",
      brand: p.brand || null,
      category: CATEGORY,
      imageUrl: p.imageUrl || null,
      description: p.features?.join(". ") || null,
      platform: "AMAZON", // Prisma enum — must be uppercase
      platformId: asin,
      platformUrl: p.url || `https://www.amazon.in/dp/${asin}`,
      affiliateUrl:
        p.affiliateUrl ||
        `https://www.amazon.in/dp/${asin}?tag=${process.env.AMAZON_ASSOCIATE_TAG || "bestpickr-21"}`,
      currentPrice: p.price || 0,
      originalPrice: p.mrp || null,
      currency: "INR",
      inStock: p.inStock !== false,
      platformRating: p.rating || null,
      reviewCount: p.reviewCount || 0,
    };

    try {
      await prisma.product.upsert({
        where: {
          platform_platformId: { platform: "AMAZON", platformId: asin },
        },
        create: data,
        update: {
          name: data.name,
          brand: data.brand,
          imageUrl: data.imageUrl,
          description: data.description,
          currentPrice: data.currentPrice,
          originalPrice: data.originalPrice,
          inStock: data.inStock,
          platformRating: data.platformRating,
          reviewCount: data.reviewCount,
          affiliateUrl: data.affiliateUrl,
        },
      });
      ok(`Upserted: "${p.name?.slice(0, 50)}" (${asin})`);
      upserted.push({
        asin,
        name: p.name,
        brand: p.brand,
        reviewCount: p.reviewCount,
      });
    } catch (e) {
      fail(`Upsert failed for ${asin}: ${e.message}`);
      upsertFailed.push({ asin, error: e.message });
    }
  }

  console.log(
    `\n  ${c.bold}Upserted: ${upserted.length}  Failed: ${upsertFailed.length}${c.reset}`,
  );

  if (upserted.length === 0) {
    fail("No products upserted. Cannot continue.");
    await cleanup(prisma);
    process.exit(1);
  }

  // ── RUN ANALYSIS PIPELINE ──────────────────────────────────────
  if (SKIP_ANALYSIS) {
    hr();
    warn("Skipping analysis (--skip-analysis flag set)");
    warn("Products are in Postgres but have NO AI score or review data.");
    warn("Re-run without --skip-analysis once you have your ScraperAPI key.");
  } else {
    hr();
    console.log(
      `\n${c.bold}STEP 4 — Review scraping + GPT analysis (${upserted.length} products)${c.reset}`,
    );
    console.log(
      `  ${c.grey}Each product: ~5 ScraperAPI credits + ~$0.002 OpenAI${c.reset}\n`,
    );
    console.log(
      `  ${c.yellow}This takes 2–5 minutes. Do not interrupt.${c.reset}\n`,
    );

    const analysisResults = [];

    for (let i = 0; i < upserted.length; i++) {
      const { asin, name, brand } = upserted[i];
      hr();
      info(
        `[${i + 1}/${upserted.length}] Analysing: "${name?.slice(0, 50)}" (${asin})`,
      );

      const t0 = Date.now();
      try {
        const result = await runAnalysisPipeline(asin, name, CATEGORY, {
          forceRefresh: FORCE_REFRESH,
          brand,
        });

        if (result) {
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          const score = result.aiScore?.toFixed(1) || "n/a";
          const pos = result.overallSentiment?.positive || 0;
          const reviews = result.reviewsAnalyzed || 0;
          ok(
            `Done in ${elapsed}s  |  aiScore=${score}  |  positive=${pos}%  |  reviews=${reviews}`,
          );
          if (result.whatPeopleLove?.length) {
            info(`  💚 Love: ${result.whatPeopleLove[0]}`);
          }
          if (result.commonComplaints?.length) {
            info(`  ⚠  Issue: ${result.commonComplaints[0]}`);
          }
          analysisResults.push({
            asin,
            name,
            aiScore: result.aiScore,
            ok: true,
          });

          // Update aiScore in PostgreSQL so search rankings instantly reflect it
          try {
            await prisma.product.updateMany({
              where: { platform: "AMAZON", platformId: asin },
              data: { aiScore: result.aiScore, lastScored: new Date() },
            });
            ok(`aiScore=${score} written back to PostgreSQL`);
          } catch (updateErr) {
            warn(
              `Could not write aiScore back to Postgres: ${updateErr.message}`,
            );
          }
        } else {
          warn(`Pipeline returned null for ${asin} — likely no reviews found`);
          analysisResults.push({
            asin,
            name,
            aiScore: null,
            ok: false,
            reason: "null result",
          });
        }
      } catch (e) {
        fail(`Analysis failed for ${asin}: ${e.message}`);
        analysisResults.push({
          asin,
          name,
          aiScore: null,
          ok: false,
          reason: e.message,
        });
      }

      // 3-second gap between products to avoid hammering ScraperAPI
      if (i < upserted.length - 1) {
        info("Waiting 3s before next product…");
        await sleep(3000);
      }
    }

    // ── ANALYSIS SUMMARY ──────────────────────────────────────────
    hr();
    console.log(`\n${c.bold}ANALYSIS SUMMARY${c.reset}\n`);
    analysisResults.forEach((r) => {
      const status = r.ok ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
      const score = r.ok
        ? `  aiScore=${r.aiScore?.toFixed(1) || "n/a"}`
        : `  ${c.red}${r.reason?.slice(0, 60)}${c.reset}`;
      console.log(
        `  ${status}  ${r.name?.slice(0, 45).padEnd(45)} ${c.grey}${r.asin}${c.reset}${score}`,
      );
    });

    const successCount = analysisResults.filter((r) => r.ok).length;
    console.log(
      `\n  ${c.bold}Analysed: ${successCount}/${analysisResults.length}${c.reset}`,
    );
  }

  // ── FINAL SUMMARY ──────────────────────────────────────────────
  hr();
  const totalSec = ((Date.now() - totalStart) / 1000).toFixed(0);
  console.log(
    `\n${c.bold}╔════════════════════════════════════════════════════╗${c.reset}`,
  );
  console.log(
    `${c.bold}║   SEED COMPLETE  (${totalSec}s)${" ".repeat(32 - totalSec.length)}   ║${c.reset}`,
  );
  console.log(
    `${c.bold}╚════════════════════════════════════════════════════╝${c.reset}\n`,
  );

  ok(`${upserted.length} laptops in PostgreSQL`);
  if (!SKIP_ANALYSIS) {
    ok("Review scraping + GPT analysis done");
  }
  console.log();
  info("Next steps:");
  console.log(
    `     1. ${c.bold}Search "laptops"${c.reset} on the frontend → should see real products`,
  );
  console.log(
    `     2. ${c.bold}Click "View Details"${c.reset} → should show AI analysis, pros/cons`,
  );
  console.log(
    `     3. ${c.bold}Search specific model${c.reset} e.g. "MacBook Air M2" → tests intent routing`,
  );
  console.log();

  await cleanup(prisma);
}

// ── HELPERS ────────────────────────────────────────────────────────
async function cleanup(prisma) {
  try {
    await prisma.$disconnect();
  } catch {}
  try {
    await disconnectMongoDB();
  } catch {}
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── RUN ────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error(`\n${c.red}FATAL ERROR:${c.reset}`, err.message);
  if (err.stack) console.error(err.stack.split("\n").slice(1, 4).join("\n"));
  process.exit(1);
});
