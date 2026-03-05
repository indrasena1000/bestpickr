// src/cron/categoryPreloader.js — Daily Category Pre-Loader
// ─────────────────────────────────────────────────────────────────
// WHAT IT DOES:
//   Runs at 12:00 AM IST every day.
//   Scrapes top 10 products for each category.
//   Stores results in Redis so morning users get instant results.
//
// CREDIT COST:
//   ~10 categories × 2 scrapes each (Flipkart + Myntra) = ~20 credits/day
//   Monthly: ~600 credits (out of 5000 budget — leaves 4400 for user searches)
//
// HOW TO TRIGGER MANUALLY:
//   POST /api/admin/preload-categories (added in admin route)
//   Or call: preloadAllCategories() from server.js
// ─────────────────────────────────────────────────────────────────
"use strict";

const { setCategoryCache } = require("../utils/redis");
const logger = require("../utils/logger");

// The ranking agent does the heavy lifting — scrape + score + rank
// We import it lazily to avoid circular dependency issues
let runSearchAgent = null;

function setSearchAgent(fn) {
  runSearchAgent = fn;
}

// Categories to preload — slugs MUST match canonical slugs in categoryKeyMap.js
const CATEGORIES = [
  { slug: "mobile", searchQuery: "best smartphones 2026 india" },
  { slug: "laptop", searchQuery: "best laptops india 2026" },
  { slug: "headphones", searchQuery: "best headphones wireless india" },
  { slug: "televisions", searchQuery: "best smart tv india 2026" },
  { slug: "appliances", searchQuery: "best home appliances india" },
  { slug: "gaming", searchQuery: "best gaming accessories india" },
  { slug: "camera", searchQuery: "best cameras india 2026" },
  { slug: "smartwatch", searchQuery: "best smartwatch india 2026" },
  { slug: "footwear", searchQuery: "best running shoes india" },
  { slug: "skincare", searchQuery: "best skincare products india" },
  { slug: "fashion", searchQuery: "best fashion clothing india" },
];

/**
 * Preload all categories into Redis.
 * Called by the cron scheduler at 12 AM IST and manually via admin endpoint.
 *
 * @returns {{ success: number, failed: number, skipped: number }}
 */
async function preloadAllCategories() {
  if (!runSearchAgent) {
    logger.error("Cron: searchAgent not set — call setSearchAgent() first");
    return { success: 0, failed: 0, skipped: CATEGORIES.length };
  }

  logger.info(
    `Cron: starting category preload (${CATEGORIES.length} categories)`,
  );
  const startTime = Date.now();
  let success = 0;
  let failed = 0;

  // Process sequentially to avoid hammering ScraperAPI
  for (const cat of CATEGORIES) {
    try {
      logger.info(
        `Cron: preloading "${cat.slug}" → search: "${cat.searchQuery}"`,
      );

      const result = await runSearchAgent(cat.searchQuery, cat.slug);

      if (result.results && result.results.length > 0) {
        // Store in category-specific Redis key
        await setCategoryCache(cat.slug, result.results);
        success++;
        logger.info(
          `Cron: "${cat.slug}" → ${result.results.length} products cached`,
        );
      } else {
        failed++;
        logger.warn(`Cron: "${cat.slug}" → 0 products returned`);
      }

      // Pause 3s between categories to respect ScraperAPI rate limits
      await sleep(3000);
    } catch (err) {
      failed++;
      logger.error(`Cron: "${cat.slug}" failed: ${err.message}`);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  logger.info(
    `Cron: preload complete in ${elapsed}s — ${success} cached, ${failed} failed`,
  );

  return { success, failed, skipped: 0, elapsed_seconds: elapsed };
}

// ── CRON SCHEDULER ──────────────────────────────────────────────
// Uses a simple setInterval approach (no extra dependency like node-cron).
// Checks every minute if it's 12:00 AM IST.
//
// IST = UTC + 5:30
// So 12:00 AM IST = 6:30 PM UTC (previous day)

let cronInterval = null;
let lastRunDate = null; // Prevent running twice on same day

function startCron() {
  logger.info(
    "Cron: scheduler started — will preload categories at 12:00 AM IST daily",
  );

  // Check every 60 seconds
  cronInterval = setInterval(() => {
    const now = new Date();
    // Convert to IST
    const istHour =
      (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) %
      24;
    const istMinute = (now.getUTCMinutes() + 30) % 60;
    const todayKey = now.toISOString().slice(0, 10); // "2026-02-19"

    // Run at 00:00 IST (allow 0-1 minute window)
    if (istHour === 0 && istMinute === 0 && lastRunDate !== todayKey) {
      lastRunDate = todayKey;
      logger.info(`Cron: 12:00 AM IST triggered — starting preload`);
      preloadAllCategories().catch((err) =>
        logger.error(`Cron: preload error: ${err.message}`),
      );
    }
  }, 60 * 1000); // check every 60s
}

function stopCron() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    logger.info("Cron: scheduler stopped");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  preloadAllCategories,
  setSearchAgent,
  startCron,
  stopCron,
  CATEGORIES,
};
