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

module.exports = router
