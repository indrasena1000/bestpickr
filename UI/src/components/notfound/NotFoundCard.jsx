// UI/src/components/notfound/NotFoundCard.jsx
// ─────────────────────────────────────────────────────────────────
// Section 2 — Fake product card styled like a real bestpickr rcard.
// Includes: animated AI score counter, staggered platform pills.
// ─────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react'
import { PlatformLogo } from '../PlatformLogo.jsx'

export default function NotFoundCard({ onHome }) {
  const [score,     setScore]     = useState('0.0')
  const [scoreColor, setScoreColor] = useState('var(--accent2)')
  const [flash,     setFlash]     = useState(false)
  const intervalRef = useRef(null)

  // ── AI Score counter animation ──────────────────────────────────
  // 0.0 → 9.8 over ~1.5s, pause 400ms, snap back to 0.0 + flash
  useEffect(() => {
    let current = 0
    setScoreColor('var(--accent)')

    intervalRef.current = setInterval(() => {
      current += 0.1
      if (current >= 9.8) {
        clearInterval(intervalRef.current)
        setScore('9.8')
        setTimeout(() => {
          setScore('0.0')
          setScoreColor('var(--accent2)')
          setFlash(true)
          setTimeout(() => setFlash(false), 600)
        }, 400)
        return
      }
      setScore(current.toFixed(1))
    }, 15)

    return () => clearInterval(intervalRef.current)
  }, [])

  const pillStyle = (delay) => ({
    display: 'inline-flex', alignItems: 'center',
    padding: '3px 10px', borderRadius: 100,
    fontSize: 12, fontWeight: 600,
    background: 'var(--accent2-bg)', color: 'var(--accent2)',
    opacity: 0,
    animation: `bp404PillIn 0.35s ease forwards`,
    animationDelay: delay,
  })

  const scoreCellStyle = {
    transition: 'background 0.3s',
    background: flash ? 'var(--accent2-bg)' : 'transparent',
    borderRadius: 'var(--r)',
    padding: '4px 6px',
  }

  return (
    <div className="rcard best" style={{ marginBottom: 0 }}>
      {/* Top row */}
      <div className="rcard-top">
        <div className="rcard-rank" style={{
          fontFamily: "'DM Mono', monospace",
          color: 'var(--accent2)', fontSize: 13, fontWeight: 700,
        }}>
          #404
        </div>
        <div className="rcard-emoji">🔍</div>
        <div className="rcard-info">
          <div className="rcard-brand">bestpickr internal</div>
          <div className="rcard-name">Page Not Found — Error 404</div>

          {/* Platform pills — staggered fade-in */}
          <div className="rcard-meta" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            <span style={{...pillStyle('0.3s'), display:'inline-flex', alignItems:'center', gap:5}}><PlatformLogo name="Amazon" size={13}/> Amazon · Not found</span>
            <span style={{...pillStyle('0.5s'), display:'inline-flex', alignItems:'center', gap:5}}><PlatformLogo name="Flipkart" size={13}/> Flipkart · Not found</span>
            <span style={{...pillStyle('0.7s'), display:'inline-flex', alignItems:'center', gap:5}}><PlatformLogo name="Myntra" size={13}/> Myntra · Not found</span>
          </div>
        </div>
      </div>

      {/* Bottom stats row */}
      <div className="rcard-bottom" style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>

        {/* AI Score */}
        <div style={{ flex: 1, minWidth: 80 }}>
          <div className="rcard-bottom-label">AI SCORE</div>
          <div style={scoreCellStyle}>
            <span
              className="score-big"
              style={{
                fontFamily: "'DM Mono', monospace",
                color: scoreColor,
                transition: 'color 0.2s',
              }}
            >
              {score}
            </span>
            <span className="score-denom">/ 10</span>
          </div>
        </div>

        {/* Rating */}
        <div style={{ flex: 1, minWidth: 80 }}>
          <div className="rcard-bottom-label">RATING</div>
          <div className="rcard-bottom-val" style={{ fontFamily: "'DM Mono', monospace" }}>—</div>
          <div style={{ fontSize: 11, color: 'var(--ink4)' }}>0 platforms</div>
        </div>

        {/* Reviews */}
        <div style={{ flex: 1, minWidth: 80 }}>
          <div className="rcard-bottom-label">REVIEWS</div>
          <div className="rcard-bottom-val" style={{ fontFamily: "'DM Mono', monospace" }}>0</div>
          <div style={{ fontSize: 11, color: 'var(--ink4)' }}>verified purchases</div>
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
          <button
            onClick={onHome}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            style={{
              background: 'var(--accent)', color: 'white',
              border: 'none', borderRadius: 'var(--r2)',
              padding: '10px 18px', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', transition: 'opacity 0.15s',
              fontFamily: 'inherit',
            }}
          >
            ← Go Home
          </button>
        </div>
      </div>
    </div>
  )
}
