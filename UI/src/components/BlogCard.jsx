// src/components/BlogCard.jsx
// Reusable blog post card — used in BlogPage grid and BlogPostPage related section.
import '../styles/blog.css'

const CATEGORY_COLORS = {
  Smartphones:    { color: '#1A6B3C', bg: 'rgba(26,107,60,0.85)' },
  Laptops:        { color: '#1155CC', bg: 'rgba(17,85,204,0.85)' },
  Audio:          { color: '#6B3FAC', bg: 'rgba(107,63,172,0.85)' },
  Deals:          { color: '#C84B11', bg: 'rgba(200,75,17,0.85)' },
  Wearables:      { color: '#0D7C8C', bg: 'rgba(13,124,140,0.85)' },
  Televisions:    { color: '#B8860B', bg: 'rgba(184,134,11,0.85)' },
  'Industry News':{ color: '#444',    bg: 'rgba(60,60,60,0.75)' },
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800'

export default function BlogCard({ post, onNavigate }) {
  const cat     = CATEGORY_COLORS[post.category] || CATEGORY_COLORS['Industry News']
  const date    = formatDate(post.publishedAt || post.createdAt)
  const readTime = post.readTimeMinutes ? `${post.readTimeMinutes} min read` : ''

  function handleClick() {
    if (onNavigate) onNavigate('blog/' + post.slug)
  }

  return (
    <div className="blog-card" onClick={handleClick} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
    >
      {/* Image with category badge overlaid */}
      <div className="blog-card-img-wrap">
        <img
          className="blog-card-img"
          src={post.coverImage || FALLBACK_IMAGE}
          alt={post.coverImageAlt || post.title}
          loading="lazy"
        />
        <div className="blog-card-img-overlay" />
        {post.category && (
          <span
            className="blog-card-cat-badge"
            style={{ color: 'white', background: cat.bg }}
          >
            {post.category}
          </span>
        )}
      </div>

      {/* Card body — title, excerpt, meta */}
      <div className="blog-card-body">
        <div className="blog-card-title">{post.title}</div>
        <div className="blog-card-excerpt">{post.excerpt}</div>
        <div className="blog-card-meta">
          {date && <span>{date}</span>}
          {date && readTime && <span className="blog-card-meta-dot" />}
          {readTime && <span>{readTime}</span>}
        </div>
      </div>
    </div>
  )
}
