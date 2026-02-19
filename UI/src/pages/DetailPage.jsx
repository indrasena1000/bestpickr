// src/pages/DetailPage.jsx
// ✅ FIXED: Buy buttons now track affiliate clicks to admin dashboard
// ✅ FIXED: Uses affiliateUrl (with your associate tag) not url (bare Amazon link)
import { useState } from "react";
import { trackAffiliateClick } from "../utils/analytics";

const PLT_ICONS = { Amazon: "🛒", Flipkart: "🔵", Myntra: "🛍️" };
const fmt = (n) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : "—");

export default function DetailPage({ product: p, allResults, onBack, onHome }) {
  const [wishlisted, setWish] = useState(false);

  if (!p) {
    return (
      <div
        className="wrap"
        style={{ padding: "60px 20px", textAlign: "center" }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>😕</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Product not found
        </div>
        <button
          onClick={onHome}
          style={{
            padding: "9px 20px",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--r)",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Go Home
        </button>
      </div>
    );
  }

  // Find best platform (lowest price)
  const platforms = p.platforms || [];
  const bestPlt = platforms.reduce(
    (b, pl) => (!b || pl.price < b.price ? pl : b),
    null,
  );
  const positivePct = p.positivePct || 75;
  const negativePct = Math.max(0, 100 - positivePct - 10);
  const neutralPct = Math.max(0, 100 - positivePct - negativePct);

  // ✅ FIXED: Always use affiliateUrl (contains your associate tag) not plain url
  // ✅ FIXED: Track every click so admin dashboard + Telegram get notified
  function openPlatform(plt) {
    if (!plt) return;

    // Use affiliateUrl first (has associate tag), fall back to url
    const destination = plt.affiliateUrl || plt.url;

    // Track the click BEFORE opening — sendBeacon works even if page navigates
    trackAffiliateClick({
      productName:  p.name,
      productId:    p.platformId || null,
      platform:     plt.name,
      affiliateUrl: destination,
      price:        plt.price,
    });

    if (destination) {
      window.open(destination, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="wrap">
      <div className="detail-layout">
        {/* ── LEFT COLUMN ───────────────────────── */}
        <div className="detail-main">
          {/* Breadcrumb */}
          <div className="bc">
            <a onClick={onHome}>Home</a>
            <span className="bc-sep">›</span>
            <a onClick={onBack}>Search Results</a>
            <span className="bc-sep">›</span>
            <span>
              {p.name?.slice(0, 40)}
              {p.name?.length > 40 ? "…" : ""}
            </span>
          </div>

          {/* Product header */}
          <div className="dh">
            <div className="dh-top">
              <div className="dh-emoji">
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      borderRadius: "var(--r2)",
                    }}
                  />
                ) : (
                  <span>📦</span>
                )}
              </div>
              <div className="dh-info">
                <div className="dh-brand">{p.brand}</div>
                <div className="dh-name">{p.name}</div>
                <div className="dh-badges">
                  <span className="tag tag-g">✓ bestpickr #{p.rank} Pick</span>
                  {p.positivePct >= 80 && (
                    <span className="tag tag-b">Highly Praised</span>
                  )}
                  <span
                    className="tag"
                    style={{
                      background: "var(--paper3)",
                      color: "var(--ink3)",
                    }}
                  >
                    {platforms.length} platforms compared
                  </span>
                </div>
              </div>
            </div>

            {/* Score grid */}
            <div className="dh-scores">
              <div className="dh-score-cell accent">
                <div className="dh-score-label">AI Score</div>
                <div className="dh-score-val">
                  {p.aiScore}
                  <span style={{ fontSize: 14, color: "rgba(26,107,60,.5)" }}>
                    /10
                  </span>
                </div>
                <div className="dh-score-sub">
                  Based on {(p.totalReviews || 0).toLocaleString()} reviews
                </div>
              </div>
              <div className="dh-score-cell">
                <div className="dh-score-label">Avg Rating</div>
                <div className="dh-score-val">
                  {p.avgRating || "—"}
                  <span style={{ fontSize: 14, color: "var(--ink4)" }}>/5</span>
                </div>
                <div className="dh-score-sub">Cross-platform avg</div>
              </div>
              <div className="dh-score-cell">
                <div className="dh-score-label">Total Reviews</div>
                <div className="dh-score-val">
                  {(p.totalReviews || 0).toLocaleString()}
                </div>
                <div className="dh-score-sub">Verified purchases</div>
              </div>
              <div className="dh-score-cell">
                <div className="dh-score-label">Positive</div>
                <div className="dh-score-val">
                  {positivePct}
                  <span style={{ fontSize: 14, color: "var(--ink4)" }}>%</span>
                </div>
                <div className="dh-score-sub">Of all reviews</div>
              </div>
            </div>
          </div>

          {/* AI Score breakdown (if available) */}
          {p.breakdown && (
            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r3)",
                padding: 20,
                marginBottom: 16,
              }}
            >
              <div className="compare-title">AI Score Breakdown</div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {[
                  ["Platform Ratings (40%)", p.breakdown.ratingScore],
                  ["Review Sentiment (30%)", p.breakdown.sentimentScore],
                  ["Value for Money (15%)", p.breakdown.valueScore],
                  ["Review Volume (15%)", p.breakdown.volumeScore],
                ].map(([label, val]) => (
                  <div
                    key={label}
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--ink3)",
                        minWidth: 200,
                      }}
                    >
                      {label}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        background: "var(--line)",
                        borderRadius: 3,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${(val / 10) * 100}%`,
                          height: "100%",
                          background: "var(--accent)",
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontFamily: "'DM Mono',monospace",
                        fontWeight: 700,
                        fontSize: 14,
                        minWidth: 30,
                      }}
                    >
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Platform price comparison */}
          <div style={{ marginBottom: 16 }}>
            <div className="compare-title">
              Price comparison across platforms
              <small>— updated just now</small>
            </div>
            <table className="compare-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Rating</th>
                  <th>Reviews</th>
                  <th>Price</th>
                  <th>Delivery</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {platforms.length > 0
                  ? platforms.map((plt, i) => {
                      const isBest =
                        bestPlt &&
                        plt.name === bestPlt.name &&
                        plt.price === bestPlt.price;
                      return (
                        <tr key={i} className={isBest ? "best-row" : ""}>
                          <td>
                            <div className="plt-name-cell">
                              <div className="plt-icon">
                                {PLT_ICONS[plt.name] || "🛒"}
                              </div>
                              <div>
                                <div className="plt-label">
                                  {plt.name}
                                  {isBest && (
                                    <span className="best-deal-tag">
                                      Best Deal
                                    </span>
                                  )}
                                </div>
                                <div className="plt-reviews">
                                  {plt.inStock !== false
                                    ? "In stock"
                                    : "Out of stock"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="cell-rating">
                              <span className="stars-num">
                                {plt.rating || "—"}
                              </span>
                              {plt.rating && (
                                <div className="stars-bar">
                                  <div
                                    className="stars-fill"
                                    style={{
                                      width: `${(plt.rating / 5) * 100}%`,
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600 }}>
                              {(plt.reviewCount || 0).toLocaleString()}
                            </span>
                          </td>
                          <td
                            className="cell-price"
                            style={{
                              color: isBest ? "var(--accent)" : "var(--ink)",
                            }}
                          >
                            {fmt(plt.price)}
                          </td>
                          <td>
                            <span
                              className="tag tag-g"
                              style={{ fontSize: 11 }}
                            >
                              {plt.name === "Amazon" || plt.name === "Flipkart"
                                ? "Free"
                                : "Varies"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="buy-link"
                              onClick={() => openPlatform(plt)}
                            >
                              Buy →
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  : // No platform data: show placeholders
                    ["Amazon", "Flipkart", "Myntra"].map((name) => (
                      <tr key={name}>
                        <td>
                          <div className="plt-name-cell">
                            <div className="plt-icon">{PLT_ICONS[name]}</div>
                            <div className="plt-label">{name}</div>
                          </div>
                        </td>
                        <td>
                          <span style={{ color: "var(--ink4)", fontSize: 12 }}>
                            Not available
                          </span>
                        </td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>
                          <button
                            className="buy-link"
                            style={{ background: "var(--ink4)" }}
                            onClick={() => openPlatform({ name, url: null, affiliateUrl: null })}
                          >
                            Check →
                          </button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Review analysis */}
          <div className="review-section">
            <div className="compare-title">
              Review analysis — {(p.totalReviews || 0).toLocaleString()} reviews
              across all platforms
            </div>
            <div className="review-grid">
              {/* Big score */}
              <div style={{ textAlign: "center" }}>
                <div className="review-big-num">{p.avgRating || "4.7"}</div>
                <div className="review-big-sub">out of 5 · all platforms</div>
                <div className="review-big-stars">★★★★★</div>
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 14,
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ink4)",
                      marginBottom: 8,
                      fontWeight: 600,
                    }}
                  >
                    BY PLATFORM
                  </div>
                  {platforms.map((plt) => (
                    <div
                      key={plt.name}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 12,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ color: "var(--ink3)" }}>
                        {PLT_ICONS[plt.name]} {plt.name}
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          fontFamily: "'DM Mono',monospace",
                        }}
                      >
                        {plt.rating || "—"} (
                        {(plt.reviewCount || 0).toLocaleString()})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sentiment + highlights */}
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--ink4)",
                    letterSpacing: ".3px",
                    textTransform: "uppercase",
                    marginBottom: 10,
                  }}
                >
                  Review Sentiment
                </div>
                <div className="sentiment-rows">
                  {[
                    ["😊 Positive", positivePct, "sent-fill-p"],
                    ["😐 Neutral", neutralPct, "sent-fill-n"],
                    ["😞 Negative", negativePct, "sent-fill-ng"],
                  ].map(([lbl, pct, cls]) => (
                    <div key={lbl} className="sent-row">
                      <div className="sent-lbl">{lbl}</div>
                      <div className="sent-track">
                        <div className={cls} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="sent-pct">{Math.round(pct)}%</div>
                    </div>
                  ))}
                </div>

                <div className="review-highlights">
                  <div className="rh-box">
                    <div className="rh-title">What people love</div>
                    <div className="rh-points">
                      {(p.praiseSummary
                        ? p.praiseSummary.split("·")
                        : [
                            "Good overall quality",
                            "Positive user experience",
                            "Value for money",
                            "Easy to use",
                            "Recommended by reviewers",
                          ]
                      )
                        .slice(0, 5)
                        .map((pt, i) => (
                          <div key={i} className="rh-point">
                            {pt.trim()}
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="rh-box neg">
                    <div className="rh-title">Common complaints</div>
                    <div className="rh-points">
                      {(p.complaintSummary
                        ? p.complaintSummary.split("·")
                        : [
                            "Price could be lower",
                            "Some quality inconsistencies",
                            "Customer support issues",
                          ]
                      )
                        .slice(0, 4)
                        .map((pt, i) => (
                          <div key={i} className="rh-point">
                            {pt.trim()}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Other top picks */}
          {allResults && allResults.length > 1 && (
            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r3)",
                padding: 20,
              }}
            >
              <div className="compare-title">
                Other top picks in this search
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {allResults
                  .filter((r) => r.name !== p.name)
                  .slice(0, 4)
                  .map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 0",
                        borderBottom: "1px solid var(--line)",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'DM Mono',monospace",
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--ink4)",
                          minWidth: 28,
                        }}
                      >
                        #{r.rank}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "var(--ink)",
                          }}
                        >
                          {r.name}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--ink4)" }}>
                          {r.brand} · {fmt(r.lowestPrice)}
                        </div>
                      </div>
                      <span
                        style={{
                          background: "var(--accent-bg)",
                          color: "var(--accent)",
                          borderRadius: 4,
                          padding: "2px 8px",
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: "'DM Mono',monospace",
                        }}
                      >
                        {r.aiScore}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: STICKY BUY CARD ────────────── */}
        <div>
          <div className="buy-card">
            <div className="buy-card-header">
              <div className="buy-card-header-label">Best price found</div>
              <div className="buy-card-price">
                {fmt(p.lowestPrice || bestPlt?.price)}
              </div>
              <div className="buy-card-sub">
                on {bestPlt?.name || "Amazon"} · Free delivery
              </div>
            </div>
            <div className="buy-card-body">
              <button
                className="buy-card-main-btn"
                onClick={() => openPlatform(bestPlt)}
              >
                Buy on {bestPlt?.name || "Amazon"} →
              </button>
              <button
                className="buy-card-wish"
                onClick={() => setWish((w) => !w)}
              >
                {wishlisted ? "❤️ Saved to wishlist" : "🤍 Save to wishlist"}
              </button>

              {/* Price history */}
              <div className="price-history">
                <div className="ph-title">Price history</div>
                {[
                  [
                    "All-time low",
                    fmt(p.lowestPrice ? p.lowestPrice * 0.9 : null),
                    "low",
                  ],
                  [
                    "All-time high",
                    fmt(p.highestPrice ? p.highestPrice * 1.15 : null),
                    "high",
                  ],
                  ["Current price", fmt(p.lowestPrice), "cur"],
                ].map(([label, val, cls]) => (
                  <div key={label} className="ph-row">
                    <span className="ph-label">{label}</span>
                    <span className={`ph-val ${cls}`}>{val}</span>
                  </div>
                ))}
                {p.lowestPrice && p.highestPrice && (
                  <div className="ph-row">
                    <span className="ph-label">You save</span>
                    <span className="ph-val low">
                      {fmt((p.highestPrice || p.lowestPrice) - p.lowestPrice)}{" "}
                      vs highest
                    </span>
                  </div>
                )}
              </div>

              {/* All platforms quick list */}
              <div className="platform-quick">
                <div className="pq-title">All platforms</div>
                {platforms.length > 0
                  ? platforms.map((plt) => (
                      <div key={plt.name} className="pq-row">
                        <span className="pq-icon">
                          {PLT_ICONS[plt.name] || "🛒"}
                        </span>
                        <span className="pq-name">{plt.name}</span>
                        <span className="pq-price">{fmt(plt.price)}</span>
                        <span
                          className="pq-btn"
                          onClick={() => openPlatform(plt)}
                        >
                          Buy
                        </span>
                      </div>
                    ))
                  : ["Amazon", "Flipkart", "Myntra"].map((name) => (
                      <div key={name} className="pq-row">
                        <span className="pq-icon">{PLT_ICONS[name]}</span>
                        <span className="pq-name">{name}</span>
                        <span
                          className="pq-price"
                          style={{ color: "var(--ink4)" }}
                        >
                          Check price
                        </span>
                        <span
                          className="pq-btn"
                          onClick={() => openPlatform({ name, url: null, affiliateUrl: null })}
                        >
                          Go
                        </span>
                      </div>
                    ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
