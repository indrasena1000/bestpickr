// src/routes/admin.js — bestpickr Admin Controls API
// ─────────────────────────────────────────────────────────────────
// Simple in-memory maintenance mode toggle.
// The admin dashboard calls these endpoints to put the site
// into maintenance mode — all visitors see a "we'll be back" page.
// ─────────────────────────────────────────────────────────────────
const express = require('express')
const router  = express.Router()

// In-memory state — persists as long as server is running
// If you restart the backend, maintenance mode resets to OFF
let maintenanceState = {
  enabled:   false,
  message:   'We are performing scheduled maintenance. We\'ll be back shortly.',
  eta:       '',        // e.g. "30 minutes" — shown to visitors
  enabledAt: null,
  enabledBy: 'admin',
}

// ── GET /api/admin/status ──────────────────────────────────────────
// Called by the frontend on every page load to check maintenance status
// Also called by admin dashboard to see current state
router.get('/status', (req, res) => {
  res.json({
    maintenance: maintenanceState.enabled,
    message:     maintenanceState.message,
    eta:         maintenanceState.eta,
    enabledAt:   maintenanceState.enabledAt,
  })
})

// ── POST /api/admin/maintenance ────────────────────────────────────
// Toggle maintenance mode on/off from the admin dashboard
// Body: { enabled: true/false, message?: string, eta?: string, token: string }
router.post('/maintenance', (req, res) => {
  const { enabled, message, eta, token } = req.body

  // Basic token check — must match env var
  const adminToken = process.env.ADMIN_TOKEN || 'bestpickr-admin-2025'
  if (token !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  maintenanceState = {
    enabled:   Boolean(enabled),
    message:   message || maintenanceState.message,
    eta:       eta || '',
    enabledAt: enabled ? new Date().toISOString() : null,
    enabledBy: 'admin',
  }

  console.log(`[Admin] Maintenance mode ${enabled ? 'ENABLED' : 'DISABLED'}`)

  res.json({
    ok: true,
    maintenance: maintenanceState.enabled,
    message: maintenanceState.message,
  })
})

module.exports = router
