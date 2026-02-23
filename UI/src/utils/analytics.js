// src/utils/analytics.js
// ✅ FIXED: Added trackAffiliateClick export (was missing — caused 0 clicks in admin dashboard)
// ✅ FIXED: Affiliate clicks now properly tracked with productName, url, platform fields

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function getSessionId() {
  let sid = sessionStorage.getItem('bp_sid')
  if (!sid) {
    sid = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem('bp_sid', sid)
  }
  return sid
}

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
    sessionId:   getSessionId(),
    visitorId:   getVisitorId(),
    timestamp:   new Date().toISOString(),
    referrer:    document.referrer || 'direct',
    userAgent:   navigator.userAgent,
    screenWidth: window.innerWidth,
    path:        window.location.pathname,
    url:         window.location.href,
  }
}

async function sendEvent(eventType, data = {}) {
  try {
    const payload = { ...getBasePayload(), eventType, ...data }
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

// ✅ NEW: Proper affiliate click tracker — call this on every Buy button click
// This is what populates the admin dashboard "Affiliate Clicks" counter
// AND triggers the Telegram instant alert
export function trackAffiliateClick({ productName, productId, platform, affiliateUrl, price }) {
  sendEvent('affiliate_click', {
    productName,
    productId:    productId   || null,
    platform:     platform    || null,
    affiliateUrl: affiliateUrl|| null,
    price:        price       || null,
  })
}

// ── BLOG ANALYTICS ──────────────────────────────────────────────────
// Called once when a blog post is loaded. Stores slug (query), title
// (productName) and category (page) so admin can group by post later.
export function trackBlogView(slug, title, category) {
  sendEvent('blog_view', {
    query:       slug     || null,
    productName: title    || null,
    page:        category || 'Uncategorized',
  })
}

// Called when the reader leaves the blog post page (component unmount).
// We reuse the screenWidth column to store the scroll depth % (0–100).
// Since we filter by eventType = 'blog_read_depth', there's no collision
// with the normal meaning of screenWidth in page_view events.
export function trackBlogReadDepth(slug, depthPct) {
  sendEvent('blog_read_depth', {
    query:       slug                   || null,
    screenWidth: Math.round(depthPct)  || 0,
  })
}
