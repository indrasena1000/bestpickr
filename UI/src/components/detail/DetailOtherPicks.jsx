// components/detail/DetailOtherPicks.jsx
const fmt = (n) => (n ? `₹${Number(n).toLocaleString('en-IN')}` : '—')

export default function DetailOtherPicks({ allResults, currentName }) {
  const picks = (allResults || []).filter(r => r.name !== currentName).slice(0, 4)
  if (picks.length === 0) return null

  return (
    <div style={{
      background: 'var(--paper)', border: '1px solid var(--line)',
      borderRadius: 'var(--r3)', padding: 20,
    }}>
      <div className="compare-title">Other top picks in this search</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {picks.map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 0', borderBottom: '1px solid var(--line)',
          }}>
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 700, color: 'var(--ink4)', minWidth: 28 }}>
              #{r.rank}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{r.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink4)' }}>{r.brand} · {fmt(r.lowestPrice)}</div>
            </div>
            <span style={{
              background: 'var(--accent-bg)', color: 'var(--accent)',
              borderRadius: 4, padding: '2px 8px', fontSize: 12,
              fontWeight: 700, fontFamily: "'DM Mono',monospace",
            }}>
              {r.aiScore}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
