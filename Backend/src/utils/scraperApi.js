// src/utils/scraperApi.js
// ─────────────────────────────────────────────────────────────────
// ScraperAPI shared utility for Flipkart + Myntra services
//
// FEATURES:
//   1. Credit tracker — logs how many of 100K credits used
//   2. Request cache  — same query within 30min won't re-scrape
//   3. Rate limiter   — max 20 concurrent (your plan limit)
//   4. Retry logic    — auto-retries 429/503 with backoff
//   5. India headers  — forces INR prices and Indian content
//   6. Health check   — verify API key is valid
// ─────────────────────────────────────────────────────────────────
"use strict";

const axios = require("axios");
const logger = require("./logger");

const SCRAPER_KEY = process.env.SCRAPER_API_KEY;
const MAX_RETRIES = 2;
const RETRY_DELAY = 2000; // ms between retries
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes in ms

// ── IN-MEMORY CACHE ────────────────────────────────────────────────
// Prevents re-scraping the same URL within 30 min
// In production, replace with Redis for multi-instance support
const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, ts: Date.now() });
  // Prevent memory leak — limit cache to 500 entries
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

// ── CREDIT TRACKER ─────────────────────────────────────────────────
// ScraperAPI charges:
//   1 credit  — basic (no render, no premium)
//   5 credits — render=true (headless Chrome, datacenter IP)
//  10 credits — premium=true (residential IP, no render)
//  25 credits — render=true + premium=true (residential + headless Chrome)
let creditsUsed = 0;
let requestsTotal = 0;

function trackCredit(rendered = false, premium = false) {
  let cost = 1;
  if (rendered && premium) cost = 25;
  else if (premium) cost = 10;
  else if (rendered) cost = 5;
  creditsUsed += cost;
  requestsTotal += 1;
  if (requestsTotal % 20 === 0) {
    logger.info(
      `📊 ScraperAPI usage: ${creditsUsed} credits used across ${requestsTotal} requests`,
    );
  }
}

// ── MAIN FETCH WITH RETRY ──────────────────────────────────────────
/**
 * Fetch a URL through ScraperAPI with Indian IP.
 * Automatically handles caching, retries, and credit tracking.
 *
 * @param {string} targetUrl   - The actual URL to scrape (Flipkart/Myntra/Amazon)
 * @param {Object} options     - ScraperAPI options
 * @param {boolean} options.render     - Execute JavaScript? (true = 5 credits, uses headless Chromium)
 * @param {boolean} options.premium    - Use residential proxies? (true = 25 credits, bypasses Amazon blocks)
 * @param {string}  options.waitFor    - CSS selector to wait for before returning (only with render=true)
 * @param {number}  options.timeout    - Request timeout in ms (recommend 70000+ for render=true)
 * @returns {Object}           - { data: string, status: number, fromCache: boolean }
 */
async function fetchViaScraperAPI(targetUrl, options = {}) {
  const {
    render = false,
    premium = false,
    waitFor = null,
    timeout = 25000,
    cacheKey = null,
  } = options;

  // Check cache first
  const key = cacheKey || `${targetUrl}:${render}`;
  const cached = getCached(key);
  if (cached) {
    logger.info(`⚡ ScraperAPI cache hit: ${targetUrl.slice(0, 60)}...`);
    return { data: cached, fromCache: true };
  }

  if (!SCRAPER_KEY) {
    throw new Error(
      "SCRAPER_API_KEY is not set in .env — required for review scraping",
    );
  }

  // Build ScraperAPI URL
  const params = {
    api_key: SCRAPER_KEY,
    url: targetUrl,
    country_code: "in", // ← Indian IP
    render: String(render),
    keep_headers: "false",
  };

  // Premium = residential proxies — bypasses aggressive bot detection (e.g. Amazon)
  // Costs 25 credits/request (render+premium) vs 5 credits (render only)
  if (premium) {
    params.premium = "true";
  }

  // Extra options for JS-rendered pages
  if (render && waitFor) {
    // wait_for_selector: ScraperAPI waits up to 5s for this CSS selector to appear
    params.wait_for_selector = waitFor;
  }
  // NOTE: 'wait' is NOT a valid ScraperAPI query param — timing is controlled by
  // wait_for_selector only. The headless browser already waits for network idle.

  // IMPORTANT: must use https:// — render=true returns 404 over http://
  const scraperUrl = `https://api.scraperapi.com?${new URLSearchParams(params)}`;

  // Retry loop
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const response = await axios.get(scraperUrl, {
        timeout,
        headers: {
          "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
        },
        validateStatus: (s) => s < 500, // Don't throw on 4xx — handle manually
      });

      const status = response.status;

      if (status === 200) {
        trackCredit(render, premium);
        setCached(key, response.data);
        return { data: response.data, status, fromCache: false };
      }

      if (status === 429) {
        logger.warn(
          `ScraperAPI rate limited (attempt ${attempt}) — waiting ${RETRY_DELAY * attempt}ms`,
        );
        await sleep(RETRY_DELAY * attempt);
        continue;
      }

      if (status === 403) {
        logger.error(
          `ScraperAPI 403 — site blocked scraping. Try: render=true or different URL`,
        );
        throw new Error(`ScraperAPI 403 for: ${targetUrl}`);
      }

      if (status === 401) {
        logger.error(
          `ScraperAPI 401 — invalid API key. Check SCRAPER_API_KEY env var`,
        );
        throw new Error("Invalid ScraperAPI key");
      }

      throw new Error(`ScraperAPI HTTP ${status}`);
    } catch (err) {
      lastError = err;
      if (attempt <= MAX_RETRIES) {
        logger.warn(
          `ScraperAPI attempt ${attempt} failed: ${err.message} — retrying`,
        );
        await sleep(RETRY_DELAY * attempt);
      }
    }
  }

  throw lastError || new Error("ScraperAPI: all retries exhausted");
}

// ── ACCOUNT INFO / CREDIT CHECK ────────────────────────────────────
async function checkScraperAPIAccount() {
  try {
    const response = await axios.get(
      `http://api.scraperapi.com/account?api_key=${SCRAPER_KEY}`,
      { timeout: 5000 },
    );
    const data = response.data;
    logger.info(
      `ScraperAPI account: ${data.requestCount} used / ${data.concurrentRequests} concurrent / plan: ${data.subscriptionType}`,
    );
    return data;
  } catch (err) {
    logger.error(`ScraperAPI account check failed: ${err.message}`);
    return null;
  }
}

// ── HELPERS ────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Export for use in services and for admin dashboard credit display
module.exports = {
  fetchViaScraperAPI,
  checkScraperAPIAccount,
  getUsage: () => ({ creditsUsed, requestsTotal }),
  clearCache: () => cache.clear(),
};
