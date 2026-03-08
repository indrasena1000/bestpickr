// src/routes/products.js
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const logger = require("../utils/logger");
const {
  getTop50Products,
  getClient: getRedisClient,
} = require("../utils/redis");
const { CANONICAL_CATEGORIES } = require("../utils/categoryKeyMap");
const router = express.Router();
const prisma = new PrismaClient();

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
};

// Stable cache key for the top-india list — reused across all requests
// Invalidated + rebuilt every time rankingSnapshotCron runs (every 6h)
const TOP_INDIA_CACHE_KEY = "bestpickr:top-india:stable";
const TOP_INDIA_TTL = 21600; // 6h — aligned with snapshot cron cadence

// GET /api/products/top-india
// Returns the single BEST snapshot product for each canonical category.
//
// Design principles:
//   • STABLE — same products returned on every reload (6h stable cache).
//   • DETERMINISTIC — always the #1 product by aiScore, never random.
//   • FULL DATA — includes platforms[] so detail page works immediately.
//   • ZERO external calls — Redis snapshot only (top50:{category}).
//   • ZERO DB fallback — if a category has no snapshot, we skip it.
//
// Cache: bestpickr:top-india:stable (6h TTL)
//   Invalidated by rankingSnapshotCron after each 6h snapshot run so the
//   next request automatically picks up newly-ranked products.

// Helper: build a canonical product shape with platforms[]
function buildTopIndiaEntry(pick, cat, source) {
  // Field name varies by source:
  // Redis snapshot stores:  affiliateLink
  // Postgres product stores: affiliateUrl
  const url = pick.affiliateLink || pick.affiliateUrl || pick.url || null;
  const price = pick.price || pick.currentPrice || null;
  const rating = pick.rating || pick.platformRating || null;
  const reviewCount = pick.reviewCount || null;
  const platform = pick.platform || "Amazon";

  return {
    id: pick.id || pick.platformId,
    name: pick.name,
    brand: pick.brand || null,
    category: cat,
    emoji: CAT_EMOJI[cat] || "📦",
    price,
    lowestPrice: price,
    imageUrl: pick.imageUrl || null,
    aiScore: pick.aiScore || null,
    rating,
    reviewCount,
    url,
    affiliateUrl: url,
    platform,
    // Include platforms[] so DetailPage renders the buy table immediately
    // without needing a background search hydration
    platforms: url
      ? [
          {
            name: platform,
            price,
            url,
            affiliateUrl: url,
            inStock: true,
            rating,
            reviewCount,
          },
        ]
      : [],
    source,
  };
}

router.get("/top-india", async (req, res) => {
  const rc = getRedisClient();

  // ── 0. Return stable cache if available (prevents reshuffling on reload) ──
  if (rc && rc.status === "ready") {
    try {
      const cached = await rc.get(TOP_INDIA_CACHE_KEY);
      if (cached) {
        const products = JSON.parse(cached);
        logger.info(
          `top-india: stable cache HIT — ${products.length} products`,
        );
        return res.json({ success: true, products, cached: true });
      }
    } catch (e) {
      /* non-fatal — fall through to rebuild */
    }
  }

  // ── 1. Build per-category from Redis snapshots only ───────────────────
  const products = [];

  await Promise.all(
    CANONICAL_CATEGORIES.map(async (cat) => {
      // Try Redis top50 pool first (populated by rankingSnapshotCron)
      try {
        const pool = await getTop50Products(cat);
        if (pool && pool.length > 0) {
          // Always the #1 fully-analyzed product by aiScore — no randomness
          // Require imageUrl so home page always shows product images
          const fullPool = pool.filter(
            (p) => p.imageUrl && p.aiScore && p.brand,
          );
          if (fullPool.length > 0) {
            const pick = fullPool.sort(
              (a, b) => (b.aiScore || 0) - (a.aiScore || 0),
            )[0];
            products.push(buildTopIndiaEntry(pick, cat, "redis"));
            return;
          }
        }
      } catch (err) {
        logger.warn(
          `top-india: Redis snapshot read failed for ${cat} — ${err.message}`,
        );
      }
    }),
  );

  // ── 2. Preserve canonical category order ─────────────────────────────────
  const byCategory = {};
  products.forEach((p) => {
    byCategory[p.category] = p;
  });
  const ordered = CANONICAL_CATEGORIES.map((c) => byCategory[c]).filter(
    Boolean,
  );

  // ── 3. Cache stable list for 6h so all users see the same products ────────
  if (ordered.length > 0 && rc && rc.status === "ready") {
    try {
      await rc.set(
        TOP_INDIA_CACHE_KEY,
        JSON.stringify(ordered),
        "EX",
        TOP_INDIA_TTL,
      );
      logger.info(
        `top-india: stable cache SET — ${ordered.length} products (TTL=${TOP_INDIA_TTL}s)`,
      );
    } catch (e) {
      /* non-fatal */
    }
  }

  logger.info(
    `top-india: returning ${ordered.length} products (deterministic, source: redis-only)`,
  );
  res.json({ success: true, products: ordered });
});

