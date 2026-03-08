// src/pages/TopListsPage.jsx
// "Top Lists" page — shows best picks from every category
// Uses the same /api/products/top-india + /api/products/category/:slug APIs
// as the Homepage, so zero new backend work needed.

import { useState, useEffect } from "react";
import {
  getTopIndiaProducts,
  getCategoryProducts,
  getCategories,
} from "../services/api.js";

const CAT_EMOJI = {
  mobile: "📱",
  laptop: "💻",
  headphones: "🎧",
  smartwatch: "⌚",
  camera: "📷",
  gaming: "🎮",
  appliances: "🍳",
  televisions: "📺",
  footwear: "👟",
  skincare: "✨",
  fashion: "👗",
  books: "📚",
  bags: "👜",
};

// Module-level caches (survive SPA nav, cleared on full refresh)
let _topIndiaCache = null;
let _topIndiaCacheTs = 0;
let _catsCache = null;
const _catProdsCache = new Map();
const TTL_MS = 6 * 60 * 60 * 1000;

function getFreshTopIndia() {
  if (!_topIndiaCache) return null;
  if (Date.now() - _topIndiaCacheTs > TTL_MS) {
    _topIndiaCache = null;
    return null;
  }
  return _topIndiaCache;
}

// ── Shimmer card ─────────────────────────────────────────────────
function Shimmer({ height = 220, minWidth }) {
  return (
    <div
      style={{
        height,
        minWidth,
        flexShrink: 0,
        borderRadius: "var(--r3)",
        background:
          "linear-gradient(90deg,var(--paper3) 25%,var(--line) 50%,var(--paper3) 75%)",
        backgroundSize: "200% 100%",
        animation: "bpShimmer 1.4s infinite",
      }}
    />
  );
}

// ── Single product card used in category rails ───────────────────
function ProductCard({ p, rank, onViewProduct, allResults }) {
  const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };
  const RANK_STYLE = {
    1: { border: "#F5C518", badge: "#FFF8DC", badgeText: "#7A5200" },
    2: { border: "#B0B3B8", badge: "#F4F4F4", badgeText: "#444" },
    3: { border: "#CD7F32", badge: "#FDF0E0", badgeText: "#6B3A00" },
  };
  const rs = RANK_STYLE[rank] || {
    border: "var(--line)",
    badge: "var(--paper2)",
    badgeText: "var(--ink3)",
  };

  return (
    <div
      onClick={() => onViewProduct(p, allResults)}
      style={{
        minWidth: 200,
        maxWidth: 200,
        background: "var(--paper)",
        borderRadius: "var(--r3)",
        border: `2px solid ${rs.border}`,
        padding: 16,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        scrollSnapAlign: "start",
        flexShrink: 0,
        position: "relative",
        transition: "transform .15s, box-shadow .15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 10px 28px rgba(0,0,0,.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Rank badge */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          fontSize: 11,
          fontWeight: 800,
          background: rs.badge,
          color: rs.badgeText,
          borderRadius: "var(--r)",
          padding: "2px 8px",
          lineHeight: 1.6,
        }}
      >
        {MEDAL[rank] || `#${rank}`}
      </div>
      {rank === 1 && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            fontSize: 10,
            fontWeight: 700,
            background: "var(--accent)",
            color: "white",
            borderRadius: "var(--r)",
            padding: "2px 7px",
          }}
        >
          Best
        </div>
      )}
      {/* Image */}
      <div
        style={{
          width: "100%",
          height: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fff",
          borderRadius: "var(--r2)",
          marginTop: 16,
        }}
      >
        {p.imageUrl ? (
          <img
            src={p.imageUrl}
            alt={p.name}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              padding: 8,
            }}
          />
        ) : (
          <span style={{ fontSize: 40 }}>
            {p.emoji || CAT_EMOJI[p.category] || "📦"}
          </span>
        )}
      </div>
      {/* Brand + Name */}
      <div>
        {p.brand && (
          <div
            style={{
              fontSize: 10,
              color: "var(--ink4)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".4px",
              marginBottom: 3,
            }}
          >
            {p.brand}
          </div>
        )}
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--ink)",
            lineHeight: 1.35,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {p.name}
        </div>
      </div>
      {/* AI Score */}
      {p.aiScore && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "var(--accent)",
                background: "var(--accent-bg)",
                padding: "2px 8px",
                borderRadius: 5,
                fontFamily: "'DM Mono',monospace",
              }}
            >
              AI {p.aiScore}/10
            </span>
          </div>
          <div
            style={{
              height: 4,
              background: "var(--paper3)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(p.aiScore / 10) * 100}%`,
                background: "var(--accent)",
                borderRadius: 4,
                transition: "width .6s ease",
              }}
            />
          </div>
        </div>
      )}
      {/* Price */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "auto",
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: "var(--ink)",
            fontFamily: "'DM Mono',monospace",
          }}
        >
          {p.lowestPrice || p.price
            ? `₹${Number(p.lowestPrice || p.price).toLocaleString("en-IN")}`
            : "—"}
        </div>
        <button
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--accent)",
            background: "var(--accent-bg)",
            border: "1.5px solid var(--accent)",
            borderRadius: "var(--r)",
            padding: "5px 12px",
            cursor: "pointer",
          }}
        >
          View →
        </button>
      </div>
    </div>
  );
}

