// src/pages/BlogPostPage.jsx
// Individual blog post page — route: /#/blog/:slug
// Cover hero, reading progress bar, article, share buttons, CTA, related posts
import { useState, useEffect } from 'react'
import { getBlogPosts, getBlogPost } from '../services/api.js'
import BlogCard from '../components/BlogCard.jsx'
import '../styles/blog.css'

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// Extract a likely product name from post title for CTA pre-fill
function extractProduct(title = '') {
  return title
    .replace(/[–—-]\s*.+$/, '')
    .replace(/^(Best|Top|Guide to|How to|Review:?)\s+/i, '')
    .trim()
    .slice(0, 60)
}

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800'

export default function BlogPostPage({ slug, onSearch, onHome, maintenanceMode = false }) {
  const resolvedSlug = slug || window.location.hash.replace(/^#\/?blog\//, '').split('?')[0]

  const [post,     setPost]     = useState(null)
  const [related,  setRelated]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [copied,   setCopied]   = useState(false)
  const [ctaQ,     setCtaQ]     = useState('')
  const [progress, setProgress] = useState(0)

  // ── Reading progress bar ─────────────────────────────────────────
  useEffect(() => {
    function onScroll() {
      const docH = document.documentElement.scrollHeight - window.innerHeight
      setProgress(docH > 0 ? Math.min(100, Math.round((window.scrollY / docH) * 100)) : 0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // ── Fetch post + related ─────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    setProgress(0)
    getBlogPost(resolvedSlug)
      .then(d => {
        if (!d.success || !d.post) { setNotFound(true); return }
        setPost(d.post)
        setCtaQ(extractProduct(d.post.title))
        document.title = d.post.title + ' | bestpickr'
        const meta = document.querySelector('meta[name="description"]')
        if (meta) meta.content = d.post.excerpt || ''
        return getBlogPosts({ category: d.post.category, limit: 4 })
      })
      .then(d => {
        if (!d) return
        setRelated((d.posts || []).filter(p => p.slug !== resolvedSlug).slice(0, 3))
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [resolvedSlug])

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

  function navigate(path) {
    window.location.hash = '/' + path
  }

  // ── Loading skeleton ─────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: '100%', height: 420 }} />
        <div className="blog-post-wrap">
          <div style={{ padding: '20px 0' }}>
            <div className="skeleton" style={{ height: 13, width: '35%', borderRadius: 4, marginBottom: 28 }} />
            <div className="skeleton" style={{ height: 40, borderRadius: 4, marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 40, width: '70%', borderRadius: 4, marginBottom: 22 }} />
            <div className="skeleton" style={{ height: 13, width: '45%', borderRadius: 4, marginBottom: 36 }} />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 14, borderRadius: 4, marginBottom: 12, width: i % 4 === 3 ? '75%' : '100%' }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── 404 ──────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--paper2)', minHeight: '60vh' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Post not found</h1>
        <p style={{ color: 'var(--ink3)', marginBottom: 24 }}>
          This post may have been unpublished or the URL is incorrect.
        </p>
        <button
          onClick={() => navigate('blog')}
          style={{ padding: '10px 24px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 'var(--r2)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
        >
          ← Back to Blog
        </button>
      </div>
    )
  }

  if (!post) return null

  const postUrl    = window.location.href
  const shareText  = encodeURIComponent(post.title + ' — ' + postUrl)
  const waUrl      = `https://wa.me/?text=${shareText}`
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(postUrl)}`

  return (
    <div>
      {/* ── Reading progress bar ─────────────────────────────────── */}
      <div className="blog-progress-bar" style={{ width: `${progress}%` }} />

      {/* ── Hero image — immersive with overlay ──────────────────── */}
      <div className="blog-post-hero-wrap">
        <img
          className="blog-post-hero"
          src={post.coverImage || FALLBACK_IMAGE}
          alt={post.coverImageAlt || post.title}
        />
        <div className="blog-post-hero-gradient" />
        {post.category && (
          <span className="blog-post-hero-cat">{post.category}</span>
        )}
      </div>

      <div style={{ background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>
        <div className="blog-post-wrap">

          {/* ── Breadcrumb ────────────────────────────────────────── */}
          <nav className="blog-breadcrumb" aria-label="Breadcrumb">
            <span onClick={onHome || (() => navigate(''))}>Home</span>
            <span style={{ color: 'var(--line)' }}>›</span>
            <span onClick={() => navigate('blog')}>Blog</span>
            {post.category && (
              <>
                <span style={{ color: 'var(--line)' }}>›</span>
                <span onClick={() => navigate('blog')}>{post.category}</span>
              </>
            )}
            <span style={{ color: 'var(--line)' }}>›</span>
            <span style={{ color: 'var(--ink3)', cursor: 'default', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {post.title}
            </span>
          </nav>

          {/* ── Article header ────────────────────────────────────── */}
          <h1 className="blog-post-title">{post.title}</h1>

          {/* Excerpt / summary pull-quote */}
          {post.excerpt && (
            <p style={{
              fontSize: 16,
              color: 'var(--ink3)',
              lineHeight: 1.65,
              marginBottom: 20,
              paddingLeft: 16,
              borderLeft: '3px solid var(--accent)',
              fontStyle: 'italic',
            }}>
              {post.excerpt}
            </p>
          )}

          <div className="blog-post-meta">
            <span>{formatDate(post.publishedAt || post.createdAt)}</span>
            {post.readTimeMinutes && (
              <>
                <span style={{ color: 'var(--line)' }}>·</span>
                <span>⏱ {post.readTimeMinutes} min read</span>
              </>
            )}
            <span style={{ color: 'var(--line)' }}>·</span>
            <span className="blog-post-author">
              <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
                <path d="M4 8.5L7 11.5L13 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              by bestpickr AI
            </span>
            {post.tags?.length > 0 && (
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {post.tags.slice(0, 3).map(tag => (
                  <span key={tag} style={{
                    fontSize: 11, background: 'var(--paper2)', border: '1px solid var(--line)',
                    borderRadius: 4, padding: '2px 8px', color: 'var(--ink3)', fontWeight: 500,
                  }}>
                    #{tag}
                  </span>
                ))}
              </span>
            )}
          </div>

          {/* ── Article body ──────────────────────────────────────── */}
          <div
            className="blog-content"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          {/* ── Share row ─────────────────────────────────────────── */}
          <div className="blog-share-row">
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink3)', alignSelf: 'center' }}>Share this:</span>
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

          {/* ── CTA banner ────────────────────────────────────────── */}
          <div className="blog-cta-banner">
            {maintenanceMode ? (
              /* Maintenance mode: no product search — drive Instagram follow */
              <>
                <div className="blog-cta-title">🚀 bestpickr is launching soon!</div>
                <div className="blog-cta-sub">
                  India's first AI that reads thousands of reviews and finds the best price across Amazon & Flipkart — completely free.
                </div>
                <a
                  href="https://www.instagram.com/bestpickr.in/"
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
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                  Follow @bestpickr.in on Instagram
                </a>
              </>
            ) : (
              /* Normal mode: product comparison CTA */
              <>
                <div className="blog-cta-title">🛒 Ready to buy? Compare prices with AI</div>
                <div className="blog-cta-sub">
                  Get AI-ranked results across Amazon & Flipkart — real scores from thousands of verified reviews.
                </div>
                <form className="blog-cta-form" onSubmit={handleCtaSearch}>
                  <input
                    className="blog-cta-input"
                    value={ctaQ}
                    onChange={e => setCtaQ(e.target.value)}
                    placeholder="Search for a product…"
                  />
                  <button type="submit" className="blog-cta-submit">Compare →</button>
                </form>
              </>
            )}
          </div>

        </div>
      </div>

      {/* ── Related posts ─────────────────────────────────────────── */}
      {related.length > 0 && (
        <div style={{ background: 'var(--paper2)', borderTop: '1px solid var(--line)', padding: '40px 0 64px' }}>
          <div className="blog-post-wrap" style={{ maxWidth: 'var(--max)', padding: '0 20px' }}>
            <div className="blog-related-title">You might also like</div>
            <div className="blog-grid">
              {related.map(p => (
                <BlogCard key={p._id || p.slug} post={p} onNavigate={path => { window.location.hash = '/' + path }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
