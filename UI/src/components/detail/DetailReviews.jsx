// components/detail/DetailReviews.jsx
import { useState, useEffect } from "react";
import { PlatformLogo } from "../PlatformLogo.jsx";
import { triggerAnalysis } from "../../services/api.js";

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

// ── SVG Circular Rating Ring ──────────────────────────────────────
function RatingRing({ value, max = 5 }) {
  const pct = Math.min(1, Math.max(0, value / max));
  const r = 46;
  const stroke = 7;
  const cx = 56;
  const circ = 2 * Math.PI * r;
  // start at top (−90°), go clockwise
  const dash = circ * pct;
  const color = pct >= 0.8 ? "#1a6b3c" : pct >= 0.6 ? "#d97706" : "#c84b11";
  return (
    <svg
      width={cx * 2}
      height={cx * 2}
      viewBox={`0 0 ${cx * 2} ${cx * 2}`}
      style={{ display: "block" }}
    >
      {/* track */}
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke="#e8e8e5"
        strokeWidth={stroke}
      />
      {/* fill */}
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      {/* number */}
      <text
        x={cx}
        y={cx - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fontFamily: "'DM Mono',monospace",
          fontWeight: 700,
          fontSize: 26,
          fill: "#1a1a1a",
        }}
      >
        {value}
      </text>
      <text
        x={cx}
        y={cx + 17}
        textAnchor="middle"
        style={{
          fontFamily: "'DM Sans',sans-serif",
          fontSize: 11,
          fill: "#aaa",
        }}
      >
        out of {max}
      </text>
    </svg>
  );
}

// ── Creative spinner shown while AI analysis is being generated ──────
const ANALYSIS_STEPS = [
  "Reading product specs",
  "Evaluating performance",
  "Checking value for money",
  "Scoring quality metrics",
  "Compiling AI insights",
];

function AnalysisSpinner() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setStep((s) => (s + 1) % ANALYSIS_STEPS.length);
        setVisible(true);
      }, 300);
    }, 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="dr-ai-card">
      <div className="dr-ai-header">
        <span className="dr-ai-badge">⚡ AI ANALYSIS</span>
      </div>
      <div className="dr-spinner-body">
        {/* Pulsing orb */}
        <div className="dr-orb-wrap">
          <div className="dr-orb-ring dr-orb-ring1" />
          <div className="dr-orb-ring dr-orb-ring2" />
          <div className="dr-orb-ring dr-orb-ring3" />
          <div className="dr-orb-core">🧠</div>
        </div>

        {/* Step text */}
        <div className="dr-step-text" style={{ opacity: visible ? 1 : 0 }}>
          {ANALYSIS_STEPS[step]}
          <span className="dr-dots">...</span>
        </div>
        <div className="dr-spinner-sub">
          Generating personalised AI insights
        </div>

        {/* Shimmer bar */}
        <div className="dr-shimmer-track">
          <div className="dr-shimmer-fill" />
        </div>

        {/* Step pills */}
        <div className="dr-steps-row">
          {ANALYSIS_STEPS.map((s, i) => (
            <div
              key={i}
              className={`dr-step-dot ${i === step ? "active" : i < step ? "done" : ""}`}
            />
          ))}
        </div>
      </div>
      <style>{`
        .dr-orb-wrap { position:relative; width:72px; height:72px; flex-shrink:0 }
        .dr-orb-ring { position:absolute; border-radius:50%; border:2px solid transparent }
        .dr-orb-ring1 { inset:0; border-top-color:var(--accent); animation:dr-spin 1.1s linear infinite }
        .dr-orb-ring2 { inset:8px; border-right-color:color-mix(in srgb,var(--accent) 55%,transparent); animation:dr-spin 1.7s linear infinite reverse }
        .dr-orb-ring3 { inset:16px; border-bottom-color:color-mix(in srgb,var(--accent) 30%,transparent); animation:dr-spin 2.3s linear infinite }
        .dr-orb-core { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:24px; animation:dr-pulse 2s ease-in-out infinite }
        @keyframes dr-spin { to { transform:rotate(360deg) } }
        @keyframes dr-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.12)} }
        .dr-step-text { font-size:14px; font-weight:700; color:var(--ink); transition:opacity .28s ease; letter-spacing:-.1px }
        .dr-dots { display:inline-block; overflow:hidden; width:1.4em; animation:dr-dots 1.4s steps(4,end) infinite; vertical-align:bottom }
        @keyframes dr-dots { 0%,25%{width:0} 50%{width:.5em} 75%{width:.9em} 100%{width:1.4em} }
        .dr-spinner-sub { font-size:12px; color:var(--ink4); margin-top:-4px }
        .dr-shimmer-track { width:200px; height:3px; background:var(--line); border-radius:99px; overflow:hidden }
        .dr-shimmer-fill { height:100%; width:45%; background:linear-gradient(90deg,var(--accent-bg),var(--accent),var(--accent-bg)); background-size:200%; border-radius:99px; animation:dr-scan 2s ease-in-out infinite }
        @keyframes dr-scan { 0%{transform:translateX(-220%)} 100%{transform:translateX(520%)} }
        .dr-steps-row { display:flex; gap:6px; align-items:center }
        .dr-step-dot { width:8px; height:8px; border-radius:50%; background:var(--line); transition:all .3s ease }
        .dr-step-dot.active { background:var(--accent); transform:scale(1.3) }
        .dr-step-dot.done { background:color-mix(in srgb,var(--accent) 40%,transparent) }
      `}</style>
    </div>
  );
}

