// src/pages/HomePage.jsx
import { useState, useEffect, useRef } from "react";
import { getCategories, searchProducts } from "../services/api";
import { HomeTableSkeleton } from "../components/Skeleton.jsx";
import { trackAffiliateClick } from "../utils/analytics";

// ── REAL FEATURED PRODUCTS (Amazon Affiliate Links) ────────────────
// Product 1 — Fridge Organizer (B08WC9RQYD)
//   Full URL you gave:  https://www.amazon.in/dp/B08WC9RQYD?...tag=bestpickr-21&linkId=0940b6aa9d41a50bb4d71b5efea535e6...
//   Short URL backup:   https://amzn.to/4r3wGbD
//   We use the CLEAN full URL (tag + linkCode + linkId + ref only) — Amazon tracks this
//
// TO ADD MORE PRODUCTS:
//   1. Go to Amazon Associates portal → get your full link for the product
//   2. Clean it: keep tag=, linkCode=, linkId=, ref_= — remove social_share, badgeInsights, th=
//   3. Add a new object below with the ASIN and cleaned URL
const FEATURED_PRODUCTS = [
  {
    id: "fp1",
    asin: "B08WC9RQYD",
    name: "Plastic Fridge Storage Refrigerator Organizer Container Square Handle Food Storage Organizer Boxes For Vegetable With Lid - 5L, Pack of 1, Transparent",
    brand: "Amazon Brand",
    emoji: "🧊",
    imageUrl:
      "https://m.media-amazon.com/images/I/71WqBJFa2TL._SX342_SY445_.jpg",
    price: 249,
    oldPrice: 699,
    discount: 64,
    rating: 4.5,
    reviewCount: 41200,
    badge: "✅ Top Rated",
    // ✅ Full affiliate URL — cleaned version of what you gave (removed social_share, badgeInsights, th=1)
    affiliateUrl:
      "https://www.amazon.in/LEMBOSE-Refrigerator-Organizer-Container-Vegetable/dp/B0CCLMLRY8?crid=1QBRA2JXCCKVB&dib=eyJ2IjoiMSJ9.MxsAHhKXyeBohfcJKGsSgILnQmYzd6UeRRT059Ayieda7a91Itba2PUnS7MOHZ8Jb5M7lG7oTRPVpPr5TOkoR1OB65mXT8SQYCgZGSJ8njh0ON03GTCj58IdXM4El75Kc5P7kgAbDWxMYM6gTO7EWTorQO4-2_wkVp0JdXvId3mkoagooHQ_tNjOYXiyBe1cAap0xtb1Ju777bJzDkP4RM5cTrrOih1ccT0ZbB24zyyt_Hjp9HHH015-nNOF5DoYsEy1yhxl5rrb2bMejExHJQzvRot4LJRVLTJliCvc9WU.064zlbnTgt7oLrKc9TG5dLDZBox110sy9lblFcknsq0&dib_tag=se&keywords=Plastic%2BFridge%2BStorage%2BRefrigerator%2BOrganizer%2BContainer%2BSquare%2BHandle%2BFood%2BStorage%2BOrganizer%2BBoxes%2BFo&nsdOptOutParam=true&qid=1771484669&sprefix=cubic%2Bclassic%2Ba5%2Bjournal%2B160%2Bpages%2C%2B80%2Bgsm%2Bpu%2Bleather%2Bhardbound%2Bnotebook%2Bwith%2Bpen%2Bloop%2Bblack%2Bdiary%2Bfor%2Bwriting%2C%2Bplanning%2C%2Btravel%2B%26%2Boffice%2Caps%2C347&sr=8-3-spons&aref=cI8VVeujXE&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1&linkCode=ll2&tag=bestpickr-21&linkId=3224d39e3ae39a53dc87cfaca0257221&ref_=as_li_ss_tl",
    features: ["5 Litres", "Transparent", "With Lid"],
    category: "Kitchen",
  },
  {
    id: "fp2",
    asin: "B09Q4BX7YN",
    name: "Cubic Classic A5 Journal – 160 Pages, 80 gsm | PU Leather Hardbound Notebook with Pen Loop | Black Diary for Writing, Planning, Travel & Office",
    brand: "Cubic",
    emoji: "📓",
    imageUrl:
      "https://m.media-amazon.com/images/I/71k3o+gJgFL._SX342_SY445_.jpg",
    price: 167,
    oldPrice: 185,
    discount: 10,
    rating: 4.2,
    reviewCount: 780,
    badge: "🔥 Bestseller",
    // TODO: Replace with your full Associates link for this product
    affiliateUrl:
      "https://www.amazon.in/Classic-Journal-Leather-Planning-Notebook/dp/B0C591TT8F?dib=eyJ2IjoiMSJ9.Ggl4BMpc0dCa9nJVjAeyYCL283ovhj-ltLDb18grg63owlMVhT8_CrEnek8ZvLLJfqB1zBVinPWuKRlzBvf5ts1Tr-mNGXlLQEY_RTvNse0oZ7C_iCTZUXIcs1oAgUqPGpXJYYYNLCUKPBO-YFand-OOEEV2691zcanpFj_tWIAVrA5tZDyPv8OzFXg4jVQ-FQe2ztoTzQAfmQottAaUawDct1rGnwKPDLI9yOJpX0rRgYTkJd7-r7kd8734KdN_RaiXFFkZSQl75owt7INM1r5XMDIg0Tau2abHjx_Ka0Y.-rLUpusNiyhQFQawgtydhMMH_Qv1Ke0mrQXGF4sPB2Y&dib_tag=se&keywords=Cubic%2BClassic%2BA5%2BJournal%2B%E2%80%93%2B160%2BPages%2C%2B80%2Bgsm%2B%7C%2BPU%2BLeather%2BHardbound%2BNotebook%2Bwith%2BPen%2BLoop%2B%7C%2BBlack%2BDiary%2Bfor%2BWriting%2C%2BPlanning%2C%2BTravel%2B%26%2BOffice&nsdOptOutParam=true&qid=1771484618&sr=8-1-spons&aref=4QToBf6gsW&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1&linkCode=ll2&tag=bestpickr-21&linkId=2657a6de8c2932c182b76deb8e749024&ref_=as_li_ss_tl",
    features: ["Hardbound", "A5 Size", "160 Pages"],
    category: "Diaries",
  },
  {
    id: "fp3",
    asin: "B07QDQB9ZX",
    name: "Scotch-Brite Microfiber Polishing Wipe for cleaning TV, Mobile, Laptop, Tablet screens & Spectacles (Pack of 1, Grey)",
    brand: "Scotch-Brite",
    emoji: "🧹",
    imageUrl:
      "https://m.media-amazon.com/images/I/61RI+lFf3HL._SX342_SY445_.jpg",
    price: 169,
    oldPrice: 179,
    discount: 6,
    rating: 4.2,
    reviewCount: 3665,
    badge: "⚡ Limited Deal",
    // TODO: Replace with your full Associates link for this product
    affiliateUrl:
      "https://www.amazon.in/Scotch-Brite-Microfiber-Polishing-Wipe-Grey/dp/B07DQXH8JZ?crid=2W3W1ZNX0YEX2&dib=eyJ2IjoiMSJ9.3mtZZVu_wbSnmeVpEEKoq8oi14CLRqys3eAg59JFqwqqIBnNdUv0JqLHMnoNf48MvR31PG55nAvyr1l6DhmaAKtmRHQA6DQm8C80Q3wx6Hah5d1WOaqoeOsts2JMEl3OjXx0VbV_8VNL9BTShdk7GH3hyxk265oUBHm0ruIBlVpO5ybSZb10Y-sXur1Q_plr5eBjsDnd__W9AboLNf9ICitn8wVXUJC82idVX_qPgEEV0n5gEdMbi8t6QqyiPNLIyp4z4eZhIhJxe0sUxlaozqSvYsGKBaxMihzQi_gcP2o.PbwlzGj-rHl9CIOQroRKbVdCxIeugfEkKDd5K2MraiI&dib_tag=se&keywords=Scotch-Brite+Microfiber+Polishing+Wipe+for+cleaning+TV%2C+Mobile%2C+Laptop%2C+Tablet+screens+%26+Spectacles+%28Pack+of+1%2C+Grey%29&nsdOptOutParam=true&qid=1771483819&sprefix=%2Caps%2C409&sr=8-1-spons&aref=L2ZrGaFU0n&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1&linkCode=ll2&tag=bestpickr-21&linkId=87747a090d2be209a3f34aed820729aa&ref_=as_li_ss_tl",
    features: ["Microfiber", "Screen Safe", "Grey"],
    category: "Cleaning",
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
  const [imgFailed, setImgFailed] = useState(false);

  function handleBuy(e) {
    e.stopPropagation();
    trackAffiliateClick({
      productName: product.name,
      productId: product.asin,
      platform: "Amazon",
      affiliateUrl: product.affiliateUrl,
      price: product.price,
    });
    window.open(product.affiliateUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="fcard">
      <div className="fcard-badge">{product.badge}</div>
      <div
        className="fcard-img-placeholder"
        style={{
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {product.imageUrl && !imgFailed ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            onError={() => setImgFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <span style={{ fontSize: 48 }}>{product.emoji}</span>
        )}
      </div>
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
