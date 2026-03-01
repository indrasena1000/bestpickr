// src/components/DidYouMeanBanner.jsx
// Shown when intent === LOW_CONFIDENCE (0.5 < confidence < 0.7)
import { useState } from 'react'

export default function DidYouMeanBanner({ product, confidence, onConfirm, onDismiss }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || !product) return null

  const pct = Math.round((confidence ?? 0) * 100)

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  return (
    <div style={{
      background: 'var(--accent-bg)',
      border: '1px solid var(--line)',
      borderLeft: '3px solid var(--accent)',
      borderRadius: 10,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 18,
    }}>
      {/* Icon */}
      <span style={{ fontSize: 18, flexShrink: 0 }}>🔍</span>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, color: 'var(--ink)' }}>
          Did you mean{' '}
          <strong
            style={{ color: 'var(--accent)', cursor: 'pointer' }}
            onClick={() => onConfirm?.(product)}
          >
            {product.name || product.query}
          </strong>
          ?
        </span>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
        }}>
          <div style={{
            flex: 1, maxWidth: 120, height: 4, borderRadius: 4,
            background: 'var(--line)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${pct}%`, height: '100%', borderRadius: 4,
              background: pct >= 65 ? 'var(--accent)' : '#F59E0B',
            }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--ink4)', fontFamily: "'DM Mono',monospace" }}>
            {pct}% match
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => onConfirm?.(product)}
          style={{
            fontSize: 12, fontWeight: 700, padding: '5px 12px',
            background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer',
          }}
        >Yes</button>
        <button
          onClick={handleDismiss}
          style={{
            fontSize: 12, fontWeight: 700, padding: '5px 10px',
            background: 'transparent', color: 'var(--ink4)',
            border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer',
          }}
        >✕</button>
      </div>
    </div>
  )
}
