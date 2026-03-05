// src/pages/DetailPage.jsx
// ─────────────────────────────────────────────────────────────────
// Detail page shell — composes sub-components from components/detail/.
// Handles: affiliate link tracking, onBack / onHome wiring.
// All heavy UI lives in the sub-components (each ≤ 100 lines).
//
// THIN PRODUCT HYDRATION:
//   Products from the top-india grid have a flat shape (no platforms[]).
//   When detected, we immediately synthesize a single Amazon platform entry
//   from the flat url/price so the buy button works right away.
//   In the background we fire a search for the product name to hydrate
//   real platform data (ratings, review count, stock). The UI updates
//   automatically when the search returns.
// ─────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { trackAffiliateClick } from "../utils/analytics";
import { searchProducts } from "../services/api";
import DetailBreadcrumb from "../components/detail/DetailBreadcrumb.jsx";
import DetailHeader from "../components/detail/DetailHeader.jsx";
import DetailScoreBreakdown from "../components/detail/DetailScoreBreakdown.jsx";
import DetailPlatformTable from "../components/detail/DetailPlatformTable.jsx";
import DetailReviews from "../components/detail/DetailReviews.jsx";
import DetailOtherPicks from "../components/detail/DetailOtherPicks.jsx";
import DetailBuyCard from "../components/detail/DetailBuyCard.jsx";

function ProductNotFound({ onHome }) {
  return (
    <div className="wrap" style={{ padding: "60px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>😕</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
        Product not found
      </div>
      <button
        onClick={onHome}
        style={{
          padding: "9px 20px",
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: "var(--r)",
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        Go Home
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function DetailPage({
  product: p,
  allResults,
  onBack,
  onHome,
  onViewProduct,
}) {
  // ── HOOKS — must be called unconditionally before any early returns ──
  const [hydratedPlatforms, setHydratedPlatforms] = useState(null);
  const [hydrating, setHydrating] = useState(false);

  // Detect thin product: came from top-india grid (flat shape, no platforms[])
  const isThinProduct = !p?.platforms?.length;

  // Synthesize a minimal Amazon platform entry from flat url/price
  // so the page is functional immediately — no "No store listings found"
  const syntheticPlatforms =
    isThinProduct && (p?.url || p?.affiliateUrl)
      ? [
          {
            name: "Amazon",
            price: p.price ?? null,
            url: p.url || p.affiliateUrl,
            affiliateUrl: p.url || p.affiliateUrl,
            inStock: true,
            rating: p.rating ?? null,
            reviewCount: p.reviewCount ?? null,
          },
        ]
      : [];

  // Background-hydrate thin products with real platform data via search.
  // Fires once per product name; updates the platform table when ready.
  useEffect(() => {
    if (!p || !isThinProduct || !p.name) return;
    setHydratedPlatforms(null);
    setHydrating(true);
    searchProducts(p.name, p.category || "")
      .then((data) => {
        const results = data?.results || [];
        const pNameLower = (p.name || "").toLowerCase();
        // Find best matching result by name overlap
        const match =
          results.find((r) => {
            const rLower = (r.name || "").toLowerCase();
            return (
              rLower.includes(pNameLower.slice(0, 25)) ||
              pNameLower.includes(rLower.slice(0, 25))
            );
          }) || results[0];
        if (match?.platforms?.length > 0) {
          setHydratedPlatforms(match.platforms);
        }
      })
      .catch(() => {})
      .finally(() => setHydrating(false));
  }, [p?.name, p?.category]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── EARLY RETURN (after all hooks) ──────────────────────────────
  if (!p) return <ProductNotFound onHome={onHome} />;

  // Resolved platforms: hydrated real data > original platforms > synthetic
  const rawPlatforms = p.platforms || [];
  const platforms =
    hydratedPlatforms ??
    (rawPlatforms.length > 0 ? rawPlatforms : syntheticPlatforms);

  const bestPlt = platforms.reduce(
    (b, pl) => (!b || pl.price < b.price ? pl : b),
    null,
  );

  // ✅ Always use affiliateUrl (has associate tag), fall back to url
  // ✅ Track every click for admin dashboard + Telegram reports
  function openPlatform(plt) {
    if (!plt) return;
    const destination = plt.affiliateUrl || plt.url;
    trackAffiliateClick({
      productName: p.name,
      productId: p.platformId || null,
      platform: plt.name,
      affiliateUrl: destination,
      price: plt.price,
    });
    if (destination) window.open(destination, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="wrap">
      <div className="detail-layout">
        {/* ── LEFT COLUMN ──────────────────────── */}
        <div className="detail-main">
          <DetailBreadcrumb name={p.name} onHome={onHome} onBack={onBack} />
          <DetailHeader p={p} />
          <DetailScoreBreakdown
            breakdown={p.breakdown}
            authenticityBadge={p.authenticityBadge}
          />
          {/* Loading indicator while hydrating thin product platforms */}
          {hydrating && !hydratedPlatforms && syntheticPlatforms.length > 0 && (
            <div
              style={{
                fontSize: 12,
                color: "var(--ink3)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
                padding: "6px 0",
              }}
            >
              <span
                style={{
                  animation: "spin 1s linear infinite",
                  display: "inline-block",
                }}
              >
                ⟳
              </span>
              Fetching latest prices & availability…
              <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
          <DetailPlatformTable
            platforms={platforms}
            bestPlt={bestPlt}
            onBuy={openPlatform}
          />
          <DetailReviews p={p} />
        </div>

        {/* ── RIGHT: STICKY BUY CARD ───────────── */}
        <div>
          <DetailBuyCard
            p={p}
            bestPlt={bestPlt}
            platforms={platforms}
            onBuy={openPlatform}
          />
        </div>
      </div>

      {/* ── OTHER TOP PICKS — full-width below both columns ── */}
      <DetailOtherPicks
        allResults={allResults}
        currentName={p.name}
        onSelect={(pick) => onViewProduct?.(pick, allResults)}
      />
    </div>
  );
}
