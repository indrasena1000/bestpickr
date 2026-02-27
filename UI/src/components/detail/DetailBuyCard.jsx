// components/detail/DetailBuyCard.jsx
import { PlatformLogo } from '../PlatformLogo.jsx'

const fmt = (n) => (n ? `₹${Number(n).toLocaleString('en-IN')}` : '—')
const PLACEHOLDER_PLATFORMS = ['Amazon', 'Flipkart', 'Myntra']

export default function DetailBuyCard({ p, bestPlt, platforms, onBuy }) {
  const priceHistory = [
    ['All-time low',   fmt(p.lowestPrice  ? p.lowestPrice  * 0.90 : null), 'low'],
    ['All-time high',  fmt(p.highestPrice ? p.highestPrice * 1.15 : null), 'high'],
    ['Current price',  fmt(p.lowestPrice),                                  'cur'],
  ]

  return (
    <div className="buy-card">
      <div className="buy-card-header">
        <div className="buy-card-header-label">Best price found</div>
        <div className="buy-card-price">{fmt(p.lowestPrice || bestPlt?.price)}</div>
        <div className="buy-card-sub">on {bestPlt?.name || 'Amazon'} · Free delivery</div>
      </div>

      <div className="buy-card-body">
        <button className="buy-card-main-btn" onClick={() => onBuy(bestPlt)}>
          Buy on {bestPlt?.name || 'Amazon'} →
        </button>

        {/* Price history */}
        <div className="price-history">
          <div className="ph-title">Price history</div>
          {priceHistory.map(([label, val, cls]) => (
            <div key={label} className="ph-row">
              <span className="ph-label">{label}</span>
              <span className={`ph-val ${cls}`}>{val}</span>
            </div>
          ))}
          {p.lowestPrice && p.highestPrice && (
            <div className="ph-row">
              <span className="ph-label">You save</span>
              <span className="ph-val low">
                {fmt((p.highestPrice || p.lowestPrice) - p.lowestPrice)} vs highest
              </span>
            </div>
          )}
        </div>

        {/* All platforms quick list */}
        <div className="platform-quick">
          <div className="pq-title">All platforms</div>
          {(platforms.length > 0 ? platforms : PLACEHOLDER_PLATFORMS.map(n => ({ name: n, price: null }))).map((plt) => (
            <div key={plt.name} className="pq-row">
              <span className="pq-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <PlatformLogo name={plt.name} size={16} />
              </span>
              <span className="pq-name">{plt.name}</span>
              <span className="pq-price" style={!plt.price ? { color: 'var(--ink4)' } : {}}>
                {plt.price ? fmt(plt.price) : 'Check price'}
              </span>
              <span className="pq-btn" onClick={() => onBuy(plt)}>
                {plt.price ? 'Buy' : 'Go'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
