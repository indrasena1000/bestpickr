// src/jobs/nightlyRefresh.js — Nightly Product Refresh Cron Job
// ─────────────────────────────────────────────────────────────────
// SCHEDULE: Every day at 12:00 AM IST (Asia/Kolkata)
//           = 6:30 PM UTC (previous day)
//
// WHAT IT DOES (in priority order):
//   P1 → Re-analyze top 100 most-searched products
//   P2 → Re-analyze stale ProductAnalysis docs (>7 days old)
//   P3 → Refresh prices for all tracked ProductListings
//   P4 → Check PriceAlerts and notify if target price hit
//
// SAFETY RAILS:
//   - Max 50 products per night (configurable via MAX_PRODUCTS_PER_RUN)
//   - 3s delay between each analysis (ScraperAPI + OpenAI rate limits)
//   - 4-hour hard timeout (job kills itself if it runs too long)
//   - Mutex lock — if previous job still running, skip this run entirely
//   - Every product failure is caught individually (one bad ASIN ≠ job failure)
//
// MONITORING:
//   - Full logging via Winston (same logger as the rest of the app)
//   - Run summary saved to MongoDB JobLog collection after every run
//     (even if the job partially failed)
//
// HOW IT FITS INTO YOUR ARCHITECTURE:
//   ┌─────────────────────────────────────────────────────────┐
//   │  server.js                                               │
//   │    startNightlyRefresh()  ← call once on startup         │
//   │                                                          │
//   │  categoryPreloader.js     ← also runs at 12 AM IST      │
//   │    preloadAllCategories() ← runs AFTER this job          │
//   └─────────────────────────────────────────────────────────┘
//
// MONGO COLLECTIONS USED:
//   SearchCache      → find most-searched queries (P1)
//   ProductAnalysis  → find stale analyses (P2)
//   ProductListing   → update prices + price history (P3)
//   PriceAlert       → check and trigger alerts (P4)
//   JobLog           → save run summary (always)
//
// ENVIRONMENT VARIABLES (all optional — job degrades gracefully):
//   MAX_PRODUCTS_PER_RUN  default: 50
//   NIGHTLY_DELAY_MS      default: 3000 (3s between products)
//   MAX_JOB_DURATION_MS   default: 14400000 (4 hours)
// ─────────────────────────────────────────────────────────────────
"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;
const logger = require("../utils/logger");
const {
  runAnalysisPipeline,
  findStaleAnalyses,
  runBatchAnalysis,
} = require("../pipeline/analysisPipeline");
const {
  ProductAnalysis,
  ProductListing,
  SearchCache,
  PriceAlert,
} = require("../models");
const { getClient: getRedis } = require("../utils/redis");

// ── CONFIG ────────────────────────────────────────────────────────
const MAX_PRODUCTS_PER_RUN = parseInt(process.env.MAX_PRODUCTS_PER_RUN) || 50;
const DELAY_MS = parseInt(process.env.NIGHTLY_DELAY_MS) || 3000;
const MAX_JOB_DURATION_MS =
  parseInt(process.env.MAX_JOB_DURATION_MS) || 4 * 60 * 60 * 1000; // 4 hours
const PRICE_DROP_THRESHOLD = 0.05; // 5% price drop = "significant" → triggers alert check

// ── IST SCHEDULE ──────────────────────────────────────────────────
// IST = UTC + 5:30
// 12:00 AM IST = 18:30 UTC previous day
// We check every 60 seconds and fire when IST hour=0, minute=0
const CHECK_INTERVAL_MS = 60 * 1000; // check every 1 minute

// ═════════════════════════════════════════════════════════════════
// JOB LOG SCHEMA
// ═════════════════════════════════════════════════════════════════
// Saved to MongoDB after every run so you have a full history of
// what happened each night. Useful for debugging and monitoring.
// Auto-expires after 90 days (TTL index) to avoid log bloat.

