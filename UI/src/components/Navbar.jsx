// src/components/Navbar.jsx
import { useState, useRef, useEffect } from 'react'
import { useSuggestions } from '../hooks/useSearch'

export default function Navbar({ currentPage, currentQuery, onSearch, onHome }) {
  const [q, setQ]           = useState(currentQuery || '')
  const [menuOpen, setMenu] = useState(false)
  const { suggestions, fetch: fetchSugg, clear } = useSuggestions()
  const inputRef = useRef(null)

  // Sync query when navigating back to results
  useEffect(() => { setQ(currentQuery || '') }, [currentQuery])

  function handleSubmit(e) {
    e?.preventDefault()
    if (q.trim()) { onSearch(q.trim()); clear(); setMenu(false) }
  }

  function handleChange(val) {
    setQ(val)
    fetchSugg(val)
  }

  function pickSuggestion(s) {
    setQ(s); clear(); onSearch(s)
  }

  return (
    <>
      <nav className="navbar">
        <div className="wrap" style={{ display:'flex', alignItems:'center', gap:14 }}>

          {/* Logo */}
          <div className="logo" onClick={onHome} role="button" tabIndex={0}>
            <b>best</b><span>pickr</span>
          </div>

          {/* Search bar — shown on all pages */}
          <div style={{ flex:1, maxWidth:480, position:'relative' }}>
            <form onSubmit={handleSubmit} className="nav-search">
              <SearchIcon />
              <input
                ref={inputRef}
                value={q}
                onChange={e => handleChange(e.target.value)}
                onBlur={() => setTimeout(clear, 150)}
                placeholder="Search any product…"
                aria-label="Search products"
              />
              <button type="submit" className="nav-search-btn">Search</button>
            </form>

            {/* Autocomplete dropdown */}
            {suggestions.length > 0 && (
              <div style={{
                position:'absolute', top:'calc(100% + 4px)', left:0, right:0,
                background:'var(--paper)', border:'1px solid var(--line)',
                borderRadius:'var(--r2)', boxShadow:'0 8px 24px rgba(0,0,0,.08)',
                zIndex:200, overflow:'hidden',
              }}>
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    onMouseDown={() => pickSuggestion(s)}
                    style={{
                      padding:'10px 14px', fontSize:13, fontWeight:500,
                      cursor:'pointer', color:'var(--ink2)',
                      borderBottom: i < suggestions.length-1 ? '1px solid var(--line)' : 'none',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background='var(--paper2)'}
                    onMouseLeave={e => e.currentTarget.style.background=''}
                  >
                    🔍 {s}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desktop nav links */}
          <div className="nav-links">
            <div className={`nav-lnk ${currentPage==='home'    ? 'active':''}`} onClick={onHome}>Home</div>
            <div className={`nav-lnk ${currentPage==='results' ? 'active':''}`} onClick={() => onSearch(q||'trending')}>Top Lists</div>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenu(m => !m)}
            style={{ display:'none', flexDirection:'column', gap:5, padding:6, cursor:'pointer' }}
            className="hbg-btn"
            aria-label="Menu"
          >
            <span style={{ display:'block', width:20, height:2, background:'var(--ink)', borderRadius:2 }}/>
            <span style={{ display:'block', width:20, height:2, background:'var(--ink)', borderRadius:2 }}/>
            <span style={{ display:'block', width:20, height:2, background:'var(--ink)', borderRadius:2 }}/>
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <div style={{
          position:'fixed', top:'var(--nav-h)', left:0, right:0,
          background:'var(--paper)', borderBottom:'1px solid var(--line)',
          padding:'16px 20px', zIndex:99, boxShadow:'0 8px 24px rgba(0,0,0,.08)',
        }}>
          <form onSubmit={e => { handleSubmit(e); setMenu(false) }}
            style={{ display:'flex', alignItems:'center', gap:8, border:'1.5px solid var(--line)', borderRadius:'var(--r2)', padding:'9px 12px', marginBottom:12 }}
          >
            <SearchIcon /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ flex:1, border:'none', outline:'none', fontSize:14 }}/>
          </form>
          {['Home','Top Lists','Saved'].map(item => (
            <div key={item} onClick={() => setMenu(false)}
              style={{ padding:'11px 8px', fontSize:14, fontWeight:500, color:'var(--ink2)', cursor:'pointer', borderRadius:'var(--r)' }}
            >{item}</div>
          ))}
        </div>
      )}

      <style>{`
        @media(max-width:640px){
          .hbg-btn { display:flex !important }
          .nav-links { display:none !important }
          .nav-search-btn { display:none }
        }
      `}</style>
    </>
  )
}

function SearchIcon() {
  return (
    <svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color:'var(--ink4)', flexShrink:0 }}>
      <circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/>
    </svg>
  )
}
