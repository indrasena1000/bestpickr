// src/components/PrimaryProductCard.jsx
// Progressive enhancement: skeleton → partial → ready → failed
// status: 'fetching' | 'partial' | 'ready' | 'failed'
import { useState } from 'react'
import { PlatformLogo } from './PlatformLogo.jsx'

const fmt = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—'

function SkeletonPulse({ w = '100%', h = 16, r = 6, style = {} }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, var(--paper3) 25%, var(--line) 50%, var(--paper3) 75%)',
      backgroundSize: '200% 100%',
      animation: 'bp-shimmer 1.4s infinite',
      ...style,
    }} />
  )
}

export default function PrimaryProductCard({ product, status, onBuy }) {
  const [imgErr, setImgErr] = useState(false)

  // ── FETCHING: full skeleton ───────────────────────────────────
  if (status === 'fetching' || !product) {
    return (
      <div className="rcard" style={{ padding: 20, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ width: 100, height: 100, borderRadius: 8, background: 'var(--paper3)', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SkeletonPulse w="60%" h={20} />
          <SkeletonPulse w="40%" h={14} />
          <SkeletonPulse w="30%" h={28} r={4} style={{ marginTop: 8 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <SkeletonPulse w={80} h={28} r={20} />
            <SkeletonPulse w={80} h={28} r={20} />
          </div>
        </div>
        <style>{`@keyframes bp-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      </div>
    )
  }

  const p        = product
  const platforms = p.platforms || []
  const bestPlt   = platforms.reduce((b, pl) => (!b || pl.price < b.price ? pl : b), null)

  // ── FAILED ───────────────────────────────────────────────────
  if (status === 'failed') {
    return (
      <div className="rcard" style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>😕</div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Could not fetch product details</div>
        <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Try searching again or browse by category below</div>
      </div>
    )
  }

  // ── PARTIAL / READY ───────────────────────────────────────────
  const isPartial = status === 'partial'

  return (
    <div className="rcard" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Badge */}
      <div style={{
        background: 'var(--accent)', color: '#fff',
        fontSize: 11, fontWeight: 700, letterSpacing: '.5px',
        padding: '5px 14px', display: 'inline-block',
        borderRadius: '0 0 8px 0',
      }}>
        #1 BEST PICK
      </div>

      <div style={{ padding: '16px 20px 20px', display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Image */}
        <div style={{
          width: 110, height: 110, borderRadius: 10,
          background: 'var(--paper3)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0, overflow: 'hidden',
        }}>
          {p.imageUrl && !imgErr
            ? <img src={p.imageUrl} alt={p.name} onError={() => setImgErr(true)}
                   style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: 36 }}>📦</span>}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, color: 'var(--ink4)', fontWeight: 600, marginBottom: 2 }}>{p.brand}</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3 }}>{p.name}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            {/* Price */}
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontFamily: "'DM Mono',monospace" }}>
              {fmt(p.price || p.lowestPrice || bestPlt?.price)}
            </span>
            {/* AI Score */}
            {isPartial
              ? <SkeletonPulse w={60} h={28} r={6} />
              : p.aiScore
                ? <span style={{
                    background: 'var(--accent-bg)', color: 'var(--accent)',
                    fontWeight: 800, fontSize: 14, fontFamily: "'DM Mono',monospace",
                    padding: '4px 10px', borderRadius: 6,
                  }}>AI {p.aiScore}/10</span>
                : null}
          </div>

          {/* Platform pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {platforms.length > 0
              ? platforms.map(plt => (
                  <button key={plt.name} onClick={() => onBuy?.(plt)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      border: '1px solid var(--line)', background: 'var(--paper)',
                      cursor: 'pointer', color: 'var(--ink)',
                    }}>
                    <PlatformLogo name={plt.name} size={13} />
                    {fmt(plt.price)}
                  </button>
                ))
              : ['Amazon', 'Flipkart', 'Myntra'].map(name => (
                  <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 20, fontSize: 12,
                    border: '1px solid var(--line)', color: 'var(--ink4)' }}>
                    <PlatformLogo name={name} size={13} />
                  </span>
                ))}
          </div>
        </div>

        {/* Buy button */}
        {!isPartial && bestPlt && (
          <button onClick={() => onBuy?.(bestPlt)} style={{
            background: 'var(--accent)', color: '#fff',
            fontWeight: 700, fontSize: 14, padding: '11px 22px',
            borderRadius: 10, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            alignSelf: 'center',
          }}>
            Buy on {bestPlt.name} →
          </button>
        )}
      </div>
    </div>
  )
}
