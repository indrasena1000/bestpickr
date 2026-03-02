// src/routes/products.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const logger  = require('../utils/logger');
const { getTop50Products } = require('../utils/redis');
const { CANONICAL_CATEGORIES } = require('../utils/categoryKeyMap');
const router  = express.Router();
const prisma  = new PrismaClient();

const CAT_EMOJI = {
  mobile:'📱', laptop:'💻', headphones:'🎧', tablets:'📱',
  smartwatch:'⌚', camera:'📷', gaming:'🎮', appliances:'🍳',
  footwear:'👟', skincare:'✨', fashion:'👗', books:'📚',
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
const TOP_INDIA_RANDOM_WINDOW = 3;  // pick randomly from top N by aiScore

router.get('/top-india', async (req, res) => {
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
            id:       pick.id || pick.platformId,
            name:     pick.name,
            brand:    pick.brand || null,
            category: cat,
            emoji:    CAT_EMOJI[cat] || '📦',
            price:    pick.currentPrice || pick.price || null,
            imageUrl: pick.imageUrl || null,
            aiScore:  pick.aiScore || null,
            url:      pick.url || pick.affiliateUrl || null,
            source:   'redis',
          };
        }
      } catch (_) {}
      return null;
    })
  );

  const fromRedis   = poolResults.filter(Boolean);
  const missingCats = CANONICAL_CATEGORIES.filter((_cat, i) => !poolResults[i]);

  logger.info(`top-india: Redis hit ${fromRedis.length}/${CANONICAL_CATEGORIES.length} categories`);

  // ── 2. Postgres fallback — ONLY if ALL Redis pools are empty ─────────────
  const fromPostgres = [];
  if (fromRedis.length === 0 && missingCats.length > 0) {
    logger.info(`top-india: Redis empty — falling back to Postgres for ${missingCats.length} categories`);
    const pgResults = await Promise.all(
      missingCats.map(async (cat) => {
        try {
          // Fetch top 10 by score, then pick randomly
          const rows = await pr.product.findMany({
            where:   { category: cat, aiScore: { not: null } },
            orderBy: { aiScore: 'desc' },
            take:    TOP_INDIA_RANDOM_WINDOW,
            select:  { id: true, name: true, brand: true, category: true,
                       currentPrice: true, imageUrl: true, aiScore: true,
                       platformId: true, affiliateUrl: true },
          });
          if (!rows.length) return null;
          const p = rows[Math.floor(Math.random() * rows.length)];
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

  // ── 3. Merge + preserve canonical category order ──────────────────────────
  const byCategory = {};
  [...fromRedis, ...fromPostgres].forEach(p => { byCategory[p.category] = p; });
  const products = CANONICAL_CATEGORIES.map(c => byCategory[c]).filter(Boolean);

  logger.info(`top-india: returning ${products.length} random products`);
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
