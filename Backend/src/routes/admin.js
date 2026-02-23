// Backend/src/routes/admin.js
// ✅ Prisma 7 compatible — uses prisma instance from app.locals (set in server.js)
// ✅ Maintenance mode persisted to DB via SiteConfig table

const express = require('express')
const router  = express.Router()

const MAINTENANCE_KEY = 'maintenance'

function db(req) {
  return req.app.locals.prisma
}

async function getMaintenanceState(prisma) {
  try {
    const row = await prisma.siteConfig.findUnique({ where: { key: MAINTENANCE_KEY } })
    if (!row) {
      return {
        enabled:   false,
        message:   "We're performing scheduled maintenance. We'll be back shortly.",
        eta:       '',
        enabledAt: null,
      }
    }
    return JSON.parse(row.value)
  } catch (e) {
    console.error('[Admin] getMaintenanceState error:', e)
    return { enabled: false, message: "We're performing scheduled maintenance.", eta: '', enabledAt: null }
  }
}

async function setMaintenanceState(prisma, state) {
  await prisma.siteConfig.upsert({
    where:  { key: MAINTENANCE_KEY },
    update: { value: JSON.stringify(state) },
    create: { key: MAINTENANCE_KEY, value: JSON.stringify(state) },
  })
}

// ── GET /api/admin/status ──────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const state = await getMaintenanceState(db(req))
    res.json({
      maintenance: state.enabled,
      message:     state.message,
      eta:         state.eta,
      enabledAt:   state.enabledAt,
    })
  } catch (err) {
    console.error('[Admin] status error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/admin/maintenance ────────────────────────────────────
router.post('/maintenance', async (req, res) => {
  try {
    const { enabled, message, eta, token } = req.body
    const adminToken = process.env.ADMIN_TOKEN || 'bestpickr-admin-2025'
    if (token !== adminToken) return res.status(401).json({ error: 'Unauthorized' })

    const current  = await getMaintenanceState(db(req))
    const newState = {
      enabled:   Boolean(enabled),
      message:   message || current.message,
      eta:       eta || '',
      enabledAt: enabled ? new Date().toISOString() : null,
      enabledBy: 'admin',
    }

    await setMaintenanceState(db(req), newState)
    console.log(`[Admin] Maintenance mode ${enabled ? 'ENABLED' : 'DISABLED'}`)

    res.json({ ok: true, maintenance: newState.enabled, message: newState.message })
  } catch (err) {
    console.error('[Admin] maintenance toggle error:', err)
    res.status(500).json({ error: err.message })
  }
})


// ── GET /api/admin/cache-info ──────────────────────────────────────
// Shows all Redis cached searches — used by admin dashboard
router.get('/cache-info', async (req, res) => {
  try {
    const { getCacheInfo } = require('../utils/redis')
    const info = await getCacheInfo()
    res.json(info)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/admin/cache ────────────────────────────────────────
// Flush all Redis cache — forces fresh scrape on next search
router.delete('/cache', async (req, res) => {
  try {
    const { token } = req.body
    const adminToken = process.env.ADMIN_TOKEN || 'bestpickr-admin-2025'
    if (token !== adminToken) return res.status(401).json({ error: 'Unauthorized' })
    const { flushBestpickrCache } = require('../utils/redis')
    const deleted = await flushBestpickrCache()
    console.log(`[Admin] Redis cache flushed: ${deleted} keys deleted`)
    res.json({ ok: true, deleted })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/admin/preload-categories ───────────────────────────
// Manually trigger category preloading (same as 12 AM IST cron)
// Useful for: first deploy, after cache flush, testing
router.post('/preload-categories', async (req, res) => {
  try {
    const { token } = req.body
    const adminToken = process.env.ADMIN_TOKEN || 'bestpickr-admin-2025'
    if (token !== adminToken) return res.status(401).json({ error: 'Unauthorized' })

    const { preloadAllCategories } = require('../cron/categoryPreloader')
    // Run in background — don't make the HTTP request wait 2+ minutes
    res.json({ ok: true, message: 'Category preload started in background' })
    const result = await preloadAllCategories()
    console.log(`[Admin] Preload complete:`, result)
  } catch (err) {
    console.error('[Admin] preload error:', err)
    // Response may already be sent — only send error if not
    if (!res.headersSent) {
      res.status(500).json({ error: err.message })
    }
  }
})

// ── NEWS MANAGEMENT ENDPOINTS ─────────────────────────────────────
function authToken(req) {
  const adminToken = process.env.ADMIN_TOKEN || 'bestpickr-admin-2025'
  const token = req.query.token || req.headers['x-admin-token'] || (req.body && req.body.token)
  return token === adminToken
}

// GET /api/admin/news?status=Pending  (default: all statuses)
router.get('/news', async (req, res) => {
  if (!authToken(req)) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const { status } = req.query
    const where = status ? { status } : {}
    const articles = await db(req).newsArticle.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, slug: true, title: true, summary: true, source: true,
        status: true, visible: true, publishDate: true, scheduledAt: true,
        trendScore: true, relevance: true, tags: true, imageUrl: true,
        createdAt: true, updatedAt: true,
      },
    })
    res.json(articles)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/admin/news/:slug  — full article for editing
router.get('/news/:slug', async (req, res) => {
  if (!authToken(req)) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const article = await db(req).newsArticle.findUnique({ where: { slug: req.params.slug } })
    if (!article) return res.status(404).json({ error: 'Not found' })
    res.json(article)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/admin/news/:slug  — edit title/summary/content/imageUrl/tags
router.put('/news/:slug', async (req, res) => {
  if (!authToken(req)) return res.status(401).json({ error: 'Unauthorized' })
  const { slug } = req.params
  const { title, summary, content, imageUrl, tags, token, ...rest } = req.body
  try {
    const data = {}
    if (title     !== undefined) data.title     = title
    if (summary   !== undefined) data.summary   = summary
    if (content   !== undefined) data.content   = content
    if (imageUrl  !== undefined) data.imageUrl  = imageUrl
    if (tags      !== undefined) data.tags      = tags
    const article = await db(req).newsArticle.update({ where: { slug }, data })
    res.json(article)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/admin/news/:slug/status  — change status (Approve/Reject/Archive)
router.post('/news/:slug/status', async (req, res) => {
  if (!authToken(req)) return res.status(401).json({ error: 'Unauthorized' })
  const { slug } = req.params
  const { status } = req.body
  const validStatuses = ['Draft', 'Pending', 'Approved', 'Rejected', 'Published', 'Archived']
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' })
  try {
    const data = { status }
    // When publishing immediately, also set visible=true and publishDate=now
    if (status === 'Published') {
      data.visible = true
      data.publishDate = new Date()
    }
    // When rejecting or archiving, hide from public
    if (status === 'Rejected' || status === 'Archived') {
      data.visible = false
    }
    const article = await db(req).newsArticle.update({ where: { slug }, data })
    res.json(article)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/admin/news/:slug/publish  — publish now or schedule
router.post('/news/:slug/publish', async (req, res) => {
  if (!authToken(req)) return res.status(401).json({ error: 'Unauthorized' })
  const { slug } = req.params
  const { immediately, scheduledAt } = req.body
  try {
    let data
    if (immediately) {
      data = { status: 'Published', visible: true, publishDate: new Date(), scheduledAt: null }
    } else if (scheduledAt) {
      data = { status: 'Approved', scheduledAt: new Date(scheduledAt), visible: false }
    } else {
      return res.status(400).json({ error: 'Provide immediately=true or scheduledAt' })
    }
    const article = await db(req).newsArticle.update({ where: { slug }, data })
    res.json(article)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
