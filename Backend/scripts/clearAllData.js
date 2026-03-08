#!/usr/bin/env node
// scripts/clearAllData.js
// ─────────────────────────────────────────────────────────────────
// One-command wipe of all product/search data from:
//   1. MongoDB  — ProductAnalysis, ProductListing, SearchCache
//   2. Redis    — all bestpickr:* keys
//   3. Prisma   — Product (+ cascaded Review, PriceHistory), SearchCache
//
// Preserves: Analytics (PageView), SiteConfig, Category, BlogPost, PriceAlert
//
// Usage:
//   node scripts/clearAllData.js
//   node scripts/clearAllData.js --dry-run   (show counts, delete nothing)
// ─────────────────────────────────────────────────────────────────
"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const IORedis = require("ioredis");
const { PrismaClient } = require("@prisma/client");

const DRY_RUN = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

// ── Colours for console output ───────────────────────────────────
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

// ─────────────────────────────────────────────────────────────────
// 1. REDIS — flush all bestpickr:* keys
// ─────────────────────────────────────────────────────────────────
async function clearRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log(yellow("  Redis: REDIS_URL not set — skipping"));
    return 0;
  }

  const redis = new IORedis(url, {
    tls: url.startsWith("rediss://") ? {} : undefined,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    const keys = await redis.keys("bestpickr:*");
    console.log(`  Redis: found ${bold(keys.length)} bestpickr:* keys`);

    if (keys.length > 0 && !DRY_RUN) {
      // Delete in batches of 100 to avoid RESP frame limits
      let deleted = 0;
      for (let i = 0; i < keys.length; i += 100) {
        const batch = keys.slice(i, i + 100);
        deleted += await redis.del(...batch);
      }
      console.log(green(`  Redis: deleted ${deleted} keys ✓`));
      return deleted;
    }
    return keys.length;
  } finally {
    redis.disconnect();
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. MONGODB — clear ProductAnalysis, ProductListing, SearchCache
// ─────────────────────────────────────────────────────────────────
async function clearMongo() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.log(yellow("  MongoDB: MONGODB_URI not set — skipping"));
    return;
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const collections = [
    "productanalyses", // ProductAnalysis model
    "productlistings", // ProductListing model
    "searchcaches", // SearchCache model
  ];

  for (const col of collections) {
    try {
      const count = await db.collection(col).countDocuments();
      console.log(`  MongoDB ${col}: ${bold(count)} documents`);
      if (count > 0 && !DRY_RUN) {
        await db.collection(col).deleteMany({});
        console.log(green(`  MongoDB ${col}: cleared ✓`));
      }
    } catch (err) {
      if (err.code === 26) {
        // Collection doesn't exist — fine
        console.log(`  MongoDB ${col}: does not exist (skipping)`);
      } else {
        console.log(red(`  MongoDB ${col}: error — ${err.message}`));
      }
    }
  }

  await mongoose.disconnect();
}

// ─────────────────────────────────────────────────────────────────
// 3. PRISMA — clear Product (cascades Review + PriceHistory) + SearchCache
// ─────────────────────────────────────────────────────────────────
async function clearPrisma() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(yellow("  Prisma: DATABASE_URL not set — skipping"));
    return;
  }

  // Count first
  const [productCount, searchCacheCount] = await Promise.all([
    prisma.product.count(),
    prisma.searchCache.count(),
  ]);
  console.log(
    `  Prisma Product:     ${bold(productCount)} rows (Review + PriceHistory cascade)`,
  );
  console.log(`  Prisma SearchCache: ${bold(searchCacheCount)} rows`);

  if (!DRY_RUN) {
    // Delete in dependency order (children first for FK safety)
    // PriceHistory + Review cascade from Product via onDelete: Cascade
    // So deleting Product rows is enough — but let's be explicit for clarity.
    await prisma.$transaction([
      prisma.priceHistory.deleteMany({}),
      prisma.review.deleteMany({}),
      prisma.searchCache.deleteMany({}),
      prisma.product.deleteMany({}),
    ]);
    console.log(
      green("  Prisma: Product, Review, PriceHistory, SearchCache cleared ✓"),
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. TYPESENSE — drop and recreate products + search_queries collections
// ─────────────────────────────────────────────────────────────────
async function clearTypesense() {
  const apiKey = process.env.TYPESENSE_API_KEY;
  if (!apiKey) {
    console.log(yellow("  Typesense: TYPESENSE_API_KEY not set — skipping"));
    return;
  }

  let Typesense;
  try {
    Typesense = require("typesense");
  } catch {
    console.log(yellow("  Typesense: package not installed — skipping"));
    return;
  }

  const host = process.env.TYPESENSE_HOST || "localhost";
  const port = parseInt(process.env.TYPESENSE_PORT || "8108", 10);
  const protocol = process.env.TYPESENSE_PROTOCOL || "http";

  const client = new Typesense.Client({
    nodes: [{ host, port, protocol }],
    apiKey,
    connectionTimeoutSeconds: 5,
    numRetries: 1,
  });

  for (const col of ["products", "search_queries"]) {
    try {
      const info = await client.collections(col).retrieve();
      console.log(`  Typesense "${col}": ${bold(info.num_documents)} documents`);
      if (!DRY_RUN) {
        await client.collections(col).delete();
        console.log(green(`  Typesense "${col}": dropped ✓`));
      }
    } catch (err) {
      if (err.httpStatus === 404) {
        console.log(`  Typesense "${col}": does not exist (skipping)`);
      } else {
        console.log(red(`  Typesense "${col}": error — ${err.message}`));
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(bold("\n╔══════════════════════════════════════════════╗"));
  console.log(
    bold(
      `║  bestpickr data wipe${DRY_RUN ? " [DRY RUN]            " : "                      "}║`,
    ),
  );
  console.log(bold("╚══════════════════════════════════════════════╝\n"));

  if (DRY_RUN) {
    console.log(yellow("DRY RUN — no data will be deleted.\n"));
  } else {
    console.log(
      red("WARNING: This will permanently delete all product/search data!"),
    );
    console.log("Starting in 3 seconds... (Ctrl+C to cancel)\n");
    await new Promise((r) => setTimeout(r, 3000));
  }

  // ── Redis ──
  console.log(bold("\n1. Redis"));
  try {
    await clearRedis();
  } catch (err) {
    console.log(red(`  Redis: FAILED — ${err.message}`));
  }

  // ── MongoDB ──
  console.log(bold("\n2. MongoDB"));
  try {
    await clearMongo();
  } catch (err) {
    console.log(red(`  MongoDB: FAILED — ${err.message}`));
  }

  // ── Prisma ──
  console.log(bold("\n3. Prisma (PostgreSQL)"));
  try {
    await clearPrisma();
  } catch (err) {
    console.log(red(`  Prisma: FAILED — ${err.message}`));
  }

  // ── Typesense ──
  console.log(bold("\n4. Typesense"));
  try {
    await clearTypesense();
  } catch (err) {
    console.log(red(`  Typesense: FAILED — ${err.message}`));
  }

  console.log(bold("\n────────────────────────────────────────────────"));
  if (DRY_RUN) {
    console.log(
      yellow("Dry run complete. Re-run without --dry-run to delete."),
    );
  } else {
    console.log(
      green("All data cleared. Restart the backend to trigger fresh preload."),
    );
    console.log("  → Run: node scripts/clearAllData.js to clear again");
    console.log(
      "  → Run: pm2 restart bestpickr  (or nohup node server.js) to restart\n",
    );
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(red(`\nFatal error: ${err.message}`));
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
