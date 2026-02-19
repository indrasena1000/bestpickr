// src/pages/HomePage.jsx
import { useState, useEffect, useRef } from "react";
import { getCategories, searchProducts } from "../services/api";
import { HomeTableSkeleton } from "../components/Skeleton.jsx";
import { trackClick } from "../utils/analytics";

// ── REAL FEATURED PRODUCTS (Amazon Affiliate Links) ────────────────
// Update product names/prices to match your actual products
const FEATURED_PRODUCTS = [
  {
    id: "fp1",
    name: "Cubic Classic A5 Journal – A5 Size, 160 Pages, 80 gsm | PU Leather Hardbound Notebook with Pen Loop | Black Diary for Writing, Planning, Travel & Office",
    brand: "boAt",
    emoji: "Book",
    price: 167,
    oldPrice: 185,
    discount: 10,
    rating: 4.2,
    reviewCount: 780,
    badge: "🔥 Bestseller",
    affiliateUrl: "https://amzn.to/4rrw4xm",
    features: ["Matte Black - Hardbound", "Cubic", "160"],
    category: "Diaries",
  },
  {
    id: "fp2",
    name: "Scotch-Brite Microfiber Polishing Wipe for cleaning TV, Mobile, Laptop, Tablet screens & Spectacles (Pack of 1, Grey)",
    brand: "Scotch-Brite",
    emoji: "Cloth",
    price: 169,
    oldPrice: 179,
    discount: 6,
    rating: 4.2,
    reviewCount: 3665,
    badge: "⚡ Limited Deal",
    affiliateUrl: "https://amzn.to/3ZLGr2P",
    features: ["Cleaning Cloth", "Microfiber", "Grey"],
    category: "Cloth",
  },
  {
    id: "fp3",
    name: "Plastic Fridge Storage Refrigerator Organizer Container Square Handle Food Storage Organizer Boxes For Vegetable With Lid - 5L, Pack of 1, Transparent",
    brand: "Amazon",
    emoji: "Fridge Item",
    price: 249,
    oldPrice: 699,
    discount: 64,
    rating: 4.5,
    reviewCount: 41200,
    badge: "✅ Top Rated",
    affiliateUrl: "https://amzn.to/3OeTirV",
    features: ["5 litres", "Transparent", "20L x 15W x 10H Centimeters"],
    category: "Smart Home",
  },
];

const RANK_CLASS = ["", "g", "s", "b", "n", "n", "n", "n", "n", "n", "n"];
const SUGGESTS = [
  "noise cancelling headphones",
  "air fryer",
  "running shoes",
  "gaming mouse",
  "robot vacuum cleaner",
  "smartphone under 20000",
  "laptop for students",
];

const PLT_ICONS = { Amazon: "🛒", Flipkart: "🔵", Myntra: "🛍️" };

function FeaturedProductCard({ product }) {
  function handleBuy(e) {
    e.stopPropagation();
    trackClick({
      type: "affiliate_click",
      productId: product.id,
      productName: product.name,
      url: product.affiliateUrl,
    });
    window.open(product.affiliateUrl, "_blank", "noopener,noreferrer");
  }
  return (
    <div className="fcard">
      <div className="fcard-badge">{product.badge}</div>
      <div className="fcard-img-placeholder">{product.emoji}</div>
      <div className="fcard-body">
        <div className="fcard-brand">
          {product.brand} · {product.category}
        </div>
        <div className="fcard-name">{product.name}</div>
        <div className="fcard-rating">
          <span className="fcard-stars">
            {"★".repeat(Math.round(product.rating))}
          </span>
          {product.rating} · {product.reviewCount.toLocaleString()} reviews
        </div>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}
        >
          {product.features.map((f) => (
            <span
              key={f}
              className="plt-pill"
              style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
            >
              {f}
            </span>
          ))}
        </div>
        <div className="fcard-meta">
          <div>
            <div className="fcard-price">
              ₹{product.price.toLocaleString("en-IN")}
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                marginTop: 2,
              }}
            >
              <span className="fcard-old">
                ₹{product.oldPrice.toLocaleString("en-IN")}
              </span>
              <span className="fcard-discount">{product.discount}% off</span>
            </div>
          </div>
        </div>
        <button className="fcard-buy-btn" onClick={handleBuy}>
          🛒 Buy on Amazon →
        </button>
      </div>
    </div>
  );
}

