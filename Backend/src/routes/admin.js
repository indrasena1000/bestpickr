// Backend/src/routes/admin.js
// ✅ JWT authentication — access token (15 min) + refresh token (httpOnly cookie, 7 days)
// ✅ Prisma 7 compatible — uses prisma instance from app.locals (set in server.js)
// ✅ Maintenance mode persisted to DB via SiteConfig table

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const verifyAdmin = require("../middleware/verifyAdmin");
const router = express.Router();

const MAINTENANCE_KEY = "maintenance";
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "1d";
const REFRESH_COOKIE = "bp_refresh";

function db(req) {
  return req.app.locals.prisma;
}

function issueTokens(res) {
  const payload = { role: "admin" };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL,
  });

  const isProd = process.env.NODE_ENV === "production";
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax", // 'none' needed for cross-origin (Vercel → backend host)
    maxAge: 1 * 24 * 60 * 60 * 1000, // 1 day
    path: "/api/admin/refresh",
  });
  return accessToken;
}

async function getMaintenanceState(prisma) {
  try {
    const row = await prisma.siteConfig.findUnique({
      where: { key: MAINTENANCE_KEY },
    });
    if (!row)
      return {
        enabled: false,
        message:
          "We're performing scheduled maintenance. We'll be back shortly.",
        eta: "",
        enabledAt: null,
      };
    return JSON.parse(row.value);
  } catch (e) {
    console.error("[Admin] getMaintenanceState error:", e);
    return {
      enabled: false,
      message: "We're performing scheduled maintenance.",
      eta: "",
      enabledAt: null,
    };
  }
}

async function setMaintenanceState(prisma, state) {
  await prisma.siteConfig.upsert({
    where: { key: MAINTENANCE_KEY },
    update: { value: JSON.stringify(state) },
    create: { key: MAINTENANCE_KEY, value: JSON.stringify(state) },
  });
}

// ══════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ══════════════════════════════════════════════════════════════════

