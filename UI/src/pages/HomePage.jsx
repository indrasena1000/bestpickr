// src/pages/HomePage.jsx
// BUG #3  FIX: Find Best button disabled when search bar is empty
// BUG #11 FIX: Session-based saved products (no login required)
// BUG #16 FIX: Price visible in top 10 table
// BUG #17 FIX: Category visible in home page
// BUG #18 FIX: Hover tooltip explaining why product is top pick
// BUG #19 FIX: Scroll to top button
// BUG #9  FIX: Amazon buy button opens in _blank properly (was blank page)
// Affiliate URLs: Cleaned to dp/ASIN?tag= format

import { useState, useEffect, useRef } from "react";
import { getCategories, searchProducts, getTopIndiaProducts } from "../services/api.js";
import { useSuggestions } from "../hooks/useSearch.js";
import SearchDropdown from "../components/SearchDropdown.jsx";
// HomeTableSkeleton no longer used (replaced by inline shimmer card rail)
import BlogCarousel from "../components/BlogCarousel.jsx";


// RANK_CLASS removed — replaced by card rail with medal badges
const SUGGESTS = [
  "noise cancelling headphones",
  "air fryer",
  "running shoes",
  "gaming mouse",
  "robot vacuum cleaner",
  "smartphone under 20000",
  "laptop for students",
];
import { PlatformPill } from '../components/PlatformLogo.jsx'


// ── HOVER TOOLTIP (BUG #18) ────────────────────────────────────────
function AITooltip({ reason, children }) {
  const [show, setShow] = useState(false)
  return (
    <div
      style={{ position:'relative', display:'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && reason && (
        <div style={{
          position:'absolute', bottom:'calc(100% + 8px)', left:'50%', transform:'translateX(-50%)',
          background:'#1A1A1A', color:'white', fontSize:11, fontWeight:500,
          padding:'8px 12px', borderRadius:8, whiteSpace:'normal', width:220,
          boxShadow:'0 4px 16px rgba(0,0,0,.25)', zIndex:300, lineHeight:1.5,
          pointerEvents:'none',
        }}>
          <div style={{ color:'#7ECFA0', fontWeight:700, marginBottom:3, fontSize:10, letterSpacing:'.5px' }}>
            🤖 WHY BESTPICKR CHOSE THIS
          </div>
          {reason}
          {/* Arrow */}
          <div style={{
            position:'absolute', top:'100%', left:'50%', transform:'translateX(-50%)',
            width:0, height:0,
            borderLeft:'6px solid transparent', borderRight:'6px solid transparent',
            borderTop:'6px solid #1A1A1A',
          }}/>
        </div>
      )}
    </div>
  )
}


