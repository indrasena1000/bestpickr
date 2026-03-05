// components/detail/DetailPlatformTable.jsx
import { PlatformLogo } from "../PlatformLogo.jsx";

const fmt = (n) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : "—");

export default function DetailPlatformTable({ platforms, bestPlt, onBuy }) {
  const hasRatingData  = platforms.some(p => p.rating  && p.rating > 0);
  const hasReviewData  = platforms.some(p => p.reviewCount && p.reviewCount > 0);

  // ── No platform data at all ───────────────────────────────────
  if (!platforms || platforms.length === 0) {
    return (
      <div style={{
        background: 'var(--paper2)', border: '1px dashed var(--line)',
        borderRadius: 'var(--r3)', padding: '28px 20px',
        textAlign: 'center', marginBottom: 16,
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🛍️</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>No store listings found</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5 }}>
          This product isn’t currently listed on Amazon, Flipkart or Myntra.<br />
          Check back later or search for a similar product.
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="compare-title">
        Price comparison across platforms
        <small>— updated just now</small>
      </div>

      <div className="compare-table-wrap">
        <table className="compare-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Platform</th>
              {hasRatingData && <th>Rating</th>}
              {hasReviewData && <th>Reviews</th>}
              <th>Price</th>
              <th>Delivery</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {platforms.map((plt, i) => {
              const isBest =
                bestPlt &&
                plt.name === bestPlt.name &&
                plt.price === bestPlt.price;
              return (
                <tr key={i} className={isBest ? "best-row" : ""}>
                  <td>
                    <div className="plt-name-cell">
                      <div className="plt-icon">
                        <PlatformLogo name={plt.name} size={22} />
                      </div>
                      <div>
                        <div className="plt-label">
                          {plt.name}
                          {isBest && (
                            <span className="best-deal-tag">Best Deal</span>
                          )}
                        </div>
                        <div className="plt-reviews">
                          {plt.inStock === false
                            ? <span style={{ color:'#e05a4a', fontWeight:600 }}>❌ Out of stock</span>
                            : <span style={{ color:'#1A6B3C', fontWeight:600 }}>✓ In stock</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  {hasRatingData && (
                    <td>
                      <div className="cell-rating">
                        <span className="stars-num">{plt.rating || "—"}</span>
                        {plt.rating && (
                          <div className="stars-bar">
                            <div
                              className="stars-fill"
                              style={{ width: `${(plt.rating / 5) * 100}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                  )}
                  {hasReviewData && (
                    <td>
                      <span style={{ fontWeight: 600 }}>
                        {plt.reviewCount > 0
                          ? plt.reviewCount.toLocaleString()
                          : "—"}
                      </span>
                    </td>
                  )}
                  <td
                    className="cell-price"
                    style={{ color: isBest ? "var(--accent)" : "var(--ink)" }}
                  >
                    {fmt(plt.price)}
                  </td>
                  <td>
                    <span className="tag tag-g" style={{ fontSize: 11 }}>
                      {plt.name === "Amazon" ? "Free" : "Varies"}
                    </span>
                  </td>
                  <td>
                    {plt.inStock === false
                      ? <span style={{
                          fontSize:11, fontWeight:700, color:'#e05a4a',
                          background:'rgba(224,90,74,0.08)', borderRadius:'var(--r)',
                          padding:'4px 10px', display:'inline-block',
                        }}>Out of stock</span>
                      : (plt.affiliateUrl || plt.url)
                        ? <button className="buy-link" onClick={() => onBuy(plt)}>Buy →</button>
                        : <span style={{
                            fontSize:11, fontWeight:600, color:'var(--ink4)',
                            background:'var(--paper3)', borderRadius:'var(--r)',
                            padding:'4px 10px', display:'inline-block',
                          }}>Not available</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink4)" }}>
        Multi-platform comparison coming soon.
      </div>
    </div>
  );
}
