// src/components/SuggestionsGrid.jsx
// 9-card 3-column alternatives grid for PRODUCT_SPECIFIC + LOW_CONFIDENCE
import { PlatformPill } from './PlatformLogo.jsx'

const fmt = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : null

export default function SuggestionsGrid({ title = 'Top Alternatives', items = [], onSelect }) {
  if (!items || items.length === 0) return null

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{
        fontSize: 13, fontWeight: 700, color: 'var(--ink4)',
        letterSpacing: '.4px', textTransform: 'uppercase', marginBottom: 14,
      }}>
        {title}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: 12,
      }}>
        {items.slice(0, 9).map((item, i) => (
          <SuggestionCard key={item.id || i} item={item} rank={i + 1} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

function SuggestionCard({ item, rank, onSelect }) {
  const platforms = item.platforms || []

  return (
    <div
      className="rcard"
      style={{ padding: 14, cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start' }}
      onClick={() => onSelect?.(item)}
    >
      {/* Rank badge */}
      <span style={{
        fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 700,
        color: 'var(--ink4)', minWidth: 22, paddingTop: 2,
      }}>#{rank}</span>

      {/* Image */}
      <div style={{
        width: 52, height: 52, borderRadius: 6, background: 'var(--paper3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, overflow: 'hidden',
      }}>
        {item.imageUrl
          ? <img src={item.imageUrl} alt={item.name}
                 style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 20 }}>📦</span>}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 1 }}>{item.brand}</div>
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--ink)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.name}</div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', fontFamily: "'DM Mono',monospace" }}>
            {fmt(item.price || item.lowestPrice) || '—'}
          </span>
          {item.aiScore && (
            <span style={{
              fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono',monospace",
              background: 'var(--accent-bg)', color: 'var(--accent)',
              padding: '2px 6px', borderRadius: 4,
            }}>{item.aiScore}</span>
          )}
        </div>

        {platforms.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
            {platforms.slice(0, 3).map(plt => (
              <PlatformPill key={plt.name} name={plt.name} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
