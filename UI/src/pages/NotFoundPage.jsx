// UI/src/pages/NotFoundPage.jsx
// ─────────────────────────────────────────────────────────────────
// 404 Page — shown when no route matches in App.jsx hash router.
// Sections: Hero (404 highlight + badge) + Fake Product Card + Search Recovery
// Sub-components live in UI/src/components/notfound/
// ─────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import NotFoundCard   from '../components/notfound/NotFoundCard.jsx'
import NotFoundSearch from '../components/notfound/NotFoundSearch.jsx'

// ── Inject keyframe animations once (guard with id) ───────────────
function injectStyles() {
  if (document.getElementById('bp404-styles')) return
  const el = document.createElement('style')
  el.id = 'bp404-styles'
  el.textContent = `
    @keyframes bp404PillIn {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0);   }
    }
    @keyframes bp404FadeUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0);    }
    }
    @keyframes bp404Pulse {
      0%,100% { opacity: 1; }
      50%      { opacity: 0.6; }
    }
    @keyframes bp404BadgePop {
      0%   { transform: scale(0.8); opacity: 0; }
      60%  { transform: scale(1.08); opacity: 1; }
      100% { transform: scale(1); }
    }
  `
  document.head.appendChild(el)
}

export default function NotFoundPage({ onSearch, onHome, onNav }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    injectStyles()
    // Small delay so the CSS class toggle triggers the transition
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  const wrapStyle = {
    opacity:   visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(16px)',
    transition: 'opacity 0.4s ease, transform 0.4s ease',
    paddingBottom: 48,
  }

  return (
    <div style={wrapStyle}>

      {/* ── SECTION 1: HERO HEADER ────────────────────────────── */}
      <div style={{
        background: 'var(--paper)',
        borderBottom: '1px solid var(--line)',
        padding: '48px 0 44px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Large 404 — prominent, accent-colored, gently pulsing */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 'clamp(100px, 20vw, 180px)',
          fontWeight: 800,
          fontFamily: "'DM Mono', monospace",
          letterSpacing: '-4px',
          lineHeight: 1,
          zIndex: 0,
          whiteSpace: 'nowrap',
          userSelect: 'none',
          pointerEvents: 'none',
          color: 'rgba(200, 75, 17, 0.10)',
          animation: 'bp404Pulse 3.5s ease-in-out infinite',
        }}>
          404
        </div>

        {/* Content above watermark */}
        <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>

          {/* Prominent PAGE NOT FOUND badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 13, fontWeight: 800,
            letterSpacing: '1px', textTransform: 'uppercase',
            color: 'var(--accent2)',
            background: 'var(--accent2-bg)',
            border: '1.5px solid rgba(200,75,17,0.35)',
            borderRadius: 'var(--r2)',
            padding: '7px 16px',
            marginBottom: 20,
            animation: 'bp404BadgePop 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
            animationDelay: '0.1s',
            boxShadow: '0 2px 12px rgba(200,75,17,0.12)',
          }}>
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 15, fontWeight: 900,
            }}>404</span>
            <span style={{ width: 1, height: 14, background: 'rgba(200,75,17,0.3)', display: 'inline-block' }} />
            PAGE NOT FOUND
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: 'clamp(24px, 4vw, 36px)',
            fontWeight: 800,
            letterSpacing: '-0.6px',
            color: 'var(--ink)',
            margin: '0 0 10px',
            lineHeight: 1.2,
          }}>
            Our AI searched everywhere. Found nothing.
          </h1>

          {/* Sub-line */}
          <p style={{
            fontSize: 14,
            color: 'var(--ink3)',
            lineHeight: 1.7,
            margin: 0,
            maxWidth: 520,
          }}>
            Amazon, Flipkart, and Myntra all returned 0 results for this URL.
          </p>
        </div>
      </div>

      {/* ── SECTIONS 2–5 ─────────────────────────────────────── */}
      <div className="wrap" style={{ paddingTop: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Section 3 — Search recovery */}
          <NotFoundSearch onSearch={onSearch} />

          {/* Section 2 — Fake product card */}
          <NotFoundCard onHome={onHome} />

          {/* Section 6 — Footer help row */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            paddingTop: 8,
            borderTop: '1px solid var(--line)',
          }}>
            <span style={{ fontSize: 12, color: 'var(--ink4)' }}>
              Lost? Try browsing our top categories or go back to the homepage.
            </span>
            <div style={{ display: 'flex', gap: 16 }}>
              <button
                onClick={onHome}
                style={{
                  background: 'none', border: 'none',
                  fontSize: 12, fontWeight: 600,
                  color: 'var(--accent)', cursor: 'pointer',
                  fontFamily: 'inherit', padding: 0,
                }}
              >
                🏠 Go Home
              </button>
              <button
                onClick={() => onNav('blog')}
                style={{
                  background: 'none', border: 'none',
                  fontSize: 12, fontWeight: 600,
                  color: 'var(--accent)', cursor: 'pointer',
                  fontFamily: 'inherit', padding: 0,
                }}
              >
                📝 Blog
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
