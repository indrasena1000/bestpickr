// src/components/Navbar.jsx
// BUG #2 FIX: Removed autoFocus from nav search — was causing keyboard popup on back navigation
// BUG #7 FIX: Nav search bar hidden on home page (hero search is used there instead)
// BUG #8 FIX: navbar uses width:100vw + box-sizing so zoom doesn't shrink it
// BUG #6 FIX: SVG logo mark added next to wordmark
// BUG #15 FIX: Top Lists mobile nav now correctly fires search

import { useState, useRef, useEffect } from 'react'
import { useSuggestions } from '../hooks/useSearch.js'
import SearchDropdown from './SearchDropdown.jsx'

export default function Navbar({ currentPage, currentQuery, onSearch, onHome }) {
  const [q, setQ]           = useState(currentQuery || '')
  const [menuOpen, setMenu] = useState(false)
  const sugg    = useSuggestions()
  const inputRef = useRef(null)
  const isHome = currentPage === 'home' || currentPage === '/' || currentPage === ''

  // Sync query when navigating back to results — but don't focus
  useEffect(() => { setQ(currentQuery || '') }, [currentQuery])

  function handleSubmit(e) {
    e?.preventDefault()
    if (q.trim()) { sugg.saveRecent(q.trim()); sugg.clear(); onSearch(q.trim()); setMenu(false) }
  }

  function handleChange(val) {
    setQ(val)
    sugg.fetch(val)
  }

  function pickSuggestion(s) {
    setQ(s); sugg.saveRecent(s); sugg.clear(); onSearch(s)
  }

  return (
    <>
      {/* BUG #8 FIX: full-width navbar that stays 100% even when zoomed */}
      <nav className="navbar" style={{ width: '100%', boxSizing: 'border-box', minWidth: 0 }}>
        <div className="wrap" style={{ display:'flex', alignItems:'center', gap:14, width:'100%', boxSizing:'border-box' }}>

          {/* BUG #6 FIX: Logo with SVG icon mark */}
          <div
            className="logo"
            onClick={onHome}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onHome()}
            style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0, cursor:'pointer' }}
          >
            {/* SVG checkmark icon */}
            <div style={{
              width: 28, height: 28, background: 'var(--accent)',
              borderRadius: 8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
            }}>
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                <path d="M4 8.5L7 11.5L13 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {/* Wordmark */}
            <span style={{ fontWeight:800, fontSize:18, letterSpacing:'-0.5px', lineHeight:1 }}>
              <b style={{ color:'var(--accent)' }}>best</b>
              <span style={{ color:'var(--ink)' }}>pickr</span>
              <sup style={{ fontSize:9, fontWeight:700, color:'var(--ink3)', verticalAlign:'super', letterSpacing:0, lineHeight:1 }}>™</sup>
              <span style={{ color:'var(--accent2)' }}>.</span>
            </span>
          </div>

          {/* BUG #7 FIX: Search bar hidden on home page, hidden on mobile (drawer handles it) */}
          {!isHome && (
            <div className="nav-search-wrap" style={{ flex:1, maxWidth:480, position:'relative' }}>
              <form onSubmit={handleSubmit} className="nav-search">
                <SearchIcon />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={e => handleChange(e.target.value)}
                  onFocus={() => sugg.onFocus(q)}
                  onBlur={sugg.onBlur}
                  onKeyDown={e => sugg.handleKeyDown(e, pickSuggestion)}
                  placeholder="Search any product…"
                  aria-label="Search products"
                  // BUG #2 FIX: No autoFocus — prevents keyboard on back navigation
                />
                <button type="submit" className="nav-search-btn">Search</button>
              </form>

              {sugg.showDropdown && (
                <SearchDropdown items={sugg.items} selIndex={sugg.selIndex} onPick={pickSuggestion} />
              )}
            </div>
          )}

          {/* Spacer when on home page or mobile (search is hidden) */}
          {(isHome) && <div style={{ flex:1 }} />}

          {/* Desktop nav links */}
          <div className="nav-links">
            <div
              className={`nav-lnk ${currentPage==='home' || isHome ? 'active':''}`}
              onClick={onHome}
            >Home</div>
            {/* BUG #15 FIX: Top Lists uses meaningful query */}
            <div
              className={`nav-lnk ${currentPage==='results' ? 'active':''}`}
              onClick={() => onSearch(q || 'best products india')}
            >Top Lists</div>
            {/* Blog — highlighted pill */}
            <div
              onClick={() => { window.location.hash = '#/blog' }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: currentPage === 'blog' ? 'var(--accent)' : 'var(--accent-bg)',
                color: currentPage === 'blog' ? 'white' : 'var(--accent)',
                borderRadius: 100, padding: '5px 14px',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: '1px solid rgba(93,186,133,0.3)',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              ✍️ Blog
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenu(m => !m)}
            style={{ display:'none', flexDirection:'column', gap:5, padding:'6px 8px', cursor:'pointer', marginLeft:'auto' }}
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
          position:'fixed', top:'var(--nav-h)', left:0, right:0, width:'100%',
          background:'var(--paper)', borderBottom:'1px solid var(--line)',
          padding:'16px 20px', zIndex:99, boxShadow:'0 8px 24px rgba(0,0,0,.08)',
          boxSizing:'border-box',
        }}>
          <form
            onSubmit={e => { handleSubmit(e); setMenu(false) }}
            style={{ display:'flex', alignItems:'center', gap:8, border:'1.5px solid var(--line)', borderRadius:'var(--r2)', padding:'9px 12px', marginBottom:12 }}
          >
            <SearchIcon />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search any product…"
              style={{ flex:1, border:'none', outline:'none', fontSize:16, background:'transparent' }}
            />
            <button type="submit" style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--r)', padding:'6px 14px', fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
              Search
            </button>
          </form>
          <div
            onClick={() => { onHome(); setMenu(false) }}
            style={{ padding:'11px 8px', fontSize:14, fontWeight:600, color: currentPage==='home' ? 'var(--accent)' : 'var(--ink2)', cursor:'pointer', borderRadius:'var(--r)' }}
          >🏠 Home</div>
          {/* BUG #15 FIX: Mobile Top Lists works correctly */}
          <div
            onClick={() => { onSearch('best products india'); setMenu(false) }}
            style={{ padding:'11px 8px', fontSize:14, fontWeight:500, color:'var(--ink2)', cursor:'pointer', borderRadius:'var(--r)' }}
          >📊 Top Lists</div>
          <div
            onClick={() => { window.location.hash = '#/blog'; setMenu(false) }}
            style={{ padding:'11px 8px', fontSize:14, fontWeight:700, color: currentPage==='blog' ? 'var(--accent)' : 'var(--ink2)', cursor:'pointer', borderRadius:'var(--r)', display:'flex', alignItems:'center', gap:6 }}
          >✍️ Blog</div>
        </div>
      )}

      <style>{`
        @media(max-width:640px){
          .hbg-btn { display:flex !important }
          .nav-links { display:none !important }
          .nav-search-btn { display:none }
          .nav-search-wrap { display:none }
        }
        /* BUG #8 FIX: Ensure navbar covers full width regardless of zoom level */
        .navbar {
          width: 100% !important;
          max-width: 100vw !important;
          left: 0 !important;
          right: 0 !important;
          box-sizing: border-box !important;
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
