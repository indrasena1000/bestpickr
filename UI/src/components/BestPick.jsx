// src/components/BestPick.jsx
// Typesense-powered search result layout.
// Shows the top Typesense result as "BEST PICK" with a prominent badge,
// and the remaining results as "ALTERNATIVES" in a horizontal scroll grid.
//
// Props:
//   primaryProduct  — the best-ranked product from Typesense
//   suggestions     — array of alternative products
//   query           — the search query string (for display)
//   source          — "typesense" | "redis_top50" | "live" (shows badge context)
//   onBuy(product)  — called when user clicks Buy Now
//   onDetails(asin) — called when user clicks View Details

import { useState } from 'react'
import { PlatformLogo } from './PlatformLogo.jsx'

const fmt = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—'

function StarRating({ value, max = 5 }) {
  if (!value) return null
  const pct = Math.round((value / max) * 100)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
      <span style={{ position: 'relative', display: 'inline-block', fontSize: 14 }}>
        <span style={{ color: 'var(--line)', letterSpacing: 1 }}>{'★★★★★'}</span>
        <span style={{
          position: 'absolute', top: 0, left: 0, overflow: 'hidden',
          width: `${pct}%`, color: '#f5a623', letterSpacing: 1,
        }}>{'★★★★★'}</span>
      </span>
      <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>{Number(value).toFixed(1)}</span>
    </span>
  )
}

function ProductImage({ src, alt, size = 120 }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 8,
        background: 'var(--paper2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size > 80 ? 32 : 20, flexShrink: 0,
      }}>📦</div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      style={{
        width: size, height: size, objectFit: 'contain',
        borderRadius: 8, background: '#fff', flexShrink: 0,
      }}
    />
  )
}

