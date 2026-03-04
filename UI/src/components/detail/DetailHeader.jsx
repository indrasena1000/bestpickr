// components/detail/DetailHeader.jsx
import { useState } from "react";

export default function DetailHeader({ p }) {
  const [imgError, setImgError] = useState(false);
  const platforms = p.platforms || [];
  const hasRealPositivePct =
    p.positivePct != null &&
    p.positivePct > 0 &&
    p.authenticityBadge !== "spec-based";
  const hasRealReviews = p.totalReviews > 0;
  // Fallback: use first platform's rating if top-level avgRating is missing
  const displayRating = p.avgRating ?? platforms[0]?.rating ?? null;
  const hasRealRating = displayRating != null && displayRating > 0;

  return (
    <div className="dh">
      <div className="dh-top">
        {/* Product image */}
        <div className="dh-emoji">
          {p.imageUrl && !imgError ? (
            <img
              src={p.imageUrl}
              alt={p.name}
              onError={() => setImgError(true)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                borderRadius: "var(--r2)",
                display: "block",
              }}
            />
          ) : (
            <span>📦</span>
          )}
        </div>

        {/* Name + badges */}
        <div className="dh-info">
          <div className="dh-brand">{p.brand}</div>
          <div className="dh-name">{p.name}</div>
          <div className="dh-badges">
            <span className="tag tag-g">✓ bestpickr™ #{p.rank} Pick</span>
            {hasRealPositivePct && p.positivePct >= 80 && (
              <span className="tag tag-b">Highly Praised</span>
            )}
            <span
              className="tag"
              style={{ background: "var(--paper3)", color: "var(--ink3)" }}
            >
              Currently comparing Amazon pricing
            </span>
          </div>
        </div>
      </div>

      {/* Score grid */}
      <div className="dh-scores">
        <div className="dh-score-cell accent">
          <div className="dh-score-label">AI Score</div>
          <div className="dh-score-val">
            {p.aiScore != null ? p.aiScore : "—"}
            <span style={{ fontSize: 14, color: "rgba(26,107,60,.5)" }}>
              /10
            </span>
          </div>
          <div className="dh-score-sub">
            {p.authenticityBadge === "spec-based"
              ? "AI spec analysis"
              : hasRealReviews
                ? `Based on ${p.totalReviews.toLocaleString()} reviews`
                : "Analysed by AI"}
          </div>
        </div>
        <div className="dh-score-cell">
          <div className="dh-score-label">Avg Rating</div>
          <div className="dh-score-val">
            {hasRealRating ? displayRating : "—"}
            <span style={{ fontSize: 14, color: "var(--ink4)" }}>/5</span>
          </div>
          <div className="dh-score-sub">
            {hasRealRating ? "Amazon rating" : "Not yet rated"}
          </div>
        </div>
        {hasRealReviews && (
          <div className="dh-score-cell">
            <div className="dh-score-label">Total Reviews</div>
            <div className="dh-score-val">
              {p.totalReviews.toLocaleString()}
            </div>
            <div className="dh-score-sub">Verified purchases</div>
          </div>
        )}
        {hasRealPositivePct && (
          <div className="dh-score-cell">
            <div className="dh-score-label">Positive</div>
            <div className="dh-score-val">
              {p.positivePct}
              <span style={{ fontSize: 14, color: "var(--ink4)" }}>%</span>
            </div>
            <div className="dh-score-sub">Of all reviews</div>
          </div>
        )}
        {!hasRealReviews && (
          <div className="dh-score-cell">
            <div className="dh-score-label">Analysis</div>
            <div className="dh-score-val" style={{ fontSize: 16 }}>
              AI
            </div>
            <div className="dh-score-sub">Spec-based</div>
          </div>
        )}
      </div>
    </div>
  );
}
