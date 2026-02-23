// src/components/BlogCarousel.jsx
// Horizontal auto-scrolling carousel of latest 5 blog posts.
// - Auto-advances every 5s, pauses on hover
// - Swipe support on mobile
// - Dot indicators + prev/next arrows (arrows hidden on mobile)
import { useState, useEffect, useRef, useCallback } from 'react'
import { getLatestBlogPosts } from '../services/api.js'
import '../styles/blog.css'

const CATEGORY_COLORS = {
  Smartphones:    { color: '#5dba85', bg: 'rgba(93,186,133,0.2)' },
  Laptops:        { color: '#6BA3F5', bg: 'rgba(107,163,245,0.2)' },
  Audio:          { color: '#C49BEA', bg: 'rgba(196,155,234,0.2)' },
  Deals:          { color: '#F4956B', bg: 'rgba(244,149,107,0.2)' },
  Wearables:      { color: '#4DCBDA', bg: 'rgba(77,203,218,0.2)' },
  Televisions:    { color: '#FBCF4A', bg: 'rgba(251,207,74,0.2)' },
  'Industry News':{ color: 'rgba(255,255,255,0.7)', bg: 'rgba(255,255,255,0.1)' },
}

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800'

export default function BlogCarousel({ onNavigate, darkMode = false }) {
  const [posts,   setPosts]   = useState([])
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(true)
  const [paused,  setPaused]  = useState(false)

  // Touch support
  const touchStartX = useRef(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    getLatestBlogPosts()
      .then(d => { setPosts(d.posts || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const next = useCallback(() => {
    setCurrent(c => (c + 1) % Math.max(posts.length, 1))
  }, [posts.length])

  const prev = useCallback(() => {
    setCurrent(c => (c - 1 + Math.max(posts.length, 1)) % Math.max(posts.length, 1))
  }, [posts.length])

  // Auto-advance
  useEffect(() => {
    if (paused || posts.length < 2) return
    intervalRef.current = setInterval(next, 5000)
    return () => clearInterval(intervalRef.current)
  }, [paused, posts.length, next])

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
  }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 40) diff > 0 ? next() : prev()
    touchStartX.current = null
  }

  function goToPost() {
    const post = posts[current]
    if (post && onNavigate) onNavigate('blog/' + post.slug)
  }

  // Skeleton
  if (loading) {
    return (
      <div className="blog-carousel-skeleton">
        <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 'var(--r3)' }} />
      </div>
    )
  }

  // No posts yet
  if (!posts.length) {
    return (
      <div style={{
        background: darkMode ? 'rgba(255,255,255,0.04)' : 'var(--paper2)',
        border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'var(--line)'}`,
        borderRadius: 'var(--r3)',
        padding: '32px',
        textAlign: 'center',
        color: darkMode ? 'rgba(255,255,255,0.4)' : 'var(--ink4)',
        fontSize: 14,
      }}>
        Blog posts coming soon — check back shortly!
      </div>
    )
  }

  const post = posts[current]
  const cat  = CATEGORY_COLORS[post?.category] || CATEGORY_COLORS['Industry News']

  return (
    <div
      className="blog-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slides */}
      {posts.map((p, i) => (
        <div
          key={p._id || p.slug}
          className="blog-carousel-slide"
          onClick={i === current ? goToPost : undefined}
          style={{
            backgroundImage: `url(${p.coverImage || FALLBACK_IMAGE})`,
            opacity: i === current ? 1 : 0,
            zIndex: i === current ? 2 : 1,
            cursor: i === current ? 'pointer' : 'default',
          }}
        >
          <div className="blog-carousel-overlay" />
          <div
            className="blog-carousel-cat"
            style={{ color: cat.color, borderColor: 'rgba(255,255,255,0.2)', background: cat.bg }}
          >
            {p.category || 'Tech'}
          </div>
          <div className="blog-carousel-content">
            <div className="blog-carousel-title">{p.title}</div>
            <div className="blog-carousel-excerpt">{p.excerpt}</div>
          </div>
        </div>
      ))}

      {/* Arrows */}
      {posts.length > 1 && (
        <>
          <button className="blog-carousel-arrow prev" onClick={prev} aria-label="Previous post">‹</button>
          <button className="blog-carousel-arrow next" onClick={next} aria-label="Next post">›</button>
        </>
      )}

      {/* Dots */}
      {posts.length > 1 && (
        <div className="blog-carousel-dots">
          {posts.map((_, i) => (
            <div
              key={i}
              className={`blog-carousel-dot ${i === current ? 'active' : ''}`}
              onClick={() => setCurrent(i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
