// src/routes/categories.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router  = express.Router();
const prisma  = new PrismaClient();

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const cats = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, categories: cats });
  } catch {
    // Return hardcoded fallback if DB not yet seeded
    res.json({ success: true, categories: [
      { slug:'headphones',  name:'Headphones',  emoji:'🎧' },
      { slug:'smartphones', name:'Smartphones', emoji:'📱' },
      { slug:'laptops',     name:'Laptops',     emoji:'💻' },
      { slug:'appliances',  name:'Appliances',  emoji:'🍳' },
      { slug:'gaming',      name:'Gaming',      emoji:'🎮' },
      { slug:'footwear',    name:'Footwear',    emoji:'👟' },
      { slug:'skincare',    name:'Skincare',    emoji:'✨' },
      { slug:'fashion',     name:'Fashion',     emoji:'👗' },
    ]});
  }
});

module.exports = router;
