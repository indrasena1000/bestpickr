// src/components/FallbackView.jsx
// Rendered when intent === FALLBACK: trending products + category shortcut pills
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getCategories } from '../services/api.js'

const fmt = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—'

export default function FallbackView({ suggestions = [] }) {
  const navigate = useNavigate()
  const [pills, setPills] = useState([])

  useEffect(() => {
    getCategories()
      .then((d) => setPills(
        (d.categories || []).map((c) => ({
          label: c.name,
          emoji: c.emoji,
          query: `best ${c.name.toLowerCase()}`,
        }))
      ))
      .catch(() => setPills([]))
  }, [])

  const handleSearch = (q) => {
    navigate(`/#/results?q=${encodeURIComponent(q)}`)
  }

  return (
    <div>
      {/* Empty state header */}
      <div style={{ textAlign: 'center', padding: '32px 0 28px', color: 'var(--ink4)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔎</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
          No exact match found
        </div>
        <div style={{ fontSize: 14 }}>
          Try one of these popular searches, or browse by category below.
        </div>
      </div>

      {/* Quick search suggestions */}
      <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'center', gap:8, marginBottom:28 }}>
        {[
          'Best headphones under ₹2000',
          'Best laptop under ₹50000',
          'Best AC under ₹40000',
          'Best smartwatch under ₹5000',
          'Best running shoes',
          'Best air fryer',
        ].map(s => (
          <button
            key={s}
            onClick={() => handleSearch(s)}
            style={{
              padding:'7px 14px', fontSize:13, fontWeight:600,
              background:'var(--accent-bg)', border:'1px solid var(--accent)',
              borderRadius:20, color:'var(--accent)', cursor:'pointer',
              transition:'background .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='var(--accent)'; e.currentTarget.style.color='#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background='var(--accent-bg)'; e.currentTarget.style.color='var(--accent)' }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Trending grid */}
      {suggestions.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '.5px',
            textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 12,
          }}>Trending Now</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12,
          }}>
            {suggestions.slice(0, 9).map((item, i) => (
              <TrendingCard key={item.id || i} item={item} rank={i + 1} onSelect={
                () => navigate(`/#/detail/${item.id}`)
              } />
            ))}
          </div>
        </div>
      )}

      {/* Category pills */}
      <div>
        <div style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '.5px',
          textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 12,
        }}>Browse Categories</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {pills.map((cat) => (
            <button
              key={cat.label}
              onClick={() => handleSearch(cat.query)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px',
                background: 'var(--paper3)',
                border: '1px solid var(--line)',
                borderRadius: 20,
                fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                cursor: 'pointer',
                transition: 'background .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--paper3)'}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function TrendingCard({ item, rank, onSelect }) {
  return (
    <div className="rcard"
      style={{ padding: 14, cursor: 'pointer', position: 'relative' }}
      onClick={onSelect}
    >
      {/* Rank badge */}
      <span style={{
        position: 'absolute', top: 10, left: 10,
        background: rank <= 3 ? 'var(--accent)' : 'var(--paper3)',
        color: rank <= 3 ? '#fff' : 'var(--ink4)',
        fontSize: 10, fontWeight: 800,
        padding: '2px 6px', borderRadius: 4,
        fontFamily: "'DM Mono',monospace",
      }}>#{rank}</span>

      {/* Image */}
      <div style={{
        width: 64, height: 64, margin: '22px auto 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--paper3)', borderRadius: 8, overflow: 'hidden',
      }}>
        {item.imageUrl
          ? <img src={item.imageUrl} alt={item.name}
                 style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 28 }}>📦</span>}
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--ink4)' }}>{item.brand}</div>
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--ink)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          margin: '2px 0 4px',
        }}>{item.name}</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', fontFamily: "'DM Mono',monospace" }}>
          {fmt(item.price || item.lowestPrice)}
        </div>
      </div>
    </div>
  )
}
