// components/detail/DetailReviews.jsx
import { PlatformLogo } from "../PlatformLogo.jsx";

function parseBullets(str) {
  if (!str) return [];
  return str
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Compute a real avg rating from platforms when p.avgRating is missing
function computeAvgRating(platforms) {
  const valid = platforms.filter((pl) => pl.rating && pl.reviewCount > 0);
  if (!valid.length) return null;
  const totalWeight = valid.reduce((s, pl) => s + pl.reviewCount, 0);
  const weighted = valid.reduce((s, pl) => s + pl.rating * pl.reviewCount, 0);
  return (weighted / totalWeight).toFixed(1);
}

export default function DetailReviews({ p }) {
  const platforms = p.platforms || [];
  const totalReviews =
    p.totalReviews || platforms.reduce((s, pl) => s + (pl.reviewCount || 0), 0);
  const avgRating = p.avgRating || computeAvgRating(platforms);

  // Only show sentiment when we have a real positivePct from the backend
  const hasSentiment = p.positivePct != null && p.positivePct > 0;
  const positivePct = hasSentiment ? p.positivePct : null;
  const negativePct = hasSentiment
    ? Math.max(0, 100 - positivePct - (p.neutralPct || 10))
    : null;
  const neutralPct = hasSentiment
    ? Math.max(0, 100 - positivePct - negativePct)
    : null;

  const praise = parseBullets(p.praiseSummary);
  const complaints = parseBullets(p.complaintSummary);
  const hasHighlights = praise.length > 0 || complaints.length > 0;

  // Nothing meaningful to show
  if (!totalReviews && !avgRating && !hasSentiment && !hasHighlights) {
    return (
      <div className="review-section">
        <div className="compare-title">Review analysis</div>
        <div style={{ padding: "16px 0", fontSize: 13, color: "var(--ink4)" }}>
          Review data is not yet available for this product. Check back later.
        </div>
      </div>
    );
  }

  return (
    <div className="review-section">
      <div className="compare-title">
        Review analysis
        {totalReviews > 0 &&
          ` — ${totalReviews.toLocaleString()} reviews across all platforms`}
      </div>

      <div className="review-grid">
        {/* Left: big score + per-platform */}
        <div style={{ textAlign: "center" }}>
          {avgRating ? (
            <>
              <div className="review-big-num">{avgRating}</div>
              <div className="review-big-sub">out of 5 · all platforms</div>
              <div className="review-big-stars">
                {"★".repeat(Math.round(avgRating))}
                {"☆".repeat(5 - Math.round(avgRating))}
              </div>
            </>
          ) : (
            <div
              style={{ fontSize: 13, color: "var(--ink4)", padding: "12px 0" }}
            >
              No rating data
            </div>
          )}

          {platforms.some((pl) => pl.rating || pl.reviewCount) && (
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
                  <span
                    style={{
                      color: "var(--ink3)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <PlatformLogo name={plt.name} size={14} /> {plt.name}
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
          )}
        </div>

        {/* Right: sentiment + highlights (only when real data exists) */}
        <div>
          {hasSentiment ? (
            <>
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
            </>
          ) : (
            <div
              style={{ fontSize: 13, color: "var(--ink4)", marginBottom: 12 }}
            >
              Sentiment data not yet available for this product.
            </div>
          )}

          {hasHighlights && (
            <div className="review-highlights">
              {praise.length > 0 && (
                <div className="rh-box">
                  <div className="rh-title">What people love</div>
                  <div className="rh-points">
                    {praise.slice(0, 5).map((pt, i) => (
                      <div key={i} className="rh-point">
                        {pt}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {complaints.length > 0 && (
                <div className="rh-box neg">
                  <div className="rh-title">Common complaints</div>
                  <div className="rh-points">
                    {complaints.slice(0, 4).map((pt, i) => (
                      <div key={i} className="rh-point">
                        {pt}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