// GET /api/products/top?category=headphones&limit=10
router.get("/top", async (req, res) => {
  const { category, limit = 10 } = req.query;
  try {
    const products = await prisma.product.findMany({
      where: {
        ...(category && { category }),
        inStock: true,
        aiScore: { not: null },
        imageUrl: { not: null },
        platform: "AMAZON",
      },
      orderBy: { aiScore: "desc" },
      take: parseInt(limit),
      include: {
        reviews: true,
        priceHistory: { orderBy: { recordedAt: "desc" }, take: 30 },
      },
    });
    res.json({ success: true, products });
  } catch (err) {
    logger.error("Get top products error:", err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// GET /api/products/category/:slug — fast category browse for home page
// Returns top 10 fully-analyzed Amazon products for a category.
// Best Amazon search query per category — used in Amazon live-fetch fallback
const CATEGORY_SEED_QUERIES = {
  mobile: "best smartphones india 2026",
  laptop: "best laptops india 2026",
  headphones: "best wireless headphones india",
  televisions: "best smart tv 43 inch india",
  appliances: "best home appliances india",
  gaming: "best gaming laptop india",
  camera: "best mirrorless camera india 2026",
  smartwatch: "best smartwatch india 2026",
  footwear: "best running shoes india",
  skincare: "best face serum india",
  fashion: "best casual shirts men india",
  books: "best books india 2026",
};

const CATEGORY_CACHE_TTL = 21600; // 6h

async function fetchFromAmazonAndCache(slug, pr, rc) {
  const amazonService = require("../services/amazonService");
  const { calculateAiScore } = require("../utils/scorer");

  const query = CATEGORY_SEED_QUERIES[slug] || `best ${slug} india`;
  logger.info(`[category/${slug}] DB empty → fetching from Amazon: "${query}"`);

  const items = await amazonService.searchProducts(query, slug);
  if (!items || items.length === 0) return [];

  const avgPrice =
    items
      .map((p) => p.price)
      .filter(Boolean)
      .reduce((a, b, _, arr) => a + b / arr.length, 0) || null;

  const saved = [];
  for (const item of items) {
    const asin = item.platformId;
    if (!asin || !item.imageUrl || !item.brand) continue;

    const r = item.rating || 0;
    const positivePct =
      r >= 4.5 ? 92 : r >= 4 ? 80 : r >= 3.5 ? 68 : r >= 3 ? 55 : 40;
    const { score } = calculateAiScore(
      {
        avgRating: r,
        totalReviews: item.reviewCount || 0,
        positivePct,
        lowestPrice: item.price || null,
        lastUpdated: null,
      },
      avgPrice,
    );

    try {
      const row = await pr.product.upsert({
        where: {
          platform_platformId: { platform: "AMAZON", platformId: asin },
        },
        update: {
          name: item.name,
          brand: item.brand,
          category: slug,
          currentPrice: item.price || 0,
          imageUrl: item.imageUrl,
          platformRating: item.rating || null,
          reviewCount: item.reviewCount || 0,
          aiScore: score,
          affiliateUrl: item.affiliateUrl || item.url || null,
          platformUrl: item.url || null,
          lastScored: new Date(),
          inStock: true,
        },
        create: {
          name: item.name,
          brand: item.brand,
          category: slug,
          platform: "AMAZON",
          platformId: asin,
          platformUrl: item.url || "",
          affiliateUrl: item.affiliateUrl || item.url || null,
          currentPrice: item.price || 0,
          imageUrl: item.imageUrl,
          platformRating: item.rating || null,
          reviewCount: item.reviewCount || 0,
          aiScore: score,
          lastScored: new Date(),
          inStock: true,
        },
      });
      saved.push({ row, item, score, positivePct });
    } catch (_) {}
  }

  if (saved.length === 0) return [];

  const results = saved
    .sort((a, b) => b.score - a.score)
    .map(({ row, item, score }, i) => ({
      id: row.id,
      rank: i + 1,
      name: row.name,
      brand: row.brand,
      category: slug,
      imageUrl: row.imageUrl,
      aiScore: score,
      lowestPrice: row.currentPrice,
      affiliateUrl: row.affiliateUrl || row.platformUrl || null,
      platform: "AMAZON",
      positivePct: null,
    }));

  // Cache in Redis for 6h
  if (rc && rc.status === "ready") {
    const snapshot = results.map((p) => ({
      ...p,
      affiliateLink: p.affiliateUrl,
    }));
    rc.set(
      `top50:${slug}`,
      JSON.stringify(snapshot),
      "EX",
      CATEGORY_CACHE_TTL,
    ).catch(() => {});
    logger.info(
      `[category/${slug}] Cached ${snapshot.length} products in Redis`,
    );
  }

  return results;
}

// Checks Redis top50:{category} first, falls back to Postgres, then Amazon.
// Response shape matches what the home page card rail expects.
router.get("/category/:slug", async (req, res) => {
  const { slug } = req.params;
  const pr = req.app.locals.prisma || prisma;
  const rc = getRedisClient();
  const limit = Math.min(parseInt(req.query.limit || "10"), 50);

  // 1. Try Redis top50:{slug} — built by rankingSnapshotCron every 6h
  if (rc && rc.status === "ready") {
    try {
      const raw = await rc.get(`top50:${slug}`);
      if (raw) {
        const pool = JSON.parse(raw);
        const full = pool.filter((p) => p.imageUrl && p.aiScore && p.brand);
        if (full.length >= 3) {
          const results = full.slice(0, limit).map((p, i) => ({
            id: p.id,
            rank: p.rank || i + 1,
            name: p.name,
            brand: p.brand,
            category: p.category || slug,
            imageUrl: p.imageUrl,
            aiScore: p.aiScore,
            lowestPrice: p.price || p.lowestPrice || null,
            affiliateUrl: p.affiliateLink || p.affiliateUrl || null,
            platform: p.platform || "AMAZON",
            positivePct: p.positivePct || null,
          }));
          return res.json({
            success: true,
            results,
            source: "redis",
            count: results.length,
          });
        }
      }
    } catch (_) {}
  }

  // 2. Postgres fallback
  try {
    const rows = await pr.product.findMany({
      where: {
        category: slug,
        inStock: true,
        aiScore: { not: null },
        imageUrl: { not: null },
        brand: { not: null },
        platform: "AMAZON",
      },
      orderBy: { aiScore: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        brand: true,
        category: true,
        currentPrice: true,
        imageUrl: true,
        aiScore: true,
        affiliateUrl: true,
        platformUrl: true,
        platform: true,
        reviews: { select: { positivePct: true }, take: 1 },
      },
    });

    if (rows.length >= 3) {
      const results = rows.map((p, i) => ({
        id: p.id,
        rank: i + 1,
        name: p.name,
        brand: p.brand,
        category: p.category,
        imageUrl: p.imageUrl,
        aiScore: p.aiScore,
        lowestPrice: p.currentPrice,
        affiliateUrl: p.affiliateUrl || p.platformUrl || null,
        platform: p.platform || "AMAZON",
        positivePct: p.reviews?.[0]?.positivePct || null,
      }));
      return res.json({
        success: true,
        results,
        source: "postgres",
        count: results.length,
      });
    }
  } catch (err) {
    logger.error(`category route postgres: ${slug} — ${err.message}`);
  }

  // 3. Amazon live-fetch fallback — triggered when DB is empty (e.g. after data wipe)
  try {
    const results = await fetchFromAmazonAndCache(slug, pr, rc);
    return res.json({
      success: true,
      results: results.slice(0, limit),
      source: "amazon",
      count: results.length,
    });
  } catch (err) {
    logger.error(`category route amazon fallback: ${slug} — ${err.message}`);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch category products" });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/products/asin/:asin/price-stats
//
// Returns complete price-tracking stats for a product by Amazon ASIN.
// Used by the Detail page price-history widget.
//
// RESPONSE (dataReady = false — first 7 days / <5 entries):
//   { found, dataReady: false, trackingStarted, daysTracking, currentPrice, trend }
//
// RESPONSE (dataReady = true — 7+ days with 5+ price points):
//   { found, dataReady: true, low30d, high30d, avg30d, volatilityPct,
//     trend, buySignal, chartData[] }
//
// THRESHOLDS (configurable via env):
//   BUY_SIGNAL_PCT  = 0.08  → buy_now  when current < avg × 0.92
//   WAIT_SIGNAL_PCT = 0.05  → wait     when current > avg × 1.05
// ─────────────────────────────────────────────────────────────────
router.get("/asin/:asin/price-stats", async (req, res) => {
  const { asin } = req.params;
  const pr = req.app.locals.prisma || prisma;

  try {
    const product = await pr.product.findFirst({
      where: { platform: "AMAZON", platformId: asin },
      select: {
        id: true,
        currentPrice: true,
        currency: true,
        createdAt: true,
        priceHistory: { orderBy: { recordedAt: "asc" } },
      },
    });

    if (!product) {
      return res.json({
        success: true,
        asin,
        found: false,
        dataReady: false,
        message: "Product not yet in price tracking database",
      });
    }

    const history = product.priceHistory;
    const currentPrice = product.currentPrice;
    const currency = product.currency || "INR";
    const entryCount = history.length;

    // Tracking started = first history entry OR product createdAt
    const trackingStarted =
      entryCount > 0 ? history[0].recordedAt : product.createdAt;

    const daysTracking = Math.floor(
      (Date.now() - new Date(trackingStarted)) / (1000 * 60 * 60 * 24),
    );

    // Need 5+ price points AND 7+ days for meaningful stats
    const dataReady = entryCount >= 5 && daysTracking >= 7;

    // ── 30-day window stats ───────────────────────────────────────
    const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const hist30 = history.filter((h) => new Date(h.recordedAt) >= cutoff30);
    const prices30 = hist30.map((h) => h.price).filter((n) => n > 0);

    let low30d = null,
      high30d = null,
      avg30d = null,
      volatilityPct = null;
    if (prices30.length >= 2) {
      low30d = Math.min(...prices30);
      high30d = Math.max(...prices30);
      avg30d = Math.round(
        prices30.reduce((s, p) => s + p, 0) / prices30.length,
      );
      volatilityPct =
        avg30d > 0 ? Math.round(((high30d - low30d) / avg30d) * 100) : 0;
    }

    // ── Trend (7d vs 7–14d) ────────────────────────────────────────
    const cutoff7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const cutoff14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recent7 = history
      .filter((h) => new Date(h.recordedAt) >= cutoff7)
      .map((h) => h.price);
    const prev7 = history
      .filter((h) => {
        const d = new Date(h.recordedAt);
        return d >= cutoff14 && d < cutoff7;
      })
      .map((h) => h.price);

    let trend = "insufficient_data";
    if (recent7.length > 0 && prev7.length > 0) {
      const recentAvg = recent7.reduce((s, p) => s + p, 0) / recent7.length;
      const prevAvg = prev7.reduce((s, p) => s + p, 0) / prev7.length;
      const delta = (recentAvg - prevAvg) / prevAvg;
      trend = delta < -0.02 ? "dropping" : delta > 0.02 ? "rising" : "stable";
    } else if (entryCount >= 2) {
      // Fallback: compare first vs last
      const delta =
        (history[history.length - 1].price - history[0].price) /
        history[0].price;
      trend = delta < -0.02 ? "dropping" : delta > 0.02 ? "rising" : "stable";
    }

    // ── Buy signal ────────────────────────────────────────────────
    const BUY_THRESHOLD = parseFloat(process.env.BUY_SIGNAL_PCT || "0.08");
    const WAIT_THRESHOLD = parseFloat(process.env.WAIT_SIGNAL_PCT || "0.05");
    let buySignal = null;
    if (dataReady && avg30d && currentPrice) {
      if (currentPrice < avg30d * (1 - BUY_THRESHOLD)) buySignal = "buy_now";
      else if (currentPrice > avg30d * (1 + WAIT_THRESHOLD)) buySignal = "wait";
      else buySignal = "neutral";
    }

    // ── Chart data: last 90 data points (ascending) ───────────────
    const chartData = history.slice(-90).map((h) => ({
      date: h.recordedAt,
      price: h.price,
    }));

    return res.json({
      success: true,
      asin,
      found: true,
      dataReady,
      currency,
      currentPrice,
      trackingStarted,
      daysTracking,
      entryCount,
      low30d,
      high30d,
      avg30d,
      volatilityPct,
      trend,
      buySignal,
      chartData,
    });
  } catch (err) {
    logger.error(`price-stats: failed for ${asin} — ${err.message}`);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch price stats" });
  }
});

// GET /api/products/:id  ← must stay LAST (catches all /:id patterns)
// Trigger / refresh AI analysis for a specific product.
// Called by the frontend when the detail page loads with no analysis data.
// Accepts either a Postgres UUID or an Amazon ASIN as :id.
// Falls back to query params (name, brand, category, price, rating) when
// the product is not in Postgres (e.g. fresh live-search result).
router.get("/:id/analyze", async (req, res) => {
  try {
    const rawId = req.params.id;
    const pr = req.app.locals.prisma || prisma;
    const {
      runAnalysisPipeline,
      lookupAnalysis,
    } = require("../pipeline/analysisPipeline");

    // Try to find product in Postgres — handle both UUID and ASIN formats
    let dbProduct = null;
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        rawId,
      );
    try {
      if (isUuid) {
        dbProduct = await pr.product.findUnique({ where: { id: rawId } });
      }
      if (!dbProduct) {
        // rawId might be an ASIN — try platformId lookup
        dbProduct = await pr.product.findFirst({
          where: { platform: "AMAZON", platformId: rawId.toUpperCase() },
        });
      }
    } catch (_) {
      /* UUID format mismatch — swallow */
    }

    // Resolve product details: DB row > query params
    const asin = dbProduct?.platformId || rawId.toUpperCase();
    const name = dbProduct?.name || req.query.name || "Unknown Product";
    const category = dbProduct?.category || req.query.category || "general";
    const brand = dbProduct?.brand || req.query.brand || null;
    const rating =
      dbProduct?.platformRating != null
        ? dbProduct.platformRating
        : req.query.rating
          ? parseFloat(req.query.rating)
          : null;
    const price =
      dbProduct?.currentPrice != null
        ? dbProduct.currentPrice
        : req.query.price
          ? parseFloat(req.query.price)
          : null;

    logger.info(
      `[analyze] id=${rawId} asin=${asin} name="${name}" dbFound=${!!dbProduct}`,
    );

    // Cache-first path: if analysis already exists (Redis/Mongo), return it
    // immediately and skip GPT entirely.
    const cached = await lookupAnalysis(asin);
    const hasReadableAnalysis =
      !!cached &&
      !!(
        cached.buyRecommendation ||
        (cached.whatPeopleLove && cached.whatPeopleLove.length > 0) ||
        (cached.commonComplaints && cached.commonComplaints.length > 0) ||
        cached.avoidIf
      );

    if (hasReadableAnalysis) {
      return res.json({
        success: true,
        analysis: {
          buyRecommendation: cached.buyRecommendation || null,
          whatPeopleLove: cached.whatPeopleLove || [],
          commonComplaints: cached.commonComplaints || [],
          avoidIf: cached.avoidIf || null,
          aiScore: cached.aiScore || null,
        },
        cached: true,
      });
    }

    const result = await runAnalysisPipeline(asin, name, category, {
      brand,
      rating,
      price,
      features: [],
    });

    if (!result) {
      return res
        .status(202)
        .json({ success: false, error: "Analysis not ready yet" });
    }

    // Persist updated aiScore back to Postgres if we have a real DB row
    if (dbProduct && result.aiScore && result.aiScore > 0) {
      try {
        await pr.product.update({
          where: { id: dbProduct.id },
          data: { aiScore: result.aiScore },
        });
      } catch (_) {}
    }

    res.json({
      success: true,
      analysis: {
        buyRecommendation: result.buyRecommendation || null,
        whatPeopleLove: result.whatPeopleLove || [],
        commonComplaints: result.commonComplaints || [],
        avoidIf: result.avoidIf || null,
        aiScore: result.aiScore || null,
      },
    });
  } catch (err) {
    logger.error(`analyze /:id/analyze error: ${err.message}`);
    res.status(500).json({ error: "Analysis failed" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        reviews: true,
        priceHistory: { orderBy: { recordedAt: "desc" }, take: 90 },
      },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

module.exports = router;
