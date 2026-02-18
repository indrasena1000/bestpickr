// src/pages/ResultsPage.jsx
import { useEffect, useState } from 'react'
import { useSearch }      from '../hooks/useSearch'
import { ResultSkeleton } from '../components/Skeleton.jsx'

const RANK_CLASS = ['','g','s','b','n','n','n','n','n','n','n']
const PLT_COLOR  = { Amazon:'', Flipkart:'color:var(--accent2)', Myntra:'color:#9B2FAE' }
const PLT_ICONS  = { Amazon:'🛒', Flipkart:'🔵', Myntra:'🛍️' }
const fmt = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—'

// Filter helpers
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

export default function ResultsPage({ query, category, onViewProduct, onSearch }) {
  const { results, loading, error, meta, search } = useSearch()
  const [sort,    setSort]    = useState('best')
  const [filters, setFilters] = useState({ platforms: [], minScore: 0, maxPrice: 0 })

  useEffect(() => {
    if (query) search(query, category)
  }, [query, category])

  // Apply filters + sort
  const filtered = applyFilters(results, filters)
  const sorted   = [...filtered].sort((a, b) => {
    if (sort === 'price_asc')  return (a.lowestPrice||Infinity) - (b.lowestPrice||Infinity)
    if (sort === 'price_desc') return (b.lowestPrice||0) - (a.lowestPrice||0)
    if (sort === 'rating')     return b.avgRating - a.avgRating
    return b.aiScore - a.aiScore  // default: best match
  })

  // Build AI summary from results
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
          {/* Platforms */}
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
                  <span>{PLT_ICONS[plt]} {plt}</span>
                  <span className="filter-cnt">{count}</span>
                </label>
              )
            })}
          </div>

          {/* Min AI Score */}
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
                <span className="filter-cnt">
                  {results.filter(p => p.aiScore >= val).length}
                </span>
              </label>
            ))}
          </div>

          {/* Price Range */}
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

          {/* Cache info */}
          {meta && (
            <div style={{ fontSize:11, color:'var(--ink4)', padding:'8px 12px', background:'var(--paper2)', borderRadius:'var(--r2)', border:'1px solid var(--line)' }}>
              {meta.fromCache ? '⚡ Cached result' : `🔍 Live search in ${meta.elapsed}ms`}
              {meta.platforms && (
                <div style={{ marginTop:4 }}>
                  🛒 {meta.platforms.amazon} · 🔵 {meta.platforms.flipkart} · 🛍️ {meta.platforms.myntra}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ── MAIN RESULTS ─────────────────────── */}
        <div>
          {/* Results header */}
          <div className="results-bar">
            <div className="results-title">
              Top 10 for <span>"{query}"</span>
            </div>
            <select
              className="sort-select"
              value={sort}
              onChange={e => setSort(e.target.value)}
            >
              <option value="best">Sort: Best Match</option>
              <option value="price_asc">Lowest Price</option>
              <option value="price_desc">Highest Price</option>
              <option value="rating">Highest Rated</option>
            </select>
          </div>

          {/* AI Summary bar */}
          {!loading && results.length > 0 && top && (
            <div className="ai-summary">
              <div className="ai-summary-label">★ AI Summary</div>
              <div className="ai-summary-text">
                <strong>{top.name}</strong> leads with the highest combined score ({top.aiScore}/10) across all platforms.
                {bestVal && bestVal.name !== top.name && (
                  <> <strong>Best value:</strong> {bestVal.name} at {fmt(bestVal.lowestPrice)} (score: {bestVal.aiScore}/10).</>
                )}
                {' '}{results.filter(p => p.positivePct >= 75).length} of {results.length} products have 75%+ positive reviews.
                {results.length > 1 && results[0].lowestPrice && results[results.length-1].lowestPrice && (
                  <> Prices range from <strong>{fmt(Math.min(...results.map(p=>p.lowestPrice||Infinity)))}</strong> to <strong>{fmt(Math.max(...results.map(p=>p.highestPrice||0)))}</strong>.</>
                )}
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div>
              <div className="loading-wrap" style={{ padding:'16px 0 20px', flexDirection:'row', justifyContent:'flex-start' }}>
                <div className="loading-spinner"/>
                <span>Searching Amazon, Flipkart &amp; Myntra simultaneously…</span>
              </div>
              <ResultSkeleton />
            </div>
          )}

          {/* Error */}
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

          {/* Empty state */}
          {!loading && !error && results.length === 0 && (
            <div style={{ background:'var(--paper)', border:'1px solid var(--line)', borderRadius:'var(--r3)', padding:'48px 20px', textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
              <div style={{ fontSize:16, fontWeight:700, color:'var(--ink)', marginBottom:6 }}>No results found</div>
              <div style={{ fontSize:14, color:'var(--ink3)', marginBottom:20 }}>Try a different search term or category</div>
              {['Sony headphones','running shoes','air fryer'].map(s => (
                <button key={s} onClick={() => onSearch(s, '')}
                  style={{ margin:4, padding:'7px 14px', border:'1px solid var(--line)', borderRadius:'var(--r)', background:'var(--paper2)', fontSize:13, fontWeight:600, cursor:'pointer', color:'var(--ink2)' }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Result Cards */}
          {!loading && sorted.length > 0 && (
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
          )}
        </div>
      </div>
    </div>
  )
}

// ── RESULT CARD ────────────────────────────────────────────────────
function ResultCard({ product: p, rank, isTop, onClick }) {
  const fmt = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—'

  return (
    <div className={`rcard ${isTop ? 'best' : ''}`} onClick={onClick}>
      <div className="rcard-top">
        <div className={`rcard-rank rank ${RANK_CLASS[rank]}`}>#{rank}</div>
        <div className="rcard-emoji">
          {p.imageUrl
            ? <img src={p.imageUrl} alt={p.name} style={{ width:'100%', height:'100%', objectFit:'contain', borderRadius:'var(--r2)' }}/>
            : <span style={{ fontSize:32 }}>📦</span>
          }
        </div>
        <div className="rcard-info">
          <div className="rcard-brand">{p.brand}</div>
          <div className="rcard-name">{p.name}</div>
          <div className="rcard-meta">
            <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'var(--accent-bg)', color:'var(--accent)', borderRadius:4, padding:'3px 9px', fontSize:12, fontWeight:700 }}>
              ★ {p.aiScore}/10
            </span>
            {isTop && <span className="tag tag-g">Best Match</span>}
            {p.positivePct >= 80 && <span className="tag tag-b">Highly Praised</span>}
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div className="score-big">{p.aiScore}<span className="score-denom">/10</span></div>
          <div className="score-label">AI Score</div>
        </div>
      </div>

      <div className="rcard-bottom">
        {/* Reviews + sentiment */}
        <div>
          <div className="rcard-bottom-label">Reviews</div>
          <div className="rcard-bottom-val">{(p.totalReviews||0).toLocaleString()}</div>
          <div className="rcard-bottom-sub">across {(p.platforms||[]).length} platforms</div>
          <div className="sent-mini" style={{ marginTop:6 }}>
            {[['Positive', p.positivePct, 'sent-pos'], ['Negative', p.negativePct||100-p.positivePct-10, 'sent-neg']].map(([lbl, pct, cls]) => (
              <div key={lbl} className="sent-mini-row">
                <span className="sent-mini-lbl">{lbl}</span>
                <div className="sent-mini-track"><div className={`sent-mini-fill ${cls}`} style={{ width:`${pct}%` }}/></div>
                <span className="sent-mini-pct">{Math.round(pct)}%</span>
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
              <span key={plt.name} className="plt-pill">
                {PLT_ICONS[plt.name] || ''} {plt.name}
              </span>
            ))}
          </div>
        </div>

        {/* Price */}
        <div>
          <div className="rcard-bottom-label">Best Price</div>
          <div className="rcard-price-main">{fmt(p.lowestPrice)}</div>
          {p.highestPrice && p.highestPrice !== p.lowestPrice && (
            <div className="rcard-bottom-sub">up to {fmt(p.highestPrice)}</div>
          )}
        </div>

        <div>
          <button className="view-btn" style={{ padding:'9px 20px' }}
            onClick={e => { e.stopPropagation(); onClick() }}>
            View deals →
          </button>
        </div>
      </div>
    </div>
  )
}
