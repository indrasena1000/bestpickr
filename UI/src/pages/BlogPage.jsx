// src/pages/BlogPage.jsx
// Blog listing page — route: /#/blog
// Tabs: 📅 Last 7 Days (timeline) | Category filters (grid)
import { useState, useEffect } from 'react'
import { getBlogPosts, getWeeklyBlogPosts } from '../services/api.js'
import BlogCard from '../components/BlogCard.jsx'
import '../styles/blog.css'

const CATEGORY_TABS = ['All', 'Smartphones', 'Laptops', 'Audio', 'Deals', 'Industry News', 'Wearables', 'Televisions']
const LIMIT = 12

// ── Date helpers ─────────────────────────────────────────────────
function dayLabel(dateStr) {
  const todayStr     = new Date().toISOString().slice(0, 10)
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (dateStr === todayStr)     return 'Today'
  if (dateStr === yesterdayStr) return 'Yesterday'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

export default function BlogPage({ onSearch, onNav, maintenanceMode = false }) {
  // ── Category view state ──────────────────────────────────────────
  const [posts,       setPosts]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [category,    setCategory]    = useState('All')
  const [page,        setPage]        = useState(1)
  const [total,       setTotal]       = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  // ── Recent (weekly) view state ───────────────────────────────────
  const [activeTab,   setActiveTab]   = useState('All') // 'Recent' | category
  const [weeklyData,  setWeeklyData]  = useState({})    // { 'YYYY-MM-DD': [posts] }
  const [weekLoading, setWeekLoading] = useState(false)

  // ── Share + CTA state ────────────────────────────────────────────
  const [copied, setCopied] = useState(false)
  const [ctaQ,   setCtaQ]   = useState('')

  // ── Search + Sort state ──────────────────────────────────────────
  const [searchQ, setSearchQ] = useState('')
  const [sortBy,  setSortBy]  = useState('newest')

  const isRecent = activeTab === 'Recent'

  // ── Page meta ────────────────────────────────────────────────────
  useEffect(() => {
    document.title = 'bestpickr blog — Expert Tech Insights for Indian Buyers'
    const meta = document.querySelector('meta[name="description"]')
    if (meta) meta.content = 'Expert buying guides, product comparisons, and tech news for Indian consumers. AI-analyzed content updated daily.'
  }, [])

  // ── Fetch category posts ─────────────────────────────────────────
  useEffect(() => {
    if (isRecent) return
    setLoading(true)
    setPage(1)
    const params = { limit: LIMIT, page: 1 }
    if (category !== 'All') params.category = category
    getBlogPosts(params)
      .then(d => { setPosts(d.posts || []); setTotal(d.total || 0) })
      .catch(() => { setPosts([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [category, isRecent])

  // ── Fetch weekly data when Recent tab selected ───────────────────
  useEffect(() => {
    if (!isRecent) return
    setWeekLoading(true)
    getWeeklyBlogPosts()
      .then(d => setWeeklyData(d.grouped || {}))
      .catch(() => setWeeklyData({}))
      .finally(() => setWeekLoading(false))
  }, [isRecent])

  function selectTab(tab) {
    setActiveTab(tab)
    setSearchQ('')
    if (tab !== 'Recent') setCategory(tab)
  }

  function loadMore() {
    const nextPage = page + 1
    setLoadingMore(true)
    const params = { limit: LIMIT, page: nextPage }
    if (category !== 'All') params.category = category
    getBlogPosts(params)
      .then(d => { setPosts(prev => [...prev, ...(d.posts || [])]);  setPage(nextPage) })
      .catch(() => {})
      .finally(() => setLoadingMore(false))
  }

  const hasMore       = posts.length < total
  const weekDays      = Object.entries(weeklyData).sort(([a], [b]) => b.localeCompare(a))
  const totalThisWeek = weekDays.reduce((n, [, arr]) => n + arr.length, 0)

  // ── Filtered + sorted derived data ──────────────────────────────
  const q = searchQ.trim().toLowerCase()

  // Category view
  const filteredPosts = posts
    .filter(p =>
      !q ||
      (p.title  || '').toLowerCase().includes(q) ||
      (p.excerpt || '').toLowerCase().includes(q)
    )
    .sort((a, b) => {
      if (sortBy === 'oldest')  return new Date(a.publishedAt) - new Date(b.publishedAt)
      if (sortBy === 'alpha')   return (a.title || '').localeCompare(b.title || '')
      if (sortBy === 'zalpha')  return (b.title || '').localeCompare(a.title || '')
      return new Date(b.publishedAt) - new Date(a.publishedAt) // newest
    })

  // Recent / weekly view — filter across all day buckets
  const filteredWeekDays = weekDays
    .map(([date, dayPosts]) => [
      date,
      dayPosts.filter(p =>
        !q ||
        (p.title  || '').toLowerCase().includes(q) ||
        (p.excerpt || '').toLowerCase().includes(q)
      ),
    ])
    .filter(([, arr]) => arr.length > 0)

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  function handleCtaSearch(e) {
    e.preventDefault()
    if (ctaQ.trim() && onSearch) onSearch(ctaQ.trim())
  }

  const pageUrl    = window.location.href
  const shareText  = encodeURIComponent('bestpickr Blog — Expert Tech Insights for Indian Buyers — ' + pageUrl)
  const waUrl      = `https://wa.me/?text=${shareText}`
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent('bestpickr Blog — Expert Tech Insights for Indian Buyers')}&url=${encodeURIComponent(pageUrl)}`

  return (
    <div style={{ background: 'var(--paper2)', minHeight: '80vh' }}>

      {/* ── Page header ──────────────────────────────────────────── */}
      <div style={{ background: 'var(--paper)', borderBottom: '1px solid var(--line)', padding: '32px 0 24px' }}>
        <div className="wrap">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-bg)', borderRadius: 'var(--r)', padding: '3px 10px', display: 'inline-block', marginBottom: 12 }}>
            bestpickr blog
          </div>
          <h1 style={{ fontSize: 'clamp(22px,4vw,34px)', fontWeight: 700, letterSpacing: '-.5px', color: 'var(--ink)', marginBottom: 8, lineHeight: 1.2 }}>
            Expert Tech Insights for Indian Buyers
          </h1>
          <p style={{ fontSize: 14, color: 'var(--ink3)', lineHeight: 1.7, maxWidth: 560, margin: 0 }}>
            AI-analyzed buying guides, product comparisons, and news — updated daily.
          </p>
        </div>
      </div>

      <div className="wrap" style={{ padding: '28px 20px 0px' }}>

        {/* ── Tabs row ──────────────────────────────────────────── */}
        <div className="blog-cat-tabs" style={{ marginBottom: 16 }}>
          {/* Recent — special pill with accent */}
          <button
            className={`blog-cat-tab ${isRecent ? 'active' : ''}`}
            onClick={() => selectTab('Recent')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
          >
            📅 Last 7 Days
          </button>

          {/* Divider */}
          <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch', margin: '0 4px' }} />

          {/* Category tabs */}
          {CATEGORY_TABS.map(cat => (
            <button
              key={cat}
              className={`blog-cat-tab ${!isRecent && activeTab === cat ? 'active' : ''}`}
              onClick={() => selectTab(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ── Search + Sort bar ─────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center', marginBottom: 24,
          flexWrap: 'wrap',
        }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
            <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink4)', pointerEvents: 'none' }}
              width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search posts…"
              style={{
                width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                border: '1px solid var(--line)', borderRadius: 'var(--r2)',
                background: 'var(--paper)', color: 'var(--ink)', fontSize: 13,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{
              padding: '8px 12px', border: '1px solid var(--line)',
              borderRadius: 'var(--r2)', background: 'var(--paper)',
              color: 'var(--ink)', fontSize: 13, cursor: 'pointer', flexShrink: 0,
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="alpha">Title A → Z</option>
            <option value="zalpha">Title Z → A</option>
          </select>
          {searchQ && (
            <button
              onClick={() => setSearchQ('')}
              style={{
                padding: '8px 12px', border: '1px solid var(--line)',
                borderRadius: 'var(--r2)', background: 'var(--paper)',
                color: 'var(--ink3)', fontSize: 12, cursor: 'pointer', flexShrink: 0,
              }}
            >
              ✕ Clear
            </button>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════
            RECENT VIEW — 7-day timeline
            ════════════════════════════════════════════════════════ */}
        {isRecent && (
          weekLoading ? (
            /* Skeleton */
            <div>
              {[1, 2].map(i => (
                <div key={i} style={{ marginBottom: 36 }}>
                  <div className="skeleton" style={{ height: 28, width: 140, borderRadius: 100, marginBottom: 16 }} />
                  <div className="blog-grid">
                    {[1, 2, 3].map(j => (
                      <div key={j} style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                        <div className="skeleton" style={{ height: 180 }} />
                        <div style={{ padding: 16 }}>
                          <div className="skeleton" style={{ height: 14, borderRadius: 4, marginBottom: 8 }} />
                          <div className="skeleton" style={{ height: 14, width: '70%', borderRadius: 4 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : weekDays.length === 0 ? (
            /* Empty */
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink4)' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink2)', marginBottom: 8 }}>
                No posts published this week yet
              </div>
              <div style={{ fontSize: 13 }}>Fresh content goes live every morning — check back soon!</div>
            </div>
          ) : filteredWeekDays.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink4)' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink2)', marginBottom: 8 }}>No posts match your search</div>
              <div style={{ fontSize: 13 }}>Try a different keyword</div>
            </div>
          ) : (
            /* Timeline */
            <div>
              {/* Summary strip */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28,
                padding: '12px 16px', background: 'var(--paper)', border: '1px solid var(--line)',
                borderRadius: 'var(--r2)', fontSize: 13,
              }}>
                <span style={{ fontSize: 18 }}>📊</span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                  {totalThisWeek} post{totalThisWeek !== 1 ? 's' : ''} this week
                </span>
                <span style={{ color: 'var(--ink4)' }}>across {weekDays.length} day{weekDays.length !== 1 ? 's' : ''}</span>
              </div>
              
              {filteredWeekDays.map(([date, dayPosts]) => (
                <div key={date} style={{ marginBottom: 40 }}>
                  {/* Day header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 800, color: 'var(--accent)',
                      background: 'var(--accent-bg)', padding: '5px 14px',
                      borderRadius: 100, whiteSpace: 'nowrap', letterSpacing: '0.2px',
                    }}>
                      {dayLabel(date)}
                    </div>
                    <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                    <div style={{ fontSize: 11, color: 'var(--ink4)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      &nbsp;· {dayPosts.length} post{dayPosts.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="blog-grid">
                    {dayPosts.map(post => (
                      <BlogCard key={post._id || post.slug} post={post} onNavigate={onNav} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ════════════════════════════════════════════════════════
            CATEGORY VIEW — standard grid
            ════════════════════════════════════════════════════════ */}
        {!isRecent && (
          loading ? (
            <div className="blog-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                  <div className="skeleton" style={{ height: 190 }} />
                  <div style={{ padding: 16 }}>
                    <div className="skeleton" style={{ height: 12, width: '40%', borderRadius: 4, marginBottom: 10 }} />
                    <div className="skeleton" style={{ height: 16, borderRadius: 4, marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 16, width: '80%', borderRadius: 4, marginBottom: 16 }} />
                    <div className="skeleton" style={{ height: 12, width: '60%', borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink4)' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✍️</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink2)', marginBottom: 8 }}>
                No posts in this category yet
              </div>
              <div style={{ fontSize: 13 }}>New content is generated daily — check back soon!</div>
            </div>
          ) : filteredPosts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink4)' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink2)', marginBottom: 8 }}>No posts match your search</div>
              <div style={{ fontSize: 13 }}>Try a different keyword or clear the filter</div>
            </div>
          ) : (
            <>
              <div className="blog-grid">
                {filteredPosts.map(post => (
                  <BlogCard key={post._id || post.slug} post={post} onNavigate={onNav} />
                ))}
              </div>

              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: 32 }}>
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{
                      padding: '10px 28px',
                      background: 'var(--paper)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--r2)',
                      fontSize: 14, fontWeight: 600,
                      color: 'var(--ink2)',
                      cursor: loadingMore ? 'default' : 'pointer',
                      transition: 'all .15s',
                    }}
                  >
                    {loadingMore ? 'Loading…' : `Load More (${total - posts.length} remaining)`}
                  </button>
                </div>
              )}
            </>
          )
        )}

          {/* ── Share row ───────────────────────────────────────── */}
          <div className="blog-share-row" style={{ marginTop: 20 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink3)', alignSelf: 'center' }}>
              Share this:
            </span>
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className="blog-share-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp
            </a>
            <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="blog-share-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.731-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
              </svg>
              X / Twitter
            </a>
            <button className="blog-share-btn" onClick={handleCopyLink}>
              {copied ? '✅ Copied!' : '🔗 Copy Link'}
            </button>
          </div>
      </div>


      {/* ── CTA banner ────────────────────────────────────────────── */}
      
        <div className="wrap" style={{ padding: '0 20px' }}>
          <div className="blog-cta-banner">
            {maintenanceMode ? (
              <>
                <div className="blog-cta-title">🚀 bestpickr is launching soon!</div>
                <div className="blog-cta-sub">
                  India's first AI that reads thousands of reviews and finds the best price across Amazon &amp; Flipkart — completely free.
                </div>
                <a
                  href="https://www.instagram.com/bestpickr"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 9,
                    background: 'rgba(255,255,255,0.12)', color: 'white',
                    border: '1.5px solid rgba(255,255,255,0.25)',
                    borderRadius: 'var(--r)', padding: '11px 24px',
                    fontWeight: 700, fontSize: 14, textDecoration: 'none',
                    marginTop: 6, transition: 'background 0.15s',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                  Follow @bestpickr.in on Instagram
                </a>
              </>
            ) : (
              <>
                <div className="blog-cta-title">🛒 Ready to buy? Compare prices with AI</div>
                <div className="blog-cta-sub">
                  Get AI-ranked results across Amazon &amp; Flipkart — real scores from thousands of verified reviews.
                </div>
                <form className="blog-cta-form" onSubmit={handleCtaSearch}>
                  <input
                    className="blog-cta-input"
                    value={ctaQ}
                    onChange={(e) => setCtaQ(e.target.value)}
                    placeholder="Search for a product…"
                  />
                  <button type="submit" className="blog-cta-submit">Compare →</button>
                </form>
              </>
            )}
          </div>
        </div>

    </div>
  )
}
