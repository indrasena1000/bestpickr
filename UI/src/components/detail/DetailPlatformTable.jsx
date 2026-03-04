// components/detail/DetailPlatformTable.jsx
import { PlatformLogo } from "../PlatformLogo.jsx";

const fmt = (n) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : "—");

export default function DetailPlatformTable({ platforms, bestPlt, onBuy }) {
  const hasRatingData  = platforms.some(p => p.rating  && p.rating > 0);
  const hasReviewData  = platforms.some(p => p.reviewCount && p.reviewCount > 0);

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
                          {plt.inStock !== false ? "In stock" : "Out of stock"}
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
                    <button className="buy-link" onClick={() => onBuy(plt)}>
                      Buy →
                    </button>
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
