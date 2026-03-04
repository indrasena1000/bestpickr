// components/detail/DetailBuyCard.jsx
// ─────────────────────────────────────────────────────────────────
// PRICE WIDGET STATES
//
//  V0 — loading skeleton (usePriceHistory in flight)
//  V1 — tracking started but < 7 days or < 5 data points
//       shows: current price, tracking start date, simple trend label
//  V2 — 30+ days of real data (dataReady = true)
//       shows: 30d low / high, buy signal, volatility
//
// NO fake historical data. NO all-time values from multipliers.
// ─────────────────────────────────────────────────────────────────
import { PlatformLogo } from "../PlatformLogo.jsx";
import { usePriceHistory } from "../../hooks/usePriceHistory.js";

const fmt = (n) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : "—");

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

// ── Trend label config ────────────────────────────────────────────
const TREND_CONFIG = {
  dropping: { label: "Price dropping ↓", color: "#5dba85" },
  stable: { label: "Price stable →", color: "#a0aab4" },
  rising: { label: "Price rising ↑", color: "#f4956b" },
  insufficient_data: { label: "Insufficient data yet", color: "#6b7280" },
};

// ── Buy signal config ─────────────────────────────────────────────
const BUY_SIGNAL_CONFIG = {
  buy_now: {
    label: "Good time to buy",
    color: "#5dba85",
    bg: "rgba(93,186,133,0.12)",
  },
  wait: {
    label: "Price above average — consider waiting",
    color: "#f4956b",
    bg: "rgba(244,149,107,0.12)",
  },
  neutral: {
    label: "Price near average",
    color: "#a0aab4",
    bg: "rgba(160,170,180,0.08)",
  },
};

