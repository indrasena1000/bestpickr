// UI/src/components/notfound/NotFoundSearch.jsx
// ─────────────────────────────────────────────────────────────────
// Section 5 — Search recovery bar with category shortcut pills.
// Auto-focuses after 400ms to let entrance animation settle first.
// ─────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react'
import { getCategories } from '../../services/api.js'

const boxStyle = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r3)',
  padding: '24px',
}

export default function NotFoundSearch({ onSearch }) {
  const [q,          setQ]        = useState('')
  const [focused,    setFocused]  = useState(false)
  const [hoveredCat, setHover]    = useState(null)
  const [btnHover,   setBtnHover] = useState(false)
  const [categories, setCats]     = useState([])
  const inputRef = useRef(null)

  // Auto-focus after 400ms — let entrance animation settle
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 400)
    return () => clearTimeout(t)
  }, [])

  // Load categories from API
  useEffect(() => {
    getCategories()
      .then((d) => setCats(d.categories || []))
      .catch(() => setCats([]))
  }, [])

  function handleSearch() {
    const val = q.trim()
    if (val) onSearch(val)
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleSearch()
  }

  const inputStyle = {
    flex: 1,
    border: `1.5px solid ${focused ? 'var(--accent)' : 'var(--line)'}`,
    borderRadius: 'var(--r2)',
    padding: '12px 14px',
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
    background: 'var(--paper)',
    color: 'var(--ink)',
    transition: 'border-color 0.15s',
    minWidth: 0,
  }

  const btnStyle = {
    background: 'var(--accent)', color: 'white',
    border: 'none', borderRadius: 'var(--r2)',
    padding: '12px 20px', fontWeight: 700, fontSize: 14,
    cursor: 'pointer', fontFamily: 'inherit',
    opacity: btnHover ? 0.88 : 1, transition: 'opacity 0.15s',
    flexShrink: 0,
  }

  function pillStyle(name) {
    const active = hoveredCat === name
    return {
      background: active ? 'var(--accent-bg)' : 'var(--paper3)',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
      borderRadius: 100,
      padding: '6px 14px',
      fontSize: 13, fontWeight: 600,
      color: active ? 'var(--accent)' : 'var(--ink2)',
      cursor: 'pointer',
      transition: 'background 0.12s, border-color 0.12s, color 0.12s',
      userSelect: 'none',
    }
  }

  return (
    <div style={boxStyle}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>
        Or search for something that actually exists 👇
      </div>

      {/* Search input + button */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder='Try "Sony headphones" or "Gaming laptops"...'
          style={inputStyle}
        />
        <button
          onClick={handleSearch}
          onMouseEnter={() => setBtnHover(true)}
          onMouseLeave={() => setBtnHover(false)}
          style={btnStyle}
        >
          Search
        </button>
      </div>

      {/* Category shortcut pills — loaded from API */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {categories.map(({ name, emoji }) => (
          <div
            key={name}
            style={pillStyle(name)}
            onMouseEnter={() => setHover(name)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSearch(name)}
          >
            {emoji} {name}
          </div>
        ))}
      </div>
    </div>
  )
}
