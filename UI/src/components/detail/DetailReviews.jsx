// components/detail/DetailReviews.jsx
import { PlatformLogo } from '../PlatformLogo.jsx'

const DEFAULT_PRAISE     = ['Good overall quality', 'Positive user experience', 'Value for money', 'Easy to use', 'Recommended by reviewers']
const DEFAULT_COMPLAINTS = ['Price could be lower', 'Some quality inconsistencies', 'Customer support issues']

function parseBullets(str, fallback) {
  return str ? str.split('·').map(s => s.trim()).filter(Boolean) : fallback
}

export default function DetailReviews({ p }) {
  const platforms   = p.platforms || []
  const positivePct = p.positivePct || 75
  const negativePct = Math.max(0, 100 - positivePct - 10)
  const neutralPct  = Math.max(0, 100 - positivePct - negativePct)

  const sentimentRows = [
    ['😊 Positive', positivePct,  'sent-fill-p'],
    ['😐 Neutral',  neutralPct,   'sent-fill-n'],
    ['😞 Negative', negativePct,  'sent-fill-ng'],
  ]

  return (
    <div className="review-section">
      <div className="compare-title">
        Review analysis — {(p.totalReviews || 0).toLocaleString()} reviews across all platforms
      </div>

      <div className="review-grid">
        {/* Left: big score + per-platform */}
        <div style={{ textAlign: 'center' }}>
          <div className="review-big-num">{p.avgRating || '4.7'}</div>
          <div className="review-big-sub">out of 5 · all platforms</div>
          <div className="review-big-stars">★★★★★</div>

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <div style={{ fontSize: 12, color: 'var(--ink4)', marginBottom: 8, fontWeight: 600 }}>BY PLATFORM</div>
            {platforms.map((plt) => (
              <div key={plt.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--ink3)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <PlatformLogo name={plt.name} size={14} /> {plt.name}
                </span>
                <span style={{ fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>
                  {plt.rating || '—'} ({(plt.reviewCount || 0).toLocaleString()})
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: sentiment bars + highlights */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink4)', letterSpacing: '.3px', textTransform: 'uppercase', marginBottom: 10 }}>
            Review Sentiment
          </div>
          <div className="sentiment-rows">
            {sentimentRows.map(([lbl, pct, cls]) => (
              <div key={lbl} className="sent-row">
                <div className="sent-lbl">{lbl}</div>
                <div className="sent-track"><div className={cls} style={{ width: `${pct}%` }} /></div>
                <div className="sent-pct">{Math.round(pct)}%</div>
              </div>
            ))}
          </div>

          <div className="review-highlights">
            <div className="rh-box">
              <div className="rh-title">What people love</div>
              <div className="rh-points">
                {parseBullets(p.praiseSummary, DEFAULT_PRAISE).slice(0, 5).map((pt, i) => (
                  <div key={i} className="rh-point">{pt}</div>
                ))}
              </div>
            </div>
            <div className="rh-box neg">
              <div className="rh-title">Common complaints</div>
              <div className="rh-points">
                {parseBullets(p.complaintSummary, DEFAULT_COMPLAINTS).slice(0, 4).map((pt, i) => (
                  <div key={i} className="rh-point">{pt}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