// ── Category rail section ────────────────────────────────────────
function CategoryRail({ cat, onSearch, onViewProduct }) {
  const [products, setProds] = useState(_catProdsCache.get(cat.slug) || []);
  const [loading, setLoading] = useState(!_catProdsCache.has(cat.slug));

  useEffect(() => {
    if (_catProdsCache.has(cat.slug)) return;
    setLoading(true);
    getCategoryProducts(cat.slug, 10)
      .then((d) => {
        const results = d.results || [];
        _catProdsCache.set(cat.slug, results);
        setProds(results);
      })
      .catch(() => setProds([]))
      .finally(() => setLoading(false));
  }, [cat.slug]);

  return (
    <div style={{ marginBottom: 48 }}>
      {/* Category header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28 }}>{cat.emoji}</span>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "clamp(16px,2.5vw,22px)",
                fontWeight: 700,
                color: "var(--ink)",
                letterSpacing: "-.3px",
              }}
            >
              Top {cat.name}
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: "var(--ink3)" }}>
              Best-rated by bestpickr AI
            </p>
          </div>
        </div>
        <button
          onClick={() => onSearch(cat.slug, cat.slug)}
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--accent)",
            background: "var(--accent-bg)",
            border: "1.5px solid var(--accent)",
            borderRadius: 100,
            padding: "7px 18px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          See full list →
        </button>
      </div>

      {/* Horizontal scroll rail */}
      {loading ? (
        <div
          style={{
            display: "flex",
            gap: 14,
            overflowX: "auto",
            scrollbarWidth: "none",
            paddingBottom: 8,
          }}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} height={300} minWidth={200} />
          ))}
        </div>
      ) : products.length > 0 ? (
        <div
          style={{
            display: "flex",
            gap: 14,
            overflowX: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            paddingBottom: 8,
            scrollSnapType: "x mandatory",
          }}
        >
          {products.map((p, i) => (
            <ProductCard
              key={p.id || p.asin || i}
              p={p}
              rank={p.rank || i + 1}
              onViewProduct={onViewProduct}
              allResults={products}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r3)",
            padding: "32px 20px",
            textAlign: "center",
            color: "var(--ink3)",
            fontSize: 14,
          }}
        >
          No products yet in this category. Check back soon!
        </div>
      )}
    </div>
  );
}

