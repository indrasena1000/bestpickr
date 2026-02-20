// src/jobs/telegramReport.js — Daily Telegram Analytics Report
// ─────────────────────────────────────────────────────────────────
// SCHEDULE: Every day at 9:00 AM IST (Asia/Kolkata) = 3:30 AM UTC
//
// Sends a summary of yesterday's analytics to the configured
// Telegram chat via the Bot API.
// ─────────────────────────────────────────────────────────────────
'use strict'

const cron   = require('node-cron')
const logger = require('../utils/logger')

let cronJob = null
let prisma  = null

function setPrisma(instance) {
  prisma = instance
}

async function sendTelegramMsg(message) {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    logger.warn('[TelegramReport] Not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID')
    return false
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
    })
    return r.ok
  } catch (e) {
    logger.error('[TelegramReport] Send error:', e)
    return false
  }
}

async function generateAndSendReport() {
  if (!prisma) {
    logger.warn('[TelegramReport] No Prisma instance — skipping report')
    return false
  }

  try {
    const yesterdayStart = new Date()
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    yesterdayStart.setHours(0, 0, 0, 0)

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [
      yesterdayVisitorsRaw,
      totalPageViews,
      affiliateClicks,
      totalSearches,
      yesterdayClicks,
      topProductsRaw,
      topSearchesRaw,
    ] = await Promise.all([
      prisma.pageView.groupBy({
        by: ['visitorId'],
        where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
        _count: true,
      }),
      prisma.pageView.count({ where: { eventType: 'page_view' } }),
      prisma.pageView.count({ where: { eventType: 'affiliate_click' } }),
      prisma.pageView.count({ where: { eventType: 'search' } }),
      prisma.pageView.count({
        where: {
          eventType: 'affiliate_click',
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
      }),
      prisma.pageView.groupBy({
        by: ['productName'],
        where: { eventType: 'affiliate_click', productName: { not: null } },
        _count: { productName: true },
        orderBy: { _count: { productName: 'desc' } },
        take: 5,
      }),
      prisma.pageView.groupBy({
        by: ['query'],
        where: { eventType: 'search', query: { not: null } },
        _count: { query: true },
        orderBy: { _count: { query: 'desc' } },
        take: 5,
      }),
    ])

    const topProducts = topProductsRaw
      .map((r, i) => `  ${i + 1}. ${r.productName} — ${r._count.productName} clicks`)
      .join('\n')

    const topSearches = topSearchesRaw
      .map((r, i) => `  ${i + 1}. "${r.query}" — ${r._count.query}x`)
      .join('\n')

    const msg =
      `📊 *bestpickr Daily Report*\n` +
      `${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}\n\n` +
      `👥 Yesterday's Visitors: *${yesterdayVisitorsRaw.length}*\n` +
      `🛒 Yesterday's Clicks: *${yesterdayClicks}*\n\n` +
      `📈 *All-Time Totals*\n` +
      `📄 Page Views: *${totalPageViews}*\n` +
      `🛒 Affiliate Clicks: *${affiliateClicks}*\n` +
      `🔍 Searches: *${totalSearches}*\n\n` +
      `🏆 *Top Clicked Products:*\n${topProducts || '  No clicks yet'}\n\n` +
      `🔍 *Top Searches:*\n${topSearches || '  No searches yet'}\n\n` +
      `_bestpickr.in_`

    const ok = await sendTelegramMsg(msg)
    if (ok) {
      logger.info('[TelegramReport] Daily report sent successfully')
    } else {
      logger.warn('[TelegramReport] Failed to send daily report')
    }
    return ok
  } catch (err) {
    logger.error('[TelegramReport] Error generating report:', err)
    return false
  }
}

// 9:00 AM IST = minute 0, hour 9, in Asia/Kolkata timezone
function startTelegramReport() {
  if (cronJob) return
  cronJob = cron.schedule('0 9 * * *', () => {
    logger.info('[TelegramReport] Cron triggered — generating daily report')
    generateAndSendReport()
  }, { timezone: 'Asia/Kolkata' })
  logger.info('[TelegramReport] Cron scheduled — daily at 9:00 AM IST')
}

function stopTelegramReport() {
  if (cronJob) {
    cronJob.stop()
    cronJob = null
  }
}

module.exports = {
  setPrisma,
  startTelegramReport,
  stopTelegramReport,
  triggerManually: generateAndSendReport,
}
