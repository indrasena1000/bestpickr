// src/components/ProductGrid.jsx
// 10-card grid for CATEGORY / BRAND_CATEGORY / GENERIC intents
import { PlatformPill } from "./PlatformLogo.jsx";

const fmt = (n) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : null);

// Picks the best buy URL from platform list or fallback fields
function getBuyUrl(item) {
  const platforms = item.platforms || [];
  const best = platforms.find((p) => p.url) || platforms[0];
  return best?.url || item.affiliateUrl || item.url || item.productUrl || null;
}

export default function ProductGrid({ items = [], onSelect, title }) {
  if (!items || items.length === 0) return null;

  return (
    <div>
      {title && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--ink4)",
            letterSpacing: ".4px",
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          {title}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.slice(0, 10).map((item, i) => (
          <ProductRow
            key={item.id || i}
            item={item}
            rank={i + 1}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function ProductRow({ item, rank, onSelect }) {
  const platforms = item.platforms || [];
  const buyUrl = getBuyUrl(item);

  return (
    <div
      className="rcard"
      style={{
        padding: "14px 16px",
        cursor: "pointer",
        display: "flex",
        gap: 14,
        alignItems: "center",
      }}
      onClick={() => onSelect?.(item)}
    >
      {/* Rank */}
      <span
        style={{
          fontFamily: "'DM Mono',monospace",
          fontWeight: 700,
          fontSize: 13,
          color: rank <= 3 ? "var(--accent)" : "var(--ink4)",
          minWidth: 24,
          flexShrink: 0,
        }}
      >
        #{rank}
      </span>

      {/* Image */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 8,
          background: "var(--paper3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <span style={{ fontSize: 22 }}>📦</span>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--ink4)", marginBottom: 1 }}>
          {item.brand}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.name}
        </div>

        {platforms.length > 0 && (
          <div
            style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}
          >
            {platforms.slice(0, 3).map((plt) => (
              <PlatformPill key={plt.name} name={plt.name} />
            ))}
          </div>
        )}
      </div>

      {/* Price + Score + Actions */}
      <div
        style={{
          textAlign: "right",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "var(--accent)",
            fontFamily: "'DM Mono',monospace",
          }}
        >
          {fmt(item.price || item.lowestPrice) || "—"}
        </div>
        {item.aiScore != null && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--ink4)",
              fontFamily: "'DM Mono',monospace",
            }}
          >
            {item.aiScore}/10
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          {/* View Details — opens the in-app product detail view */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(item);
            }}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "4px 10px",
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
          {/* Buy Now — opens the best available store URL in a new tab */}
          {buyUrl && (
            <a
              href={buyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 10px",
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
    </div>
  );
}
