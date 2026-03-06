// src/pages/ResultsPage.jsx
// BUG #4  FIX: Sort dropdown centered on mobile
// BUG #10 FIX: "You save" calculation correct (shows MRP - lowestPrice)
// BUG #18 FIX: Hover tooltip on result cards explaining AI pick reason
// BUG #19 FIX: Scroll to top button

import { useEffect, useState, useRef } from "react";
import { useSearch } from "../hooks/useSearch.js";
import { ResultSkeleton } from "../components/Skeleton.jsx";
import { PlatformLogo, PlatformPill } from "../components/PlatformLogo.jsx";
import PrimaryProductCard from "../components/PrimaryProductCard.jsx";
import SuggestionsGrid from "../components/SuggestionsGrid.jsx";
import ProductGrid from "../components/ProductGrid.jsx";
import DidYouMeanBanner from "../components/DidYouMeanBanner.jsx";
import FallbackView from "../components/FallbackView.jsx";
import RefineSearchBanner from "../components/RefineSearchBanner.jsx";

const RANK_CLASS = ["", "g", "s", "b", "n", "n", "n", "n", "n", "n", "n"];
const fmt = (n) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : "—");

const CATEGORY_EMOJIS = {
  headphones: "🎧",
  earbuds: "🎧",
  audio: "🎧",
  speaker: "🔊",
  mobile: "📱",
  phone: "📱",
  smartphone: "📱",
  laptop: "💻",
  computer: "💻",
  tablet: "📱",
  ipad: "📱",
  tv: "📺",
  television: "📺",
  camera: "📷",
  watch: "⌚",
  smartwatch: "⌚",
  shoe: "👟",
  shoes: "👟",
  sneaker: "👟",
  bag: "👜",
  backpack: "🎒",
  book: "📚",
  kindle: "📚",
  gaming: "🎮",
  controller: "🎮",
  kitchen: "🍳",
  airfryer: "🍳",
  fryer: "🍳",
  vacuum: "🌀",
  cleaner: "🌀",
  printer: "🖨️",
  mouse: "🖱️",
  keyboard: "⌨️",
};

function getCategoryEmoji(product) {
  const text = `${product.name} ${product.category || ""}`.toLowerCase();
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJIS)) {
    if (text.includes(key)) return emoji;
  }
  return "📦";
}

function ProductImage({ product }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [product.imageUrl]);

  if (!product.imageUrl || failed) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--paper2)",
          borderRadius: "var(--r2)",
          fontSize: 36,
        }}
      >
        {getCategoryEmoji(product)}
      </div>
    );
  }
  return (
    <img
      src={product.imageUrl}
      alt={product.name}
      onError={() => setFailed(true)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        borderRadius: "var(--r2)",
        background: "#fff",
      }}
    />
  );
}

function applyFilters(results, filters) {
  return results.filter((p) => {
    if (filters.minScore && p.aiScore < filters.minScore) return false;
    if (filters.maxPrice && p.lowestPrice > filters.maxPrice) return false;
    if (filters.platforms.length > 0) {
      const pltNames = (p.platforms || []).map((pl) => pl.name);
      if (!filters.platforms.some((f) => pltNames.includes(f))) return false;
    }
    // Hide products where every platform is explicitly out-of-stock
    const plts = p.platforms || [];
    if (plts.length > 0 && plts.every((pl) => pl.inStock === false))
      return false;
    return true;
  });
}

// ── Query relevance guard ─────────────────────────────────────────
// Prevents contaminated-cache results (e.g. skincare returned for a laptop query)
// by requiring at least one significant query token to appear in the product name.
// Only kicks in when the query has brand/model tokens (≥4 chars, non-stop-words).
const QUERY_STOP = new Set([
  "best",
  "top",
  "good",
  "under",
  "for",
  "with",
  "the",
  "and",
  "in",
  "on",
  "of",
  "a",
  "an",
  "buy",
  "price",
  "india",
  "cheap",
  "budget",
  "new",
  "latest",
]);

