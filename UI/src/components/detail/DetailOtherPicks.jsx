// components/detail/DetailOtherPicks.jsx
const fmt = (n) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : "—");

function getBuyUrl(r) {
  const platforms = r.platforms || [];
  const best = platforms.find((p) => p.url) || platforms[0];
  return best?.url || r.affiliateUrl || r.url || r.productUrl || null;
}

export default function DetailOtherPicks({
  allResults,
  currentName,
  onSelect,
}) {
  const picks = (allResults || [])
    .filter((r) => r.name !== currentName)
    .slice(0, 6);
  if (picks.length === 0) return null;

  return (
    <div
      style={{
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r3)",
        padding: 20,
        marginTop: 16,
      }}
    >
      <div className="compare-title">Other top picks in this search</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {picks.map((r, i) => {
          const buyUrl = getBuyUrl(r);
          return (
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
                #{r.rank || i + 2}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--ink)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink4)" }}>
                  {r.brand} · {fmt(r.lowestPrice || r.price)}
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
                  flexShrink: 0,
                }}
              >
                {r.aiScore}
              </span>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => onSelect?.(r)}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "5px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--line)",
                    background: "var(--paper2)",
                    color: "var(--ink2)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  View details
                </button>
                {buyUrl && (
                  <a
                    href={buyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "5px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: "var(--accent)",
                      color: "#fff",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      textDecoration: "none",
                      display: "inline-block",
                    }}
                  >
                    Buy now ›
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
