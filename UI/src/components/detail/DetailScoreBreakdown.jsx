// components/detail/DetailScoreBreakdown.jsx
const ROWS_REVIEW = [
  ["Platform Ratings (40%)", "ratingScore"],
  ["Review Sentiment (30%)", "sentimentScore"],
  ["Value for Money (15%)", "valueScore"],
  ["Review Volume (15%)", "volumeScore"],
];

const ROWS_SPEC = [
  ["Product Quality (40%)", "ratingScore"],
  ["AI Sentiment (30%)", "sentimentScore"],
  ["Value for Money (15%)", "valueScore"],
  ["Review Volume (15%)", "volumeScore"],
];

export default function DetailScoreBreakdown({ breakdown, authenticityBadge }) {
  if (!breakdown) return null;

  const isSpec = authenticityBadge === "spec-based";
  const ROWS = isSpec ? ROWS_SPEC : ROWS_REVIEW;

  return (
    <div
      style={{
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r3)",
        padding: 20,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div className="compare-title" style={{ marginBottom: 0 }}>
          AI Score Breakdown
        </div>
        {isSpec && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--accent)",
              background: "color-mix(in srgb, var(--accent) 12%, transparent)",
              borderRadius: 4,
              padding: "2px 8px",
              letterSpacing: ".3px",
            }}
          >
            AI SPEC ANALYSIS
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ROWS.map(([label, key]) => (
          <div
            key={key}
            style={{ display: "flex", alignItems: "center", gap: 12 }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ink3)",
                minWidth: "clamp(120px, 30%, 200px)",
                flexShrink: 0,
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
                  width: `${((breakdown[key] || 0) / 10) * 100}%`,
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
              {breakdown[key] || 0}
            </span>
          </div>
        ))}
      </div>
      {isSpec && (
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "var(--ink4)",
            borderTop: "1px solid var(--line)",
            paddingTop: 10,
          }}
        >
          Score based on AI analysis of product specs, brand, and price — will
          update with real reviews when available.
        </div>
      )}
    </div>
  );
}
