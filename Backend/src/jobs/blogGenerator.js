// src/jobs/blogGenerator.js
// Scheduled cron wrapper for the daily "Top 5 Global Tech News" post.
// Called by node-cron in server.js at 3:30 AM UTC (9:00 AM IST).
//
// Generation strategy:
//   1. Fetches real tech news from RSS feeds (last 24 hours)
//   2. Passes raw articles to GPT-4o-mini to write the roundup
//   3. Saves one draft blog post per day (idempotent — skips if already exists)
'use strict';

const { generateDailyBlogs } = require('../services/blogContentService');
const logger = require('../utils/logger');

async function runBlogGeneration() {
  logger.info('[BlogCron] Starting daily Top 5 Tech News generation (RSS-grounded)');
  try {
    const result = await generateDailyBlogs();
    if (result.skipped) {
      logger.info('[BlogCron] Skipped — today\'s post already exists', { slug: result.posts[0] });
    } else {
      logger.info('[BlogCron] Done', result);
    }
  } catch (err) {
    logger.error('[BlogCron] Failed', { error: err.message });
  }
}

module.exports = { runBlogGeneration };