function queryRelevanceFilter(items, query, opts = {}) {
  const { allowFallback = true } = opts;
  const tokens = query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((t) => t.length >= 3 && !QUERY_STOP.has(t));
  // If no meaningful tokens (e.g. "best laptops"), skip filtering
  if (tokens.length < 2) return items;
  // Also build concatenated variants so "skull candy" matches "skullcandy"
  const joined = tokens.join(""); // e.g. ["skull","candy"] → "skullcandy"
  // Check if any token looks like a brand/model (starts with letter, mixed alphanum)
  const hasModelToken = tokens.some(
    (t) => /^[a-z][a-z0-9-]+$/.test(t) && t.length >= 3,
  );
  if (!hasModelToken) return items;
  const filtered = items.filter((p) => {
    const text =
      `${p.name || ""} ${p.brand || ""} ${p.category || ""}`.toLowerCase();
    // Match individual tokens OR the joined form (handles "skull candy" → "skullcandy")
    // Also stem plurals: "cameras" → "camera", "phones" → "phone"
    return (
      tokens.some(
        (t) =>
          text.includes(t) ||
          (t.endsWith("es") && t.length > 3 && text.includes(t.slice(0, -2))) ||
          (t.endsWith("s") && t.length > 3 && text.includes(t.slice(0, -1))),
      ) || text.includes(joined)
    );
  });
  // In default mode, if the filter is too aggressive and removes everything,
  // return all items to avoid blank pages. In strict mode, return true matches only.
  if (!allowFallback) return filtered;
  return filtered.length > 0 ? filtered : items;
}

// BUG #18: Tooltip component
function AITooltip({ reason, children }) {
  const [show, setShow] = useState(false);
  return (
    <div
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && reason && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1A1A1A",
            color: "white",
            fontSize: 11,
            fontWeight: 500,
            padding: "8px 12px",
            borderRadius: 8,
            whiteSpace: "normal",
            width: 230,
            boxShadow: "0 4px 16px rgba(0,0,0,.3)",
            zIndex: 400,
            lineHeight: 1.5,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              color: "#7ECFA0",
              fontWeight: 700,
              marginBottom: 3,
              fontSize: 10,
              letterSpacing: ".5px",
            }}
          >
            🤖 WHY BESTPICKR CHOSE THIS
          </div>
          {reason}
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid #1A1A1A",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── SEARCH LOADING STATE ────────────────────────────────────────────
const SEARCH_STEPS = [
  { icon: "🔍", label: "Searching Amazon for best matches" },
  { icon: "📦", label: "Fetching prices and product specs" },
  { icon: "🤖", label: "Reading thousands of reviews" },
  { icon: "📊", label: "Scoring by value, sentiment & reliability" },
  { icon: "✨", label: "Almost done — building your personalised results" },
];

