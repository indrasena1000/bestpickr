// src/routes/products.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const logger  = require('../utils/logger');
const router  = express.Router();
const prisma  = new PrismaClient();

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
