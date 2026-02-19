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
import { getCategories, searchProducts } from "../services/api.js";
import { HomeTableSkeleton } from "../components/Skeleton.jsx";
import { trackAffiliateClick } from "../utils/analytics.js";

// ── CLEAN AFFILIATE LINKS ──────────────────────────────────────────
const FEATURED_PRODUCTS = [
  {
    id: "fp1",
    asin: "B0CCLMLRY8",
    name: "LEMBOSE Plastic Fridge Storage Refrigerator Organizer Container with Lid - 5L, Transparent",
    brand: "LEMBOSE",
    emoji: "🧊",
    imageUrl: "https://m.media-amazon.com/images/I/71WqBJFa2TL._SX342_SY445_.jpg",
    price: 249,
    oldPrice: 699,
    discount: 64,
    rating: 4.5,
    reviewCount: 41200,
    badge: "✅ Top Rated",
    // BUG #9 FIX: Clean dp/ASIN URL — no search params that cause blank page
    affiliateUrl: "https://www.amazon.in/dp/B0CCLMLRY8?tag=bestpickr-21&linkCode=ll2&linkId=3224d39e3ae39a53dc87cfaca0257221&ref_=as_li_ss_tl",
    features: ["5 Litres", "Transparent", "With Lid"],
    category: "Kitchen",
    aiReason: "Highest rated fridge organizer with 41K+ verified reviews. 4.5★ across Amazon. Best value in its category.",
  },
  {
    id: "fp2",
    asin: "B0C591TT8F",
    name: "Cubic Classic A5 Journal – 160 Pages, 80 gsm | PU Leather Hardbound Notebook with Pen Loop",
    brand: "Cubic",
    emoji: "📓",
    imageUrl: "https://m.media-amazon.com/images/I/71k3o+gJgFL._SX342_SY445_.jpg",
    price: 167,
    oldPrice: 185,
    discount: 10,
    rating: 4.2,
    reviewCount: 780,
    badge: "🔥 Bestseller",
    affiliateUrl: "https://www.amazon.in/dp/B0C591TT8F?tag=bestpickr-21&linkCode=ll2&linkId=2657a6de8c2932c182b76deb8e749024&ref_=as_li_ss_tl",
    features: ["Hardbound", "A5 Size", "160 Pages"],
    category: "Diaries",
    aiReason: "Top-rated hardbound journal with PU leather cover. 4.2★ with consistent positive sentiment on build quality.",
  },
  {
    id: "fp3",
    asin: "B07DQXH8JZ",
    name: "Scotch-Brite Microfiber Polishing Wipe for cleaning TV, Mobile, Laptop screens",
    brand: "Scotch-Brite",
    emoji: "🧹",
    imageUrl: "https://m.media-amazon.com/images/I/61RI+lFf3HL._SX342_SY445_.jpg",
    price: 169,
    oldPrice: 179,
    discount: 6,
    rating: 4.2,
    reviewCount: 3665,
    badge: "⚡ Limited Deal",
    affiliateUrl: "https://www.amazon.in/dp/B07DQXH8JZ?tag=bestpickr-21&linkCode=ll2&linkId=87747a090d2be209a3f34aed820729aa&ref_=as_li_ss_tl",
    features: ["Microfiber", "Screen Safe", "Grey"],
    category: "Cleaning",
    aiReason: "Most reviewed microfiber wipe in India. Scotch-Brite brand trust + 3.6K reviews make this the safest pick.",
  },
];

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
const PLT_ICONS = { Amazon: "🛒", Flipkart: "🔵", Myntra: "🛍️" };

// ── SESSION SAVED PRODUCTS (BUG #11) ──────────────────────────────
function getSaved() {
  try { return JSON.parse(sessionStorage.getItem('bp_saved') || '[]') } catch { return [] }
}
function setSaved(list) {
  try { sessionStorage.setItem('bp_saved', JSON.stringify(list)) } catch {}
}

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

