// src/cron/priceRefreshCron.js
// ─────────────────────────────────────────────────────────────────
// Daily price refresh for Amazon products in our Postgres DB.
//
// WHY: Product metadata (name, brand, AI score) is stable for months,
//      but prices change daily. This cron keeps prices accurate at
//      minimal API cost using the Creators API (ASIN as keyword search).
//
// SCHEDULE: 03:00 IST daily
//
// COST PER RUN:
//   - 1 Creators API call per ASIN (search by ASIN → exact product)
//   - 0 GPT/AI calls — price-only update
//   - Capped at DAILY_LIMIT products per run (oldest-checked first)
//   - e.g. 150 products = 150 calls with 600ms delay ≈ ~2.5 min
//
// WHAT IT DOES:
//   1. Select top DAILY_LIMIT Amazon products not price-checked in 24h
//      (sorted by aiScore DESC so the most valuable products refresh first)
//   2. For each ASIN: call Creators API with ASIN as keyword → get price
//   3. Price changed (>₹0.50): update currentPrice + append PriceHistory
//   4. Bump updatedAt for all checked products (so they're skipped tomorrow)
//   5. Cleanup: delete PriceHistory rows older than 30 days (1-month retention)
// ─────────────────────────────────────────────────────────────────
'use strict'

const cron          = require('node-cron')
const logger        = require('../utils/logger')
const amazonService = require('../services/amazonService')

// ── Config ────────────────────────────────────────────────────────
const DAILY_LIMIT    = 150    // Max products refreshed per run (API call budget)
const ITEM_DELAY_MS  = 600    // 600ms between calls (~1.7 calls/sec, well under limits)
const STALE_HOURS    = 24     // Refresh products not checked in the last 24h
const HISTORY_DAYS   = 30     // Delete PriceHistory rows older than 30 days

let prisma   = null
let _cronJob = null

function init(prismaClient) {
  prisma = prismaClient
}

// ── MAIN REFRESH LOGIC ────────────────────────────────────────────
async function runPriceRefresh() {
  if (!prisma) {
    logger.warn('PriceRefreshCron: prisma not injected — skipping')
    return
  }

  const runStart   = Date.now()
  const staleAfter = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000)

  logger.info(`PriceRefreshCron: starting daily price refresh (cap=${DAILY_LIMIT} products)...`)

  // ── Step 1: Find stale Amazon products (highest aiScore first) ──
  let staleProducts = []
  try {
    staleProducts = await prisma.product.findMany({
      where: {
        platform:  'AMAZON',
        updatedAt: { lt: staleAfter },
      },
      select: {
        id:           true,
        platformId:   true,
        currentPrice: true,
        inStock:      true,
      },
      orderBy: { aiScore: 'desc' },   // most valuable products first
      take:    DAILY_LIMIT,
    })
  } catch (err) {
    logger.error(`PriceRefreshCron: DB query failed — ${err.message}`)
    return
  }

  logger.info(`PriceRefreshCron: ${staleProducts.length} products to refresh`)

  if (staleProducts.length === 0) {
    logger.info('PriceRefreshCron: all prices are fresh — done')
    return
  }

  // ── Step 2: Fetch price for each ASIN via Creators API ───────────
  let totalUpdated   = 0
  let totalUnchanged = 0
  let totalFailed    = 0
  const checkedIds   = []

  for (let i = 0; i < staleProducts.length; i++) {
    const product = staleProducts[i]

    if (!product.platformId) {
      totalFailed++
      continue
    }

    let priceData = null
    try {
      priceData = await amazonService.getItemPrice(product.platformId)
    } catch (err) {
      logger.warn(`PriceRefreshCron: API error for ${product.platformId} — ${err.message}`)
      totalFailed++
    }

    if (!priceData || priceData.price === null) {
      // API returned no price (item unavailable/delisted) — still mark as checked
      checkedIds.push(product.id)
      totalFailed++
    } else {
      checkedIds.push(product.id)

      const newPrice   = priceData.price
      const newInStock = priceData.inStock ?? true
      const priceChanged = Math.abs(newPrice - product.currentPrice) > 0.5   // >₹0.50 diff
      const stockChanged = newInStock !== product.inStock

      if (priceChanged || stockChanged) {
        try {
          await prisma.product.update({
            where: { id: product.id },
            data:  { currentPrice: newPrice, inStock: newInStock },
          })

          if (priceChanged) {
            await prisma.priceHistory.create({
              data: { productId: product.id, price: newPrice, currency: 'INR' },
            })
            logger.info(
              `PriceRefreshCron: ${product.platformId} ₹${product.currentPrice} → ₹${newPrice}` +
              (stockChanged ? ` inStock=${newInStock}` : ''),
            )
          }
          totalUpdated++
        } catch (updateErr) {
          logger.warn(`PriceRefreshCron: DB update failed for ${product.platformId} — ${updateErr.message}`)
          totalFailed++
        }
      } else {
        totalUnchanged++
      }
    }

    // Delay between API calls (rate limiting)
    if (i < staleProducts.length - 1) {
      await new Promise(r => setTimeout(r, ITEM_DELAY_MS))
    }
  }

  // ── Step 3: Bump updatedAt for all checked products ───────────────
  // Raw SQL: Prisma's @updatedAt doesn't allow direct writes, use raw query
  if (checkedIds.length > 0) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "Product" SET "updatedAt" = NOW() WHERE id = ANY($1::uuid[])`,
        checkedIds,
      )
    } catch (touchErr) {
      logger.warn(`PriceRefreshCron: updatedAt touch failed — ${touchErr.message}`)
    }
  }

  // ── Step 4: Cleanup — delete PriceHistory older than 30 days ─────
  try {
    const cutoff  = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000)
    const deleted = await prisma.priceHistory.deleteMany({
      where: { recordedAt: { lt: cutoff } },
    })
    if (deleted.count > 0) {
      logger.info(`PriceRefreshCron: cleaned up ${deleted.count} PriceHistory rows older than ${HISTORY_DAYS} days`)
    }
  } catch (cleanupErr) {
    logger.warn(`PriceRefreshCron: PriceHistory cleanup failed — ${cleanupErr.message}`)
  }

  const elapsed = Math.round((Date.now() - runStart) / 1000)
  logger.info(
    `PriceRefreshCron: done in ${elapsed}s — ` +
    `${totalUpdated} price updated, ${totalUnchanged} unchanged, ${totalFailed} failed/skipped`,
  )
}

// ── CRON REGISTRATION ─────────────────────────────────────────────
function startPriceRefresh() {
  // 03:00 IST daily
  _cronJob = cron.schedule('0 3 * * *', async () => {
    try {
      await runPriceRefresh()
    } catch (err) {
      logger.error(`PriceRefreshCron: unhandled error — ${err.message}`)
    }
  }, { timezone: 'Asia/Kolkata' })

  logger.info('PriceRefreshCron: scheduled daily at 03:00 IST')
}

function stopPriceRefresh() {
  if (_cronJob) {
    _cronJob.stop()
    _cronJob = null
    logger.info('PriceRefreshCron: stopped')
  }
}

module.exports = { init, startPriceRefresh, stopPriceRefresh, runPriceRefresh }
