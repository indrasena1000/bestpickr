// src/routes/products.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const logger  = require('../utils/logger');
const { getTop50Products } = require('../utils/redis');
const { CANONICAL_CATEGORIES } = require('../utils/categoryKeyMap');
const router  = express.Router();
const prisma  = new PrismaClient();

// GET /api/products/top-india
// Returns the #1 AI-ranked product from each canonical category.
// Sourced from Redis top50 pools first (0 Amazon calls), falls back to Postgres.
router.get('/top-india', async (req, res) => {
  const pr = req.app.locals.prisma || prisma;
  const results = [];

  const CAT_EMOJI = {
    mobile:'📱', laptop:'💻', headphones:'🎧', tablets:'📱',
    smartwatch:'⌚', camera:'📷', gaming:'🎮', appliances:'🍳',
    footwear:'👟', skincare:'✨', fashion:'👗', books:'📚',
  };

  for (const cat of CANONICAL_CATEGORIES) {
    // ── Try Redis top50 pool first ──────────────────────────────────
    let top = null;
    try {
      const pool = await getTop50Products(cat);
      if (pool && pool.length > 0) {
        top = pool.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))[0];
      }
    } catch (_) {}

    if (top) {
      results.push({
        id:           top.id || top.platformId,
        name:         top.name,
        brand:        top.brand || null,
        category:     cat,
        emoji:        CAT_EMOJI[cat] || '📦',
        price:        top.currentPrice || top.price || null,
        imageUrl:     top.imageUrl || null,
        aiScore:      top.aiScore || null,
        url:          top.url || top.affiliateUrl || null,
        source:       'redis',
      });
      continue;
    }

    // ── Fallback: Postgres ──────────────────────────────────────────
    try {
      const p = await pr.product.findFirst({
        where:   { category: cat, aiScore: { not: null } },
        orderBy: { aiScore: 'desc' },
        select:  { id: true, name: true, brand: true, category: true,
                   currentPrice: true, imageUrl: true, aiScore: true,
                   platformId: true, affiliateUrl: true },
      });
      if (p) {
        results.push({
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
        });
      }
    } catch (err) {
      logger.warn(`top-india: Postgres fallback failed for ${cat} — ${err.message}`);
    }
  }

  res.json({ success: true, products: results });
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
