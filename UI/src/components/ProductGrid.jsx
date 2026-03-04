// src/components/ProductGrid.jsx
// 10-card grid for CATEGORY / BRAND_CATEGORY / GENERIC intents
import { PlatformPill } from "./PlatformLogo.jsx";

const fmt = (n) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : null);

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
  const price = fmt(item.price || item.lowestPrice);

  return (
    <div className="pgrid-card" onClick={() => onSelect?.(item)}>
      {/* ── TOP ROW: rank + image + name block + score badge ── */}
      <div className="pgrid-top">
        {/* Rank */}
        <span
          className="pgrid-rank"
          style={{ color: rank <= 3 ? "var(--accent)" : "var(--ink4)" }}
        >
          #{rank}
        </span>

        {/* Image */}
        <div className="pgrid-img">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <span style={{ fontSize: 20 }}>📦</span>
          )}
        </div>

        {/* Name + brand + price */}
        <div className="pgrid-info">
          {item.brand && <div className="pgrid-brand">{item.brand}</div>}
          <div className="pgrid-name">{item.name}</div>
          {price && <div className="pgrid-price">{price}</div>}
        </div>

        {/* Score badge — top right */}
        {item.aiScore != null && (
          <div className="pgrid-score">
            <div className="pgrid-score-val">{item.aiScore}</div>
            <div className="pgrid-score-lbl">AI</div>
          </div>
        )}
      </div>

      {/* ── BOTTOM ROW: platform pills + action buttons ── */}
      <div className="pgrid-bottom">
        {/* Platform pills */}
        <div className="pgrid-platforms">
          {platforms.slice(0, 3).map((plt) => (
            <PlatformPill key={plt.name} name={plt.name} />
          ))}
        </div>

        {/* Action buttons */}
        <div className="pgrid-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="pgrid-btn-details"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(item);
            }}
          >
            View details
          </button>
          {buyUrl && (
            <a
              href={buyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pgrid-btn-buy"
              onClick={(e) => e.stopPropagation()}
            >
              View price ›
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
