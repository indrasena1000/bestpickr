// src/components/SearchDropdown.jsx
// Shared autocomplete dropdown used by Navbar and HomePage hero search.
// Props:
//   items      — [{ label: string, type: 'recent'|'trending'|'suggestion' }]
//   selIndex   — keyboard-highlighted row index (-1 = none)
//   onPick(label) — called on click or keyboard Enter

const ICON = { recent: '🕐', trending: '🔥', suggestion: '🔍' }

const headerStyle = {
  padding: '6px 14px 2px',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--ink4)',
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
}

export default function SearchDropdown({ items, selIndex, onPick }) {
  if (!items || items.length === 0) return null

  // Bucket by type while preserving original order (for selIndex alignment)
  const recents   = []
  const trending  = []
  const suggs     = []
  items.forEach((it, i) => {
    const entry = { ...it, idx: i }
    if      (it.type === 'recent')     recents.push(entry)
    else if (it.type === 'trending')   trending.push(entry)
    else                               suggs.push(entry)
  })

  function Row({ entry }) {
    const active = entry.idx === selIndex
    return (
      <div
        key={entry.idx}
        onMouseDown={() => onPick(entry.label)}
        style={{
          padding: '9px 14px',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          color: 'var(--ink2)',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          background: active ? 'var(--paper2)' : '',
          transition: 'background 0.08s',
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--paper2)' }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = '' }}
      >
        <span style={{ fontSize: 12, flexShrink: 0 }}>{ICON[entry.type]}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.label}
        </span>
      </div>
    )
  }

  return (
    <div style={{
      position: 'absolute',
      top: 'calc(100% + 4px)',
      left: 0,
      right: 0,
      background: 'var(--paper)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--r2)',
      boxShadow: '0 8px 28px rgba(0,0,0,.10)',
      zIndex: 200,
      overflow: 'hidden',
    }}>
      {recents.length  > 0 && <><div style={headerStyle}>Recent</div>{recents.map(e  => <Row key={e.idx} entry={e} />)}</>}
      {trending.length > 0 && <><div style={headerStyle}>Trending</div>{trending.map(e => <Row key={e.idx} entry={e} />)}</>}
      {suggs.length    > 0 && suggs.map(e => <Row key={e.idx} entry={e} />)}
    </div>
  )
}
