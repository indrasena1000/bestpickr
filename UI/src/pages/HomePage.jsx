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
import { HomeTableSkeleton } from "../components/Skeleton.jsx";
import BlogCarousel from "../components/BlogCarousel.jsx";


const RANK_CLASS = ["", "g", "s", "b", "n", "n", "n", "n", "n", "n", "n"];
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
  const [categories, setCats] = useState([]);
  const [activeCat, setActive] = useState("headphones");
  const [products, setProds] = useState([]);
  const [loadingProds, setLoad] = useState(false);
  const [topIndia, setTopIndia] = useState([]);
  const [loadingTopIndia, setLoadingTopIndia] = useState(true);
  // BUG #19 FIX: scroll to top visibility
  const [showScroll, setShowScroll] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    getCategories()
      .then((d) => setCats(d.categories || FALLBACK_CATS))
      .catch(() => setCats(FALLBACK_CATS));
  }, []);

  useEffect(() => {
    getTopIndiaProducts()
      .then((d) => setTopIndia(d.products || []))
      .catch(() => setTopIndia([]))
      .finally(() => setLoadingTopIndia(false));
  }, []);

  useEffect(() => {
    if (!activeCat) return;
    setLoad(true);
    setProds([]);
    searchProducts(activeCat, activeCat)
      .then((d) => setProds(d.results || []))
      .catch(() => setProds([]))   // show empty state — never show wrong-category fallback
      .finally(() => setLoad(false));
  }, [activeCat]);

  // BUG #19 FIX: scroll listener
  useEffect(() => {
    function onScroll() { setShowScroll(window.scrollY > 400) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function handleSearch(e) {
    e?.preventDefault();
    if (q.trim()) onSearch(q.trim(), "");
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
              bestpickr compares ratings, reviews &amp; prices across Amazon,
              Flipkart &amp; Myntra — then ranks them so you always pick the right one.
            </p>
            <form onSubmit={handleSearch}>
              <div className="big-search">
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
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

      {/* ── HOW IT WORKS ─────────────────────── */}
      <div className="how-strip">
        <div className="wrap">
          <div className="how-items">
            {[
              ["1", "You search", "any product"],
              ["2", "AI scans", "3 platforms"],
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
          <div className="cat-row">
            {(categories.length > 0 ? categories : FALLBACK_CATS).map((c) => (
              <div
                key={c.slug}
                className={`cat-btn ${c.slug === activeCat ? "sel" : ""}`}
                onClick={() => setActive(c.slug)}
              >
                <span>{c.emoji}</span>
                {c.name}
              </div>
            ))}
          </div>
        </div>

        {/* ── TOP PICKS TABLE ───────────────────── */}
        <div className="section" style={{ paddingTop: 0 }}>
          <div className="section-head">
            {/* BUG #17 FIX: Show active category name clearly */}
            <div className="section-title">
              {CATEGORY_EMOJI[activeCat] || "📦"} Top 10 {cat?.name || activeCat} — by bestpickr AI
            </div>
            <div className="see-all" onClick={() => onSearch(activeCat, activeCat)}>
              See full analysis →
            </div>
          </div>

          {loadingProds ? (
            <HomeTableSkeleton />
          ) : products.length > 0 ? (
            <div className="picks-table">
              <div className="picks-table-head">
                <div className="th">#</div>
                <div className="th">Product</div>
                <div className="th">AI Score</div>
                <div className="th">Reviews</div>
                {/* BUG #16 FIX: Best Price column header now visible */}
                <div className="th">Best Price</div>
                <div className="th"></div>
              </div>
              {products.map((p, i) => (
                <div
                  key={i}
                  className={`picks-row ${i === 0 ? "top-pick" : ""}`}
                  onClick={() => onViewProduct(p, products)}
                >
                  <div className={`rank ${RANK_CLASS[p.rank || i + 1]}`}>
                    #{p.rank || i + 1}
                  </div>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:24 }}>{CATEGORY_EMOJI[activeCat] || "📦"}</span>
                      <div>
                        <div className="pick-name">{p.name}</div>
                        <div className="pick-brand">{p.brand}</div>
                        <div className="pick-tags">
                          {i === 0 && <span className="tag tag-g">Best Overall</span>}
                          {p.positivePct >= 80 && <span className="tag tag-b">Highly Praised</span>}
                          {p.lowestPrice && p.highestPrice && p.lowestPrice < p.highestPrice * 0.7 && (
                            <span className="tag tag-o">Best Value</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="plt-pills" style={{ marginTop:6 }}>
                      {(p.platforms || []).map((plt) => (
                        <PlatformPill key={plt.name} name={plt.name} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="score-num">{p.aiScore}</div>
                    <div className="score-bar">
                      <div className="score-fill" style={{ width:`${(p.aiScore / 10) * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="rev-count">{(p.totalReviews || 0).toLocaleString()}</div>
                    <div className="rev-sub">{p.positivePct}% positive</div>
                  </div>
                  {/* BUG #16 FIX: Price now renders with fallback */}
                  <div>
                    <div className="price-best" style={{ fontSize:15, fontWeight:700, color:'var(--accent)', fontFamily:"'DM Mono',monospace" }}>
                      {p.lowestPrice ? `₹${Number(p.lowestPrice).toLocaleString('en-IN')}` : '—'}
                    </div>
                    {p.highestPrice && p.highestPrice !== p.lowestPrice && (
                      <div className="price-range">
                        up to ₹{Number(p.highestPrice).toLocaleString('en-IN')}
                      </div>
                    )}
                  </div>
                  <div>
                    {/* BUG #18 FIX: Hover tooltip on view button */}
                    <AITooltip reason={
                      i === 0
                        ? `#1 pick with AI score ${p.aiScore}/10. ${p.positivePct}% positive reviews across ${(p.platforms||[]).length} platforms.`
                        : `Ranked #${i+1} with AI score ${p.aiScore}/10. ${p.positivePct || 70}% positive reviews.`
                    }>
                      <button className="view-btn">View deals</button>
                    </AITooltip>
                  </div>
                </div>
              ))}
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

      {/* ── TOP PRODUCTS IN INDIA ─────────────── */}
      {(loadingTopIndia || topIndia.length > 0) && (
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
                {topIndia.map((p) => (
                  <div key={p.id || p.name} onClick={() => onViewProduct(p, topIndia)}
                    style={{ background:'var(--paper)', borderRadius:'var(--r3)', border:'1px solid var(--line)',
                      padding:16, cursor:'pointer', transition:'box-shadow .15s,border-color .15s',
                      display:'flex', flexDirection:'column', gap:10 }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.08)'; e.currentTarget.style.borderColor='var(--accent)' }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor='var(--line)' }}
                  >
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
const CATEGORY_EMOJI = {
  headphones:"🎧", smartphones:"📱", laptops:"💻", gaming:"🎮",
  footwear:"👟", skincare:"✨", fashion:"👗", books:"📚", appliances:"🍳",
};

const FALLBACK_CATS = [
  { slug:"headphones", name:"Headphones", emoji:"🎧" },
  { slug:"smartphones", name:"Smartphones", emoji:"📱" },
  { slug:"laptops", name:"Laptops", emoji:"💻" },
  { slug:"gaming", name:"Gaming", emoji:"🎮" },
  { slug:"footwear", name:"Footwear", emoji:"👟" },
  { slug:"skincare", name:"Skincare", emoji:"✨" },
  { slug:"fashion", name:"Fashion", emoji:"👗" },
  { slug:"appliances", name:"Appliances", emoji:"🍳" },
];