export default function HomePage({ onSearch, onViewProduct, onNav }) {
  const [q, setQ] = useState("");
  const sugg = useSuggestions();
  const [categories, setCats] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [activeCat, setActive] = useState(null);
  const [products, setProds] = useState([]);
  const [loadingProds, setLoad] = useState(false);
  const [topIndia, setTopIndia] = useState([]);
  const [loadingTopIndia, setLoadingTopIndia] = useState(false);
  const [topIndiaVisible, setTopIndiaVisible] = useState(false);
  // BUG #19 FIX: scroll to top visibility
  const [showScroll, setShowScroll] = useState(false);
  const inputRef = useRef(null);
  const topIndiaSentinelRef = useRef(null);


  useEffect(() => {
    setLoadingCats(true);
    getCategories()
      .then((d) => {
        const cats = d.categories || [];
        setCats(cats);
        if (cats.length > 0) setActive(cats[0].slug);
      })
      .catch(() => {})
      .finally(() => setLoadingCats(false));
  }, []);

  // Lazy-load top-india when the section scrolls into view.
  // Uses sessionStorage so navigating away and back never re-fetches.
  useEffect(() => {
    const sentinel = topIndiaSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setTopIndiaVisible(true);

        setLoadingTopIndia(true);
        getTopIndiaProducts()
          .then((d) => setTopIndia(d.products || []))
          .catch(() => setTopIndia([]))
          .finally(() => setLoadingTopIndia(false));
      },
      { rootMargin: '200px' }  // start loading 200px before it enters viewport
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activeCat) return;   // wait until real category is set from API
    setLoad(true);
    setProds([]);
    searchProducts(activeCat, activeCat)
      .then((d) => setProds(d.results || []))
      .catch(() => setProds([]))
      .finally(() => setLoad(false));
  }, [activeCat]);

  // BUG #19 FIX: scroll listener
  useEffect(() => {
    function onScroll() { setShowScroll(window.scrollY > 400) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function pickSuggestion(s) {
    setQ(s); sugg.saveRecent(s); sugg.clear(); onSearch(s, "");
  }

  function handleSearch(e) {
    e?.preventDefault();
    if (q.trim()) { sugg.saveRecent(q.trim()); sugg.clear(); onSearch(q.trim(), ""); }
  }

  const cat = categories.find((c) => c.slug === activeCat);

  return (
    <>
      {/* ── HERO ─────────────────────────────── */}
      <div className="hero">
        <div className="wrap">
          <div style={{ maxWidth: 620 }}>
            <div className="hero-tag">★ AI-powered product rankings</div>
            <h1>
              Stop guessing.
              <br />
              Find the <em>best-rated</em> product.
            </h1>
            <p className="hero-sub">
              bestpickr analyzes ratings, reviews &amp; prices on Amazon — then
              ranks them so you always pick the right one.
              <span style={{ fontSize:12, opacity:0.7 }}> Flipkart &amp; Myntra coming soon.</span>
            </p>
            <div style={{ position: 'relative' }}>
              <form onSubmit={handleSearch}>
                <div className="big-search">
                  <input
                    ref={inputRef}
                    value={q}
                    onChange={(e) => { setQ(e.target.value); sugg.fetch(e.target.value) }}
                    onFocus={() => sugg.onFocus(q)}
                    onBlur={sugg.onBlur}
                    onKeyDown={e => sugg.handleKeyDown(e, pickSuggestion)}
                    placeholder='Try "Sony headphones" or "running shoes under ₹3000"…'
                    autoFocus
                  />
                  {/* BUG #3 FIX: Button disabled when search bar empty */}
                  <button
                    type="submit"
                    className="big-search-go"
                    disabled={!q.trim()}
                    style={{ opacity: q.trim() ? 1 : 0.45, cursor: q.trim() ? 'pointer' : 'not-allowed' }}
                  >
                    Find Best →
                  </button>
                </div>
              </form>
              {sugg.showDropdown && (
                <SearchDropdown items={sugg.items} selIndex={sugg.selIndex} onPick={pickSuggestion} />
              )}
            </div>
            <div className="hero-suggests">
              <span>Popular:</span>
              {SUGGESTS.map((s) => (
                <div key={s} className="suggest-chip" onClick={() => onSearch(s, "")}>
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── TRUST BAR ────────────────────────── */}
      <div style={{
        background:'var(--paper2)', borderTop:'1px solid var(--line)', borderBottom:'1px solid var(--line)',
        padding:'14px 0',
      }}>
        <div className="wrap">
          <div style={{
            display:'flex', flexWrap:'wrap', justifyContent:'center', gap:'20px 36px',
            fontSize:13, color:'var(--ink3)', fontWeight:600,
          }}>
            {[
              ['🚫', 'No paid rankings'],
              ['🤖', 'AI review analysis'],
              ['🔗', 'Transparent affiliate links'],
              ['💯', '100% free to use'],
            ].map(([icon, text]) => (
              <span key={text} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:15 }}>{icon}</span>{text}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ─────────────────────── */}
      <div className="how-strip">
        <div className="wrap">
          <div className="how-items">
            {[
              ["1", "You search", "any product"],
              ["2", "AI scans", "Amazon"],
              ["3", "Analyzes", "100K+ reviews"],
              ["4", "Shows you", "the Top 10"],
              ["5", "Buy from", "best price store"],
            ].map(([n, b, s]) => (
              <div key={n} className="how-item">
                <div className="how-num">{n}</div>
                <div className="how-text"><b>{b}</b><br />{s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="wrap">
        {/* ── CATEGORIES (BUG #17 FIX: categories visible) ───── */}
        <div className="section">
          <div className="section-head">
            <div className="section-title">Browse by category</div>
          </div>
          {/* ── Category icon circles (Zomato-style) ───────────── */}
          <div style={{
            display:'flex', gap:20, overflowX:'auto', scrollbarWidth:'none',
            msOverflowStyle:'none', paddingBottom:8, paddingTop:4,
          }}>
            {loadingCats
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, minWidth:72, flexShrink:0 }}>
                    <div style={{ width:64, height:64, borderRadius:'50%', background:'var(--paper3)', animation:'bp-shimmer 1.4s infinite', backgroundSize:'200% 100%',
                      backgroundImage:'linear-gradient(90deg,var(--paper3) 25%,var(--line) 50%,var(--paper3) 75%)' }} />
                    <div style={{ width:44, height:10, borderRadius:4, backgroundImage:'linear-gradient(90deg,var(--paper3) 25%,var(--line) 50%,var(--paper3) 75%)', backgroundSize:'200% 100%', animation:'bp-shimmer 1.4s infinite' }} />
                  </div>
                ))
              : categories.map((c) => {
              const isActive = c.slug === activeCat;
              return (
                <div
                  key={c.slug}
                  onClick={() => setActive(c.slug)}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, cursor:'pointer', minWidth:72, flexShrink:0 }}
                >
                  <div style={{
                    width:64, height:64, borderRadius:'50%',
                    background: isActive ? 'var(--accent)' : 'var(--paper)',
                    border: isActive ? '2.5px solid var(--accent)' : '2px solid var(--line)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:28, transition:'all .15s',
                    boxShadow: isActive ? '0 4px 14px rgba(26,107,60,.28)' : 'none',
                  }}>
                    {c.emoji}
                  </div>
                  <span style={{
                    fontSize:11, fontWeight:700, lineHeight:1.2, textAlign:'center',
                    color: isActive ? 'var(--accent)' : 'var(--ink3)', transition:'color .15s',
                  }}>
                    {c.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── TOP PICKS TABLE ───────────────────── */}
        <div className="section" style={{ paddingTop: 0 }}>
          <div className="section-head">
            {/* BUG #17 FIX: Show active category name clearly */}
            <div className="section-title">
              {cat?.emoji || "📦"} Top 10 {cat?.name || activeCat} — by bestpickr AI
            </div>
            <div className="see-all" onClick={() => onSearch(activeCat, activeCat)}>
              See full analysis →
            </div>
          </div>

          {loadingProds ? (
            /* Loading shimmer rail */
            <div style={{ display:'flex', gap:14, overflowX:'auto', scrollbarWidth:'none', paddingBottom:8 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{
                  minWidth:200, height:300, borderRadius:'var(--r3)', flexShrink:0,
                  background:'linear-gradient(90deg,var(--paper3) 25%,var(--line) 50%,var(--paper3) 75%)',
                  backgroundSize:'200% 100%', animation:'bp-shimmer 1.4s infinite',
                }} />
              ))}
              <style>{`@keyframes bp-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
            </div>
          ) : products.length > 0 ? (
            /* ── Horizontal card rail ───────────────────────────── */
            <div style={{
              display:'flex', gap:14, overflowX:'auto', scrollbarWidth:'none',
              msOverflowStyle:'none', paddingBottom:8, scrollSnapType:'x mandatory',
            }}>
              {products.map((p, i) => {
                const rank = p.rank || i + 1;
                const MEDAL = { 1:'🥇', 2:'🥈', 3:'🥉' };
                const RANK_STYLE = {
                  1: { border:'#F5C518', badge:'#FFF8DC', badgeText:'#7A5200' },
                  2: { border:'#B0B3B8', badge:'#F4F4F4', badgeText:'#444' },
                  3: { border:'#CD7F32', badge:'#FDF0E0', badgeText:'#6B3A00' },
                };
                const rs = RANK_STYLE[rank] || { border:'var(--line)', badge:'var(--paper2)', badgeText:'var(--ink3)' };
                return (
                  <div
                    key={i}
                    onClick={() => onViewProduct(p, products)}
                    style={{
                      minWidth:200, maxWidth:200, background:'var(--paper)',
                      borderRadius:'var(--r3)', border:`2px solid ${rs.border}`,
                      padding:16, cursor:'pointer', display:'flex', flexDirection:'column', gap:10,
                      scrollSnapAlign:'start', flexShrink:0, position:'relative',
                      transition:'transform .15s, box-shadow .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow='0 10px 28px rgba(0,0,0,.10)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none'; }}
                  >
                    {/* Rank badge */}
                    <div style={{
                      position:'absolute', top:10, left:10, fontSize:11, fontWeight:800,
                      background: rs.badge, color: rs.badgeText,
                      borderRadius:'var(--r)', padding:'2px 8px', lineHeight:1.6,
                    }}>
                      {MEDAL[rank] || `#${rank}`}
                    </div>
                    {/* Best Overall badge for #1 */}
                    {i === 0 && (
                      <div style={{
                        position:'absolute', top:10, right:10, fontSize:10, fontWeight:700,
                        background:'var(--accent)', color:'white',
                        borderRadius:'var(--r)', padding:'2px 7px',
                      }}>Best</div>
                    )}
                    {/* Product image */}
                    <div style={{
                      width:'100%', height:120, display:'flex', alignItems:'center', justifyContent:'center',
                      background:'#fff', borderRadius:'var(--r2)', marginTop:16,
                    }}>
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name}
                          style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain', padding:8 }} />
                      ) : (
                        <span style={{ fontSize:44 }}>{cat?.emoji || '📦'}</span>
                      )}
                    </div>
                    {/* Brand + Name */}
                    <div>
                      {p.brand && <div style={{ fontSize:10, color:'var(--ink4)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.4px', marginBottom:3 }}>{p.brand}</div>}
                      <div style={{
                        fontSize:13, fontWeight:700, color:'var(--ink)', lineHeight:1.35,
                        display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden',
                      }}>{p.name}</div>
                    </div>
                    {/* AI Score bar */}
                    <div>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{
                          fontSize:11, fontWeight:800, color:'var(--accent)', background:'var(--accent-bg)',
                          padding:'2px 8px', borderRadius:5, fontFamily:"'DM Mono',monospace",
                        }}>AI {p.aiScore}/10</span>
                        {p.positivePct > 0 && (
                          <span style={{ fontSize:10, color:'var(--ink3)', fontWeight:600 }}>👍 {p.positivePct}%</span>
                        )}
                      </div>
                      <div style={{ height:4, background:'var(--paper3)', borderRadius:4, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${(p.aiScore / 10) * 100}%`, background:'var(--accent)', borderRadius:4, transition:'width .6s ease' }} />
                      </div>
                    </div>
                    {/* Price + CTA */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'auto' }}>
                      <div style={{ fontSize:15, fontWeight:800, color:'var(--ink)', fontFamily:"'DM Mono',monospace" }}>
                        {p.lowestPrice ? `₹${Number(p.lowestPrice).toLocaleString('en-IN')}` : '—'}
                      </div>
                      <AITooltip reason={`Ranked #${rank} with AI score ${p.aiScore}/10. ${p.positivePct || ''}${p.positivePct ? '% positive reviews.' : ''}`}>
                        <button style={{
                          fontSize:11, fontWeight:700, color:'var(--accent)', background:'var(--accent-bg)',
                          border:'1.5px solid var(--accent)', borderRadius:'var(--r)', padding:'5px 12px', cursor:'pointer',
                        }}>View →</button>
                      </AITooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              background:'var(--paper)', border:'1px solid var(--line)', borderRadius:'var(--r3)',
              padding:'40px 20px', textAlign:'center', color:'var(--ink3)', fontSize:14,
            }}>
              No products found. Try a different category or search above.
            </div>
          )}
        </div>

        {/* ── SCORE EXPLAINER ─────────────────── */}
        <div className="section" style={{ paddingTop:0 }}>
          <div style={{
            background:'var(--paper)', border:'1px solid var(--line)',
            borderRadius:'var(--r3)', padding:24,
          }}>
            <div className="section-head" style={{ marginBottom:12 }}>
              <div className="section-title">How the AI score works</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16 }}>
              {[
                ["40%", "Platform Ratings", "Weighted avg star rating across all platforms"],
                ["30%", "Review Sentiment", "NLP analysis of positive vs negative language"],
                ["15%", "Value for Money", "Score relative to price vs category average"],
                ["15%", "Review Volume", "More reviews = higher confidence in the score"],
              ].map(([pct, title, desc]) => (
                <div key={title} style={{ padding:14, background:'var(--paper2)', borderRadius:'var(--r2)', border:'1px solid var(--line)' }}>
                  <div style={{ fontSize:22, fontWeight:700, fontFamily:"'DM Mono',monospace", color:'var(--accent)', marginBottom:4 }}>
                    {pct}
                  </div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)', marginBottom:3 }}>{title}</div>
                  <div style={{ fontSize:12, color:'var(--ink3)', lineHeight:1.5 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sentinel — IntersectionObserver watches this to trigger lazy load */}
      <div ref={topIndiaSentinelRef} style={{ height: 1 }} />

      {/* ── TOP PRODUCTS IN INDIA ─────────────── */}
      {(topIndiaVisible || loadingTopIndia || topIndia.length > 0) && (
        <div style={{ background:'var(--paper2)', borderTop:'1px solid var(--line)', padding:'40px 0' }}>
          <div className="wrap">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:20, flexWrap:'wrap', gap:12 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', color:'var(--accent)', background:'var(--accent-bg)', borderRadius:'var(--r)', padding:'3px 10px', display:'inline-block', marginBottom:10 }}>
                  🏆 bestpickr picks
                </div>
                <h2 style={{ fontSize:'clamp(18px,3vw,26px)', fontWeight:700, letterSpacing:'-.4px', color:'var(--ink)', margin:'0 0 4px', lineHeight:1.2 }}>
                  Top Products in India
                </h2>
                <p style={{ fontSize:13, color:'var(--ink3)', margin:0 }}>Best-rated pick from every category — sourced from our AI rankings</p>
              </div>
            </div>
            {loadingTopIndia ? (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={{ background:'var(--paper)', borderRadius:'var(--r3)', border:'1px solid var(--line)', padding:16, height:220,
                    background:'linear-gradient(90deg,var(--paper3) 25%,var(--line) 50%,var(--paper3) 75%)',
                    backgroundSize:'200% 100%', animation:'bp-shimmer 1.4s infinite' }} />
                ))}
                <style>{`@keyframes bp-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14 }}>
                {topIndia.map((p, ri) => (
                  <div key={p.id || p.name} onClick={() => onViewProduct(p, topIndia)}
                    style={{ background:'var(--paper)', borderRadius:'var(--r3)', border:'1px solid var(--line)',
                      padding:16, cursor:'pointer', transition:'box-shadow .15s,border-color .15s',
                      display:'flex', flexDirection:'column', gap:10, position:'relative' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.08)'; e.currentTarget.style.borderColor='var(--accent)' }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor='var(--line)' }}
                  >
                    {/* Rank badge */}
                    <div style={{
                      position:'absolute', top:10, right:10, fontSize:11, fontWeight:800,
                      background: ri === 0 ? '#FFF8DC' : ri === 1 ? '#F4F4F4' : ri === 2 ? '#FDF0E0' : 'var(--paper2)',
                      color: ri === 0 ? '#7A5200' : ri === 1 ? '#444' : ri === 2 ? '#6B3A00' : 'var(--ink3)',
                      borderRadius:'var(--r)', padding:'2px 7px',
                    }}>{ri === 0 ? '🥇' : ri === 1 ? '🥈' : ri === 2 ? '🥉' : `#${ri + 1}`}</div>
                    {/* Category tag */}
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', background:'var(--accent-bg)', borderRadius:'var(--r)', padding:'2px 8px', display:'inline-flex', alignItems:'center', gap:4, alignSelf:'flex-start' }}>
                      <span>{p.emoji}</span> {p.category}
                    </div>
                    {/* Image */}
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name}
                        style={{ width:'100%', height:110, objectFit:'contain', borderRadius:'var(--r2)', background:'#fff' }} />
                    ) : (
                      <div style={{ width:'100%', height:110, display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:40, background:'var(--paper2)', borderRadius:'var(--r2)' }}>{p.emoji}</div>
                    )}
                    {/* Info */}
                    <div>
                      <div style={{ fontSize:11, color:'var(--ink4)', fontWeight:600, marginBottom:2 }}>{p.brand}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)', lineHeight:1.3,
                        display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{p.name}</div>
                    </div>
                    {/* Score + Price */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'auto' }}>
                      {p.aiScore && (
                        <span style={{ fontSize:12, fontWeight:800, color:'var(--accent)', background:'var(--accent-bg)', padding:'2px 8px', borderRadius:5, fontFamily:"'DM Mono',monospace" }}>
                          AI {p.aiScore}/10
                        </span>
                      )}
                      {p.price && (
                        <span style={{ fontSize:14, fontWeight:800, color:'var(--ink)', fontFamily:"'DM Mono',monospace" }}>
                          ₹{Number(p.price).toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── BLOG SECTION ── */}
      <div style={{ background:'var(--paper2)', borderTop:'1px solid var(--line)', padding:'40px 0 48px' }}>
        <div className="wrap">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:20, flexWrap:'wrap', gap:12 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', color:'var(--accent)', background:'var(--accent-bg)', borderRadius:'var(--r)', padding:'3px 10px', display:'inline-block', marginBottom:10 }}>
                From our blog
              </div>
              <h2 style={{ fontSize:'clamp(18px,3vw,26px)', fontWeight:700, letterSpacing:'-.4px', color:'var(--ink)', margin:'0 0 4px', lineHeight:1.2 }}>
                Latest from the bestpickr blog
              </h2>
              <p style={{ fontSize:13, color:'var(--ink3)', margin:0 }}>Expert buying guides updated daily</p>
            </div>
            <button
              onClick={() => onNav('blog')}
              style={{ fontSize:13, fontWeight:600, color:'var(--accent)', textDecoration:'none', whiteSpace:'nowrap', padding:'8px 16px', border:'1px solid var(--accent)', borderRadius:'var(--r2)', background:'transparent', cursor:'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background='var(--accent)'; e.currentTarget.style.color='white' }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--accent)' }}
            >
              View all posts →
            </button>
          </div>
          <BlogCarousel onNavigate={(path) => onNav(path)} />
        </div>
      </div>

      {/* BUG #19 FIX: Scroll to top button */}
      {showScroll && (
        <button
          onClick={() => window.scrollTo({ top:0, behavior:'smooth' })}
          style={{
            position:'fixed', bottom:24, right:24, width:44, height:44,
            background:'var(--accent)', color:'white', border:'none',
            borderRadius:'50%', cursor:'pointer', zIndex:500,
            boxShadow:'0 4px 16px rgba(26,107,60,.4)',
            fontSize:18, display:'flex', alignItems:'center', justifyContent:'center',
            transition:'transform .15s',
          }}
          title="Scroll to top"
          onMouseEnter={e => e.currentTarget.style.transform='scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}
        >↑</button>
      )}
    </>
  );
}

// ── HELPERS ────────────────────────────────────────────────────────
// No static category data — emoji comes from API category objects


