// src/App.jsx
// ─────────────────────────────────────────────────────────────────
// ROUTING STRATEGY:
//   Hash routes (#/results?q=...) for internal navigation
//   Path routes (/best-mobiles-india-2026) for SEO landing pages
//
// SEO AUTO-SEARCH:
//   When Google sends a visitor to bestpickr.in/best-mobiles-india-2026,
//   this app reads the path, matches it to seoRoutes.js, and
//   automatically fires the mapped search query — showing real
//   Amazon + Flipkart results for exactly what the visitor searched.
//
// MAINTENANCE MODE:
//   Admin toggles from dashboard → backend stores state →
//   frontend polls /api/admin/status every 60 seconds.
// ─────────────────────────────────────────────────────────────────
import { useState, useCallback, useEffect } from 'react'
import Navbar          from './components/Navbar.jsx'
import Footer          from './components/Footer.jsx'
import HomePage        from './pages/HomePage.jsx'
import ResultsPage     from './pages/ResultsPage.jsx'
import DetailPage      from './pages/DetailPage.jsx'
import AdminDashboard  from './pages/AdminDashboard.jsx'
import MaintenancePage from './pages/MaintenancePage.jsx'
import {
  AboutPage, BlogPage, HowItWorksPage,
  AIScorePage, PriceAlertsPage,
  PrivacyPage, TermsPage,
} from './pages/StaticPage.jsx'
import { matchSeoRoute } from './seoRoutes.js'
import { trackPageView, trackSearch } from './utils/analytics.js'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

// ── SESSION STORAGE ────────────────────────────────────────────────
function saveDetailToSession(product, results) {
  try {
    sessionStorage.setItem('bp_detail_product', JSON.stringify(product))
    sessionStorage.setItem('bp_detail_results',  JSON.stringify(results || []))
  } catch (_) {}
}
function loadDetailFromSession() {
  try {
    const p = sessionStorage.getItem('bp_detail_product')
    const r = sessionStorage.getItem('bp_detail_results')
    return { product: p ? JSON.parse(p) : null, results: r ? JSON.parse(r) : [] }
  } catch (_) { return { product: null, results: [] } }
}

// ── HASH ROUTER ────────────────────────────────────────────────────
function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '') || '/'
  const [path, qs] = raw.split('?')
  const params = {}
  if (qs) qs.split('&').forEach(p => {
    const [k, v] = p.split('=')
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '')
  })
  return { path: path || '/', params }
}
function setHash(path, params = {}) {
  const qs = Object.entries(params).filter(([, v]) => v)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  window.location.hash = '/' + path + (qs ? '?' + qs : '')
}

const PAGE_TITLES = {
  '/':            'bestpickr — Best Rated Products in India | AI Comparison',
  'results':      'Search Results — bestpickr',
  'about':        'About bestpickr — AI Product Comparison India',
  'blog':         'Blog — bestpickr',
  'how-it-works': 'How It Works — bestpickr AI Rankings',
  'ai-score':     'AI Score Explained — bestpickr',
  'price-alerts': 'Price Alerts — bestpickr',
  'privacy':      'Privacy Policy — bestpickr',
  'terms':        'Terms of Service — bestpickr',
}