// ── Shared AI analysis content block ─────────────────────────────
function AIAnalysisBlock({ src, isSpecBased }) {
  const loves = src.whatPeopleLove || [];
  const complaints = src.commonComplaints || [];
  return (
    <div className="dr-ai-card">
      <div className="dr-ai-header">
        <span className="dr-ai-badge">⚡ AI ANALYSIS</span>
        {isSpecBased && <span className="dr-spec-chip">SPEC-BASED</span>}
      </div>

      {src.buyRecommendation && (
        <div className="dr-verdict-box">
          <div className="dr-verdict-label">Verdict</div>
          <div className="dr-verdict-text">{src.buyRecommendation}</div>
        </div>
      )}

      {src.avoidIf && (
        <div className="dr-avoidif">
          <span className="dr-avoidif-icon">⚠</span>
          <div>
            <strong>Avoid if:</strong> {src.avoidIf}
          </div>
        </div>
      )}

      {(loves.length > 0 || complaints.length > 0) && (
        <div className="dr-insights-grid">
          {loves.length > 0 && (
            <div className="dr-insight-col dr-insight-pos">
              <div className="dr-insight-head">
                <span className="dr-insight-icon">✦</span> Strengths
              </div>
              <ul className="dr-insight-list">
                {loves.slice(0, 4).map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            </div>
          )}
          {complaints.length > 0 && (
            <div className="dr-insight-col dr-insight-neg">
              <div className="dr-insight-head">
                <span className="dr-insight-icon">◆</span> Trade-offs
              </div>
              <ul className="dr-insight-list">
                {complaints.slice(0, 4).map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {isSpecBased && (
        <div className="dr-spec-note">
          AI-generated from product specs · customer reviews added as available
        </div>
      )}
    </div>
  );
}

export default function DetailReviews({ p }) {
  // ── Derive a stable cache key from ASIN / platformId / id ────────
  const productKey = p?.asin || p?.platformId || p?.id || null;

  // ── Seed state from sessionStorage so repeat visits skip the spinner ──
  const [analysisData, setAnalysisData] = useState(() => {
    if (!productKey) return null;
    try {
      const raw = sessionStorage.getItem(`bp_analysis:${productKey}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [analysisError, setAnalysisError] = useState(false);

  const platforms = p.platforms || [];
  const totalReviews =
    p.totalReviews || platforms.reduce((s, pl) => s + (pl.reviewCount || 0), 0);
  const avgRating = p.avgRating || computeAvgRating(platforms);

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

  const src = analysisData ? { ...p, ...analysisData } : p;
  const hasAnalysis = !!(
    src.buyRecommendation ||
    src.whatPeopleLove?.length > 0 ||
    src.commonComplaints?.length > 0
  );

  const needsAnalysis = !hasAnalysis;

  useEffect(() => {
    if (!needsAnalysis || !productKey || analysisError) return;

    let cancelled = false;
    let attempt = 0;
    const MAX_ATTEMPTS = 5;

    async function poll() {
      if (cancelled || attempt >= MAX_ATTEMPTS) {
        if (!cancelled) setAnalysisError(true);
        return;
      }
      attempt++;
      try {
        const data = await triggerAnalysis(productKey, p);
        if (!cancelled && data?.success && data?.analysis?.buyRecommendation) {
          try {
            sessionStorage.setItem(
              `bp_analysis:${productKey}`,
              JSON.stringify(data.analysis),
            );
          } catch (_) {}
          setAnalysisData(data.analysis);
          return;
        }
      } catch (_) {}
      if (!cancelled) setTimeout(poll, 8000);
    }

    const timer = setTimeout(poll, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [productKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Spec-only product (no real ratings/reviews) ───────────────
  const isReviewless =
    isSpecBased ||
    (!totalReviews && !avgRating && !hasSentiment && !hasHighlights);

  if (isReviewless) {
    if (!hasAnalysis) {
      if (analysisError) {
        return (
          <div className="dr-ai-card">
            <div className="dr-ai-header">
              <span className="dr-ai-badge">⚡ AI ANALYSIS</span>
            </div>
            <div className="dr-error-state">
              <span style={{ fontSize: 28 }}>🤔</span>
              <div>Analysis could not be generated right now.</div>
              <button
                className="dr-retry-btn"
                onClick={() => setAnalysisError(false)}
              >
                Try again
              </button>
            </div>
          </div>
        );
      }
      return <AnalysisSpinner />;
    }
    return <AIAnalysisBlock src={src} isSpecBased />;
  }

  // ── Product with real reviews ─────────────────────────────────
  return (
    <div className="dr-reviews-wrap">
      {/* ── Section title ── */}
      <div className="dr-section-title">
        <span>Review Analysis</span>
        {totalReviews > 0 && (
          <span className="dr-review-count">
            {totalReviews.toLocaleString()} reviews
          </span>
        )}
      </div>

      {/* ── Rating + Sentiment row ── */}
      <div className="dr-top-row">
        {/* Rating ring */}
        <div className="dr-rating-col">
          {avgRating ? (
            <>
              <RatingRing value={avgRating} />
              <div className="dr-stars-row">
                {[1, 2, 3, 4, 5].map((n) => (
                  <svg key={n} width="14" height="14" viewBox="0 0 24 24">
                    <polygon
                      points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
                      fill={n <= Math.round(avgRating) ? "#f59e0b" : "#e8e8e5"}
                      stroke="none"
                    />
                  </svg>
                ))}
              </div>
              {platforms.some((pl) => pl.rating || pl.reviewCount) && (
                <div className="dr-platform-list">
                  {platforms.map((plt) => (
                    <div key={plt.name} className="dr-plt-row">
                      <span className="dr-plt-name">
                        <PlatformLogo name={plt.name} size={13} />
                        {plt.name}
                      </span>
                      <span className="dr-plt-val">
                        {plt.rating ? (
                          <>
                            <span className="dr-plt-star">★</span> {plt.rating}
                            {plt.reviewCount > 0 && (
                              <span className="dr-plt-count">
                                ({plt.reviewCount.toLocaleString()})
                              </span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="dr-no-rating">No rating data yet</div>
          )}
        </div>

        {/* Sentiment + highlights */}
        <div className="dr-right-col">
          {hasSentiment ? (
            <div className="dr-sentiment-wrap">
              <div className="dr-col-label">Buyer Sentiment</div>
              {[
                {
                  label: "Positive",
                  pct: positivePct,
                  color: "var(--accent)",
                  icon: "😊",
                },
                {
                  label: "Neutral",
                  pct: neutralPct,
                  color: "#9ca3af",
                  icon: "😐",
                },
                {
                  label: "Critical",
                  pct: negativePct,
                  color: "var(--accent2)",
                  icon: "😞",
                },
              ].map(({ label, pct, color, icon }) => (
                <div key={label} className="dr-sent-row">
                  <div className="dr-sent-lbl">
                    {icon} {label}
                  </div>
                  <div className="dr-sent-track">
                    <div
                      className="dr-sent-fill"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <div className="dr-sent-pct" style={{ color }}>
                    {Math.round(pct)}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="dr-no-sentiment">
              <span style={{ fontSize: 24 }}>📊</span>
              <span>Sentiment analysis not yet available</span>
            </div>
          )}

          {hasHighlights && (
            <div className="dr-highlights-grid">
              {praise.length > 0 && (
                <div className="dr-hl-col dr-hl-pos">
                  <div className="dr-hl-title">✦ Loved</div>
                  {praise.slice(0, 4).map((pt, i) => (
                    <div key={i} className="dr-hl-item">
                      {pt}
                    </div>
                  ))}
                </div>
              )}
              {complaints.length > 0 && (
                <div className="dr-hl-col dr-hl-neg">
                  <div className="dr-hl-title">◆ Issues</div>
                  {complaints.slice(0, 4).map((pt, i) => (
                    <div key={i} className="dr-hl-item">
                      {pt}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── AI Verdict (below review data) ── */}
      {hasAnalysis && <AIAnalysisBlock src={src} isSpecBased={false} />}

      {/* Subtle loading hint while GPT runs in background */}
      {!hasAnalysis && !analysisError && productKey && (
        <div className="dr-ai-pending">
          <span className="dr-ai-pending-dot" />
          <span
            className="dr-ai-pending-dot"
            style={{ animationDelay: ".2s" }}
          />
          <span
            className="dr-ai-pending-dot"
            style={{ animationDelay: ".4s" }}
          />
          Generating AI verdict
        </div>
      )}
    </div>
  );
}
