// src/services/backgroundAnalysis.js
// ─────────────────────────────────────────────────────────────────
// Non-blocking GPT analysis queue for PRODUCT_SPECIFIC searches.
//
// STRATEGY:
//   - Never blocks the HTTP response
//   - Max 3 concurrent analysis jobs (semaphore pattern)
//   - Dedup: in-memory Set (fast) + Redis flag (survives restarts)
//   - On completion: merge analysis into bestpickr:product:{asin}
//   - analysisPipeline checks MongoDB first → only calls GPT if stale
// ─────────────────────────────────────────────────────────────────
'use strict'

const logger = require('../utils/logger')
const { runAnalysisPipeline } = require('../pipeline/analysisPipeline')
const {
  getProductCache,
  setProductCache,
  isAnalysisQueued,
  markAnalysisQueued,
} = require('../utils/redis')

// ── CONCURRENCY SEMAPHORE ─────────────────────────────────────────
const MAX_CONCURRENT = 3
let activeJobs = 0

// ── IN-MEMORY DEDUP SET ────────────────────────────────────────────
// Survives within a single process restart cycle; Redis flag covers cross-restarts
const inFlightAsins = new Set()

// ═════════════════════════════════════════════════════════════════
// PUBLIC: queueAnalysis(asin, productName, category, brand)
// ═════════════════════════════════════════════════════════════════
/**
 * Queue a background GPT analysis for a product.
 * Returns immediately — never throws.
 *
 * @param {string} asin        — Amazon ASIN (or product ID)
 * @param {string} productName — e.g. "Sony WH-1000XM5"
 * @param {string} category    — e.g. "headphones"
 * @param {string} brand       — e.g. "Sony"
 */
async function queueAnalysis(asin, productName, category, brand) {
  if (!asin || !productName) return

  // 1. In-memory dedup (fastest check)
  if (inFlightAsins.has(asin)) {
    logger.info(`🧠 BgAnalysis: "${asin}" already in-flight — skipping`)
    return
  }

  // 2. Redis flag dedup (survives server restarts)
  try {
    const alreadyQueued = await isAnalysisQueued(asin)
    if (alreadyQueued) {
      logger.info(`🧠 BgAnalysis: "${asin}" already queued (Redis flag) — skipping`)
      return
    }
  } catch { /* non-fatal, proceed */ }

  // 3. Mark as queued
  inFlightAsins.add(asin)
  try { await markAnalysisQueued(asin) } catch { /* non-fatal */ }

  logger.info(`🧠 BgAnalysis: queued "${productName}" (${asin}) — activeJobs=${activeJobs}`)

  // 4. Fire async (non-blocking)
  setImmediate(() => runJob(asin, productName, category, brand))
}

// ── INTERNAL JOB RUNNER ───────────────────────────────────────────
async function runJob(asin, productName, category, brand) {
  // Respect concurrency limit
  if (activeJobs >= MAX_CONCURRENT) {
    // Re-queue after 5s (simple backoff without a full queue library)
    setTimeout(() => runJob(asin, productName, category, brand), 5000)
    return
  }

  activeJobs++
  logger.info(`🧠 BgAnalysis: starting analysis for "${asin}" — activeJobs=${activeJobs}`)

  try {
    // runAnalysisPipeline checks MongoDB + Redis first — only calls GPT if stale
    const analysis = await runAnalysisPipeline(asin, productName, category, brand)

    if (analysis && analysis.aiScore) {
      // Merge analysis into the product cache
      try {
        const cached = await getProductCache(asin)
        if (cached) {
          await setProductCache(asin, {
            ...cached,
            aiScore:          analysis.aiScore,
            breakdown:        analysis.breakdown        || cached.breakdown,
            aspectScores:     analysis.aspectScores     || cached.aspectScores,
            whatPeopleLove:   analysis.whatPeopleLove   || cached.whatPeopleLove,
            commonComplaints: analysis.commonComplaints || cached.commonComplaints,
            overallSentiment: analysis.overallSentiment || null,
            positivePct:      analysis.positivePct      || cached.positivePct,
            analysisUpdatedAt: Date.now(),
          })
          logger.info(`🧠 BgAnalysis: ✅ merged analysis for "${asin}" aiScore=${analysis.aiScore}`)
        }
      } catch (cacheErr) {
        logger.warn(`🧠 BgAnalysis: cache merge failed for "${asin}" — ${cacheErr.message}`)
      }
    } else {
      logger.warn(`🧠 BgAnalysis: analysis returned no aiScore for "${asin}"`)
    }

  } catch (err) {
    logger.error(`🧠 BgAnalysis: FAILED for "${asin}" — ${err.message}`)
  } finally {
    activeJobs--
    inFlightAsins.delete(asin)
    logger.info(`🧠 BgAnalysis: done for "${asin}" — activeJobs=${activeJobs}`)
  }
}

module.exports = { queueAnalysis }
