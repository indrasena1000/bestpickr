// src/pages/ResultsPage.jsx
// BUG #4  FIX: Sort dropdown centered on mobile
// BUG #10 FIX: "You save" calculation correct (shows MRP - lowestPrice)
// BUG #18 FIX: Hover tooltip on result cards explaining AI pick reason
// BUG #19 FIX: Scroll to top button

import { useEffect, useState, useRef } from 'react'
import { useSearch }      from '../hooks/useSearch.js'
import { ResultSkeleton } from '../components/Skeleton.jsx'
import { PlatformLogo, PlatformPill } from '../components/PlatformLogo.jsx'
import PrimaryProductCard from '../components/PrimaryProductCard.jsx'
import SuggestionsGrid    from '../components/SuggestionsGrid.jsx'
import ProductGrid        from '../components/ProductGrid.jsx'
import DidYouMeanBanner   from '../components/DidYouMeanBanner.jsx'
import FallbackView       from '../components/FallbackView.jsx'
import RefineSearchBanner from '../components/RefineSearchBanner.jsx'

const RANK_CLASS = ['','g','s','b','n','n','n','n','n','n','n']
const fmt = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—'

const CATEGORY_EMOJIS = {
  headphones:'🎧', earbuds:'🎧', audio:'🎧', speaker:'🔊',
  mobile:'📱', phone:'📱', smartphone:'📱',
  laptop:'💻', computer:'💻',
  tablet:'📱', ipad:'📱',
  tv:'📺', television:'📺',
  camera:'📷',
  watch:'⌚', smartwatch:'⌚',
  shoe:'👟', shoes:'👟', sneaker:'👟',
  bag:'👜', backpack:'🎒',
  book:'📚', kindle:'📚',
  gaming:'🎮', controller:'🎮',
  kitchen:'🍳', airfryer:'🍳', fryer:'🍳',
  vacuum:'🌀', cleaner:'🌀',
  printer:'🖨️',
  mouse:'🖱️', keyboard:'⌨️',
}

function getCategoryEmoji(product) {
  const text = `${product.name} ${product.category || ''}`.toLowerCase()
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJIS)) {
    if (text.includes(key)) return emoji
  }
  return '📦'
}

function ProductImage({ product }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [product.imageUrl])

  if (!product.imageUrl || failed) {
    return (
      <div style={{
        width:'100%', height:'100%',
        display:'flex', alignItems:'center', justifyContent:'center',
        background:'var(--paper2)', borderRadius:'var(--r2)', fontSize:36,
      }}>
        {getCategoryEmoji(product)}
      </div>
    )
  }
  return (
    <img
      src={product.imageUrl}
      alt={product.name}
      onError={() => setFailed(true)}
      style={{ width:'100%', height:'100%', objectFit:'contain', borderRadius:'var(--r2)', background:'#fff' }}
    />
  )
}

function applyFilters(results, filters) {
  return results.filter(p => {
    if (filters.minScore && p.aiScore < filters.minScore) return false
    if (filters.maxPrice && p.lowestPrice > filters.maxPrice) return false
    if (filters.platforms.length > 0) {
      const pltNames = (p.platforms || []).map(pl => pl.name)
      if (!filters.platforms.some(f => pltNames.includes(f))) return false
    }
    return true
  })
}

// BUG #18: Tooltip component
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
          padding:'8px 12px', borderRadius:8, whiteSpace:'normal', width:230,
          boxShadow:'0 4px 16px rgba(0,0,0,.3)', zIndex:400, lineHeight:1.5,
          pointerEvents:'none',
        }}>
          <div style={{ color:'#7ECFA0', fontWeight:700, marginBottom:3, fontSize:10, letterSpacing:'.5px' }}>
            🤖 WHY BESTPICKR CHOSE THIS
          </div>
          {reason}
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

