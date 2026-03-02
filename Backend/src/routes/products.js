// src/routes/products.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const logger  = require('../utils/logger');
const { getTop50Products, getClient } = require('../utils/redis');
const { CANONICAL_CATEGORIES } = require('../utils/categoryKeyMap');
const router  = express.Router();
const prisma  = new PrismaClient();

const CAT_EMOJI = {
  mobile:'📱', laptop:'💻', headphones:'🎧', tablets:'📱',
  smartwatch:'⌚', camera:'📷', gaming:'🎮', appliances:'🍳',
  footwear:'👟', skincare:'✨', fashion:'👗', books:'📚',
};

const TOP_INDIA_CACHE_KEY = 'bestpickr:top-india'
const TOP_INDIA_CACHE_TTL = 900  // 15 minutes

// GET /api/products/top-india
// Returns the #1 AI-ranked product from each canonical category.
// Architecture:
//   1. Whole-response Redis cache (15 min TTL) — single key, zero pool lookups on repeat visits
//   2. Parallel Redis pool lookup across all categories
//   3. If ALL Redis pools are empty → one parallel Postgres query per category
//   4. NEVER calls Amazon — this endpoint is always 0 external API calls
router.get('/top-india', async (req, res) => {
  const pr = req.app.locals.prisma || prisma;
  const redis = getClient();

  // ── 1. Whole-response cache ───────────────────────────────────────
  if (redis && redis.status === 'ready') {
    try {
      const cached = await redis.get(TOP_INDIA_CACHE_KEY);
      if (cached) {
        const products = JSON.parse(cached);
        logger.info(`top-india: cache HIT — ${products.length} products`);
        return res.json({ success: true, products, source: 'cache' });
      }
    } catch (_) {}
  }

  // ── 2. Parallel Redis pool lookup ────────────────────────────────
  const poolResults = await Promise.all(
    CANONICAL_CATEGORIES.map(async (cat) => {
      try {
        const pool = await getTop50Products(cat);
        if (pool && pool.length > 0) {
          const top = pool.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))[0];
          return {
            id:       top.id || top.platformId,
            name:     top.name,
            brand:    top.brand || null,
            category: cat,
            emoji:    CAT_EMOJI[cat] || '📦',
            price:    top.currentPrice || top.price || null,
            imageUrl: top.imageUrl || null,
            aiScore:  top.aiScore || null,
            url:      top.url || top.affiliateUrl || null,
            source:   'redis',
          };
        }
      } catch (_) {}
      return null;  // Redis miss for this category
    })
  );

  const fromRedis  = poolResults.filter(Boolean);
  const missingCats = CANONICAL_CATEGORIES.filter((_cat, i) => !poolResults[i]);

  logger.info(`top-india: Redis hit ${fromRedis.length}/${CANONICAL_CATEGORIES.length} categories`);

  // ── 3. Postgres fallback — ONLY if ALL Redis pools were empty ────
  // Keeps the promise: never call Amazon, and skip Postgres when Redis has anything.
  const fromPostgres = [];
  if (fromRedis.length === 0 && missingCats.length > 0) {
    logger.info(`top-india: Redis empty — falling back to Postgres for ${missingCats.length} categories`);
    const pgResults = await Promise.all(
      missingCats.map(async (cat) => {
        try {
          const p = await pr.product.findFirst({
            where:   { category: cat, aiScore: { not: null } },
            orderBy: { aiScore: 'desc' },
            select:  { id: true, name: true, brand: true, category: true,
                       currentPrice: true, imageUrl: true, aiScore: true,
                       platformId: true, affiliateUrl: true },
          });
          if (!p) return null;
          return {
            id:       p.platformId || p.id,
            name:     p.name,
            brand:    p.brand || null,
            category: cat,
            emoji:    CAT_EMOJI[cat] || '📦',
            price:    p.currentPrice || null,
            imageUrl: p.imageUrl || null,
            aiScore:  p.aiScore || null,
            url:      p.affiliateUrl || null,
            source:   'postgres',
          };
        } catch (err) {
          logger.warn(`top-india: Postgres failed for ${cat} — ${err.message}`);
          return null;
        }
      })
    );
    fromPostgres.push(...pgResults.filter(Boolean));
  }

  // ── 4. Merge + preserve canonical category order ─────────────────
  const byCategory = {};
  [...fromRedis, ...fromPostgres].forEach(p => { byCategory[p.category] = p; });
  const products = CANONICAL_CATEGORIES.map(c => byCategory[c]).filter(Boolean);

  // ── 5. Cache the full response ────────────────────────────────────
  if (redis && redis.status === 'ready' && products.length > 0) {
    redis.set(TOP_INDIA_CACHE_KEY, JSON.stringify(products), 'EX', TOP_INDIA_CACHE_TTL).catch(() => {});
  }

  logger.info(`top-india: returning ${products.length} products`);
  res.json({ success: true, products });
});

// GET /api/products/top?category=headphones&limit=10
router.get('/top', async (req, res) => {
  const { category, limit = 10 } = req.query;
  try {
    const products = await prisma.product.findMany({
      where:   { ...(category && { category }), aiScore: { not: null } },
      orderBy: { aiScore: 'desc' },
      take:    parseInt(limit),
      include: { reviews: true, priceHistory: { orderBy: { recordedAt: 'desc' }, take: 30 } },
    });
    res.json({ success: true, products });
  } catch (err) {
    logger.error('Get top products error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where:   { id: req.params.id },
      include: { reviews: true, priceHistory: { orderBy: { recordedAt: 'desc' }, take: 90 } },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

module.exports = router;
