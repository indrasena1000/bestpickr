// src/utils/analytics.js
// Client-side analytics tracker for bestpickr
// Sends events to backend, which logs to DB and notifies Telegram

const API_BASE = import.meta.env.VITE_API_URL || '/api'

// Generate or retrieve session ID
function getSessionId() {
  let sid = sessionStorage.getItem('bp_sid')
  if (!sid) {
    sid = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem('bp_sid', sid)
  }
  return sid
}

// Get visitor ID (persisted across sessions)
function getVisitorId() {
  let vid = localStorage.getItem('bp_vid')
  if (!vid) {
    vid = 'vis_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('bp_vid', vid)
  }
  return vid
}

function getBasePayload() {
  return {
    sessionId: getSessionId(),
    visitorId: getVisitorId(),
    timestamp: new Date().toISOString(),
    referrer: document.referrer || 'direct',
    userAgent: navigator.userAgent,
    screenWidth: window.innerWidth,
    path: window.location.pathname,
    url: window.location.href,
  }
}

// Fire-and-forget: send event to backend
async function sendEvent(eventType, data = {}) {
  try {
    const payload = { ...getBasePayload(), eventType, ...data }
    // Use sendBeacon for reliability (works even on page unload)
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
      navigator.sendBeacon(`${API_BASE}/analytics/event`, blob)
    } else {
      fetch(`${API_BASE}/analytics/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {})
    }
  } catch (e) {
    // Never throw — analytics should never break the app
  }
}

// ── PUBLIC API ──────────────────────────────────────────────────────

export function trackPageView(page, extra = {}) {
  sendEvent('page_view', { page, ...extra })
}

export function trackSearch(query, category, resultCount) {
  sendEvent('search', { query, category, resultCount })
}

export function trackClick(data = {}) {
  sendEvent('click', data)
}

export function trackProductView(productName, productId) {
  sendEvent('product_view', { productName, productId })
}