export default function App() {
  // Check if visitor arrived via an SEO landing page URL
  const pathname = window.location.pathname.replace(/^\//, '')
  const seoMatch = matchSeoRoute(pathname)

  const initialRoute   = parseHash()
  const initialSession = initialRoute.path === 'detail' ? loadDetailFromSession() : { product: null, results: [] }

  const [route,           setRoute]       = useState(
    seoMatch
      ? { path: 'results', params: { q: seoMatch.query, cat: seoMatch.category } }
      : initialRoute
  )
  const [selectedProduct, setProduct]     = useState(initialSession.product)
  const [searchResults,   setResults]     = useState(initialSession.results)
  const [showAdmin,       setShowAdmin]   = useState(false)
  const [maintenance,     setMaintenance] = useState({ enabled: false, message: '', eta: '' })
  const [activeSeoMeta,   setSeoMeta]     = useState(seoMatch || null)

  // Whether this device is bypassing maintenance (admin access)
  const isAdminBypass = window.location.search.includes('admin=1')

  // ── MAINTENANCE POLLING ─────────────────────────────────────────
  async function checkMaintenance() {
    try {
      const r    = await fetch(`${API_BASE}/admin/status`, { cache: 'no-store' })
      if (!r.ok) return
      const data = await r.json()
      setMaintenance({
        enabled: Boolean(data.maintenance) && !isAdminBypass,
        message: data.message || 'We are performing scheduled maintenance.',
        eta:     data.eta     || '',
      })
    } catch (_) { /* Server offline — don't show maintenance mode */ }
  }

  useEffect(() => {
    checkMaintenance()
    const t = setInterval(checkMaintenance, 60_000)
    return () => clearInterval(t)
  }, [])

  // ── INJECT STRUCTURED DATA FOR SEO ─────────────────────────────
  useEffect(() => {
    const sd = document.createElement('script')
    sd.type  = 'application/ld+json'
    sd.text  = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'WebSite',
      name: 'bestpickr', url: 'https://bestpickr.in',
      description: 'AI-powered product comparison across Amazon & Flipkart. Best rated products in India.',
      potentialAction: {
        '@type': 'SearchAction',
        target: 'https://bestpickr.in/#/results?q={search_term_string}',
        'query-input': 'required name=search_term_string',
      },
    })
    document.head.appendChild(sd)
  }, [])

  // ── SEO META TAGS — set on landing ─────────────────────────────
  useEffect(() => {
    if (!seoMatch) return
    document.title = seoMatch.title
    const setMeta = (sel, val) => { const el = document.querySelector(sel); if (el) el.content = val }
    setMeta('meta[name="description"]',  seoMatch.description)
    setMeta('meta[name="keywords"]',     seoMatch.keywords)
    setMeta('meta[property="og:title"]', seoMatch.title)
    setMeta('meta[property="og:description"]', seoMatch.description)
    trackPageView('seo-landing', { query: seoMatch.query, path: pathname })
  }, [])

  // ── HASH CHANGE LISTENER ───────────────────────────────────────
  useEffect(() => {
    function onHashChange() {
      const r = parseHash()
      setRoute(r)
      setSeoMeta(null)
      if (r.path !== 'admin') setShowAdmin(false)
      if (r.path === 'detail') {
        const { product, results } = loadDetailFromSession()
        if (product) { setProduct(product); setResults(results) }
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // ── PAGE TITLE ─────────────────────────────────────────────────
  useEffect(() => {
    if (activeSeoMeta) return
    document.title = PAGE_TITLES[route.path] || 'bestpickr'
  }, [route.path, activeSeoMeta])

  // ── ADMIN SHORTCUT ─────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) { if (e.shiftKey && e.key === 'F12') setShowAdmin(true) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (parseHash().path === 'admin') setShowAdmin(true)
    trackPageView(route.path || 'home')
  }, [])

  // ── NAVIGATION ─────────────────────────────────────────────────
  const navigate = useCallback((path, params = {}) => {
    setSeoMeta(null)
    setHash(path === 'home' ? '' : path, params)
    setRoute({ path: path === 'home' ? '/' : path, params })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    trackPageView(path, params)
  }, [])

  function handleSearch(q, cat = '') {
    trackSearch(q, cat, 0)
    setSeoMeta(null)
    setHash('results', { q, cat })
    setRoute({ path: 'results', params: { q, cat } })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleViewProduct(product, results) {
    setProduct(product)
    setResults(results)
    saveDetailToSession(product, results)
    setHash('detail', { id: product.id || product.name?.slice(0, 40) })
    setRoute({ path: 'detail', params: {} })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── RENDER: ADMIN ──────────────────────────────────────────────
  if (showAdmin) {
    return (
      <AdminDashboard
        onClose={() => { setShowAdmin(false); setHash('') }}
        maintenance={maintenance}
        onMaintenanceChange={setMaintenance}
        adminToken={import.meta.env.VITE_ADMIN_TOKEN || 'bestpickr-admin-2025'}
      />
    )
  }

  // ── RENDER: MAINTENANCE ────────────────────────────────────────
  if (maintenance.enabled) {
    return <MaintenancePage message={maintenance.message} eta={maintenance.eta} />
  }

  const { path, params } = route
  const isHome = path === '/' || path === ''

  const staticPages = {
    'about':        <AboutPage        onHome={() => navigate('home')} onNav={navigate} />,
    'blog':         <BlogPage         onHome={() => navigate('home')} onNav={navigate} />,
    'how-it-works': <HowItWorksPage   onHome={() => navigate('home')} />,
    'ai-score':     <AIScorePage      onHome={() => navigate('home')} />,
    'price-alerts': <PriceAlertsPage  onHome={() => navigate('home')} />,
    'privacy':      <PrivacyPage      onHome={() => navigate('home')} />,
    'terms':        <TermsPage        onHome={() => navigate('home')} />,
  }
  if (staticPages[path]) {
    return (
      <>
        <Navbar currentPage={path} currentQuery='' onSearch={handleSearch} onHome={() => navigate('home')} />
        {staticPages[path]}
        <Footer onSearch={handleSearch} onNav={navigate} onAdmin={() => setShowAdmin(true)} />
      </>
    )
  }

  return (
    <>
      <Navbar
        currentPage={isHome ? 'home' : path}
        currentQuery={params.q || activeSeoMeta?.query || ''}
        onSearch={handleSearch}
        onHome={() => navigate('home')}
      />

      {/* SEO landing page banner — visible when arriving from Google */}
      {activeSeoMeta && path === 'results' && (
        <div style={{ background:'var(--accent-bg)', borderBottom:'2px solid #C8E6D4', padding:'18px 0' }}>
          <div className="wrap">
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', color:'var(--accent)', marginBottom:6 }}>
              🔍 Showing live results for your search
            </div>
            <h1 style={{ fontSize:'clamp(17px,3vw,24px)', fontWeight:700, color:'var(--ink)', margin:'0 0 4px', letterSpacing:'-.3px', lineHeight:1.3 }}>
              {activeSeoMeta.h1}
            </h1>
            <p style={{ fontSize:13, color:'var(--ink3)', margin:0, lineHeight:1.6, maxWidth:620 }}>
              {activeSeoMeta.description}
            </p>
          </div>
        </div>
      )}

      {isHome && <HomePage onSearch={handleSearch} onViewProduct={handleViewProduct} />}

      {path === 'results' && (
        <ResultsPage
          query={params.q || activeSeoMeta?.query || ''}
          category={params.cat || activeSeoMeta?.category || ''}
          onViewProduct={handleViewProduct}
          onSearch={handleSearch}
        />
      )}

      {path === 'detail' && (
        <DetailPage
          product={selectedProduct}
          allResults={searchResults}
          onBack={() => navigate('results')}
          onHome={() => navigate('home')}
        />
      )}

      <Footer onSearch={handleSearch} onNav={navigate} onAdmin={() => setShowAdmin(true)} />
    </>
  )
}
