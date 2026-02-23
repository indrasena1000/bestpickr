// src/jobs/blogGenerator.js
// Scheduled cron wrapper for daily blog generation.
// Called by node-cron in server.js at 3:30 AM UTC (9:00 AM IST).
'use strict';

const { generateDailyBlogs } = require('../services/blogContentService');
const logger = require('../utils/logger');

async function runBlogGeneration() {
  logger.info('[BlogCron] Starting daily blog generation');
  try {
    const result = await generateDailyBlogs();
    logger.info('[BlogCron] Done', result);
  } catch (err) {
    logger.error('[BlogCron] Failed', { error: err.message });
  }
}

module.exports = { runBlogGeneration };
