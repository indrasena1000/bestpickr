'use strict';
// src/cron/autoSeedCron.js — Weekly self-healing seed for zero-result queries
//
// HOW IT WORKS:
//   1. Every time a search returns 0 products, trackMiss() writes to
//      Redis sorted set  "bestpickr:search_misses"  (ZINCRBY).
//   2. This cron reads the top N missed queries weekly, makes an internal
//      GET /api/search?q=... for each, which runs the full pipeline
//      (Amazon → analysis → cache write).
//   3. Successfully seeded queries are removed from the misses set.
//      If they still return 0 results, they stay in the set and are
//      retried next week.
//
// SCHEDULE: every Monday at 3:10 AM IST
// WHY NOT NIGHTLY: misses represent gaps in Amazon's catalogue; retrying
//   weekly is enough and avoids burning scraper + GPT quota.
//
// COST ESTIMATE:
//   Top 20 misses × 5 scraper calls + 1 GPT call = ~100 scraper + 20 GPT
//   Throttled to 1 query every 5 s → finishes in ~100 s

const cron   = require('node-cron');
const axios  = require('axios');
const logger = require('../utils/logger');

const MISS_KEY   = 'bestpickr:search_misses';
const SEED_LIMIT = 20;    // max queries to seed per run
const THROTTLE   = 5000;  // ms between queries (protect Amazon rate limits)

let _redis = null;

function init(redisClient) {
  _redis = redisClient;
}

// ── Core seed runner (exported so it can be triggered manually / tested) ──────
async function runAutoSeed() {
  if (!_redis || _redis.status !== 'ready') {
    logger.warn('autoSeed: Redis unavailable — skipping');
    return { seeded: 0, skipped: 0, total: 0 };
  }

  // Read top N misses ordered by frequency (highest first)
  const raw = await _redis.zrevrange(MISS_KEY, 0, SEED_LIMIT - 1, 'WITHSCORES');
  if (!raw.length) {
    logger.info('autoSeed: No misses in queue — nothing to do');
    return { seeded: 0, skipped: 0, total: 0 };
  }

  // Parse interleaved [query, score, query, score, …] array from Redis
  const queue = [];
  for (let i = 0; i < raw.length; i += 2) {
    queue.push({ query: raw[i], count: parseInt(raw[i + 1], 10) });
  }
  logger.info(`autoSeed: Seeding ${queue.length} missed queries (${queue.map(q => `"${q.query}"(${q.count}x)`).join(', ')})`);

  const port    = process.env.PORT || 5001;
  const baseUrl = `http://localhost:${port}`;
  let seeded = 0, skipped = 0;

  for (const { query, count } of queue) {
    try {
      logger.info(`autoSeed: → "${query}" (missed ${count}×)`);
      const resp = await axios.get(`${baseUrl}/api/search`, {
        params:  { q: query },
        timeout: 120_000,  // up to 2 min per query
        // Skip the admin token; the internal search endpoint doesn't need it
        headers: { 'x-auto-seed': '1' },
      });

      const data = resp.data;
      if (data.totalResults > 0) {
        // Products found — remove from misses so we don't re-seed next week
        await _redis.zrem(MISS_KEY, query);
        logger.info(`autoSeed: ✅ "${query}" → ${data.totalResults} results, removed from misses`);
        seeded++;
      } else {
        // Still 0 results — keep in misses set, retry next week
        logger.info(`autoSeed: ⚠️  "${query}" still returns 0 results — staying in queue`);
        skipped++;
      }
    } catch (err) {
      logger.warn(`autoSeed: ❌ "${query}" failed — ${err.message}`);
      skipped++;
    }

    // Throttle between requests to protect Amazon PA-API rate limits
    if (queue.indexOf({ query, count }) < queue.length - 1) {
      await new Promise(r => setTimeout(r, THROTTLE));
    }
  }

  const summary = `autoSeed: Done — ${seeded} seeded, ${skipped} still missing`;
  logger.info(summary);
  return { seeded, skipped, total: queue.length };
}

// ── Cron registration ──────────────────────────────────────────────────────────
function startAutoSeedCron() {
  // Every Monday at 3:10 AM IST (UTC+5:30 → 21:40 Sunday UTC)
  cron.schedule('10 3 * * 1', async () => {
    logger.info('autoSeed: Weekly run starting…');
    try {
      const result = await runAutoSeed();
      logger.info(`autoSeed: Weekly run complete`, result);
    } catch (err) {
      logger.error(`autoSeed: Uncaught error — ${err.message}`);
    }
  }, { timezone: 'Asia/Kolkata' });

  logger.info('✅ Auto-seed cron scheduled (weekly Monday 3:10 AM IST)');
}

module.exports = { init, startAutoSeedCron, runAutoSeed };
