// src/components/PrimaryProductCard.jsx
// Progressive enhancement: skeleton → partial → ready → failed
// v2.0: "Best Match for Your Search" prominent badge + confidence indicator
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

export default function PrimaryProductCard({ product, status, onBuy, onViewDetails, confidence, matchType }) {
  const [imgErr, setImgErr] = useState(false)

  // ── LAZY_PENDING: skeleton with "Finding exact match" label ─────
  if (status === 'lazy_pending' || status === 'fetching' || !product) {
    return (
      <div className="rcard" style={{ padding: 20 }}>
        {status === 'lazy_pending' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: 'var(--ink3)', marginBottom: 14,
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              border: '2px solid var(--accent)', borderTopColor: 'transparent',
              animation: 'spin 0.8s linear infinite', flexShrink: 0,
            }} />
            Finding exact match on Amazon…
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
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
        </div>
        <style>{`@keyframes bp-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      </div>
    )
  }

  const p         = product
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
  const confPct = confidence ? Math.round(confidence * 100) : null

  // Issue 2: Determine if AI score has sufficient data
  const hasReliableScore = p.aiScore && p.totalReviews > 0 && p.aiScore !== 3.8
  const showBetaLabel = p.aiScore && (!p.totalReviews || p.totalReviews === 0)

  return (
    <div className="rcard" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--accent)', position: 'relative' }}>
      {/* Best Match Badge — refined, lighter */}
      <div style={{
        background: 'linear-gradient(135deg, var(--accent), #228B47)',
        color: '#fff', padding: '8px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>🏆</span>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase' }}>
            Best Match for Your Search
          </span>
        </div>
        {confPct && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 36, height: 4, borderRadius: 2,
              background: 'rgba(255,255,255,0.25)', overflow: 'hidden',
            }}>
              <div style={{
                width: `${confPct}%`, height: '100%', borderRadius: 2,
                background: '#fff',
              }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.85 }}>{confPct}%</span>
          </div>
        )}
      </div>

      <div style={{ padding: '14px 18px 18px', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Image */}
        <div style={{
          width: 100, height: 100, borderRadius: 8,
          background: 'var(--paper3)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0, overflow: 'hidden',
        }}>
          {p.imageUrl && !imgErr
            ? <img src={p.imageUrl} alt={p.name} onError={() => setImgErr(true)}
                   style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: 32 }}>📦</span>}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 11, color: 'var(--ink4)', fontWeight: 600, marginBottom: 2 }}>{p.brand}</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3 }}>{p.name}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            {/* Price */}
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontFamily: "'DM Mono',monospace" }}>
              {fmt(p.price || p.lowestPrice || bestPlt?.price)}
            </span>
            {/* AI Score — Issue 2: show beta label or hide if unreliable */}
            {isPartial
              ? <SkeletonPulse w={60} h={28} r={6} />
              : p.aiScore
                ? <span style={{
                    background: 'var(--accent-bg)', color: 'var(--accent)',
                    fontWeight: 800, fontSize: 13, fontFamily: "'DM Mono',monospace",
                    padding: '3px 8px', borderRadius: 5, display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    {showBetaLabel && <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7 }}>BETA</span>}
                    AI {p.aiScore}/10
                  </span>
                : null}
          </div>

          {/* AI Summary line */}
          {p.aiSummary && (
            <div style={{
              fontSize: 12, color: 'var(--ink3)', marginTop: 6,
              lineHeight: 1.5, maxHeight: 36, overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {p.aiSummary}
            </div>
          )}

          {/* Platform pills */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
            {platforms.length > 0
              ? platforms.map(plt => (
                  <button key={plt.name} onClick={() => onBuy?.(plt)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px', borderRadius: 16, fontSize: 11, fontWeight: 600,
                      border: '1px solid var(--line)', background: 'var(--paper)',
                      cursor: 'pointer', color: 'var(--ink)',
                    }}>
                    <PlatformLogo name={plt.name} size={12} />
                    {fmt(plt.price)}
                  </button>
                ))
              : <span style={{ fontSize: 11, color: 'var(--ink4)' }}>Currently powered by Amazon data</span>}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'center' }}>
          {onViewDetails && !isPartial && (
            <button onClick={() => onViewDetails(product)} style={{
              background: 'var(--paper2)', color: 'var(--accent)',
              fontWeight: 700, fontSize: 12, padding: '8px 16px',
              borderRadius: 8, border: '1px solid var(--accent)', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}>
              View Details
            </button>
          )}
          {!isPartial && bestPlt && (
            <button onClick={() => onBuy?.(bestPlt)} style={{
              background: 'var(--accent)', color: '#fff',
              fontWeight: 700, fontSize: 13, padding: '10px 20px',
              borderRadius: 8, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(26,107,60,0.2)',
            }}>
              View Today's Best Price →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
