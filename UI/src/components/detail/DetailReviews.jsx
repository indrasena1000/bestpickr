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
  const isSpecBased = p.authenticityBadge === "spec-based";

  // Spec-based: show GPT AI analysis content (no real reviews yet)
  if (
    isSpecBased ||
    (!totalReviews && !avgRating && !hasSentiment && !hasHighlights)
  ) {
    const hasAnalysis =
      p.buyRecommendation ||
      p.whatPeopleLove?.length > 0 ||
      p.commonComplaints?.length > 0;

    if (!hasAnalysis) {
      return (
        <div className="review-section">
          <div className="compare-title">AI Analysis</div>
          <div
            style={{ padding: "16px 0", fontSize: 13, color: "var(--ink4)" }}
          >
            AI analysis is being generated. Check back in a moment.
          </div>
        </div>
      );
    }

    return (
      <div className="review-section">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div className="compare-title" style={{ marginBottom: 0 }}>
            AI Product Analysis
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--accent)",
              background: "color-mix(in srgb, var(--accent) 12%, transparent)",
              borderRadius: 4,
              padding: "2px 8px",
            }}
          >
            SPEC-BASED
          </span>
        </div>

        {p.buyRecommendation && (
          <div
            style={{
              background: "color-mix(in srgb, var(--accent) 8%, var(--paper))",
              border:
                "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 14,
              fontSize: 13.5,
              color: "var(--ink2)",
              lineHeight: 1.6,
            }}
          >
            <span
              style={{
                fontWeight: 700,
                color: "var(--accent)",
                marginRight: 6,
              }}
            >
              Verdict:
            </span>
            {p.buyRecommendation}
          </div>
        )}

        {p.avoidIf && (
          <div
            style={{
              fontSize: 12.5,
              color: "var(--ink4)",
              marginBottom: 14,
              fontStyle: "italic",
            }}
          >
            ⚠ <strong style={{ color: "var(--ink3)" }}>Avoid if:</strong>{" "}
            {p.avoidIf}
          </div>
        )}

        <div className="review-highlights">
          {p.whatPeopleLove?.length > 0 && (
            <div className="rh-box">
              <div className="rh-title">Strengths</div>
              <div className="rh-points">
                {p.whatPeopleLove.slice(0, 4).map((pt, i) => (
                  <div key={i} className="rh-point">
                    {pt}
                  </div>
                ))}
              </div>
            </div>
          )}
          {p.commonComplaints?.length > 0 && (
            <div className="rh-box neg">
              <div className="rh-title">Trade-offs</div>
              <div className="rh-points">
                {p.commonComplaints.slice(0, 3).map((pt, i) => (
                  <div key={i} className="rh-point">
                    {pt}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: "var(--ink4)" }}>
          Analysis generated by AI from product specs and brand knowledge. Real
          customer reviews will be added as they become available.
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
