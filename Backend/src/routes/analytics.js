// Backend/src/routes/analytics.js
// ✅ Prisma 7 compatible — uses prisma instance from app.locals (set in server.js)
// ✅ All analytics persisted to PostgreSQL — no data loss on refresh/restart

const express = require('express')
const router  = express.Router()

// Helper: get prisma from request context (set on app.locals in server.js)
function db(req) {
  return req.app.locals.prisma
}

// ── POST /api/analytics/event ──────────────────────────────────────
router.post('/event', express.json(), async (req, res) => {
  try {
    const event = req.body
    if (!event || !event.eventType) return res.status(400).json({ ok: false })

    await db(req).pageView.create({
      data: {
        sessionId:    event.sessionId    || 'unknown',
        visitorId:    event.visitorId    || 'unknown',
        eventType:    event.eventType,
        page:         event.page         || null,
        query:        event.query        || null,
        productName:  event.productName  || null,
        productId:    event.productId    || null,
        affiliateUrl: event.affiliateUrl || null,
        referrer:     event.referrer     || null,
        userAgent:    event.userAgent    || null,
        screenWidth:  event.screenWidth  ? Number(event.screenWidth) : null,
        path:         event.path         || null,
      },
    })

    if (event.eventType === 'affiliate_click' && event.productName) {
      sendTelegramMsg(
        `🛒 *Affiliate Click!*\n` +
        `Product: ${event.productName}\n` +
        `Screen: ${event.screenWidth}px\n` +
        `Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
      )
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Analytics event error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── GET /api/analytics/stats ───────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const prisma     = db(req)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [
      totalVisitorsRaw,
      totalPageViews,
      affiliateClicks,
      totalSearches,
      todayVisitorsRaw,
      topProductsRaw,
      topSearchesRaw,
    ] = await Promise.all([
      prisma.pageView.groupBy({ by: ['visitorId'], _count: true }),
      prisma.pageView.count({ where: { eventType: 'page_view' } }),
      prisma.pageView.count({ where: { eventType: 'affiliate_click' } }),
      prisma.pageView.count({ where: { eventType: 'search' } }),
      prisma.pageView.groupBy({
        by: ['visitorId'],
        where: { createdAt: { gte: todayStart } },
        _count: true,
      }),
      prisma.pageView.groupBy({
        by: ['productName'],
        where: { eventType: 'affiliate_click', productName: { not: null } },
        _count: { productName: true },
        orderBy: { _count: { productName: 'desc' } },
        take: 10,
      }),
      prisma.pageView.groupBy({
        by: ['query'],
        where: { eventType: 'search', query: { not: null } },
        _count: { query: true },
        orderBy: { _count: { query: 'desc' } },
        take: 10,
      }),
    ])

    res.json({
      totalVisitors:   totalVisitorsRaw.length,
      totalPageViews,
      affiliateClicks,
      totalSearches,
      todayVisitors:   todayVisitorsRaw.length,
      topProducts: topProductsRaw.map(r => ({ name: r.productName, clicks: r._count.productName })),
      topSearches: topSearchesRaw.map(r => ({ query: r.query,       count:  r._count.query       })),
    })
  } catch (err) {
    console.error('Analytics stats error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/analytics/events ──────────────────────────────────────
router.get('/events', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200)
    const events = await db(req).pageView.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    res.json({
      events: events.map(e => ({
        timestamp:   e.createdAt,
        eventType:   e.eventType,
        page:        e.page,
        query:       e.query,
        productName: e.productName,
        path:        e.path,
        screenWidth: e.screenWidth,
        visitorId:   e.visitorId,
        sessionId:   e.sessionId,
      })),
      total: events.length,
    })
  } catch (err) {
    console.error('Analytics events error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/analytics/telegram-test ─────────────────────────────
router.post('/telegram-test', async (req, res) => {
  const ok = await sendTelegramMsg('✅ bestpickr Telegram connected! You will receive daily analytics here.')
  res.json({ ok })
})

// ── POST /api/analytics/daily-report ──────────────────────────────
router.post('/daily-report', async (req, res) => {
  try {
    const prisma     = db(req)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [todayVisitorsRaw, totalPageViews, affiliateClicks, totalSearches, topProductsRaw] = await Promise.all([
      prisma.pageView.groupBy({ by: ['visitorId'], where: { createdAt: { gte: todayStart } }, _count: true }),
      prisma.pageView.count({ where: { eventType: 'page_view' } }),
      prisma.pageView.count({ where: { eventType: 'affiliate_click' } }),
      prisma.pageView.count({ where: { eventType: 'search' } }),
      prisma.pageView.groupBy({
        by: ['productName'],
        where: { eventType: 'affiliate_click', productName: { not: null } },
        _count: { productName: true },
        orderBy: { _count: { productName: 'desc' } },
        take: 3,
      }),
    ])

    const topProducts = topProductsRaw
      .map((r, i) => `${i + 1}. ${r.productName} — ${r._count.productName} clicks`)
      .join('\n')

    const msg =
      `📊 *bestpickr Daily Report*\n` +
      `Date: ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n` +
      `👥 Today's Visitors: *${todayVisitorsRaw.length}*\n` +
      `📄 Total Page Views: *${totalPageViews}*\n` +
      `🛒 Affiliate Clicks: *${affiliateClicks}*\n` +
      `🔍 Total Searches: *${totalSearches}*\n\n` +
      `🏆 Top Clicked Products:\n${topProducts || 'No clicks yet'}\n\n` +
      `_bestpickr.vercel.app_`

    const ok = await sendTelegramMsg(msg)
    res.json({ ok, message: ok ? 'Report sent!' : 'Telegram not configured' })
  } catch (err) {
    console.error('Daily report error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── TELEGRAM HELPER ───────────────────────────────────────────────
async function sendTelegramMsg(message) {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.log('[Telegram] Not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID')
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
    console.error('[Telegram] Send error:', e)
    return false
  }
}

module.exports = { router, sendTelegram: sendTelegramMsg }
