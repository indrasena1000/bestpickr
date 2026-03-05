// src/routes/categories.js
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const router = express.Router();
const prisma = new PrismaClient();

// Canonical category list — slugs must match categoryKeyMap.js canonical categories
const CANONICAL_CATEGORIES = [
  { slug: "mobile", name: "Smartphones", emoji: "📱" },
  { slug: "laptop", name: "Laptops", emoji: "💻" },
  { slug: "headphones", name: "Headphones", emoji: "🎧" },
  { slug: "televisions", name: "Televisions", emoji: "📺" },
  { slug: "appliances", name: "Appliances", emoji: "🍳" },
  { slug: "gaming", name: "Gaming", emoji: "🎮" },
  { slug: "camera", name: "Cameras", emoji: "📷" },
  { slug: "tablets", name: "Tablets", emoji: "📟" },
  { slug: "smartwatch", name: "Smartwatches", emoji: "⌚" },
  { slug: "footwear", name: "Footwear", emoji: "👟" },
  { slug: "skincare", name: "Skincare", emoji: "✨" },
  { slug: "fashion", name: "Fashion", emoji: "👗" },
];

// GET /api/categories
router.get("/", async (req, res) => {
  try {
    let cats = await prisma.category.findMany({ orderBy: { name: "asc" } });
    console.log(`Fetched ${cats.length} categories from DB`);

    // Remove stale categories with wrong/legacy slugs
    const canonicalSlugs = new Set(CANONICAL_CATEGORIES.map((c) => c.slug));
    const staleCats = cats.filter((c) => !canonicalSlugs.has(c.slug));
    if (staleCats.length > 0) {
      await prisma.category.deleteMany({
        where: { slug: { in: staleCats.map((c) => c.slug) } },
      });
      console.log(
        `Removed ${staleCats.length} stale categories: ${staleCats.map((c) => c.slug).join(", ")}`,
      );
    }

    // Upsert all canonical categories
    await prisma.category.createMany({
      data: CANONICAL_CATEGORIES,
      skipDuplicates: true,
    });

    cats = await prisma.category.findMany({ orderBy: { name: "asc" } });
    res.json({ success: true, categories: cats });
  } catch (err) {
    console.error("Categories DB error:", err.message);
    // Return canonical fallback if DB unavailable
    res.json({
      success: true,
      categories: CANONICAL_CATEGORIES,
    });
  }
});

module.exports = router;