// ── POST /api/admin/login ──────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username and password required" });

    const expectedUser = process.env.ADMIN_USER;
    const passwordHash = process.env.ADMIN_PASSWORD_HASH;
    if (!expectedUser || !passwordHash) {
      console.error("[Admin] ADMIN_USER or ADMIN_PASSWORD_HASH not set");
      return res.status(500).json({ error: "Server misconfiguration" });
    }

    const userOk = username === expectedUser;
    const passOk = await bcrypt.compare(password, passwordHash);
    if (!userOk || !passOk)
      return res.status(401).json({ error: "Invalid credentials" });

    const accessToken = issueTokens(res);
    console.log("[Admin] Login successful");
    res.json({ ok: true, accessToken, expiresIn: ACCESS_TOKEN_TTL });
  } catch (err) {
    console.error("[Admin] login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ── POST /api/admin/refresh ────────────────────────────────────────
router.post("/refresh", (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken)
      return res
        .status(401)
        .json({ error: "No refresh token", code: "NO_REFRESH" });

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    if (payload.role !== "admin")
      return res.status(403).json({ error: "Forbidden" });

    const accessToken = issueTokens(res);
    res.json({ ok: true, accessToken, expiresIn: ACCESS_TOKEN_TTL });
  } catch (err) {
    const isProd = process.env.NODE_ENV === "production";
    res.clearCookie(REFRESH_COOKIE, {
      path: "/api/admin/refresh",
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
    });
    if (err.name === "TokenExpiredError")
      return res
        .status(401)
        .json({
          error: "Session expired — please log in again",
          code: "SESSION_EXPIRED",
        });
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

// ── POST /api/admin/logout ─────────────────────────────────────────
router.post("/logout", (req, res) => {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie(REFRESH_COOKIE, {
    path: "/api/admin/refresh",
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
  });
  console.log("[Admin] Logout");
  res.json({ ok: true });
});

// ── GET /api/admin/status ──────────────────────────────────────────
// Public — used by frontend to poll maintenance mode
router.get("/status", async (req, res) => {
  try {
    const state = await getMaintenanceState(db(req));
    res.json({
      maintenance: state.enabled,
      message: state.message,
      eta: state.eta,
      enabledAt: state.enabledAt,
    });
  } catch (err) {
    console.error("[Admin] status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// PROTECTED ROUTES — JWT required (verifyAdmin middleware)
// ══════════════════════════════════════════════════════════════════

// ── POST /api/admin/maintenance ────────────────────────────────────
router.post("/maintenance", verifyAdmin, async (req, res) => {
  try {
    const { enabled, message, eta } = req.body;
    const current = await getMaintenanceState(db(req));
    const newState = {
      enabled: Boolean(enabled),
      message: message || current.message,
      eta: eta || "",
      enabledAt: enabled ? new Date().toISOString() : null,
      enabledBy: "admin",
    };
    await setMaintenanceState(db(req), newState);
    console.log(`[Admin] Maintenance mode ${enabled ? "ENABLED" : "DISABLED"}`);
    res.json({
      ok: true,
      maintenance: newState.enabled,
      message: newState.message,
    });
  } catch (err) {
    console.error("[Admin] maintenance toggle error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/cache-info ──────────────────────────────────────
router.get("/cache-info", verifyAdmin, async (req, res) => {
  try {
    const { getCacheInfo } = require("../utils/redis");
    res.json(await getCacheInfo());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/admin/cache ────────────────────────────────────────
router.delete("/cache", verifyAdmin, async (req, res) => {
  try {
    const { flushBestpickrCache } = require("../utils/redis");
    const deleted = await flushBestpickrCache();
    console.log(`[Admin] Redis cache flushed: ${deleted} keys deleted`);
    res.json({ ok: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/product-debug?q=... ────────────────────────────
// Returns raw Amazon API data + field-level annotation of what's real vs fallback.
// Used in the admin "Data Debug" tab to understand data quality.
router.get("/product-debug", verifyAdmin, async (req, res) => {
  const q = (req.query.q || "").trim();
  const cat = (req.query.cat || "").trim();
  if (!q) return res.status(400).json({ error: "q is required" });

  try {
    const amazonService = require("../services/amazonService");
    const { ProductAnalysis } = require("../models");

    const start = Date.now();
    const raw = await amazonService.searchProducts(q, cat);

    // For each product, check if we have AI analysis in MongoDB
    const results = await Promise.all(
      raw.slice(0, 8).map(async (p) => {
        const asin = p.asin || p.platformId || null;
        let analysis = null;
        if (asin) {
          try {
            analysis = await ProductAnalysis.findOne({ asin }).lean();
          } catch {
            /* skip */
          }
        }

        // Annotate each field: 'real', 'computed', 'fallback', 'missing'
        const fields = {
          asin: { value: asin, status: asin ? "real" : "missing" },
          name: {
            value: p.name || p.title,
            status: p.name || p.title ? "real" : "missing",
          },
          brand: { value: p.brand, status: p.brand ? "real" : "missing" },
          price: { value: p.price, status: p.price ? "real" : "missing" },
          mrp: { value: p.mrp, status: p.mrp ? "real" : "fallback" },
          discountPct: {
            value: p.discountPct,
            status: p.discountPct ? "real" : "missing",
          },
          imageUrl: {
            value: p.imageUrl ? "✓ present" : null,
            status: p.imageUrl ? "real" : "missing",
          },
          url: {
            value: p.url ? "✓ present" : null,
            status: p.url ? "real" : "missing",
          },
          rating: { value: p.rating, status: p.rating ? "real" : "missing" },
          reviewCount: {
            value: p.reviewCount,
            status: p.reviewCount ? "real" : "missing",
          },
          inStock: {
            value: p.inStock,
            status: p.inStock !== undefined ? "real" : "missing",
          },
          features: {
            value: p.features?.length ? `${p.features.length} features` : null,
            status: p.features?.length ? "real" : "missing",
          },
          // Analysis fields (from GPT + review scraping)
          aiScore: {
            value: analysis?.aiScore,
            status: analysis?.aiScore ? "real" : "missing",
          },
          positivePct: {
            value: analysis?.overallSentiment?.positive,
            status: analysis?.overallSentiment ? "real" : "missing",
          },
          reviewsAnalyzed: {
            value: analysis?.reviewsAnalyzed,
            status: analysis?.reviewsAnalyzed ? "real" : "missing",
          },
          whatPeopleLove: {
            value: analysis?.whatPeopleLove?.length
              ? `${analysis.whatPeopleLove.length} points`
              : null,
            status: analysis?.whatPeopleLove?.length ? "real" : "missing",
          },
          commonComplaints: {
            value: analysis?.commonComplaints?.length
              ? `${analysis.commonComplaints.length} points`
              : null,
            status: analysis?.commonComplaints?.length ? "real" : "missing",
          },
          authenticityBadge: {
            value: analysis?.authenticityBadge,
            status: analysis?.authenticityBadge ? "real" : "missing",
          },
        };

        return {
          asin,
          name: p.name || p.title,
          brand: p.brand,
          fields,
          hasAnalysis: !!analysis,
        };
      }),
    );

    res.json({
      ok: true,
      query: q,
      elapsed_ms: Date.now() - start,
      count: results.length,
      results,
    });
  } catch (err) {
    console.error("[Admin] product-debug error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/preload-categories ────────────────────────────
router.post("/preload-categories", verifyAdmin, async (req, res) => {
  try {
    const { preloadAllCategories } = require("../cron/categoryPreloader");
    res.json({ ok: true, message: "Category preload started in background" });
    const result = await preloadAllCategories();
    console.log("[Admin] Preload complete:", result);
  } catch (err) {
    console.error("[Admin] preload error:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/seed-categories ──────────────────────────────────
// Seeds all canonical categories from Amazon + rebuilds Redis top50 keys.
// Clears incomplete products (no image) before seeding.
// Call this after a fresh deploy or when categories are empty.
router.post("/seed-categories", verifyAdmin, async (req, res) => {
  res.json({
    ok: true,
    message: "Category seeding started in background — check logs",
  });
  try {
    const prisma = db(req);
    const amazonService = require("../services/amazonService");
    const { calculateAiScore } = require("../utils/scorer");
    const { CANONICAL_CATEGORIES } = require("../utils/categoryKeyMap");
    const { getClient } = require("../utils/redis");
    const redis = getClient();
    const SNAPSHOT_TTL = 21600;

    // Category → best Amazon search query for quality results
    const SEED_QUERIES = {
      mobile: "best smartphones india 2026",
      laptop: "best laptops india 2026",
      headphones: "best wireless headphones india",
      televisions: "best smart tv 43 inch india",
      appliances: "best air conditioner 1.5 ton india",
      gaming: "best gaming laptop india",
      camera: "best mirrorless camera india 2026",
      tablets: "best tablets india 2025",
      smartwatch: "best smartwatch india 2026",
      footwear: "best running shoes india",
      skincare: "best face serum india",
      fashion: "best casual shirts men india",
    };

    // Step 1: Delete obviously bad records (no image OR FLIPKART/MYNTRA)
    try {
      const deleted = await prisma.product.deleteMany({
        where: {
          OR: [
            { imageUrl: null },
            { platform: { in: ["FLIPKART", "MYNTRA"] } },
          ],
        },
      });
      console.log(
        `[SeedCategories] Cleaned up ${deleted.count} incomplete/non-Amazon products`,
      );
    } catch (cleanErr) {
      console.error(
        "[SeedCategories] Cleanup error (non-fatal):",
        cleanErr.message,
      );
    }

    // Invalidate all cached data so fresh data serves immediately after seeding
    if (redis && redis.status === "ready") {
      try {
        const keys = await redis.keys("top50:*");
        const topIndia = await redis.keys("bestpickr:top-india:*");
        const searchKeys = await redis.keys("search:*");
        const allKeys = [...keys, ...topIndia, ...searchKeys];
        if (allKeys.length > 0) await redis.del(...allKeys);
        console.log(`[SeedCategories] Cleared ${allKeys.length} Redis keys`);
      } catch (redisErr) {
        console.error(
          "[SeedCategories] Redis cleanup error:",
          redisErr.message,
        );
      }
    }

    // Step 2: Seed each category from Amazon — save flat items directly by ASIN
    for (const category of CANONICAL_CATEGORIES) {
      const query = SEED_QUERIES[category] || `best ${category} india`;
      try {
        console.log(`[SeedCategories] Seeding "${category}" — query: "${query}"`);
        const items = await amazonService.searchProducts(query, category);
        if (!items || items.length === 0) {
          console.warn(`[SeedCategories] Amazon returned 0 for "${category}" — skipping`);
          continue;
        }

        const avgPrice =
          items.map((p) => p.price).filter(Boolean)
            .reduce((a, b, _, arr) => a + b / arr.length, 0) || null;

        let saved = 0;
        for (const item of items) {
          const asin = item.platformId;
          if (!asin || !item.imageUrl) continue; // require ASIN and image

          // Estimate positivePct from rating
          const r = item.rating || 0;
          const positivePct = r >= 4.5 ? 92 : r >= 4 ? 80 : r >= 3.5 ? 68 : r >= 3 ? 55 : 40;

          const { score } = calculateAiScore(
            {
              avgRating: item.rating || 0,
              totalReviews: item.reviewCount || 0,
              positivePct,
              lowestPrice: item.price || null,
              lastUpdated: null,
            },
            avgPrice,
          );

          try {
            await prisma.product.upsert({
              where: { platform_platformId: { platform: "AMAZON", platformId: asin } },
              update: {
                name: item.name,
                brand: item.brand || null,
                category,
                currentPrice: item.price || 0,
                imageUrl: item.imageUrl,
                platformRating: item.rating || null,
                reviewCount: item.reviewCount || 0,
                aiScore: score,
                affiliateUrl: item.affiliateUrl || item.url || null,
                platformUrl: item.url || null,
                lastScored: new Date(),
                inStock: item.inStock !== false,
              },
              create: {
                name: item.name,
                brand: item.brand || null,
                category,
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
                inStock: item.inStock !== false,
              },
            });
            saved++;
          } catch (_) {}
        }
        console.log(`[SeedCategories] "${category}" — saved/updated ${saved} products`);

        // Rebuild Redis top50:{category} from DB immediately after saving
        if (redis && redis.status === "ready") {
          const dbProducts = await prisma.product.findMany({
            where: {
              category,
              inStock: true,
              aiScore: { not: null },
              imageUrl: { not: null },
              brand: { not: null },
              platform: "AMAZON",
            },
            orderBy: { aiScore: "desc" },
            take: 10,
            select: {
              id: true, name: true, brand: true, category: true,
              imageUrl: true, currentPrice: true, platformRating: true,
              reviewCount: true, aiScore: true, affiliateUrl: true,
              platformUrl: true, platform: true,
            },
          });
          if (dbProducts.length > 0) {
            const snapshot = dbProducts.map((p, i) => ({
              id: p.id, rank: i + 1, name: p.name, brand: p.brand,
              category: p.category, imageUrl: p.imageUrl,
              price: p.currentPrice, lowestPrice: p.currentPrice,
              rating: p.platformRating, reviewCount: p.reviewCount,
              rankingScore: p.aiScore, aiScore: p.aiScore,
              affiliateLink: p.affiliateUrl || p.platformUrl,
              platform: p.platform,
            }));
            await redis.set(`top50:${category}`, JSON.stringify(snapshot), "EX", SNAPSHOT_TTL);
            console.log(`[SeedCategories] Redis top50:${category} — ${snapshot.length} products`);
          }
        }
        // Rate limit between categories to avoid Amazon throttling
        await new Promise((r) => setTimeout(r, 2500));
      } catch (catErr) {
        console.error(`[SeedCategories] "${category}" failed:`, catErr.message);
      }
    }

    // Invalidate top-india cache so it rebuilds fresh on next request
    if (redis && redis.status === "ready") {
      try { await redis.del("bestpickr:top-india:stable"); } catch (_) {}
    }
    console.log("[SeedCategories] All categories seeded — top-india cache invalidated");
  } catch (err) {
    console.error("[SeedCategories] Fatal error:", err.message);
  }
});

module.exports = router;