// ── Main page component ──────────────────────────────────────────
export default function TopListsPage({ onSearch, onViewProduct }) {
  const [topIndia, setTopIndia] = useState(getFreshTopIndia() || []);
  const [loadingTop, setLoadingTop] = useState(!getFreshTopIndia());
  const [categories, setCats] = useState(_catsCache || []);

  // Fetch top-india grid
  useEffect(() => {
    if (getFreshTopIndia()) return;
    setLoadingTop(true);
    getTopIndiaProducts()
      .then((d) => {
        const prods = d.products || [];
        _topIndiaCache = prods;
        _topIndiaCacheTs = Date.now();
        setTopIndia(prods);
      })
      .catch(() => setTopIndia([]))
      .finally(() => setLoadingTop(false));
  }, []);

  // Fetch categories for rails
  useEffect(() => {
    if (_catsCache) return;
    getCategories()
      .then((d) => {
        const cats = d.categories || [];
        _catsCache = cats;
        setCats(cats);
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* ── HERO HEADER ─────────────────────── */}
      <div
        style={{
          background:
            "linear-gradient(135deg,var(--paper2) 0%,var(--paper3) 100%)",
          borderBottom: "1px solid var(--line)",
          padding: "48px 0 40px",
        }}
      >
        <div className="wrap">
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".5px",
              textTransform: "uppercase",
              color: "var(--accent)",
              background: "var(--accent-bg)",
              borderRadius: "var(--r)",
              padding: "3px 10px",
              display: "inline-block",
              marginBottom: 12,
            }}
          >
            🏆 bestpickr picks
          </div>
          <h1
            style={{
              margin: "0 0 8px",
              fontSize: "clamp(24px,4vw,36px)",
              fontWeight: 800,
              color: "var(--ink)",
              letterSpacing: "-.5px",
              lineHeight: 1.15,
            }}
          >
            Top Lists
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 15,
              color: "var(--ink3)",
              maxWidth: 540,
              lineHeight: 1.6,
            }}
          >
            The best-rated product from every category in India — ranked by
            bestpickr's AI using ratings, reviews, and value for money.
          </p>
        </div>
      </div>

      <div className="wrap" style={{ paddingTop: 40, paddingBottom: 60 }}>
        {/* ── TOP PICKS GRID ─────────────────── */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ marginBottom: 20 }}>
            <h2
              style={{
                margin: "0 0 4px",
                fontSize: "clamp(18px,2.5vw,24px)",
                fontWeight: 700,
                color: "var(--ink)",
                letterSpacing: "-.3px",
              }}
            >
              #1 Pick from Every Category
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink3)" }}>
              One hand-picked winner per category — the product with our highest
              AI score.
            </p>
          </div>

          {loadingTop ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
                gap: 14,
              }}
            >
              {Array.from({ length: 10 }).map((_, i) => (
                <Shimmer key={i} height={220} />
              ))}
              <style>{`@keyframes bpShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
            </div>
          ) : topIndia.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
                gap: 14,
              }}
            >
              <style>{`@keyframes bpShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
              {topIndia.map((p, ri) => (
                <div
                  key={p.id || p.name}
                  onClick={() => onViewProduct(p, topIndia)}
                  style={{
                    background: "var(--paper)",
                    borderRadius: "var(--r3)",
                    border: "1px solid var(--line)",
                    padding: 16,
                    cursor: "pointer",
                    transition: "box-shadow .15s, border-color .15s",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow =
                      "0 4px 16px rgba(0,0,0,.08)";
                    e.currentTarget.style.borderColor = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.borderColor = "var(--line)";
                  }}
                >
                  {/* Category tag */}
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--accent)",
                      background: "var(--accent-bg)",
                      borderRadius: "var(--r)",
                      padding: "2px 8px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      alignSelf: "flex-start",
                    }}
                  >
                    <span>{p.emoji}</span>
                    {p.category}
                  </div>
                  {/* Image */}
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      style={{
                        width: "100%",
                        height: 110,
                        objectFit: "contain",
                        borderRadius: "var(--r2)",
                        background: "#fff",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: 110,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 40,
                        background: "var(--paper2)",
                        borderRadius: "var(--r2)",
                      }}
                    >
                      {p.emoji}
                    </div>
                  )}
                  {/* Info */}
                  <div>
                    {p.brand && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--ink4)",
                          fontWeight: 600,
                          marginBottom: 2,
                        }}
                      >
                        {p.brand}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--ink)",
                        lineHeight: 1.3,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {p.name}
                    </div>
                  </div>
                  {/* Score + Price */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: "auto",
                    }}
                  >
                    {p.aiScore && (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "var(--accent)",
                          background: "var(--accent-bg)",
                          padding: "2px 8px",
                          borderRadius: 5,
                          fontFamily: "'DM Mono',monospace",
                        }}
                      >
                        AI {p.aiScore}/10
                      </span>
                    )}
                    {(p.price || p.lowestPrice) && (
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: "var(--ink)",
                          fontFamily: "'DM Mono',monospace",
                        }}
                      >
                        ₹
                        {Number(p.price || p.lowestPrice).toLocaleString(
                          "en-IN",
                        )}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r3)",
                padding: "48px 20px",
                textAlign: "center",
                color: "var(--ink3)",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                Top picks loading…
              </div>
              <p style={{ fontSize: 13, margin: 0 }}>
                Products are being indexed. Try searching for a specific
                category above.
              </p>
            </div>
          )}
        </div>

        {/* ── DIVIDER ─────────────────────────── */}
        <div
          style={{ borderTop: "1px solid var(--line)", margin: "0 0 48px" }}
        />

        {/* ── PER-CATEGORY RAILS ─────────────── */}
        <div style={{ marginBottom: 20 }}>
          <h2
            style={{
              margin: "0 0 4px",
              fontSize: "clamp(18px,2.5vw,24px)",
              fontWeight: 700,
              color: "var(--ink)",
              letterSpacing: "-.3px",
            }}
          >
            Browse by Category
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink3)" }}>
            Top 10 picks in each category — click any product to see the full AI
            analysis.
          </p>
        </div>

        {categories.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Shimmer height={24} />
                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    marginTop: 16,
                    overflowX: "hidden",
                  }}
                >
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Shimmer key={j} height={300} minWidth={200} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          categories.map((cat) => (
            <CategoryRail
              key={cat.slug}
              cat={cat}
              onSearch={onSearch}
              onViewProduct={onViewProduct}
            />
          ))
        )}
      </div>
    </div>
  );
}
