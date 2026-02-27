// components/detail/DetailScoreBreakdown.jsx
const ROWS = [
  ['Platform Ratings (40%)',  'ratingScore'],
  ['Review Sentiment (30%)',  'sentimentScore'],
  ['Value for Money (15%)',   'valueScore'],
  ['Review Volume (15%)',     'volumeScore'],
]

export default function DetailScoreBreakdown({ breakdown }) {
  if (!breakdown) return null

  return (
    <div style={{
      background: 'var(--paper)', border: '1px solid var(--line)',
      borderRadius: 'var(--r3)', padding: 20, marginBottom: 16,
    }}>
      <div className="compare-title">AI Score Breakdown</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ROWS.map(([label, key]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontSize: 12, fontWeight: 600, color: 'var(--ink3)',
              minWidth: 'clamp(120px, 30%, 200px)', flexShrink: 0,
            }}>
              {label}
            </span>
            <div style={{ flex: 1, height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${((breakdown[key] || 0) / 10) * 100}%`,
                height: '100%', background: 'var(--accent)', borderRadius: 3,
              }} />
            </div>
            <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 14, minWidth: 30 }}>
              {breakdown[key] || 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
