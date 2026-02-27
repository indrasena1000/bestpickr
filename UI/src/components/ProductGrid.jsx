// src/components/ProductGrid.jsx
// 10-card grid for CATEGORY / BRAND_CATEGORY / GENERIC intents
import { PlatformPill } from './PlatformLogo.jsx'

const fmt = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : null

export default function ProductGrid({ items = [], onSelect, title }) {
  if (!items || items.length === 0) return null

  return (
    <div>
      {title && (
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--ink4)',
          letterSpacing: '.4px', textTransform: 'uppercase', marginBottom: 14,
        }}>{title}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.slice(0, 10).map((item, i) => (
          <ProductRow key={item.id || i} item={item} rank={i + 1} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

function ProductRow({ item, rank, onSelect }) {
  const platforms = item.platforms || []

  return (
    <div
      className="rcard"
      style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'center' }}
      onClick={() => onSelect?.(item)}
    >
      {/* Rank */}
      <span style={{
        fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 13,
        color: rank <= 3 ? 'var(--accent)' : 'var(--ink4)',
        minWidth: 24, flexShrink: 0,
      }}>#{rank}</span>

      {/* Image */}
      <div style={{
        width: 56, height: 56, borderRadius: 8, background: 'var(--paper3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, overflow: 'hidden',
      }}>
        {item.imageUrl
          ? <img src={item.imageUrl} alt={item.name}
                 style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 22 }}>📦</span>}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 1 }}>{item.brand}</div>
        <div style={{
          fontSize: 14, fontWeight: 700, color: 'var(--ink)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.name}</div>

        {platforms.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
            {platforms.slice(0, 3).map(plt => (
              <PlatformPill key={plt.name} name={plt.name} />
            ))}
          </div>
        )}
      </div>

      {/* Price + Score */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)', fontFamily: "'DM Mono',monospace" }}>
          {fmt(item.price || item.lowestPrice) || '—'}
        </div>
        {item.aiScore != null && (
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--ink4)',
            fontFamily: "'DM Mono',monospace", marginTop: 2,
          }}>AI {item.aiScore}/10</div>
        )}
      </div>

      <span style={{ color: 'var(--ink4)', fontSize: 16, flexShrink: 0 }}>›</span>
    </div>
  )
}