const jobLogSchema = new Schema(
  {
    jobName: { type: String, default: "nightlyRefresh" },
    runDate: { type: Date, default: Date.now, index: true },

    // Timing
    startedAt: { type: Date },
    completedAt: { type: Date },
    durationMs: { type: Number },

    // Overall outcome
    status: {
      type: String,
      enum: ["success", "partial", "failed", "skipped"],
      default: "success",
    },
    skipReason: { type: String, default: null },

    // P1: Most-searched product analysis
    p1: {
      attempted: { type: Number, default: 0 },
      succeeded: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
    },

    // P2: Stale analysis refresh
    p2: {
      attempted: { type: Number, default: 0 },
      succeeded: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },

    // P3: Price refresh
    p3: {
      productsChecked: { type: Number, default: 0 },
      pricesUpdated: { type: Number, default: 0 },
      significantDrops: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
    },

    // P4: Price alerts
    p4: {
      alertsChecked: { type: Number, default: 0 },
      alertsTriggered: { type: Number, default: 0 },
      alertsNotified: { type: Number, default: 0 },
    },

    // API usage tracking (for cost monitoring)
    apiCalls: {
      scraperApi: { type: Number, default: 0 },
      openAi: { type: Number, default: 0 },
      amazon: { type: Number, default: 0 },
    },

    // Individual failures (ASIN + error message)
    failures: [
      {
        asin: String,
        phase: String, // 'p1' | 'p2' | 'p3' | 'p4'
        error: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],

    // Final notes / warnings
    notes: [String],
  },
  {
    timestamps: false,
    collection: "job_logs",
    toJSON: { versionKey: false },
    toObject: { versionKey: false },
  },
);

// Auto-delete logs older than 90 days
jobLogSchema.index({ runDate: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Compile model lazily (avoids OverwriteModelError if module is hot-reloaded)
let JobLog;
function getJobLogModel() {
  if (!JobLog) {
    JobLog = mongoose.models.JobLog || mongoose.model("JobLog", jobLogSchema);
  }
  return JobLog;
}

// ═════════════════════════════════════════════════════════════════
// MUTEX — PREVENT CONCURRENT RUNS
// ═════════════════════════════════════════════════════════════════
// If the nightly job is still running when the next trigger fires
// (e.g. it took >24h somehow), we skip rather than run two jobs
// at the same time, which would double the API costs.

let isRunning = false;
let lastRunKey = null; // "2026-02-20" — prevents double-fire in same minute

function getISTDateKey() {
  const now = new Date();
  // IST offset: +5:30 = +330 minutes
  const istMs = now.getTime() + 330 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10); // "2026-02-20"
}

function getISTTime() {
  const now = new Date();
  const istMs = now.getTime() + 330 * 60 * 1000;
  const ist = new Date(istMs);
  return { hour: ist.getUTCHours(), minute: ist.getUTCMinutes() };
}

// ═════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═════════════════════════════════════════════════════════════════

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Format milliseconds → "2h 34m 12s" for logs
function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Check if the job has exceeded its maximum allowed duration
function isTimedOut(startTime) {
  return Date.now() - startTime > MAX_JOB_DURATION_MS;
}

// Save the run summary to MongoDB (called at the end of every run)
async function saveJobLog(summary) {
  try {
    const Model = getJobLogModel();
    await Model.create(summary);
    logger.info(`🌙 NightlyRefresh: job log saved to MongoDB`);
  } catch (err) {
    // Non-fatal — don't let a log-save failure crash anything
    logger.error(`🌙 NightlyRefresh: failed to save job log — ${err.message}`);
  }
}

// ═════════════════════════════════════════════════════════════════
// PRIORITY 1: REFRESH TOP SEARCHED PRODUCTS
// ═════════════════════════════════════════════════════════════════
// Strategy:
//   1. Pull the most recent 200 SearchCache entries
//   2. Each SearchCache doc has an array of ASIN strings in `results`
//   3. Flatten → deduplicate → take top N by frequency
//   4. For each ASIN, find its ProductAnalysis to get productName + category
//   5. Run the full analysis pipeline

async function runPriority1(summary, startTime, budget) {
  logger.info(
    `🌙 P1: starting — top searched products (budget: ${budget} slots)`,
  );

  const p1Stats = { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };

  try {
    // ── Find most-queried ASINs from SearchCache ─────────────────
    // SearchCache stores results as an array of ASIN strings per query.
    // We aggregate to find which ASINs appear most across all searches.
    const recentCaches = await SearchCache.find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .select("results normalizedQuery")
      .lean();

    if (!recentCaches.length) {
      logger.info(`🌙 P1: SearchCache is empty — skipping P1`);
      p1Stats.skipped = budget;
      return p1Stats;
    }

    // Count ASIN frequency across all cached searches
    const asinCount = {};
    for (const cache of recentCaches) {
      for (const asin of cache.results || []) {
        if (typeof asin === "string" && asin.length === 10) {
          asinCount[asin] = (asinCount[asin] || 0) + 1;
        }
      }
    }

    // Sort by frequency — most popular first
    const sortedAsins = Object.entries(asinCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, budget)
      .map(([asin]) => asin);

    logger.info(
      `🌙 P1: found ${Object.keys(asinCount).length} unique ASINs in SearchCache ` +
        `→ processing top ${sortedAsins.length}`,
    );

    // ── Look up product details for each ASIN ───────────────────
    // We need productName + category to run the analysis pipeline.
    // ProductAnalysis is the source of truth for this metadata.
    const analyses = await ProductAnalysis.find({ asin: { $in: sortedAsins } })
      .select("asin productName category brand")
      .lean();

    const analysisByAsin = {};
    for (const a of analyses) {
      analysisByAsin[a.asin] = a;
    }

    // ── Process each ASIN ────────────────────────────────────────
    for (const asin of sortedAsins) {
      if (isTimedOut(startTime)) {
        logger.warn(`🌙 P1: 4-hour timeout reached — stopping early`);
        summary.notes.push(
          `P1 stopped early: job timeout after ${formatDuration(MAX_JOB_DURATION_MS)}`,
        );
        break;
      }

      p1Stats.attempted++;
      const meta = analysisByAsin[asin];

      if (!meta) {
        // ASIN in SearchCache but no ProductAnalysis record — skip
        logger.info(
          `🌙 P1: ASIN ${asin} has no ProductAnalysis record — skipping`,
        );
        p1Stats.skipped++;
        continue;
      }

      try {
        logger.info(
          `🌙 P1 [${p1Stats.attempted}/${sortedAsins.length}]: ${asin} "${meta.productName}"`,
        );

        const result = await runAnalysisPipeline(
          asin,
          meta.productName,
          meta.category,
          { brand: meta.brand },
          // No forceRefresh — pipeline's shouldReanalyze() gates on 7-day staleness.
          // Scraper + GPT only fire if the analysis is actually stale.
        );

        if (result && result.aiScore !== null) {
          p1Stats.succeeded++;
          // Only count API costs when a fresh analysis actually ran
          if (result._pipelineMeta?.source === 'fresh-analysis') {
            summary.apiCalls.scraperApi += 5;
            summary.apiCalls.openAi += 1;
          }
          logger.info(
            `🌙 P1: ✅ ${asin} → aiScore=${result.aiScore} ` +
            `source=${result._pipelineMeta?.source || 'unknown'}`,
          );
        } else {
          p1Stats.failed++;
          summary.failures.push({
            asin,
            phase: "p1",
            error: "Pipeline returned null or no score",
          });
          logger.warn(`🌙 P1: ⚠️  ${asin} — pipeline returned null/no score`);
        }
      } catch (err) {
        p1Stats.failed++;
        summary.failures.push({ asin, phase: "p1", error: err.message });
        logger.error(`🌙 P1: ❌ ${asin} — ${err.message}`);
        // Individual failure — continue with next product
      }

      // Rate limit delay between products
      if (p1Stats.attempted < sortedAsins.length) {
        await sleep(DELAY_MS);
      }
    }
  } catch (err) {
    logger.error(`🌙 P1: phase-level error — ${err.message}`);
    summary.notes.push(`P1 phase error: ${err.message}`);
  }

  logger.info(
    `🌙 P1: complete — ` +
      `${p1Stats.succeeded} succeeded, ${p1Stats.failed} failed, ${p1Stats.skipped} skipped`,
  );

  return p1Stats;
}

// ═════════════════════════════════════════════════════════════════
// PRIORITY 2: REFRESH STALE ANALYSES
// ═════════════════════════════════════════════════════════════════
// Uses findStaleAnalyses() from analysisPipeline.js which already
// knows the 7-day cutoff rule. We only process what P1 didn't cover.

async function runPriority2(summary, startTime, budget, p1AsinsProcessed) {
  logger.info(`🌙 P2: starting — stale analyses (budget: ${budget} slots)`);

  const p2Stats = { attempted: 0, succeeded: 0, failed: 0 };

  if (budget <= 0) {
    logger.info(`🌙 P2: no budget remaining — skipping`);
    return p2Stats;
  }

  try {
    // findStaleAnalyses() from analysisPipeline.js handles the 7-day check
    // and low-confidence retry logic — we just call it
    const staleProducts = await findStaleAnalyses(
      budget + p1AsinsProcessed.size,
    );

    // Filter out ASINs already processed in P1 to avoid double work
    const toProcess = staleProducts
      .filter((p) => !p1AsinsProcessed.has(p.asin))
      .slice(0, budget);

    if (!toProcess.length) {
      logger.info(
        `🌙 P2: no stale products found (or all already refreshed in P1)`,
      );
      return p2Stats;
    }

    logger.info(`🌙 P2: found ${toProcess.length} stale products to refresh`);

    for (const product of toProcess) {
      if (isTimedOut(startTime)) {
        logger.warn(`🌙 P2: timeout reached — stopping early`);
        summary.notes.push("P2 stopped early: job timeout");
        break;
      }

      p2Stats.attempted++;

      try {
        logger.info(
          `🌙 P2 [${p2Stats.attempted}/${toProcess.length}]: ` +
            `${product.asin} "${product.productName}" ` +
            `(age: ${product.analysisDate ? Math.round((Date.now() - new Date(product.analysisDate)) / 86400000) + "d" : "never"})`,
        );

        const result = await runAnalysisPipeline(
          product.asin,
          product.productName,
          product.category,
          { brand: product.brand },
          // No forceRefresh — pipeline's own shouldReanalyze() decides
        );

        if (result && result.aiScore !== null) {
          p2Stats.succeeded++;
          summary.apiCalls.scraperApi += 5;
          summary.apiCalls.openAi += 1;
          logger.info(`🌙 P2: ✅ ${product.asin} → aiScore=${result.aiScore}`);
        } else {
          p2Stats.failed++;
          summary.failures.push({
            asin: product.asin,
            phase: "p2",
            error: "Pipeline returned null",
          });
        }
      } catch (err) {
        p2Stats.failed++;
        summary.failures.push({
          asin: product.asin,
          phase: "p2",
          error: err.message,
        });
        logger.error(`🌙 P2: ❌ ${product.asin} — ${err.message}`);
      }

      if (p2Stats.attempted < toProcess.length) {
        await sleep(DELAY_MS);
      }
    }
  } catch (err) {
    logger.error(`🌙 P2: phase-level error — ${err.message}`);
    summary.notes.push(`P2 phase error: ${err.message}`);
  }

  logger.info(
    `🌙 P2: complete — ${p2Stats.succeeded} succeeded, ${p2Stats.failed} failed`,
  );

  return p2Stats;
}

// ═════════════════════════════════════════════════════════════════
// PRIORITY 3: REFRESH PRICES
// ═════════════════════════════════════════════════════════════════
// Pull current prices from ProductListing, compare to what we have,
// update if changed, append to priceHistory, flag big drops.
//
// NOTE: We don't re-scrape here — that would be expensive.
// Instead we use the prices already stored in ProductListing
// (which gets updated when searches happen) and check for
// significant changes against the last recorded priceHistory entry.
// When Amazon PA-API is live, we'll call it here for fresh prices.

async function runPriority3(summary, startTime) {
  logger.info(`🌙 P3: starting — price refresh check`);

  const p3Stats = {
    productsChecked: 0,
    pricesUpdated: 0,
    significantDrops: 0,
    errors: 0,
  };

  try {
    // Fetch all ProductListings that have been updated in the last 30 days
    // (no point checking products that haven't been touched in a month)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const listings = await ProductListing.find({
      lastDataRefresh: { $gte: thirtyDaysAgo },
      $or: [
        { amazonPrice: { $ne: null } },
        { flipkartPrice: { $ne: null } },
        { myntraPrice: { $ne: null } },
      ],
    })
      .select(
        "asin title brand category amazonPrice flipkartPrice myntraPrice bestPrice bestPlatform priceHistory lastPriceUpdate",
      )
      .lean();

    if (!listings.length) {
      logger.info(`🌙 P3: no active product listings found`);
      return p3Stats;
    }

    logger.info(`🌙 P3: checking prices for ${listings.length} products`);

    for (const listing of listings) {
      if (isTimedOut(startTime)) {
        logger.warn(`🌙 P3: timeout — stopping price check early`);
        summary.notes.push("P3 stopped early: job timeout");
        break;
      }

      p3Stats.productsChecked++;

      try {
        // Find the last recorded price for comparison
        const lastHistory = listing.priceHistory?.slice(-1)?.[0];
        const currentBestPrice = listing.bestPrice;

        if (!currentBestPrice || !lastHistory) continue;

        const lastRecordedPrice = lastHistory.price;
        const priceDelta = lastRecordedPrice - currentBestPrice;
        const dropPercent =
          lastRecordedPrice > 0 ? priceDelta / lastRecordedPrice : 0;

        const isSignificantDrop =
          dropPercent >= PRICE_DROP_THRESHOLD && priceDelta > 0;

        // Record today's price snapshot if price changed or no entry today
        const lastHistoryDate = lastHistory?.date
          ? new Date(lastHistory.date).toISOString().slice(0, 10)
          : null;
        const today = new Date().toISOString().slice(0, 10);

        if (lastHistoryDate !== today || Math.abs(priceDelta) > 1) {
          // Use ProductListing.recordPrice() static method from models/index.js
          await ProductListing.recordPrice(
            listing.asin,
            listing.bestPlatform || "amazon",
            currentBestPrice,
          );
          p3Stats.pricesUpdated++;

          if (isSignificantDrop) {
            p3Stats.significantDrops++;
            logger.info(
              `🌙 P3: 📉 significant price drop for ${listing.asin} "${listing.title}" ` +
                `₹${lastRecordedPrice} → ₹${currentBestPrice} ` +
                `(-${Math.round(dropPercent * 100)}%)`,
            );
          }
        }

        // Update currentPrice on all active PriceAlerts for this ASIN
        // so P4 can do a simple comparison
        if (currentBestPrice) {
          await PriceAlert.updateMany(
            { asin: listing.asin, isActive: true },
            { $set: { currentPrice: currentBestPrice } },
          );
        }
      } catch (err) {
        p3Stats.errors++;
        summary.failures.push({
          asin: listing.asin,
          phase: "p3",
          error: err.message,
        });
        logger.warn(`🌙 P3: error for ${listing.asin} — ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`🌙 P3: phase-level error — ${err.message}`);
    summary.notes.push(`P3 phase error: ${err.message}`);
  }

  logger.info(
    `🌙 P3: complete — ` +
      `${p3Stats.productsChecked} checked, ` +
      `${p3Stats.pricesUpdated} prices recorded, ` +
      `${p3Stats.significantDrops} significant drops`,
  );

  return p3Stats;
}

// ═════════════════════════════════════════════════════════════════
// PRIORITY 4: PRICE ALERT CHECKER
// ═════════════════════════════════════════════════════════════════
// P3 already updated currentPrice on all active alerts.
// Now we find any alerts where currentPrice <= targetPrice and notify.
//
// EMAIL INTEGRATION: Replace notifyUser() stub with your email
// provider (Nodemailer, SendGrid, AWS SES, etc.) when ready.
// The structure is already set up — just swap the log for a real send.

async function runPriority4(summary) {
  logger.info(`🌙 P4: starting — price alert check`);

  const p4Stats = {
    alertsChecked: 0,
    alertsTriggered: 0,
    alertsNotified: 0,
  };

  try {
    // findTriggerable() is defined in PriceAlert model (models/index.js)
    // Returns active alerts where currentPrice <= targetPrice
    const triggeredAlerts = await PriceAlert.findTriggerable();

    if (!triggeredAlerts.length) {
      logger.info(`🌙 P4: no price alerts triggered tonight`);
      return p4Stats;
    }

    logger.info(
      `🌙 P4: ${triggeredAlerts.length} alerts triggered — notifying users`,
    );

    for (const alert of triggeredAlerts) {
      p4Stats.alertsChecked++;

      try {
        // ── Notify user ──────────────────────────────────────────
        // TODO: Replace this log with real email when ready.
        // Suggested providers: Resend (resend.com) — easiest for India,
        // or AWS SES — cheapest at scale.
        await notifyUser(alert);
        p4Stats.alertsTriggered++;

        // Mark alert as triggered so we don't re-notify
        await PriceAlert.findByIdAndUpdate(alert._id, {
          $set: {
            isActive: false, // Deactivate — user got their notification
            triggeredAt: new Date(),
          },
          $inc: { notificationsSent: 1 },
        });

        p4Stats.alertsNotified++;

        logger.info(
          `🌙 P4: ✅ alert triggered — ${alert.email} | ` +
            `ASIN=${alert.asin} | ` +
            `target=₹${alert.targetPrice} | ` +
            `current=₹${alert.currentPrice}`,
        );
      } catch (err) {
        summary.failures.push({
          asin: alert.asin,
          phase: "p4",
          error: `Notification failed for ${alert.email}: ${err.message}`,
        });
        logger.error(
          `🌙 P4: ❌ notification failed for ${alert.email} — ${err.message}`,
        );
      }
    }
  } catch (err) {
    logger.error(`🌙 P4: phase-level error — ${err.message}`);
    summary.notes.push(`P4 phase error: ${err.message}`);
  }

  logger.info(
    `🌙 P4: complete — ` +
      `${p4Stats.alertsTriggered} triggered, ${p4Stats.alertsNotified} notified`,
  );

  return p4Stats;
}

// ── NOTIFICATION STUB ─────────────────────────────────────────────
// Currently logs to console + writes to a Redis notification queue
// for future processing. Replace the TODO section with real email.
async function notifyUser(alert) {
  const saving = alert.currentPrice
    ? Math.round(
        ((alert.currentPrice - alert.targetPrice) / alert.currentPrice) * 100,
      )
    : 0;

  // ── Current: Console log ─────────────────────────────────────
  logger.info(
    `\n` +
      `  ╔══════════════════════════════════════════════╗\n` +
      `  ║  🔔 PRICE ALERT TRIGGERED                    ║\n` +
      `  ║  To:      ${alert.email.padEnd(36)}║\n` +
      `  ║  Product: ${(alert.productName || alert.asin).slice(0, 36).padEnd(36)}║\n` +
      `  ║  Target:  ₹${String(alert.targetPrice).padEnd(35)}║\n` +
      `  ║  Current: ₹${String(alert.currentPrice).padEnd(35)}║\n` +
      `  ║  Saving:  ${String(saving + "% below target price").padEnd(36)}║\n` +
      `  ╚══════════════════════════════════════════════╝`,
  );

  // ── Optional: Push to Redis notification queue ───────────────
  // Useful if you have a separate notification worker process.
  // Remove if you're going straight to email.
  const redis = getRedis();
  if (redis && redis.status === "ready") {
    try {
      const notification = {
        type: "price_alert",
        email: alert.email,
        asin: alert.asin,
        productName: alert.productName,
        targetPrice: alert.targetPrice,
        currentPrice: alert.currentPrice,
        platform: alert.platform,
        triggeredAt: new Date().toISOString(),
      };
      // Push to a list — a separate worker can LPOP from this
      await redis.rpush(
        "bestpickr:notifications:queue",
        JSON.stringify(notification),
      );
      // Expire after 48 hours in case worker is down
      await redis.expire("bestpickr:notifications:queue", 48 * 60 * 60);
    } catch (redisErr) {
      // Non-fatal — notification still logged above
      logger.warn(
        `🌙 P4: Redis notification queue push failed — ${redisErr.message}`,
      );
    }
  }

  // ── TODO: Add real email here ─────────────────────────────────
  // OPTION A: Resend (recommended — simple API, good deliverability)
  //   const resend = new Resend(process.env.RESEND_API_KEY)
  //   await resend.emails.send({
  //     from:    'alerts@bestpickr.in',
  //     to:      alert.email,
  //     subject: `Price drop alert: ${alert.productName}`,
  //     html:    buildAlertEmailHtml(alert),
  //   })
  //
  // OPTION B: Nodemailer + Gmail (good for early stage)
  //   const transporter = nodemailer.createTransporter({ ... })
  //   await transporter.sendMail({ to: alert.email, subject: ..., html: ... })
  //
  // OPTION C: AWS SES (cheapest at scale — $0.10 per 1000 emails)
  //   const ses = new AWS.SES({ region: 'ap-south-1' })
  //   await ses.sendEmail({ ... }).promise()
}

// ═════════════════════════════════════════════════════════════════
// MAIN JOB RUNNER
// ═════════════════════════════════════════════════════════════════

async function runNightlyJob() {
  // ── Mutex: skip if already running ──────────────────────────
  if (isRunning) {
    logger.warn(
      `🌙 NightlyRefresh: previous job still running — SKIPPING this run`,
    );
    await saveJobLog({
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 0,
      status: "skipped",
      skipReason: "Previous job still running",
      notes: ["Mutex prevented concurrent execution"],
    });
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  const runDate = new Date();

  // ── Build the summary object — filled in as job progresses ──
  const summary = {
    jobName: "nightlyRefresh",
    runDate,
    startedAt: runDate,
    completedAt: null,
    durationMs: null,
    status: "success",
    skipReason: null,
    p1: { attempted: 0, succeeded: 0, failed: 0, skipped: 0 },
    p2: { attempted: 0, succeeded: 0, failed: 0 },
    p3: {
      productsChecked: 0,
      pricesUpdated: 0,
      significantDrops: 0,
      errors: 0,
    },
    p4: { alertsChecked: 0, alertsTriggered: 0, alertsNotified: 0 },
    apiCalls: { scraperApi: 0, openAi: 0, amazon: 0 },
    failures: [],
    notes: [],
  };

  logger.info(`\n${"═".repeat(60)}`);
  logger.info(`🌙 NightlyRefresh: JOB STARTED`);
  logger.info(
    `🌙 NightlyRefresh: ${runDate.toISOString()} (IST: ${getISTDateKey()})`,
  );
  logger.info(
    `🌙 NightlyRefresh: max products=${MAX_PRODUCTS_PER_RUN} delay=${DELAY_MS}ms timeout=${formatDuration(MAX_JOB_DURATION_MS)}`,
  );
  logger.info(`${"═".repeat(60)}`);

  try {
    // ── Check MongoDB is available ───────────────────────────────
    if (mongoose.connection.readyState !== 1) {
      const msg = "MongoDB not connected — cannot run nightly job";
      logger.error(`🌙 NightlyRefresh: ❌ ${msg}`);
      summary.status = "failed";
      summary.skipReason = msg;
      summary.notes.push(msg);
      isRunning = false;
      return;
    }

    // ── Budget allocation: 50 products split across P1 and P2 ───
    // P1 gets 70% of the budget (most-searched = highest value)
    // P2 gets the remaining 30%
    const p1Budget = Math.floor(MAX_PRODUCTS_PER_RUN * 0.7); // ~35
    const p2Budget = MAX_PRODUCTS_PER_RUN - p1Budget; // ~15

    // ── PRIORITY 1 ───────────────────────────────────────────────
    logger.info(`\n${"─".repeat(40)}`);
    logger.info(`🌙 NightlyRefresh: PHASE 1 — Top Searched Products`);
    logger.info(`${"─".repeat(40)}`);

    const p1Result = await runPriority1(summary, startTime, p1Budget);
    summary.p1 = p1Result;

    // Track which ASINs P1 processed so P2 can skip them
    const p1AsinsProcessed = new Set();
    // (We don't have direct access to the ASINs list here, but findStaleAnalyses
    //  will naturally exclude recently-refreshed ones since their analysisDate
    //  was just updated by P1 — so this is handled automatically)

    if (isTimedOut(startTime)) {
      summary.status = "partial";
      summary.notes.push("Job timed out after P1 — P2, P3, P4 skipped");
      logger.warn(`🌙 NightlyRefresh: timed out after P1`);
    } else {
      // ── PRIORITY 2 ─────────────────────────────────────────────
      logger.info(`\n${"─".repeat(40)}`);
      logger.info(`🌙 NightlyRefresh: PHASE 2 — Stale Analysis Refresh`);
      logger.info(`${"─".repeat(40)}`);

      const p2Result = await runPriority2(
        summary,
        startTime,
        p2Budget,
        p1AsinsProcessed,
      );
      summary.p2 = p2Result;

      if (isTimedOut(startTime)) {
        summary.status = "partial";
        summary.notes.push("Job timed out after P2 — P3, P4 skipped");
        logger.warn(`🌙 NightlyRefresh: timed out after P2`);
      } else {
        // ── PRIORITY 3 ───────────────────────────────────────────
        logger.info(`\n${"─".repeat(40)}`);
        logger.info(`🌙 NightlyRefresh: PHASE 3 — Price Refresh`);
        logger.info(`${"─".repeat(40)}`);

        const p3Result = await runPriority3(summary, startTime);
        summary.p3 = p3Result;

        if (isTimedOut(startTime)) {
          summary.status = "partial";
          summary.notes.push("Job timed out after P3 — P4 skipped");
        } else {
          // ── PRIORITY 4 ─────────────────────────────────────────
          logger.info(`\n${"─".repeat(40)}`);
          logger.info(`🌙 NightlyRefresh: PHASE 4 — Price Alerts`);
          logger.info(`${"─".repeat(40)}`);

          const p4Result = await runPriority4(summary);
          summary.p4 = p4Result;
        }
      }
    }
  } catch (err) {
    // Top-level catch — something very unexpected happened
    summary.status = "failed";
    summary.notes.push(`Unhandled error: ${err.message}`);
    logger.error(`🌙 NightlyRefresh: ❌ UNHANDLED ERROR — ${err.message}`);
    logger.error(
      `🌙 NightlyRefresh: stack: ${err.stack?.split("\n").slice(1, 4).join(" | ")}`,
    );
  } finally {
    // ── Always runs — finalize summary and save ──────────────────
    isRunning = false;

    summary.completedAt = new Date();
    summary.durationMs = Date.now() - startTime;

    // Determine final status based on failures
    if (summary.status === "success" && summary.failures.length > 0) {
      summary.status = "partial";
    }

    const totalProducts =
      summary.p1.succeeded +
      summary.p1.failed +
      summary.p2.succeeded +
      summary.p2.failed;

    logger.info(`\n${"═".repeat(60)}`);
    logger.info(`🌙 NightlyRefresh: JOB COMPLETE`);
    logger.info(
      `🌙 NightlyRefresh: status=${summary.status} duration=${formatDuration(summary.durationMs)}`,
    );
    logger.info(
      `🌙 NightlyRefresh: P1 — ${summary.p1.succeeded}✅ ${summary.p1.failed}❌ ${summary.p1.skipped}⏭`,
    );
    logger.info(
      `🌙 NightlyRefresh: P2 — ${summary.p2.succeeded}✅ ${summary.p2.failed}❌`,
    );
    logger.info(
      `🌙 NightlyRefresh: P3 — ${summary.p3.productsChecked} checked, ${summary.p3.pricesUpdated} updated, ${summary.p3.significantDrops} drops`,
    );
    logger.info(
      `🌙 NightlyRefresh: P4 — ${summary.p4.alertsTriggered} alerts triggered`,
    );
    logger.info(
      `🌙 NightlyRefresh: API — ScraperAPI=${summary.apiCalls.scraperApi} OpenAI=${summary.apiCalls.openAi}`,
    );
    logger.info(`🌙 NightlyRefresh: failures=${summary.failures.length}`);
    if (summary.notes.length) {
      summary.notes.forEach((n) =>
        logger.info(`🌙 NightlyRefresh: NOTE — ${n}`),
      );
    }
    logger.info(`${"═".repeat(60)}\n`);

    // Save run summary to MongoDB (best-effort)
    await saveJobLog(summary);
  }
}

// ═════════════════════════════════════════════════════════════════
// CRON SCHEDULER
// ═════════════════════════════════════════════════════════════════
// Fires at 12:00 AM IST every day.
// Uses the same IST detection pattern as categoryPreloader.js
// so both cron jobs use the same timing mechanism.
//
// Offset by 1 minute from categoryPreloader (which fires at 00:00)
// so they don't both hit MongoDB and Redis simultaneously.
// nightlyRefresh fires at 00:01 IST → categoryPreloader fires after it.

let cronInterval = null;
let lastRunDate = null;

function startNightlyRefresh() {
  if (cronInterval) {
    logger.warn(
      "🌙 NightlyRefresh: already started — ignoring duplicate startNightlyRefresh() call",
    );
    return;
  }

  logger.info(
    "🌙 NightlyRefresh: scheduler started — will run at 12:01 AM IST daily",
  );
  logger.info(
    `🌙 NightlyRefresh: config — maxProducts=${MAX_PRODUCTS_PER_RUN} delay=${DELAY_MS}ms timeout=${formatDuration(MAX_JOB_DURATION_MS)}`,
  );

  cronInterval = setInterval(() => {
    const { hour, minute } = getISTTime();
    const todayKey = getISTDateKey();

    // Fire at 00:01 IST (1 minute after midnight)
    // Offset from categoryPreloader.js which fires at 00:00
    if (hour === 0 && minute === 1 && lastRunDate !== todayKey) {
      lastRunDate = todayKey;
      logger.info(`🌙 NightlyRefresh: 12:01 AM IST triggered — starting job`);
      runNightlyJob().catch((err) =>
        logger.error(`🌙 NightlyRefresh: top-level catch — ${err.message}`),
      );
    }
  }, CHECK_INTERVAL_MS);
}

function stopNightlyRefresh() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    logger.info("🌙 NightlyRefresh: scheduler stopped");
  }
}

// ── Manual trigger (admin endpoint / testing) ─────────────────────
// Call this from POST /api/admin/trigger-nightly-refresh
async function triggerManually(options = {}) {
  if (isRunning) {
    return { success: false, message: "Job is already running" };
  }

  logger.info("🌙 NightlyRefresh: manual trigger called");

  // Run without awaiting so the admin API returns immediately
  runNightlyJob().catch((err) =>
    logger.error(`🌙 NightlyRefresh: manual run error — ${err.message}`),
  );

  return {
    success: true,
    message: "Nightly refresh job started manually",
    config: {
      maxProducts: MAX_PRODUCTS_PER_RUN,
      delayMs: DELAY_MS,
      timeoutMs: MAX_JOB_DURATION_MS,
    },
  };
}

// ── Status check (admin endpoint) ────────────────────────────────
function getJobStatus() {
  return {
    isRunning,
    lastRunDate,
    scheduledFor: "12:01 AM IST daily",
    config: {
      maxProductsPerRun: MAX_PRODUCTS_PER_RUN,
      delayBetweenMs: DELAY_MS,
      maxDurationMs: MAX_JOB_DURATION_MS,
    },
  };
}

// ═════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════

module.exports = {
  // Called once from server.js on startup
  startNightlyRefresh,
  stopNightlyRefresh,

  // Admin/testing utilities
  triggerManually,
  getJobStatus,
  runNightlyJob, // Exported for direct testing
};
