// Backend/src/routes/admin.js
// ✅ JWT authentication — access token (15 min) + refresh token (httpOnly cookie, 7 days)
// ✅ Prisma 7 compatible — uses prisma instance from app.locals (set in server.js)
// ✅ Maintenance mode persisted to DB via SiteConfig table

const express     = require('express')
const jwt         = require('jsonwebtoken')
const bcrypt      = require('bcryptjs')
const verifyAdmin = require('../middleware/verifyAdmin')
const router      = express.Router()

const MAINTENANCE_KEY   = 'maintenance'
const ACCESS_TOKEN_TTL  = '15m'
const REFRESH_TOKEN_TTL = '7d'
const REFRESH_COOKIE    = 'bp_refresh'

function db(req) { return req.app.locals.prisma }

function issueTokens(res) {
  const payload      = { role: 'admin' }
  const accessToken  = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL })
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL })

  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000,
    path:     '/api/admin/refresh',
  })
  return accessToken
}

async function getMaintenanceState(prisma) {
  try {
    const row = await prisma.siteConfig.findUnique({ where: { key: MAINTENANCE_KEY } })
    if (!row) return {
      enabled: false, message: "We're performing scheduled maintenance. We'll be back shortly.",
      eta: '', enabledAt: null,
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

// ══════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ══════════════════════════════════════════════════════════════════

// ── POST /api/admin/login ──────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' })

    const expectedUser = process.env.ADMIN_USER
    const passwordHash = process.env.ADMIN_PASSWORD_HASH
    if (!expectedUser || !passwordHash) {
      console.error('[Admin] ADMIN_USER or ADMIN_PASSWORD_HASH not set')
      return res.status(500).json({ error: 'Server misconfiguration' })
    }

    const userOk = username === expectedUser
    const passOk = await bcrypt.compare(password, passwordHash)
    if (!userOk || !passOk) return res.status(401).json({ error: 'Invalid credentials' })

    const accessToken = issueTokens(res)
    console.log('[Admin] Login successful')
    res.json({ ok: true, accessToken, expiresIn: ACCESS_TOKEN_TTL })
  } catch (err) {
    console.error('[Admin] login error:', err)
    res.status(500).json({ error: 'Login failed' })
  }
})

// ── POST /api/admin/refresh ────────────────────────────────────────
router.post('/refresh', (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE]
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token', code: 'NO_REFRESH' })

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

    const accessToken = issueTokens(res)
    res.json({ ok: true, accessToken, expiresIn: ACCESS_TOKEN_TTL })
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/admin/refresh' })
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Session expired — please log in again', code: 'SESSION_EXPIRED' })
    return res.status(401).json({ error: 'Invalid refresh token' })
  }
})

// ── POST /api/admin/logout ─────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/admin/refresh' })
  console.log('[Admin] Logout')
  res.json({ ok: true })
})

// ── GET /api/admin/status ──────────────────────────────────────────
// Public — used by frontend to poll maintenance mode
router.get('/status', async (req, res) => {
  try {
    const state = await getMaintenanceState(db(req))
    res.json({ maintenance: state.enabled, message: state.message, eta: state.eta, enabledAt: state.enabledAt })
  } catch (err) {
    console.error('[Admin] status error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════
// PROTECTED ROUTES — JWT required (verifyAdmin middleware)
// ══════════════════════════════════════════════════════════════════

// ── POST /api/admin/maintenance ────────────────────────────────────
router.post('/maintenance', verifyAdmin, async (req, res) => {
  try {
    const { enabled, message, eta } = req.body
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
router.get('/cache-info', verifyAdmin, async (req, res) => {
  try {
    const { getCacheInfo } = require('../utils/redis')
    res.json(await getCacheInfo())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/admin/cache ────────────────────────────────────────
router.delete('/cache', verifyAdmin, async (req, res) => {
  try {
    const { flushBestpickrCache } = require('../utils/redis')
    const deleted = await flushBestpickrCache()
    console.log(`[Admin] Redis cache flushed: ${deleted} keys deleted`)
    res.json({ ok: true, deleted })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/admin/preload-categories ────────────────────────────
router.post('/preload-categories', verifyAdmin, async (req, res) => {
  try {
    const { preloadAllCategories } = require('../cron/categoryPreloader')
    res.json({ ok: true, message: 'Category preload started in background' })
    const result = await preloadAllCategories()
    console.log('[Admin] Preload complete:', result)
  } catch (err) {
    console.error('[Admin] preload error:', err)
    if (!res.headersSent) res.status(500).json({ error: err.message })
  }
})

module.exports = router