export default function HomePage({ onSearch, onViewProduct }) {
  const [q, setQ] = useState("");
  const [categories, setCats] = useState([]);
  const [activeCat, setActive] = useState("headphones");
  const [products, setProds] = useState([]);
  const [loadingProds, setLoad] = useState(false);
  const inputRef = useRef(null);

  // Load categories on mount
  useEffect(() => {
    getCategories()
      .then((d) => setCats(d.categories || FALLBACK_CATS))
      .catch(() => setCats(FALLBACK_CATS));
  }, []);

  // Load top products for active category
  useEffect(() => {
    if (!activeCat) return;
    setLoad(true);
    setProds([]);
    // Search the API for top products in this category
    searchProducts(activeCat, activeCat)
      .then((d) => setProds(d.results || []))
      .catch(() =>
        setProds(MOCK_PRODUCTS[activeCat] || MOCK_PRODUCTS.headphones),
      )
      .finally(() => setLoad(false));
  }, [activeCat]);

  function handleSearch(e) {
    e?.preventDefault();
    if (q.trim()) onSearch(q.trim(), "");
  }

  const cat = categories.find((c) => c.slug === activeCat);

  return (
    <>
      {/* ── HERO ─────────────────────────────── */}
      <div className="hero">
        <div className="wrap">
          <div style={{ maxWidth: 620 }}>
            <div className="hero-tag">★ AI-powered product rankings</div>
            <h1>
              Stop guessing.
              <br />
              Find the <em>best-rated</em> product.
            </h1>
            <p className="hero-sub">
              bestpickr compares ratings, reviews &amp; prices across Amazon,
              Flipkart &amp; Myntra — then ranks them so you always pick the
              right one.
            </p>
            <form onSubmit={handleSearch}>
              <div className="big-search">
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder='Try "Sony headphones" or "running shoes under ₹3000"…'
                  autoFocus
                />
                <button type="submit" className="big-search-go">
                  Find Best →
                </button>
              </div>
            </form>
            <div className="hero-suggests">
              <span>Popular:</span>
              {SUGGESTS.map((s) => (
                <div
                  key={s}
                  className="suggest-chip"
                  onClick={() => onSearch(s, "")}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ─────────────────────── */}
      <div className="how-strip">
        <div className="wrap">
          <div className="how-items">
            {[
              ["1", "You search", "any product"],
              ["2", "AI scans", "3 platforms"],
              ["3", "Analyzes", "100K+ reviews"],
              ["4", "Shows you", "the Top 10"],
              ["5", "Buy from", "best price store"],
            ].map(([n, b, s]) => (
              <div key={n} className="how-item">
                <div className="how-num">{n}</div>
                <div className="how-text">
                  <b>{b}</b>
                  <br />
                  {s}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="wrap">
        {/* ── CATEGORIES ───────────────────────── */}
        <div className="section">
          <div className="section-head">
            <div className="section-title">Browse by category</div>
          </div>
          <div className="cat-row">
            {categories.map((c) => (
              <div
                key={c.slug}
                className={`cat-btn ${c.slug === activeCat ? "sel" : ""}`}
                onClick={() => setActive(c.slug)}
              >
                <span>{c.emoji}</span>
                {c.name}
              </div>
            ))}
          </div>
        </div>

        {/* ── TOP PICKS TABLE ───────────────────── */}
        <div className="section" style={{ paddingTop: 0 }}>
          <div className="section-head">
            <div className="section-title">
              Top 10 {cat?.name || activeCat} — by bestpickr AI
            </div>
            <div
              className="see-all"
              onClick={() => onSearch(activeCat, activeCat)}
            >
              See full analysis →
            </div>
          </div>

          {loadingProds ? (
            <HomeTableSkeleton />
          ) : products.length > 0 ? (
            <div className="picks-table">
              <div className="picks-table-head">
                <div className="th">#</div>
                <div className="th">Product</div>
                <div className="th">AI Score</div>
                <div className="th">Reviews</div>
                <div className="th">Best Price</div>
                <div className="th"></div>
              </div>
              {products.map((p, i) => (
                <div
                  key={i}
                  className={`picks-row ${i === 0 ? "top-pick" : ""}`}
                  onClick={() => onViewProduct(p, products)}
                >
                  <div className={`rank ${RANK_CLASS[p.rank || i + 1]}`}>
                    #{p.rank || i + 1}
                  </div>
                  <div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <span style={{ fontSize: 24 }}>
                        {CATEGORY_EMOJI[activeCat] || "📦"}
                      </span>
                      <div>
                        <div className="pick-name">{p.name}</div>
                        <div className="pick-brand">{p.brand}</div>
                        <div className="pick-tags">
                          {i === 0 && (
                            <span className="tag tag-g">Best Overall</span>
                          )}
                          {p.positivePct >= 80 && (
                            <span className="tag tag-b">Highly Praised</span>
                          )}
                          {p.lowestPrice &&
                            p.highestPrice &&
                            p.lowestPrice < p.highestPrice * 0.7 && (
                              <span className="tag tag-o">Best Value</span>
                            )}
                        </div>
                      </div>
                    </div>
                    <div className="plt-pills" style={{ marginTop: 6 }}>
                      {(p.platforms || []).map((plt) => (
                        <span key={plt.name} className="plt-pill">
                          {PLT_ICONS[plt.name] || ""} {plt.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="score-num">{p.aiScore}</div>
                    <div className="score-bar">
                      <div
                        className="score-fill"
                        style={{ width: `${(p.aiScore / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="rev-count">
                      {(p.totalReviews || 0).toLocaleString()}
                    </div>
                    <div className="rev-sub">{p.positivePct}% positive</div>
                  </div>
                  <div>
                    <div className="price-best">{fmt(p.lowestPrice)}</div>
                    {p.highestPrice && p.highestPrice !== p.lowestPrice && (
                      <div className="price-range">
                        up to {fmt(p.highestPrice)}
                      </div>
                    )}
                  </div>
                  <div>
                    <button className="view-btn">View deals</button>
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
                padding: "40px 20px",
                textAlign: "center",
                color: "var(--ink3)",
                fontSize: 14,
              }}
            >
              No products found. Try a different category or search above.
            </div>
          )}
        </div>

        {/* ── FEATURED PRODUCTS ──────────────────────── */}
        <div className="section featured-section" style={{ paddingTop: 0 }}>
          <div className="section-head">
            <div className="section-title">
              🔥 Hot Deals — Curated by bestpickr
            </div>
            <div
              style={{ fontSize: 11, color: "var(--ink4)", fontWeight: 600 }}
            >
              Affiliate links · Helps support us
            </div>
          </div>
          <div className="featured-grid">
            {FEATURED_PRODUCTS.map((p) => (
              <FeaturedProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>

        {/* ── SCORE EXPLAINER ─────────────────── */}
        <div className="section" style={{ paddingTop: 0 }}>
          <div
            style={{
              background: "var(--paper)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r3)",
              padding: 24,
            }}
          >
            <div className="section-head" style={{ marginBottom: 12 }}>
              <div className="section-title">How the AI score works</div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                gap: 16,
              }}
            >
              {[
                [
                  "40%",
                  "Platform Ratings",
                  "Weighted avg star rating across all platforms",
                ],
                [
                  "30%",
                  "Review Sentiment",
                  "NLP analysis of positive vs negative language",
                ],
                [
                  "15%",
                  "Value for Money",
                  "Score relative to price vs category average",
                ],
                [
                  "15%",
                  "Review Volume",
                  "More reviews = higher confidence in the score",
                ],
              ].map(([pct, title, desc]) => (
                <div
                  key={title}
                  style={{
                    padding: 14,
                    background: "var(--paper2)",
                    borderRadius: "var(--r2)",
                    border: "1px solid var(--line)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      fontFamily: "'DM Mono',monospace",
                      color: "var(--accent)",
                      marginBottom: 4,
                    }}
                  >
                    {pct}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--ink)",
                      marginBottom: 3,
                    }}
                  >
                    {title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ink3)",
                      lineHeight: 1.5,
                    }}
                  >
                    {desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── HELPERS ────────────────────────────────────────────────────────
const fmt = (n) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : "—");

const CATEGORY_EMOJI = {
  headphones: "🎧",
  smartphones: "📱",
  laptops: "💻",
  gaming: "🎮",
  footwear: "👟",
  skincare: "✨",
  fashion: "👗",
  books: "📚",
  appliances: "🍳",
};

const FALLBACK_CATS = [
  { slug: "headphones", name: "Headphones", emoji: "🎧" },
  { slug: "smartphones", name: "Smartphones", emoji: "📱" },
  { slug: "laptops", name: "Laptops", emoji: "💻" },
  { slug: "gaming", name: "Gaming", emoji: "🎮" },
  { slug: "footwear", name: "Footwear", emoji: "👟" },
  { slug: "skincare", name: "Skincare", emoji: "✨" },
  { slug: "fashion", name: "Fashion", emoji: "👗" },
  { slug: "appliances", name: "Appliances", emoji: "🍳" },
];

const MOCK_PRODUCTS = {
  headphones: [
    {
      rank: 1,
      name: "Sony WH-1000XM5 Wireless NC",
      brand: "Sony",
      aiScore: 9.5,
      totalReviews: 1240,
      positivePct: 84,
      lowestPrice: 24990,
      highestPrice: 27500,
      platforms: [{ name: "Amazon" }, { name: "Flipkart" }],
    },
    {
      rank: 2,
      name: "Bose QuietComfort 45",
      brand: "Bose",
      aiScore: 8.8,
      totalReviews: 890,
      positivePct: 79,
      lowestPrice: 26500,
      highestPrice: 29000,
      platforms: [{ name: "Amazon" }, { name: "Flipkart" }],
    },
    {
      rank: 3,
      name: "Apple AirPods Max",
      brand: "Apple",
      aiScore: 8.2,
      totalReviews: 1050,
      positivePct: 76,
      lowestPrice: 59900,
      highestPrice: 61000,
      platforms: [{ name: "Amazon" }],
    },
    {
      rank: 4,
      name: "Samsung Galaxy Buds 2 Pro",
      brand: "Samsung",
      aiScore: 7.9,
      totalReviews: 640,
      positivePct: 71,
      lowestPrice: 14990,
      highestPrice: 16500,
      platforms: [{ name: "Flipkart" }, { name: "Amazon" }],
    },
    {
      rank: 5,
      name: "Jabra Evolve2 75 Wireless Headset",
      brand: "Jabra",
      aiScore: 7.5,
      totalReviews: 410,
      positivePct: 68,
      lowestPrice: 18999,
      highestPrice: 21000,
      platforms: [{ name: "Amazon" }],
    },
  ],
};
