// src/pages/BlogPage.jsx
// Blog listing page — route: /#/blog
// Tabs: 📅 Last 7 Days (timeline) | Category filters (grid)
import { useState, useEffect } from 'react'
import { getBlogPosts, getWeeklyBlogPosts } from '../services/api.js'
import BlogCard from '../components/BlogCard.jsx'
import BlogCarousel from '../components/BlogCarousel.jsx'
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

export default function BlogPage({ onSearch, onNav }) {
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

      <div className="wrap" style={{ padding: '28px 20px 80px' }}>

        {/* ── Featured Carousel ─────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <BlogCarousel onNavigate={onNav} />
        </div>

        {/* ── Tabs row ──────────────────────────────────────────── */}
        <div className="blog-cat-tabs" style={{ marginBottom: 28 }}>
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

              {weekDays.map(([date, dayPosts]) => (
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
          ) : (
            <>
              <div className="blog-grid">
                {posts.map(post => (
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

      </div>
    </div>
  )
}
