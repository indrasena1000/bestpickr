// src/pages/DetailPage.jsx
// ─────────────────────────────────────────────────────────────────
// Detail page shell — composes sub-components from components/detail/.
// Handles: affiliate link tracking, onBack / onHome wiring.
// All heavy UI lives in the sub-components (each ≤ 100 lines).
// ─────────────────────────────────────────────────────────────────
import { trackAffiliateClick } from "../utils/analytics";
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
  if (!p) return <ProductNotFound onHome={onHome} />;

  const platforms = p.platforms || [];
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
          <DetailScoreBreakdown breakdown={p.breakdown} />
          <DetailPlatformTable
            platforms={platforms}
            bestPlt={bestPlt}
            onBuy={openPlatform}
          />
          <DetailReviews p={p} />
          <DetailOtherPicks
            allResults={allResults}
            currentName={p.name}
            onSelect={(pick) => onViewProduct?.(pick, allResults)}
          />
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
    </div>
  );
}