export default function DetailBuyCard({ p, bestPlt, platforms, onBuy }) {
  const asin = p?.asin || p?.platformId || null;
  const { stats, loading } = usePriceHistory(asin);

  const currentPriceDisplay = p.lowestPrice || bestPlt?.price || null;

  // ── BUY BUTTON ───────────────────────────────────────────────────
  const BuyButton = (
    <button className="buy-card-main-btn" onClick={() => onBuy(bestPlt)}>
      Buy on {bestPlt?.name || "Amazon"} →
    </button>
  );

  // ── PLATFORMS LIST ───────────────────────────────────────────────
  const PlatformList = (
    <div className="platform-quick">
      <div className="pq-title">All platforms</div>
      {platforms.map((plt) => (
        <div key={plt.name} className="pq-row">
          <span
            className="pq-icon"
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            <PlatformLogo name={plt.name} size={16} />
          </span>
          <span className="pq-name">{plt.name}</span>
          <span
            className="pq-price"
            style={!plt.price ? { color: "var(--ink4)" } : {}}
          >
            {plt.price ? fmt(plt.price) : "Check price"}
          </span>
          <span className="pq-btn" onClick={() => onBuy(plt)}>
            {plt.price ? "Buy" : "Go"}
          </span>
        </div>
      ))}
    </div>
  );

  // ── PRICE HISTORY WIDGET ─────────────────────────────────────────
  const PriceWidget = () => {
    // V0 — skeleton while loading
    if (loading) {
      return (
        <div className="price-history">
          <div className="ph-title">Price history</div>
          <div
            style={{
              height: 48,
              background: "rgba(255,255,255,0.05)",
              borderRadius: 8,
              marginTop: 8,
            }}
          />
        </div>
      );
    }

    // Product not yet in DB — show minimal note
    if (!stats || !stats.found) {
      return (
        <div className="price-history">
          <div className="ph-title">Price history</div>
          <div className="ph-row">
            <span className="ph-label">Current price</span>
            <span className="ph-val cur">{fmt(currentPriceDisplay)}</span>
          </div>
          <p
            style={{
              fontSize: 11,
              color: "var(--ink4)",
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Price tracking begins when you first view this product. Check back
            tomorrow.
          </p>
        </div>
      );
    }

    const trendCfg =
      TREND_CONFIG[stats.trend] || TREND_CONFIG.insufficient_data;
    const startDate = fmtDate(stats.trackingStarted);

    // ── V2 — enough data (30d stats ready) ───────────────────────
    if (stats.dataReady) {
      const signal = stats.buySignal
        ? BUY_SIGNAL_CONFIG[stats.buySignal]
        : null;
      const youSave =
        stats.low30d && stats.high30d && stats.currentPrice < stats.high30d
          ? stats.high30d - stats.currentPrice
          : null;
      const savePct =
        youSave && stats.high30d
          ? Math.round((youSave / stats.high30d) * 100)
          : null;

      return (
        <div className="price-history">
          <div className="ph-title">
            Price history
            <span
              style={{
                fontWeight: 400,
                fontSize: 10,
                color: "var(--ink4)",
                marginLeft: 6,
              }}
            >
              {stats.daysTracking}d data · {stats.entryCount} readings
            </span>
          </div>

          <div className="ph-row">
            <span className="ph-label">30-day low</span>
            <span className="ph-val low">{fmt(stats.low30d)}</span>
          </div>
          <div className="ph-row">
            <span className="ph-label">30-day high</span>
            <span className="ph-val high">{fmt(stats.high30d)}</span>
          </div>
          <div className="ph-row">
            <span className="ph-label">30-day avg</span>
            <span className="ph-val cur">{fmt(stats.avg30d)}</span>
          </div>
          <div className="ph-row">
            <span className="ph-label">Current price</span>
            <span className="ph-val cur" style={{ fontWeight: 700 }}>
              {fmt(stats.currentPrice)}
            </span>
          </div>

          {youSave && youSave > 0 && (
            <div className="ph-row">
              <span className="ph-label">You save</span>
              <span className="ph-val low">
                {fmt(youSave)} ({savePct}%) vs 30d high
              </span>
            </div>
          )}

          {/* Trend + buy signal */}
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span
              style={{ fontSize: 11, color: trendCfg.color, fontWeight: 600 }}
            >
              {trendCfg.label}
            </span>
            {signal && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: signal.color,
                  background: signal.bg,
                  borderRadius: 6,
                  padding: "5px 8px",
                  lineHeight: 1.4,
                }}
              >
                {signal.label}
                {stats.volatilityPct > 0 && (
                  <span
                    style={{
                      fontWeight: 400,
                      color: "var(--ink4)",
                      marginLeft: 6,
                    }}
                  >
                    · {stats.volatilityPct}% swing
                  </span>
                )}
              </div>
            )}
          </div>
          <p
            style={{
              fontSize: 10,
              color: "var(--ink4)",
              marginTop: 6,
              lineHeight: 1.4,
            }}
          >
            Tracked since {startDate}
          </p>
        </div>
      );
    }

    // ── V1 — tracking started but not enough data yet ────────────
    return (
      <div className="price-history">
        <div className="ph-title">Price history</div>
        <div className="ph-row">
          <span className="ph-label">Current price</span>
          <span className="ph-val cur" style={{ fontWeight: 700 }}>
            {fmt(stats.currentPrice || currentPriceDisplay)}
          </span>
        </div>
        <div
          style={{
            marginTop: 8,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <span
            style={{ fontSize: 11, color: trendCfg.color, fontWeight: 600 }}
          >
            {trendCfg.label}
          </span>
          <p
            style={{
              fontSize: 11,
              color: "var(--ink4)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Price tracking started {startDate}.
            {stats.daysTracking < 7
              ? ` Full stats available after 7 days (${7 - stats.daysTracking} days left).`
              : ` Building 30-day history — ${stats.entryCount} readings so far.`}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="buy-card">
      <div className="buy-card-header">
        <div className="buy-card-header-label">Best price found</div>
        <div className="buy-card-price">{fmt(currentPriceDisplay)}</div>
        <div className="buy-card-sub">
          on {bestPlt?.name || "Amazon"} · Free delivery
        </div>
      </div>

      <div className="buy-card-body">
        {BuyButton}
        <PriceWidget />
        {PlatformList}
      </div>
    </div>
  );
}