function FeaturedProductCard({ product }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [saved, setSavedState] = useState(() => getSaved().some(s => s.id === product.id));

  function handleBuy(e) {
    e.stopPropagation();
    trackAffiliateClick({
      productName: product.name,
      productId: product.asin,
      platform: "Amazon",
      affiliateUrl: product.affiliateUrl,
      price: product.price,
    });
    // BUG #9 FIX: proper window.open with noopener
    window.open(product.affiliateUrl, "_blank", "noopener,noreferrer");
  }

  // BUG #11 FIX: Session-based save (no login needed)
  function toggleSave(e) {
    e.stopPropagation();
    const list = getSaved();
    const exists = list.some(s => s.id === product.id);
    if (exists) {
      setSaved(list.filter(s => s.id !== product.id));
      setSavedState(false);
    } else {
      setSaved([...list, { id: product.id, name: product.name, price: product.price }]);
      setSavedState(true);
    }
  }

  return (
    <div className="fcard">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div className="fcard-badge">{product.badge}</div>
        {/* BUG #11: Save button - session based */}
        <button
          onClick={toggleSave}
          title={saved ? "Remove from saved" : "Save for later"}
          style={{
            background:'none', border:'none', cursor:'pointer', padding:'4px 8px',
            fontSize:16, color: saved ? 'var(--accent2)' : 'var(--ink4)',
          }}
        >{saved ? "🔖" : "📎"}</button>
      </div>
      <div className="fcard-img-placeholder" style={{ background:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {product.imageUrl && !imgFailed ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            onError={() => setImgFailed(true)}
            style={{ width:'100%', height:'100%', objectFit:'contain' }}
          />
        ) : (
          <span style={{ fontSize:48 }}>{product.emoji}</span>
        )}
      </div>
      <div className="fcard-body">
        <div className="fcard-brand">{product.brand} · {product.category}</div>
        <div className="fcard-name">{product.name}</div>
        <div className="fcard-rating">
          <span className="fcard-stars">{"★".repeat(Math.round(product.rating))}</span>
          {product.rating} · {product.reviewCount.toLocaleString()} reviews
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:4 }}>
          {product.features.map((f) => (
            <span key={f} className="plt-pill" style={{ background:'var(--accent-bg)', color:'var(--accent)' }}>
              {f}
            </span>
          ))}
        </div>
        <div className="fcard-meta">
          <div>
            <div className="fcard-price">₹{product.price.toLocaleString("en-IN")}</div>
            <div style={{ display:'flex', gap:6, alignItems:'center', marginTop:2 }}>
              <span className="fcard-old">₹{product.oldPrice.toLocaleString("en-IN")}</span>
              <span className="fcard-discount">{product.discount}% off</span>
            </div>
          </div>
          {/* BUG #18 FIX: AI reason tooltip */}
          <AITooltip reason={product.aiReason}>
            <div style={{
              background:'var(--accent-bg)', color:'var(--accent)',
              fontSize:10, fontWeight:700, padding:'3px 7px', borderRadius:4,
              cursor:'help', border:'1px solid #C8E6D4',
            }}>🤖 Why this?</div>
          </AITooltip>
        </div>
        <button className="fcard-buy-btn" onClick={handleBuy}>
          🛒 Buy on Amazon →
        </button>
      </div>
    </div>
  );
}

export default function HomePage({ onSearch, onViewProduct }) {
  const [q, setQ] = useState("");
  const [categories, setCats] = useState([]);
  const [activeCat, setActive] = useState("headphones");
  const [products, setProds] = useState([]);
  const [loadingProds, setLoad] = useState(false);
  // BUG #19 FIX: scroll to top visibility
  const [showScroll, setShowScroll] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    getCategories()
      .then((d) => setCats(d.categories || FALLBACK_CATS))
      .catch(() => setCats(FALLBACK_CATS));
  }, []);

  useEffect(() => {
    if (!activeCat) return;
    setLoad(true);
    setProds([]);
    searchProducts(activeCat, activeCat)
      .then((d) => setProds(d.results || []))
      .catch(() => setProds(MOCK_PRODUCTS[activeCat] || MOCK_PRODUCTS.headphones))
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
                        <span key={plt.name} className="plt-pill">
                          {PLT_ICONS[plt.name] || ""} {plt.name}
                        </span>
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

        {/* ── FEATURED PRODUCTS ──────────────────────── */}
        <div className="section featured-section" style={{ paddingTop:0 }}>
          <div className="section-head">
            <div className="section-title">🔥 Hot Deals — Curated by bestpickr</div>
            <div style={{ fontSize:11, color:'var(--ink4)', fontWeight:600 }}>
              Affiliate links · Helps support us
            </div>
          </div>
          <div className="featured-grid">
            {FEATURED_PRODUCTS.map((p) => (
              <FeaturedProductCard key={p.id} product={p} />
            ))}
          </div>
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

const MOCK_PRODUCTS = {
  headphones: [
    { rank:1, name:"Sony WH-1000XM5 Wireless NC", brand:"Sony", aiScore:9.5, totalReviews:1240, positivePct:84, lowestPrice:24990, highestPrice:27500, platforms:[{name:"Amazon"},{name:"Flipkart"}] },
    { rank:2, name:"Bose QuietComfort 45", brand:"Bose", aiScore:8.8, totalReviews:890, positivePct:79, lowestPrice:26500, highestPrice:29000, platforms:[{name:"Amazon"},{name:"Flipkart"}] },
    { rank:3, name:"Apple AirPods Max", brand:"Apple", aiScore:8.2, totalReviews:1050, positivePct:76, lowestPrice:59900, highestPrice:61000, platforms:[{name:"Amazon"}] },
    { rank:4, name:"Samsung Galaxy Buds 2 Pro", brand:"Samsung", aiScore:7.9, totalReviews:640, positivePct:71, lowestPrice:14990, highestPrice:16500, platforms:[{name:"Flipkart"},{name:"Amazon"}] },
    { rank:5, name:"Jabra Evolve2 75 Wireless Headset", brand:"Jabra", aiScore:7.5, totalReviews:410, positivePct:68, lowestPrice:18999, highestPrice:21000, platforms:[{name:"Amazon"}] },
  ],
};