function SearchLoadingState({ status, query }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [dots, setDots] = useState(".");
  const [isCold, setIsCold] = useState(false);

  // Advance one step every 2.5s until the last step
  useEffect(() => {
    const t = setInterval(
      () => setStepIndex((i) => Math.min(i + 1, SEARCH_STEPS.length - 1)),
      2500,
    );
    return () => clearInterval(t);
  }, []);

  // Animate ellipsis on current step
  useEffect(() => {
    const t = setInterval(
      () => setDots((d) => (d.length >= 3 ? "" : d + ".")),
      400,
    );
    return () => clearInterval(t);
  }, []);

  // After 4s with no result → this is a cold / first-time search
  useEffect(() => {
    const t = setTimeout(() => setIsCold(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const progress = Math.round(((stepIndex + 1) / SEARCH_STEPS.length) * 100);

  return (
    <div
      style={{
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r3)",
        padding: "20px 22px 18px",
        marginBottom: 16,
      }}
    >
      {/* Header line */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div
          className="loading-spinner"
          style={{ width: 16, height: 16, borderWidth: 2, flexShrink: 0 }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--ink)",
            lineHeight: 1.4,
          }}
        >
          {isCold
            ? `🌟 First time "${query}" was searched — takes a little longer`
            : status === "partial"
              ? "Analysing results…"
              : "Running AI search…"}
        </span>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 3,
          background: "var(--line)",
          borderRadius: 2,
          marginBottom: 18,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            background: "var(--accent)",
            width: `${progress}%`,
            transition: "width 2.4s ease",
            borderRadius: 2,
          }}
        />
      </div>

      {/* Step list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {SEARCH_STEPS.map((step, i) => {
          const done = i < stepIndex;
          const current = i === stepIndex;
          const pending = i > stepIndex;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 8px",
                borderRadius: 6,
                background: current ? "var(--accent-bg)" : "transparent",
                opacity: pending ? 0.3 : 1,
                transition: "opacity 0.4s ease, background 0.3s ease",
              }}
            >
              <span
                style={{
                  fontSize: 15,
                  width: 22,
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                {done ? "✅" : step.icon}
              </span>
              <span
                style={{
                  fontSize: 13,
                  flex: 1,
                  fontWeight: current ? 600 : 400,
                  color: done
                    ? "var(--ink4)"
                    : current
                      ? "var(--ink)"
                      : "var(--ink3)",
                  textDecoration: done ? "line-through" : "none",
                }}
              >
                {step.label}
                {current ? dots : ""}
              </span>
              {current && (
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--accent)",
                    fontWeight: 700,
                    letterSpacing: ".5px",
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}
                >
                  in progress
                </span>
              )}
            </div>
          );
        })}
      </div>

      {isCold && (
        <div
          style={{
            marginTop: 14,
            padding: "8px 12px",
            background: "#FFF8EC",
            border: "1px solid #F5C87A",
            borderRadius: 6,
            fontSize: 12,
            color: "#92600A",
            lineHeight: 1.5,
          }}
        >
          💡 Bestpickr is fetching &amp; analysing this product for the first
          time. Results will be cached for everyone after this — the next search
          will be instant.
        </div>
      )}
    </div>
  );
}

export default function ResultsPage({
  query,
  category,
  onViewProduct,
  onSearch,
}) {
  const {
    results,
    loading,
    error,
    meta,
    search,
    intent,
    confidence,
    primaryProduct,
    suggestions,
    status,
    matchType,
    wasSpellingCorrected,
    correctedQuery,
    detectedCategory,
    noResults,
    noResultsMessage,
  } = useSearch();
  const [sort, setSort] = useState("best");
  const [filters, setFilters] = useState({
    platforms: [],
    minScore: 0,
    maxPrice: 0,
  });
  // BUG #19 FIX
  const [showScroll, setShowScroll] = useState(false);

  useEffect(() => {
    if (query) {
      // Reset filters on every new query so stale platform/price filters don't hide results
      setFilters({ platforms: [], minScore: 0, maxPrice: 0 });
      search(query, category);
    }
  }, [query, category]);

  useEffect(() => {
    function onScroll() {
      setShowScroll(window.scrollY > 300);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // baseList: single source of truth for what's displayed.
  // suggestions (backend-ranked list) takes priority; falls back to results.
  const baseList = suggestions?.length > 0 ? suggestions : results;

  const filtered = applyFilters(baseList, filters);
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "price_asc")
      return (a.lowestPrice || Infinity) - (b.lowestPrice || Infinity);
    if (sort === "price_desc")
      return (b.lowestPrice || 0) - (a.lowestPrice || 0);
    if (sort === "rating") return (b.avgRating || 0) - (a.avgRating || 0);
    return (b.aiScore || 0) - (a.aiScore || 0);
  });

  const isFiltered =
    filters.minScore > 0 ||
    filters.maxPrice > 0 ||
    filters.platforms.length > 0;

  const top = baseList[0];
  const bestVal = results.reduce(
    (best, p) =>
      !best || (p.lowestPrice < best.lowestPrice && p.aiScore > 7) ? p : best,
    null,
  );

  function togglePlatform(plt) {
    setFilters((f) => ({
      ...f,
      platforms: f.platforms.includes(plt)
        ? f.platforms.filter((p) => p !== plt)
        : [...f.platforms, plt],
    }));
  }

  return (
    <div className="wrap">
      <div className="results-wrap">
        {/* ── SIDEBAR FILTERS ─────────────────── */}
        <aside className="sidebar">
          <div className="filter-box">
            <div className="filter-box-title">
              Platforms
              <button
                onClick={() => setFilters((f) => ({ ...f, platforms: [] }))}
              >
                Clear
              </button>
            </div>
            {["Amazon"].map((plt) => {
              const count = baseList.filter((p) =>
                (p.platforms || []).some((pl) => pl.name === plt),
              ).length;
              return (
                <label key={plt} className="filter-opt">
                  <input
                    type="checkbox"
                    checked={
                      filters.platforms.length === 0 ||
                      filters.platforms.includes(plt)
                    }
                    onChange={() => togglePlatform(plt)}
                  />
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <PlatformLogo name={plt} size={13} /> {plt}
                  </span>
                  <span className="filter-cnt">{count}</span>
                </label>
              );
            })}
          </div>

          <div className="filter-box">
            <div className="filter-box-title">
              Min AI Score
              <button
                onClick={() => setFilters((f) => ({ ...f, minScore: 0 }))}
              >
                Clear
              </button>
            </div>
            {[
              ["9.0+", 9.0, "Excellent"],
              ["8.0+", 8.0, "Great"],
              ["7.0+", 7.0, "Good"],
            ].map(([label, val, desc]) => (
              <label key={label} className="filter-opt">
                <input
                  type="radio"
                  name="minscore"
                  checked={filters.minScore === val}
                  onChange={() => setFilters((f) => ({ ...f, minScore: val }))}
                />
                <span>
                  {label} {desc}
                </span>
                <span className="filter-cnt">
                  {baseList.filter((p) => p.aiScore >= val).length}
                </span>
              </label>
            ))}
          </div>

          <div className="filter-box">
            <div className="filter-box-title">
              Max Price
              <button
                onClick={() => setFilters((f) => ({ ...f, maxPrice: 0 }))}
              >
                Clear
              </button>
            </div>
            {[
              [5000, "Under ₹5,000"],
              [20000, "Under ₹20,000"],
              [50000, "Under ₹50,000"],
              [0, "Any price"],
            ].map(([val, label]) => (
              <label key={label} className="filter-opt">
                <input
                  type="radio"
                  name="maxprice"
                  checked={filters.maxPrice === val}
                  onChange={() => setFilters((f) => ({ ...f, maxPrice: val }))}
                />
                <span>{label}</span>
                <span className="filter-cnt">
                  {val === 0
                    ? baseList.length
                    : baseList.filter(
                        (p) => p.lowestPrice && p.lowestPrice <= val,
                      ).length}
                </span>
              </label>
            ))}
          </div>

          {meta && (
            <div
              style={{
                fontSize: 11,
                color: "var(--ink4)",
                padding: "8px 12px",
                background: "var(--paper2)",
                borderRadius: "var(--r2)",
                border: "1px solid var(--line)",
              }}
            >
              {meta.fromCache
                ? "⚡ Cached result"
                : `🔍 Live search in ${meta.elapsed}ms`}
              {meta.platforms && (
                <div style={{ marginTop: 4 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      flexWrap: "wrap",
                    }}
                  >
                    <PlatformLogo name="Amazon" size={13} />{" "}
                    {meta.platforms.amazon}
                  </span>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ── MAIN RESULTS ─────────────────────── */}
        <div>
          {/* BUG #4 FIX: Sort centered using flex with justify-content */}
          <div
            className="results-bar"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div className="results-title" style={{ flex: 1, minWidth: 0 }}>
              Bestpickr&apos;s top picks for <span>&quot;{query}&quot;</span>
              {isFiltered && !loading && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--ink4)",
                    marginLeft: 10,
                  }}
                >
                  Showing {sorted.length} of {baseList.length}
                  <button
                    onClick={() =>
                      setFilters({ platforms: [], minScore: 0, maxPrice: 0 })
                    }
                    style={{
                      marginLeft: 6,
                      fontSize: 11,
                      color: "var(--accent2)",
                      fontWeight: 700,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Clear filters
                  </button>
                </span>
              )}
            </div>
            {/* BUG #4: Sort centered block on mobile */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <select
                className="sort-select"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                style={{ margin: "0 auto", display: "block" }}
              >
                <option value="best">Sort: Best Match</option>
                <option value="price_asc">Lowest Price</option>
                <option value="price_desc">Highest Price</option>
                <option value="rating">Highest Rated</option>
              </select>
            </div>
          </div>

          {/* ── INTENT-BASED LAYOUT ROUTER ─────────────────── */}

          {/* Loading / polling state — not shown during lazy_pending (suggestions already visible) */}
          {(loading || status === "fetching" || status === "partial") &&
            !primaryProduct &&
            status !== "lazy_pending" && (
              <div>
                <SearchLoadingState key={query} status={status} query={query} />
                <ResultSkeleton />
              </div>
            )}

          {/* Error state */}
          {error && (
            <div className="error-wrap">
              ⚠️ {error}
              <button
                onClick={() => search(query, category)}
                style={{
                  marginLeft: 12,
                  fontWeight: 700,
                  color: "var(--accent2)",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* No results state — graceful, no crash */}
          {!loading && !error && noResults && (
            <div
              style={{
                textAlign: "center",
                padding: "48px 20px",
                color: "var(--ink3)",
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--ink)",
                  marginBottom: 8,
                }}
              >
                No products found for &ldquo;{query}&rdquo;
              </div>
              <div
                style={{ fontSize: 14, color: "var(--ink3)", marginBottom: 20 }}
              >
                {noResultsMessage ||
                  "We couldn't find what you're looking for. Try one of these popular searches:"}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: 8,
                  marginBottom: 24,
                }}
              >
                {[
                  "Best headphones under ₹2000",
                  "Best laptop under ₹50000",
                  "Best AC under ₹40000",
                  "Best smartwatch under ₹5000",
                  "Best running shoes",
                  "Best air fryer",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => onSearch && onSearch(s)}
                    style={{
                      padding: "7px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      background: "var(--paper3)",
                      border: "1px solid var(--line)",
                      borderRadius: 20,
                      color: "var(--ink)",
                      cursor: "pointer",
                      transition: "background .15s, border-color .15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--accent-bg)";
                      e.currentTarget.style.borderColor = "var(--accent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "var(--paper3)";
                      e.currentTarget.style.borderColor = "var(--line)";
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                onClick={() => onSearch && onSearch("")}
                style={{
                  padding: "10px 24px",
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--r2)",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Browse categories
              </button>
            </div>
          )}

          {/* PATH A — PRODUCT_SPECIFIC: primary card + alternatives grid */}
          {/* Also renders during lazy_pending: skeleton primary + instant suggestions */}
          {!loading &&
            !error &&
            (intent === "PRODUCT_SPECIFIC" || status === "lazy_pending") && (
              <>
                {/* Spelling correction banner */}
                {wasSpellingCorrected && correctedQuery && (
                  <div
                    style={{
                      background: "var(--accent-bg)",
                      border: "1px solid var(--accent)",
                      borderRadius: 8,
                      padding: "8px 14px",
                      marginBottom: 12,
                      fontSize: 13,
                      color: "var(--ink)",
                    }}
                  >
                    Showing results for <strong>{correctedQuery}</strong>
                  </div>
                )}
                {/* Smart variant chips — shown when we have suggestions (inexact match)
                  or during lazy-load (exact product not in DB yet).
                  Always use PRODUCT_SPECIFIC intent here regardless of backend intent,
                  so we show variant chips (Over-Ear, TWS etc.) not budget/series chips. */}
                {(status === "lazy_pending" ||
                  (suggestions && suggestions.length > 0)) && (
                  <RefineSearchBanner
                    intent="PRODUCT_SPECIFIC"
                    query={query}
                    category={detectedCategory || category}
                    onSearch={onSearch}
                    showVariants
                  />
                )}
                <PrimaryProductCard
                  product={primaryProduct}
                  status={status}
                  confidence={confidence}
                  matchType={matchType}
                  onBuy={(plt) => plt?.url && window.open(plt.url, "_blank")}
                  onViewDetails={(p) => onViewProduct(p, suggestions || [])}
                />
                {suggestions &&
                  suggestions.length > 0 &&
                  (() => {
                    // Filter out wrong-category items — backend cache can occasionally return
                    // products from a different category (contaminated Redis/Mongo cache entry).
                    // When we know the primary category, ONLY show suggestions that either:
                    //   a) match that category exactly, OR
                    //   b) have no category but their name/brand contains a query token
                    const primaryCat =
                      primaryProduct?.category || detectedCategory || null;
                    const qTokens = query
                      .toLowerCase()
                      .split(/[\s,]+/)
                      .filter((t) => t.length >= 3);
                    const relevantSuggestions = primaryCat
                      ? suggestions.filter((s) => {
                          if (s.category === primaryCat) return true;
                          // Null-category items need ≥2 token matches to avoid
                          // cross-category contamination (e.g. skincare for "hp laptop")
                          if (!s.category) {
                            const text =
                              `${s.name || ""} ${s.brand || ""}`.toLowerCase();
                            const matchCount = qTokens.filter((t) =>
                              text.includes(t),
                            ).length;
                            return matchCount >= 2;
                          }
                          return false;
                        })
                      : suggestions;
                    if (relevantSuggestions.length === 0) return null;
                    return (
                      <ResultCardList
                        title="Alternatives"
                        items={relevantSuggestions}
                        onSelect={(p) => onViewProduct(p, relevantSuggestions)}
                      />
                    );
                  })()}
              </>
            )}

          {/* PATH B — CATEGORY / BRAND_CATEGORY / GENERIC */}
          {!loading &&
            !error &&
            !noResults &&
            (intent === "CATEGORY" ||
              intent === "BRAND_CATEGORY" ||
              intent === "GENERIC") && (
              <>
                {/* Spelling correction banner */}
                {wasSpellingCorrected && correctedQuery && (
                  <div
                    style={{
                      background: "var(--accent-bg)",
                      border: "1px solid var(--accent)",
                      borderRadius: 8,
                      padding: "8px 14px",
                      marginBottom: 12,
                      fontSize: 13,
                      color: "var(--ink)",
                    }}
                  >
                    Showing results for <strong>{correctedQuery}</strong>
                  </div>
                )}
                {/* Smart refinement chips — helps users narrow vague searches */}
                <RefineSearchBanner
                  intent={intent}
                  query={query}
                  category={detectedCategory || category}
                  onSearch={onSearch}
                />
                {/* Relevance note for category-style results */}
                {(() => {
                  const guardedItems = queryRelevanceFilter(sorted, query);
                  const strictMatches = queryRelevanceFilter(sorted, query, {
                    allowFallback: false,
                  });
                  const noExactMatch =
                    sorted.length > 0 && strictMatches.length === 0;
                  const displayItems =
                    noExactMatch || guardedItems.length === 0
                      ? sorted
                      : guardedItems;
                  if (displayItems.length === 0) return null;
                  return (
                    <>
                      {noExactMatch && (
                        <div className="ai-summary">
                          <div className="ai-summary-label">
                            No Exact Match Found
                          </div>
                          <div className="ai-summary-text">
                            We did not find an exact match for
                            <strong> "{query}"</strong>. Try these similar
                            products.
                          </div>
                        </div>
                      )}
                      <ResultCardList
                        title={
                          noExactMatch
                            ? "Try these similar products"
                            : undefined
                        }
                        items={displayItems}
                        showBestMatch={!noExactMatch}
                        onSelect={(p) => onViewProduct(p, baseList)}
                      />
                    </>
                  );
                })()}
              </>
            )}

          {/* PATH C — LOW_CONFIDENCE: banner + suggestions */}
          {!loading && !error && intent === "LOW_CONFIDENCE" && (
            <>
              {wasSpellingCorrected && correctedQuery && (
                <div
                  style={{
                    background: "var(--accent-bg)",
                    border: "1px solid var(--accent)",
                    borderRadius: 8,
                    padding: "8px 14px",
                    marginBottom: 12,
                    fontSize: 13,
                    color: "var(--ink)",
                  }}
                >
                  Showing results for <strong>{correctedQuery}</strong>
                </div>
              )}
              <DidYouMeanBanner
                product={primaryProduct || suggestions?.[0]}
                confidence={confidence}
                onConfirm={(p) => onViewProduct(p, suggestions || [])}
              />
              {suggestions && suggestions.length > 0 ? (
                <ResultCardList
                  title="You might be looking for…"
                  items={suggestions}
                  onSelect={(p) => onViewProduct(p, suggestions)}
                />
              ) : (
                <ResultCardList
                  title="Popular products"
                  items={sorted}
                  onSelect={(p) => onViewProduct(p, results)}
                />
              )}
            </>
          )}

          {/* PATH D — FALLBACK */}
          {!loading && !error && intent === "FALLBACK" && (
            <FallbackView
              suggestions={suggestions || results}
              categorySuggestions={null}
            />
          )}

          {/* CATCH-ALL — unknown intent with results (prevents blank page) */}
          {!loading &&
            !error &&
            !noResults &&
            intent &&
            intent !== "PRODUCT_SPECIFIC" &&
            intent !== "CATEGORY" &&
            intent !== "BRAND_CATEGORY" &&
            intent !== "GENERIC" &&
            intent !== "LOW_CONFIDENCE" &&
            intent !== "FALLBACK" &&
            sorted.length > 0 && (
              <ResultCardList
                items={sorted}
                onSelect={(p) => onViewProduct(p, baseList)}
              />
            )}

          {/* LEGACY FALLBACK — no intent set (old API response shape) */}
          {!loading && !error && !intent && (
            <>
              {results.length === 0 && (
                <div
                  style={{
                    background: "var(--paper)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--r3)",
                    padding: "48px 20px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 40, marginBottom: 12 }}>
                    {category ? "📂" : "🔍"}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "var(--ink)",
                      marginBottom: 6,
                    }}
                  >
                    {category
                      ? `No products found in "${category}"`
                      : "No results found"}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: "var(--ink3)",
                      marginBottom: 20,
                    }}
                  >
                    {category
                      ? `We couldn't find any products in the ${category} category. Try searching for specific product names.`
                      : "Try a different search term or browse a category"}
                  </div>
                  {["Sony headphones", "running shoes", "air fryer"].map(
                    (s) => (
                      <button
                        key={s}
                        onClick={() => onSearch(s, "")}
                        style={{
                          margin: 4,
                          padding: "7px 14px",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--r)",
                          background: "var(--paper2)",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          color: "var(--ink2)",
                        }}
                      >
                        {s}
                      </button>
                    ),
                  )}
                </div>
              )}
              {sorted.length > 0 && (
                <>
                  {(() => {
                    const strictMatches = queryRelevanceFilter(sorted, query, {
                      allowFallback: false,
                    });
                    const noExactMatch =
                      sorted.length > 0 && strictMatches.length === 0;

                    if (noExactMatch) {
                      return (
                        <div className="ai-summary">
                          <div className="ai-summary-label">
                            No Exact Match Found
                          </div>
                          <div className="ai-summary-text">
                            We did not find an exact match for
                            <strong> "{query}"</strong>. Try these similar
                            products.
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })()}
                  <ResultCardList
                    title={
                      queryRelevanceFilter(sorted, query, {
                        allowFallback: false,
                      }).length === 0
                        ? "Try these similar products"
                        : undefined
                    }
                    showBestMatch={
                      queryRelevanceFilter(sorted, query, {
                        allowFallback: false,
                      }).length > 0
                    }
                    items={sorted}
                    onSelect={(p) => onViewProduct(p, results)}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* BUG #19 FIX: Scroll to top button */}
      {showScroll && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            width: 44,
            height: 44,
            background: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            zIndex: 500,
            boxShadow: "0 4px 16px rgba(26,107,60,.4)",
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Scroll to top"
        >
          ↑
        </button>
      )}

      {/* BUG #4 FIX: mobile sort center */}
      <style>{`
        @media(max-width:640px) {
          .results-bar { flex-direction: column !important; align-items: stretch !important; }
          .sort-select { width: 100% !important; text-align: center; }
        }
      `}</style>
    </div>
  );
}

// ── RESULT CARD LIST — 1-per-row column, matches skeleton layout ──
function ResultCardList({ items, title, onSelect, showBestMatch = true }) {
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
            marginBottom: 12,
            marginTop: 20,
          }}
        >
          {title}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((p, i) => (
          <ResultCard
            key={p.id || p.asin || p.platformId || i}
            product={p}
            rank={i + 1}
            isTop={i === 0}
            showBestMatch={showBestMatch}
            onClick={() => onSelect?.(p)}
          />
        ))}
      </div>
    </div>
  );
}

// ── RESULT CARD ────────────────────────────────────────────────────
function ResultCard({
  product: p,
  rank,
  isTop,
  onClick,
  showBestMatch = true,
}) {
  const fmt = (n) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : "—");

  // BUG #10 FIX: Correct "you save" = highestPrice - lowestPrice
  const youSave =
    p.highestPrice && p.lowestPrice && p.highestPrice > p.lowestPrice
      ? p.highestPrice - p.lowestPrice
      : null;
  const savePct =
    youSave && p.highestPrice
      ? Math.round((youSave / p.highestPrice) * 100)
      : null;

  // Issue 2: AI score — show beta label if insufficient data
  const hasReliableAiScore =
    p.aiScore && p.totalReviews > 0 && p.aiScore !== 3.8;
  const showBetaAiLabel =
    p.aiScore && (!p.totalReviews || p.totalReviews === 0);

  // Issue 3: Reviews — hide sentiment when reviews = 0
  const hasRealReviews = (p.totalReviews || 0) > 0;
  const hasRealSentiment =
    hasRealReviews && p.positivePct != null && p.positivePct > 0;

  // BUG #18: AI tooltip reason
  const aiReason = `AI Score ${p.aiScore}/10 based on ${(p.totalReviews || 0).toLocaleString()} reviews across ${(p.platforms || []).length} platforms. ${p.positivePct || 75}% positive sentiment.${isTop ? " Ranked #1 — highest overall score in this search." : ""}`;

  return (
    <div className={`rcard ${isTop ? "best" : ""}`} onClick={onClick}>
      <div className="rcard-top">
        <div className={`rcard-rank rank ${RANK_CLASS[rank]}`}>#{rank}</div>

        <div className="rcard-emoji">
          <ProductImage product={p} />
        </div>

        <div className="rcard-info">
          <div className="rcard-brand">{p.brand}</div>
          <div className="rcard-name">{p.name}</div>
          <div className="rcard-meta">
            {/* BUG #18: Tooltip wrapping AI score badge */}
            <AITooltip reason={aiReason}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "var(--accent-bg)",
                  color: "var(--accent)",
                  borderRadius: 4,
                  padding: "3px 9px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "help",
                }}
              >
                {showBetaAiLabel && (
                  <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.65 }}>
                    BETA
                  </span>
                )}
                ★ {p.aiScore}/10
              </span>
            </AITooltip>
            {isTop && showBestMatch && (
              <span className="tag tag-g">Best Match</span>
            )}
            {hasRealSentiment && p.positivePct >= 80 && (
              <span className="tag tag-b">Highly Praised</span>
            )}
            {/* BUG #10 FIX: Show you-save badge */}
            {savePct && savePct >= 5 && (
              <span
                style={{
                  background: "#FDF2EC",
                  color: "var(--accent2)",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 4,
                }}
              >
                Save {savePct}%
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="score-big">
            {p.aiScore}
            <span className="score-denom">/10</span>
          </div>
          <div className="score-label">
            {showBetaAiLabel ? "Beta AI Score" : "AI Score"}
          </div>
        </div>
      </div>

      <div className="rcard-bottom">
        {/* Reviews — Issue 3: hide sentiment when reviews = 0 */}
        <div>
          <div className="rcard-bottom-label">Reviews</div>
          {hasRealReviews ? (
            <>
              <div className="rcard-bottom-val">
                {p.totalReviews.toLocaleString()}
              </div>
              <div className="rcard-bottom-sub">
                across {(p.platforms || []).length} platforms
              </div>
              {hasRealSentiment && (
                <div className="sent-mini" style={{ marginTop: 6 }}>
                  {[
                    ["Positive", p.positivePct, "sent-pos"],
                    [
                      "Negative",
                      Math.max(0, 100 - (p.positivePct || 75) - 10),
                      "sent-neg",
                    ],
                  ].map(([lbl, pct, cls]) => (
                    <div key={lbl} className="sent-mini-row">
                      <span className="sent-mini-lbl">{lbl}</span>
                      <div className="sent-mini-track">
                        <div
                          className={`sent-mini-fill ${cls}`}
                          style={{ width: `${pct || 0}%` }}
                        />
                      </div>
                      <span className="sent-mini-pct">
                        {Math.round(pct || 0)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                fontSize: 12,
                color: "var(--ink4)",
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              Review data unavailable
            </div>
          )}
        </div>

        {/* Platforms */}
        <div>
          <div className="rcard-bottom-label">Available on</div>
          <div className="rcard-bottom-val">
            {(p.platforms || []).length} stores
          </div>
          <div className="plt-pills" style={{ marginTop: 6 }}>
            {(p.platforms || []).map((plt) => (
              <PlatformPill key={plt.name} name={plt.name} />
            ))}
          </div>
        </div>

        {/* BUG #10 FIX: Price + correct you save */}
        <div>
          <div className="rcard-bottom-label">Best Price</div>
          <div className="rcard-price-main">{fmt(p.lowestPrice)}</div>
          {p.highestPrice && p.highestPrice !== p.lowestPrice && (
            <div
              className="rcard-bottom-sub"
              style={{ textDecoration: "line-through", color: "var(--ink4)" }}
            >
              {fmt(p.highestPrice)}
            </div>
          )}
          {/* BUG #10: Correct "you save" = MRP - best price */}
          {youSave && youSave > 0 && (
            <div
              style={{
                fontSize: 11,
                color: "var(--accent2)",
                fontWeight: 700,
                marginTop: 2,
              }}
            >
              You save {fmt(youSave)} ({savePct}%)
            </div>
          )}
        </div>

        <div>
          <button
            className="view-btn"
            style={{ padding: "9px 20px" }}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            View deals →
          </button>
        </div>
      </div>
    </div>
  );
}