// ── Best Pick card (large) ───────────────────────────────────────
function BestPickCard({ product, onBuy, onDetails }) {
  if (!product) return null

  const price = product.lowestPrice || product.price
  const rating = product.avgRating || product.rating
  const bestDeal = product.bestDeal
  const platforms = product.platforms || []

  return (
    <div style={{
      background: 'var(--paper)',
      border: '2px solid var(--accent)',
      borderRadius: 16,
      padding: 20,
      position: 'relative',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    }}>
      {/* Best Pick badge */}
      <div style={{
        position: 'absolute', top: -12, left: 20,
        background: 'var(--accent)',
        color: '#fff',
        fontSize: 11, fontWeight: 700,
        padding: '3px 12px', borderRadius: 20,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
      }}>
        ⭐ Best Pick
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginTop: 8 }}>
        <ProductImage src={product.imageUrl} alt={product.name} size={130} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Brand */}
          {product.brand && (
            <div style={{ fontSize: 11, color: 'var(--ink4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              {product.brand}
            </div>
          )}

          {/* Title */}
          <h2 style={{
            fontSize: 17, fontWeight: 700, color: 'var(--ink1)',
            margin: '0 0 8px', lineHeight: 1.35,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {product.name}
          </h2>

          {/* Rating */}
          <div style={{ marginBottom: 8 }}>
            <StarRating value={rating} />
            {product.totalReviews > 0 && (
              <span style={{ fontSize: 11, color: 'var(--ink4)', marginLeft: 6 }}>
                ({product.totalReviews.toLocaleString('en-IN')} reviews)
              </span>
            )}
          </div>

          {/* AI Score badge */}
          {product.aiScore && (
            <div style={{ marginBottom: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: 'var(--green-subtle, #e8f5e9)',
                color: 'var(--green, #2e7d32)',
                padding: '2px 8px', borderRadius: 8,
              }}>
                AI Score: {product.aiScore}/10
              </span>
            </div>
          )}

          {/* Price */}
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', marginBottom: 10 }}>
            {fmt(price)}
          </div>

          {/* Platform pills */}
          {platforms.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {platforms.map((pl) => (
                <a
                  key={pl.name}
                  href={pl.affiliateUrl || pl.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, fontWeight: 600, padding: '4px 10px',
                    borderRadius: 16, border: '1px solid var(--line)',
                    color: 'var(--ink2)', textDecoration: 'none',
                    background: 'var(--paper2)',
                    transition: 'all 0.15s',
                  }}
                >
                  <PlatformLogo name={pl.name} size={14} />
                  {fmt(pl.price)}
                </a>
              ))}
            </div>
          )}

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {bestDeal?.url && (
              <a
                href={bestDeal.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                style={{
                  display: 'inline-block',
                  background: 'var(--accent)',
                  color: '#fff',
                  fontWeight: 700, fontSize: 13,
                  padding: '9px 20px', borderRadius: 24,
                  textDecoration: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}
                onClick={() => onBuy?.(product)}
              >
                Buy Now →
              </a>
            )}
            {onDetails && (
              <button
                style={{
                  background: 'transparent',
                  border: '1px solid var(--line)',
                  color: 'var(--ink2)',
                  fontWeight: 600, fontSize: 13,
                  padding: '9px 20px', borderRadius: 24,
                  cursor: 'pointer',
                }}
                onClick={() => onDetails(product.asin)}
              >
                View Details
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Alternative product card (compact) ──────────────────────────
function AlternativeCard({ product, onBuy, onDetails }) {
  if (!product) return null
  const price = product.lowestPrice || product.price
  const rating = product.avgRating || product.rating

  return (
    <div style={{
      background: 'var(--paper)',
      border: '1px solid var(--line)',
      borderRadius: 12,
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minWidth: 200,
      maxWidth: 240,
      flexShrink: 0,
      transition: 'box-shadow 0.15s',
      cursor: 'pointer',
    }}
    onClick={() => onDetails?.(product.asin)}
    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
    onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
    >
      <ProductImage src={product.imageUrl} alt={product.name} size={80} />

      <div>
        {product.brand && (
          <div style={{ fontSize: 10, color: 'var(--ink4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {product.brand}
          </div>
        )}
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--ink1)',
          lineHeight: 1.35,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          marginTop: 2,
        }}>
          {product.name}
        </div>
      </div>

      <StarRating value={rating} />

      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>
        {fmt(price)}
      </div>

      {product.bestDeal?.url && (
        <a
          href={product.bestDeal.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          style={{
            display: 'block', textAlign: 'center',
            background: 'var(--paper2)', border: '1px solid var(--line)',
            color: 'var(--ink2)', fontWeight: 600, fontSize: 11,
            padding: '6px 0', borderRadius: 16, textDecoration: 'none',
          }}
          onClick={(e) => { e.stopPropagation(); onBuy?.(product) }}
        >
          Buy Now
        </a>
      )}
    </div>
  )
}

// ── Main BestPick layout ─────────────────────────────────────────
export default function BestPick({ primaryProduct, suggestions = [], query, source, onBuy, onDetails }) {
  if (!primaryProduct && suggestions.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Source badge */}
      {source === 'typesense' && (
        <div style={{ fontSize: 11, color: 'var(--ink4)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            background: 'var(--paper2)', border: '1px solid var(--line)',
            padding: '2px 8px', borderRadius: 8, fontWeight: 600,
          }}>
            ⚡ Smart Search
          </span>
          Powered by Typesense — relevance-ranked results
        </div>
      )}

      {/* Best Pick */}
      {primaryProduct && (
        <BestPickCard
          product={primaryProduct}
          onBuy={onBuy}
          onDetails={onDetails}
        />
      )}

      {/* Alternatives */}
      {suggestions.length > 0 && (
        <div>
          <div style={{
            fontSize: 12, fontWeight: 700, color: 'var(--ink3)',
            textTransform: 'uppercase', letterSpacing: '0.6px',
            marginBottom: 12,
          }}>
            Alternatives
          </div>
          <div style={{
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            paddingBottom: 8,
            scrollbarWidth: 'thin',
          }}>
            {suggestions.slice(0, 6).map((p) => (
              <AlternativeCard
                key={p.asin || p.platformId}
                product={p}
                onBuy={onBuy}
                onDetails={onDetails}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
