// Backend/src/routes/analytics.js
// Tracks visitor events and sends daily Telegram reports

const express = require('express')
const router  = express.Router()

// In-memory store (replace with DB in production)
// For Vercel serverless, use a DB or external store like Upstash Redis
let events    = []
let stats     = {
  totalVisitors:  0,
  totalPageViews: 0,
  affiliateClicks: 0,
  totalSearches:  0,
  todayVisitors:  0,
  visitorIds:     new Set(),
  todayVisitorIds: new Set(),
  topProducts:    {},  // { name: count }
  topSearches:    {},  // { query: count }
  lastReset:      new Date().toDateString(),
}

function resetDailyIfNeeded() {
  const today = new Date().toDateString()
  if (stats.lastReset !== today) {
    stats.todayVisitors   = 0
    stats.todayVisitorIds = new Set()
    stats.lastReset       = today
  }
}

// ── POST /api/analytics/event ──────────────────────────────────────
router.post('/event', express.json(), (req, res) => {
  try {
    const event = req.body
    if (!event || !event.eventType) return res.status(400).json({ ok: false })

    resetDailyIfNeeded()

    // Store event (keep last 500 in memory)
    events.unshift({ ...event, receivedAt: new Date().toISOString() })
    if (events.length > 500) events = events.slice(0, 500)

    // Update stats
    const vid = event.visitorId
    if (vid) {
      if (!stats.visitorIds.has(vid)) {
        stats.visitorIds.add(vid)
        stats.totalVisitors++
      }
      if (!stats.todayVisitorIds.has(vid)) {
        stats.todayVisitorIds.add(vid)
        stats.todayVisitors++
      }
    }

    if (event.eventType === 'page_view') {
      stats.totalPageViews++
    }

    if (event.eventType === 'affiliate_click') {
      stats.affiliateClicks++
      if (event.productName) {
        stats.topProducts[event.productName] = (stats.topProducts[event.productName] || 0) + 1
        // Alert Telegram immediately on affiliate click!
        sendTelegram(
          `🛒 *Affiliate Click!*\n` +
          `Product: ${event.productName}\n` +
          `Screen: ${event.screenWidth}px\n` +
          `Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
        )
      }
    }

    if (event.eventType === 'search') {
      stats.totalSearches++
      if (event.query) {
        const q = event.query.toLowerCase().trim()
        stats.topSearches[q] = (stats.topSearches[q] || 0) + 1
      }
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Analytics event error:', err)
    res.status(500).json({ ok: false })
  }
})

// ── GET /api/analytics/stats ───────────────────────────────────────
router.get('/stats', (req, res) => {
  resetDailyIfNeeded()

  // Convert top products/searches to sorted arrays
  const topProducts = Object.entries(stats.topProducts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, clicks]) => ({ name, clicks }))

  const topSearches = Object.entries(stats.topSearches)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([query, count]) => ({ query, count }))

  res.json({
    totalVisitors:   stats.totalVisitors,
    totalPageViews:  stats.totalPageViews,
    affiliateClicks: stats.affiliateClicks,
    totalSearches:   stats.totalSearches,
    todayVisitors:   stats.todayVisitors,
    topProducts,
    topSearches,
  })
})

// ── GET /api/analytics/events ──────────────────────────────────────
router.get('/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200)
  res.json({ events: events.slice(0, limit), total: events.length })
})

// ── POST /api/analytics/telegram-test ─────────────────────────────
router.post('/telegram-test', async (req, res) => {
  const ok = await sendTelegram('✅ bestpickr Telegram connected! You will receive daily analytics here.')
  res.json({ ok })
})

// ── TELEGRAM HELPER ───────────────────────────────────────────────
async function sendTelegram(message) {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    console.log('[Telegram] Not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID')
    return false
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:    chatId,
        text:       message,
        parse_mode: 'Markdown',
      }),
    })
    return res.ok
  } catch (e) {
    console.error('[Telegram] Send error:', e)
    return false
  }
}

// ── DAILY REPORT (called by a cron/scheduled job) ─────────────────
router.post('/daily-report', async (req, res) => {
  resetDailyIfNeeded()
  const topProducts = Object.entries(stats.topProducts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, clicks], i) => `${i+1}. ${name} — ${clicks} clicks`)
    .join('\n')

  const msg =
    `📊 *bestpickr Daily Report*\n` +
    `Date: ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n` +
    `👥 Today's Visitors: *${stats.todayVisitors}*\n` +
    `📄 Total Page Views: *${stats.totalPageViews}*\n` +
    `🛒 Affiliate Clicks: *${stats.affiliateClicks}*\n` +
    `🔍 Total Searches: *${stats.totalSearches}*\n\n` +
    `🏆 Top Clicked Products:\n${topProducts || 'No clicks yet'}\n\n` +
    `_bestpickr.vercel.app_`

  const ok = await sendTelegram(msg)
  res.json({ ok, message: ok ? 'Report sent!' : 'Telegram not configured' })
})

module.exports = { router, sendTelegram }
