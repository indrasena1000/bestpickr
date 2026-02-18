// src/App.jsx — bestpickr with hash-based routing (survives refresh)
// Routes: #/ | #/results?q= | #/detail | #/about | #/blog | #/how-it-works
//          #/ai-score | #/price-alerts | #/privacy | #/terms | #/admin
import { useState, useCallback, useEffect } from 'react'
import Navbar         from './components/Navbar.jsx'
import Footer         from './components/Footer.jsx'
import HomePage       from './pages/HomePage.jsx'
import ResultsPage    from './pages/ResultsPage.jsx'
import DetailPage     from './pages/DetailPage.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import {
  AboutPage, BlogPage, HowItWorksPage,
  AIScorePage, PriceAlertsPage,
  PrivacyPage, TermsPage,
} from './pages/StaticPage.jsx'
import { trackPageView, trackSearch } from './utils/analytics'

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

// ── STRUCTURED DATA (SEO) ──────────────────────────────────────────
const SD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "bestpickr",
  "url": "https://bestpickr.vercel.app",
  "description": "AI-powered product comparison across Amazon, Flipkart & Myntra. Find the best rated products in India.",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://bestpickr.vercel.app/#/results?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
})

// ── SESSION STORAGE HELPERS ────────────────────────────────────────
// Persists the selected product across page refreshes on #/detail
const SESSION_KEY_PRODUCT = 'bp_detail_product'
const SESSION_KEY_RESULTS = 'bp_detail_results'

function saveDetailToSession(product, results) {
  try {
    sessionStorage.setItem(SESSION_KEY_PRODUCT, JSON.stringify(product))
    sessionStorage.setItem(SESSION_KEY_RESULTS, JSON.stringify(results || []))
  } catch (_) {}
}

function loadDetailFromSession() {
  try {
    const p = sessionStorage.getItem(SESSION_KEY_PRODUCT)
    const r = sessionStorage.getItem(SESSION_KEY_RESULTS)
    return {
      product: p ? JSON.parse(p) : null,
      results: r ? JSON.parse(r) : [],
    }
  } catch (_) {
    return { product: null, results: [] }
  }
}

export default function App() {
  // On initial load, if we're on a detail route, restore from session
  const initialRoute = parseHash()
  const initialSession =
    initialRoute.path === 'detail' ? loadDetailFromSession() : { product: null, results: [] }

  const [route,           setRoute]     = useState(initialRoute)
  const [selectedProduct, setProduct]   = useState(initialSession.product)
  const [searchResults,   setResults]   = useState(initialSession.results)
  const [showAdmin,       setShowAdmin] = useState(false)

  // Listen for back/forward and direct URL changes
  useEffect(() => {
    function onHashChange() {
      const r = parseHash()
      setRoute(r)
      if (r.path !== 'admin') setShowAdmin(false)
      // When navigating back to detail via browser history, restore from session
      if (r.path === 'detail') {
        const { product, results } = loadDetailFromSession()
        if (product) { setProduct(product); setResults(results) }
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Initial load — read hash immediately
  useEffect(() => {
    const r = parseHash()
    if (r.path === 'admin') setShowAdmin(true)
    trackPageView(r.path || 'home')
    // Inject structured data
    const sd = document.createElement('script')
    sd.type = 'application/ld+json'
    sd.text = SD
    document.head.appendChild(sd)
  }, [])

  // Update document title per page
  useEffect(() => {
    const titles = {
      '/': 'bestpickr — Find the Best Rated Products in India',
      'results': `Search Results — bestpickr`,
      'about': 'About bestpickr — AI Product Comparison India',
      'blog': 'Blog — bestpickr',
      'how-it-works': 'How It Works — bestpickr AI Product Rankings',
      'ai-score': 'AI Score Explained — bestpickr',
      'price-alerts': 'Price Alerts — bestpickr',
      'privacy': 'Privacy Policy — bestpickr',
      'terms': 'Terms of Service — bestpickr',
    }
    document.title = titles[route.path] || 'bestpickr'
  }, [route.path])

  const navigate = useCallback((path, params = {}) => {
    setHash(path === 'home' ? '' : path, params)
    setRoute({ path: path === 'home' ? '/' : path, params })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    trackPageView(path, params)
  }, [])

  function handleSearch(q, cat = '') {
    trackSearch(q, cat, 0)
    setHash('results', { q, cat })
    setRoute({ path: 'results', params: { q, cat } })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleViewProduct(product, results) {
    setProduct(product)
    setResults(results)
    saveDetailToSession(product, results)   // ← persist so refresh works
    setHash('detail', { id: product.id || product.name?.slice(0, 40) })
    setRoute({ path: 'detail', params: {} })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Admin shortcut
  useEffect(() => {
    function onKey(e) { if (e.shiftKey && e.key === 'F12') setShowAdmin(true) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (showAdmin) {
    return <AdminDashboard onClose={() => { setShowAdmin(false); setHash('') }} />
  }

  const { path, params } = route
  const isHome = path === '/' || path === ''

  // Pages that don't show Navbar/Footer standard wrapper
  const staticPages = {
    'about':       <AboutPage       onHome={() => navigate('home')} onNav={navigate} />,
    'blog':        <BlogPage        onHome={() => navigate('home')} onNav={navigate} />,
    'how-it-works':<HowItWorksPage  onHome={() => navigate('home')} />,
    'ai-score':    <AIScorePage     onHome={() => navigate('home')} />,
    'price-alerts':<PriceAlertsPage onHome={() => navigate('home')} />,
    'privacy':     <PrivacyPage     onHome={() => navigate('home')} />,
    'terms':       <TermsPage       onHome={() => navigate('home')} />,
  }

  if (staticPages[path]) {
    return (
      <>
        <Navbar
          currentPage={path}
          currentQuery={params.q || ''}
          onSearch={handleSearch}
          onHome={() => navigate('home')}
        />
        {staticPages[path]}
        <Footer
          onSearch={handleSearch}
          onNav={navigate}
          onAdmin={() => setShowAdmin(true)}
        />
      </>
    )
  }

  return (
    <>
      <Navbar
        currentPage={isHome ? 'home' : path}
        currentQuery={params.q || ''}
        onSearch={handleSearch}
        onHome={() => navigate('home')}
      />

      {isHome && (
        <HomePage
          onSearch={handleSearch}
          onViewProduct={handleViewProduct}
        />
      )}

      {path === 'results' && (
        <ResultsPage
          query={params.q || ''}
          category={params.cat || ''}
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

      <Footer
        onSearch={handleSearch}
        onNav={navigate}
        onAdmin={() => setShowAdmin(true)}
      />
    </>
  )
}