export default function ResultsPage({ query, category, onViewProduct, onSearch }) {
  const {
    results, loading, error, meta, search,
    intent, confidence, primaryProduct, suggestions, status,
    matchType, wasSpellingCorrected, correctedQuery,
  } = useSearch()
  const [sort,    setSort]    = useState('best')
  const [filters, setFilters] = useState({ platforms: [], minScore: 0, maxPrice: 0 })
  // BUG #19 FIX
  const [showScroll, setShowScroll] = useState(false)

  useEffect(() => {
    if (query) search(query, category)
  }, [query, category])

  useEffect(() => {
    function onScroll() { setShowScroll(window.scrollY > 300) }
    window.addEventListener('scroll', onScroll, { passive:true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const filtered = applyFilters(results, filters)
  const sorted   = [...filtered].sort((a, b) => {
    if (sort === 'price_asc')  return (a.lowestPrice||Infinity) - (b.lowestPrice||Infinity)
    if (sort === 'price_desc') return (b.lowestPrice||0) - (a.lowestPrice||0)
    if (sort === 'rating')     return (b.avgRating||0) - (a.avgRating||0)
    return (b.aiScore||0) - (a.aiScore||0)
  })

  const top     = results[0]
  const bestVal = results.reduce((best, p) => (!best || (p.lowestPrice < best.lowestPrice && p.aiScore > 7)) ? p : best, null)

  function togglePlatform(plt) {
    setFilters(f => ({
      ...f,
      platforms: f.platforms.includes(plt)
        ? f.platforms.filter(p => p !== plt)
        : [...f.platforms, plt],
    }))
  }

  return (
    <div className="wrap">
      <div className="results-wrap">

        {/* ── SIDEBAR FILTERS ─────────────────── */}
        <aside className="sidebar">
          <div className="filter-box">
            <div className="filter-box-title">
              Platforms
              <button onClick={() => setFilters(f => ({ ...f, platforms: [] }))}>Clear</button>
            </div>
            {['Amazon','Flipkart','Myntra'].map(plt => {
              const count = results.filter(p => (p.platforms||[]).some(pl => pl.name === plt)).length
              return (
                <label key={plt} className="filter-opt">
                  <input
                    type="checkbox"
                    checked={filters.platforms.length === 0 || filters.platforms.includes(plt)}
                    onChange={() => togglePlatform(plt)}
                  />
                  <span style={{display:'inline-flex',alignItems:'center',gap:5}}><PlatformLogo name={plt} size={13}/> {plt}</span>
                  <span className="filter-cnt">{count}</span>
                </label>
              )
            })}
          </div>

          <div className="filter-box">
            <div className="filter-box-title">
              Min AI Score
              <button onClick={() => setFilters(f => ({ ...f, minScore: 0 }))}>Clear</button>
            </div>
            {[['9.0+',9.0,'Excellent'],['8.0+',8.0,'Great'],['7.0+',7.0,'Good']].map(([label, val, desc]) => (
              <label key={label} className="filter-opt">
                <input
                  type="radio"
                  name="minscore"
                  checked={filters.minScore === val}
                  onChange={() => setFilters(f => ({ ...f, minScore: val }))}
                />
                <span>{label} {desc}</span>
                <span className="filter-cnt">{results.filter(p => p.aiScore >= val).length}</span>
              </label>
            ))}
          </div>

          <div className="filter-box">
            <div className="filter-box-title">
              Max Price
              <button onClick={() => setFilters(f => ({ ...f, maxPrice: 0 }))}>Clear</button>
            </div>
            {[[5000,'Under ₹5,000'],[20000,'Under ₹20,000'],[50000,'Under ₹50,000'],[0,'Any price']].map(([val, label]) => (
              <label key={label} className="filter-opt">
                <input
                  type="radio"
                  name="maxprice"
                  checked={filters.maxPrice === val}
                  onChange={() => setFilters(f => ({ ...f, maxPrice: val }))}
                />
                <span>{label}</span>
                <span className="filter-cnt">
                  {val === 0 ? results.length : results.filter(p => p.lowestPrice && p.lowestPrice <= val).length}
                </span>
              </label>
            ))}
          </div>

          {meta && (
            <div style={{ fontSize:11, color:'var(--ink4)', padding:'8px 12px', background:'var(--paper2)', borderRadius:'var(--r2)', border:'1px solid var(--line)' }}>
              {meta.fromCache ? '⚡ Cached result' : `🔍 Live search in ${meta.elapsed}ms`}
              {meta.platforms && (
                <div style={{ marginTop:4 }}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:3,flexWrap:'wrap'}}>
                    <PlatformLogo name="Amazon" size={13}/> {meta.platforms.amazon} &nbsp;·&nbsp;
                    <PlatformLogo name="Flipkart" size={13}/> {meta.platforms.flipkart} &nbsp;·&nbsp;
                    <PlatformLogo name="Myntra" size={13}/> {meta.platforms.myntra}
                  </span>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ── MAIN RESULTS ─────────────────────── */}
        <div>
          {/* BUG #4 FIX: Sort centered using flex with justify-content */}
          <div className="results-bar" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
            <div className="results-title" style={{ flex:1, minWidth:0 }}>
              Top 10 for <span>"{query}"</span>
            </div>
            {/* BUG #4: Sort centered block on mobile */}
            <div style={{ display:'flex', justifyContent:'center' }}>
              <select
                className="sort-select"
                value={sort}
                onChange={e => setSort(e.target.value)}
                style={{ margin:'0 auto', display:'block' }}
              >
                <option value="best">Sort: Best Match</option>
                <option value="price_asc">Lowest Price</option>
                <option value="price_desc">Highest Price</option>
                <option value="rating">Highest Rated</option>
              </select>
            </div>
          </div>

          {/* ── INTENT-BASED LAYOUT ROUTER ─────────────────── */}

          {/* Loading / polling state — not shown during lazy_pending (suggestions already visible) */}
          {(loading || status === 'fetching' || status === 'partial') && !primaryProduct && status !== 'lazy_pending' && (
            <div>
              <div className="loading-wrap" style={{ padding:'16px 0 20px', flexDirection:'row', justifyContent:'flex-start' }}>
                <div className="loading-spinner"/>
                <span>
                  {status === 'fetching' ? 'Fetching live data…' :
                   status === 'partial'  ? 'Analysing results…' :
                   'Searching Amazon, Flipkart & Myntra simultaneously…'}
                </span>
              </div>
              <ResultSkeleton />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="error-wrap">
              ⚠️ {error}
              <button
                onClick={() => search(query, category)}
                style={{ marginLeft:12, fontWeight:700, color:'var(--accent2)', cursor:'pointer' }}
              >
                Retry
              </button>
            </div>
          )}

          {/* PATH A — PRODUCT_SPECIFIC: primary card + alternatives grid */}
          {/* Also renders during lazy_pending: skeleton primary + instant suggestions */}
          {!loading && !error && (intent === 'PRODUCT_SPECIFIC' || status === 'lazy_pending') && (
            <>
              {/* Spelling correction banner */}
              {wasSpellingCorrected && correctedQuery && (
                <div style={{
                  background: 'var(--accent-bg)', border: '1px solid var(--accent)',
                  borderRadius: 8, padding: '8px 14px', marginBottom: 12,
                  fontSize: 13, color: 'var(--ink)',
                }}>
                  Showing results for <strong>{correctedQuery}</strong>
                </div>
              )}
              <PrimaryProductCard
                product={primaryProduct}
                status={status}
                confidence={confidence}
                matchType={matchType}
                onBuy={(plt) => plt?.url && window.open(plt.url, '_blank')}
                onViewDetails={(p) => onViewProduct(p, suggestions || [])}
              />
              {suggestions && suggestions.length > 0 && (
                <SuggestionsGrid
                  title="Bestpickr Suggested Alternatives"
                  subtitle="Suggested based on your search"
                  items={suggestions}
                  onSelect={(p) => onViewProduct(p, suggestions)}
                />
              )}
            </>
          )}

          {/* PATH B — CATEGORY / BRAND_CATEGORY / GENERIC */}
          {!loading && !error && (intent === 'CATEGORY' || intent === 'BRAND_CATEGORY' || intent === 'GENERIC') && (
            <>
              {/* Spelling correction banner */}
              {wasSpellingCorrected && correctedQuery && (
                <div style={{
                  background: 'var(--accent-bg)', border: '1px solid var(--accent)',
                  borderRadius: 8, padding: '8px 14px', marginBottom: 12,
                  fontSize: 13, color: 'var(--ink)',
                }}>
                  Showing results for <strong>{correctedQuery}</strong>
                </div>
              )}
              {/* AI Summary bar for category results */}
              {(suggestions || results).length > 0 && top && (
                <div className="ai-summary">
                  <div className="ai-summary-label">★ AI Summary</div>
                  <div className="ai-summary-text">
                    <strong>{top.name}</strong> leads with the highest combined score ({top.aiScore}/10).
                    {' '}{(suggestions || results).filter(p => p.positivePct >= 75).length} of {(suggestions || results).length} products have 75%+ positive reviews.
                  </div>
                </div>
              )}
              <ProductGrid
                title={`Top picks for "${query}"`}
                items={suggestions && suggestions.length > 0 ? suggestions : sorted}
                onSelect={(p) => onViewProduct(p, suggestions || results)}
              />
            </>
          )}

          {/* PATH C — LOW_CONFIDENCE: banner + suggestions */}
          {!loading && !error && intent === 'LOW_CONFIDENCE' && (
            <>
              {wasSpellingCorrected && correctedQuery && (
                <div style={{
                  background: 'var(--accent-bg)', border: '1px solid var(--accent)',
                  borderRadius: 8, padding: '8px 14px', marginBottom: 12,
                  fontSize: 13, color: 'var(--ink)',
                }}>
                  Showing results for <strong>{correctedQuery}</strong>
                </div>
              )}
              <DidYouMeanBanner
                product={primaryProduct || suggestions?.[0]}
                confidence={confidence}
                onConfirm={(p) => onViewProduct(p, suggestions || [])}
              />
              {suggestions && suggestions.length > 0 ? (
                <SuggestionsGrid
                  title="You might be looking for…"
                  subtitle="Based on related searches"
                  items={suggestions}
                  onSelect={(p) => onViewProduct(p, suggestions)}
                />
              ) : (
                <ProductGrid
                  title="Popular products"
                  items={sorted}
                  onSelect={(p) => onViewProduct(p, results)}
                />
              )}
            </>
          )}

          {/* PATH D — FALLBACK */}
          {!loading && !error && intent === 'FALLBACK' && (
            <FallbackView
              suggestions={suggestions || results}
              categorySuggestions={null}
            />
          )}

          {/* LEGACY FALLBACK — no intent set (old API response shape) */}
          {!loading && !error && !intent && (
            <>
              {results.length === 0 && (
                <div style={{ background:'var(--paper)', border:'1px solid var(--line)', borderRadius:'var(--r3)', padding:'48px 20px', textAlign:'center' }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>{category ? '📂' : '🔍'}</div>
                  <div style={{ fontSize:16, fontWeight:700, color:'var(--ink)', marginBottom:6 }}>
                    {category ? `No products found in "${category}"` : 'No results found'}
                  </div>
                  <div style={{ fontSize:14, color:'var(--ink3)', marginBottom:20 }}>
                    {category
                      ? `We couldn't find any products in the ${category} category. Try searching for specific product names.`
                      : 'Try a different search term or browse a category'}
                  </div>
                  {['Sony headphones','running shoes','air fryer'].map(s => (
                    <button key={s} onClick={() => onSearch(s, '')}
                      style={{ margin:4, padding:'7px 14px', border:'1px solid var(--line)', borderRadius:'var(--r)', background:'var(--paper2)', fontSize:13, fontWeight:600, cursor:'pointer', color:'var(--ink2)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {sorted.length > 0 && (
                <>
                  {top && (
                    <div className="ai-summary">
                      <div className="ai-summary-label">★ AI Summary</div>
                      <div className="ai-summary-text">
                        <strong>{top.name}</strong> leads with the highest combined score ({top.aiScore}/10) across all platforms.
                        {bestVal && bestVal.name !== top.name && (
                          <> <strong>Best value:</strong> {bestVal.name} at {fmt(bestVal.lowestPrice)} (score: {bestVal.aiScore}/10).</>
                        )}
                        {' '}{results.filter(p => p.positivePct >= 75).length} of {results.length} products have 75%+ positive reviews.
                      </div>
                    </div>
                  )}
                  <div className="result-cards">
                    {sorted.map((p, i) => (
                      <ResultCard
                        key={i}
                        product={p}
                        rank={p.rank || i+1}
                        isTop={i === 0}
                        onClick={() => onViewProduct(p, results)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
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
          }}
          title="Scroll to top"
        >↑</button>
      )}

      {/* BUG #4 FIX: mobile sort center */}
      <style>{`
        @media(max-width:640px) {
          .results-bar { flex-direction: column !important; align-items: stretch !important; }
          .sort-select { width: 100% !important; text-align: center; }
        }
      `}</style>
    </div>
  )
}

// ── RESULT CARD ────────────────────────────────────────────────────
function ResultCard({ product: p, rank, isTop, onClick }) {
  const fmt = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—'

  // BUG #10 FIX: Correct "you save" = highestPrice - lowestPrice
  const youSave = (p.highestPrice && p.lowestPrice && p.highestPrice > p.lowestPrice)
    ? p.highestPrice - p.lowestPrice
    : null
  const savePct = youSave && p.highestPrice
    ? Math.round((youSave / p.highestPrice) * 100)
    : null

  // BUG #18: AI tooltip reason
  const aiReason = `AI Score ${p.aiScore}/10 based on ${(p.totalReviews||0).toLocaleString()} reviews across ${(p.platforms||[]).length} platforms. ${p.positivePct || 75}% positive sentiment.${isTop ? ' Ranked #1 — highest overall score in this search.' : ''}`

  return (
    <div className={`rcard ${isTop ? 'best' : ''}`} onClick={onClick}>
      <div className="rcard-top">
        <div className={`rcard-rank rank ${RANK_CLASS[rank]}`}>#{rank}</div>

        <div className="rcard-emoji">
          <ProductImage product={p} />
        </div>

        <div className="rcard-info">
          <div className="rcard-brand">{p.brand}</div>
          <div className="rcard-name">{p.name}</div>
          <div className="rcard-meta">
            {/* BUG #18: Tooltip wrapping AI score badge */}
            <AITooltip reason={aiReason}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'var(--accent-bg)', color:'var(--accent)', borderRadius:4, padding:'3px 9px', fontSize:12, fontWeight:700, cursor:'help' }}>
                ★ {p.aiScore}/10
              </span>
            </AITooltip>
            {isTop && <span className="tag tag-g">Best Match</span>}
            {p.positivePct >= 80 && <span className="tag tag-b">Highly Praised</span>}
            {/* BUG #10 FIX: Show you-save badge */}
            {savePct && savePct >= 5 && (
              <span style={{ background:'#FDF2EC', color:'var(--accent2)', fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4 }}>
                Save {savePct}%
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div className="score-big">{p.aiScore}<span className="score-denom">/10</span></div>
          <div className="score-label">AI Score</div>
        </div>
      </div>

      <div className="rcard-bottom">
        {/* Reviews */}
        <div>
          <div className="rcard-bottom-label">Reviews</div>
          <div className="rcard-bottom-val">{(p.totalReviews||0).toLocaleString()}</div>
          <div className="rcard-bottom-sub">across {(p.platforms||[]).length} platforms</div>
          <div className="sent-mini" style={{ marginTop:6 }}>
            {[['Positive', p.positivePct, 'sent-pos'], ['Negative', Math.max(0, 100-(p.positivePct||75)-10), 'sent-neg']].map(([lbl, pct, cls]) => (
              <div key={lbl} className="sent-mini-row">
                <span className="sent-mini-lbl">{lbl}</span>
                <div className="sent-mini-track"><div className={`sent-mini-fill ${cls}`} style={{ width:`${pct||0}%` }}/></div>
                <span className="sent-mini-pct">{Math.round(pct||0)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Platforms */}
        <div>
          <div className="rcard-bottom-label">Available on</div>
          <div className="rcard-bottom-val">{(p.platforms||[]).length} stores</div>
          <div className="plt-pills" style={{ marginTop:6 }}>
            {(p.platforms||[]).map(plt => (
              <PlatformPill key={plt.name} name={plt.name} />
            ))}
          </div>
        </div>

        {/* BUG #10 FIX: Price + correct you save */}
        <div>
          <div className="rcard-bottom-label">Best Price</div>
          <div className="rcard-price-main">{fmt(p.lowestPrice)}</div>
          {p.highestPrice && p.highestPrice !== p.lowestPrice && (
            <div className="rcard-bottom-sub" style={{ textDecoration:'line-through', color:'var(--ink4)' }}>
              {fmt(p.highestPrice)}
            </div>
          )}
          {/* BUG #10: Correct "you save" = MRP - best price */}
          {youSave && youSave > 0 && (
            <div style={{ fontSize:11, color:'var(--accent2)', fontWeight:700, marginTop:2 }}>
              You save {fmt(youSave)} ({savePct}%)
            </div>
          )}
        </div>

        <div>
          <button
            className="view-btn"
            style={{ padding:'9px 20px' }}
            onClick={e => { e.stopPropagation(); onClick() }}
          >
            View deals →
          </button>
        </div>
      </div>
    </div>
  )
}
