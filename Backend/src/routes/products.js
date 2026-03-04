// src/routes/products.js
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const logger = require("../utils/logger");
const { getTop50Products } = require("../utils/redis");
const { CANONICAL_CATEGORIES } = require("../utils/categoryKeyMap");
const router = express.Router();
const prisma = new PrismaClient();

const CAT_EMOJI = {
  mobile: "📱",
  laptop: "💻",
  headphones: "🎧",
  tablets: "📱",
  smartwatch: "⌚",
  camera: "📷",
  gaming: "🎮",
  appliances: "🍳",
  footwear: "👟",
  skincare: "✨",
  fashion: "👗",
  books: "📚",
};

// GET /api/products/top-india
// Returns a RANDOM top-10 product from each canonical category on every request.
// Randomises on each call so the home page grid feels fresh on every page load.
// Architecture:
//   1. Parallel Redis pool lookup across all categories
//   2. If ALL Redis pools are empty → Postgres fallback (top 10 per category, random pick)
//   3. NEVER calls Amazon — always 0 external API calls
//   4. No whole-response cache — randomisation requires a fresh pick each time
//
// Pool size: up to 50 products per category cached in Redis by rankingSnapshotCron.
// We cap the random window at the top 10 by score so we never show a poor product.
const TOP_INDIA_RANDOM_WINDOW = 3; // pick randomly from top N by aiScore

router.get("/top-india", async (req, res) => {
  const pr = req.app.locals.prisma || prisma;

  // ── 1. Parallel Redis pool lookup — random pick from top 10 per category ──
  const poolResults = await Promise.all(
    CANONICAL_CATEGORIES.map(async (cat) => {
      try {
        const pool = await getTop50Products(cat);
        if (pool && pool.length > 0) {
          // Sort descending by score, take top N, pick one at random
          const top10 = pool
            .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))
            .slice(0, TOP_INDIA_RANDOM_WINDOW);
          const pick = top10[Math.floor(Math.random() * top10.length)];
          return {
            id: pick.id || pick.platformId,
            name: pick.name,
            brand: pick.brand || null,
            category: cat,
            emoji: CAT_EMOJI[cat] || "📦",
            price: pick.currentPrice || pick.price || null,
            imageUrl: pick.imageUrl || null,
            aiScore: pick.aiScore || null,
            url: pick.url || pick.affiliateUrl || null,
            source: "redis",
          };
        }
      } catch (_) {}
      return null;
    }),
  );

  const fromRedis = poolResults.filter(Boolean);
  const missingCats = CANONICAL_CATEGORIES.filter((_cat, i) => !poolResults[i]);

  logger.info(
    `top-india: Redis hit ${fromRedis.length}/${CANONICAL_CATEGORIES.length} categories`,
  );

  // ── 2. Postgres fallback — ONLY if ALL Redis pools are empty ─────────────
  const fromPostgres = [];
  if (fromRedis.length === 0 && missingCats.length > 0) {
    logger.info(
      `top-india: Redis empty — falling back to Postgres for ${missingCats.length} categories`,
    );
    const pgResults = await Promise.all(
      missingCats.map(async (cat) => {
        try {
          // Fetch top 10 by score, then pick randomly
          const rows = await pr.product.findMany({
            where: { category: cat, aiScore: { not: null } },
            orderBy: { aiScore: "desc" },
            take: TOP_INDIA_RANDOM_WINDOW,
            select: {
              id: true,
              name: true,
              brand: true,
              category: true,
              currentPrice: true,
              imageUrl: true,
              aiScore: true,
              platformId: true,
              affiliateUrl: true,
            },
          });
          if (!rows.length) return null;
          const p = rows[Math.floor(Math.random() * rows.length)];
          return {
            id: p.platformId || p.id,
            name: p.name,
            brand: p.brand || null,
            category: cat,
            emoji: CAT_EMOJI[cat] || "📦",
            price: p.currentPrice || null,
            imageUrl: p.imageUrl || null,
            aiScore: p.aiScore || null,
            url: p.affiliateUrl || null,
            source: "postgres",
          };
        } catch (err) {
          logger.warn(`top-india: Postgres failed for ${cat} — ${err.message}`);
          return null;
        }
      }),
    );
    fromPostgres.push(...pgResults.filter(Boolean));
  }

  // ── 3. Merge + preserve canonical category order ──────────────────────────
  const byCategory = {};
  [...fromRedis, ...fromPostgres].forEach((p) => {
    byCategory[p.category] = p;
  });
  const products = CANONICAL_CATEGORIES.map((c) => byCategory[c]).filter(
    Boolean,
  );

  logger.info(`top-india: returning ${products.length} random products`);
  res.json({ success: true, products });
});

// GET /api/products/top?category=headphones&limit=10
router.get("/top", async (req, res) => {
  const { category, limit = 10 } = req.query;
  try {
    const products = await prisma.product.findMany({
      where: { ...(category && { category }), aiScore: { not: null } },
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
