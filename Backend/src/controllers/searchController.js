// src/controllers/searchController.js
const { runSearchAgent } = require("../agents/rankingAgent");
const { validationResult } = require("express-validator");
const logger = require("../utils/logger");

// POST /api/search
// Body: { query: "Sony headphones", category: "headphones" }
async function search(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { query, category = "" } = req.body;

  try {
    const agentResult = await runSearchAgent(query, category);

    res.json({
      success: true,
      query,
      category,
      ...agentResult,
      count: agentResult.results.length,
    });
  } catch (err) {
    logger.error("Search error:", err);
    res
      .status(500)
      .json({ success: false, error: "Search failed. Please try again." });
  }
}

// GET /api/search/suggestions?q=sony
async function suggestions(req, res) {
  const q = (req.query.q || "").toLowerCase().trim();
  if (q.length < 2) return res.json({ suggestions: [] });

  // In production: query from a search index or autocomplete service
  // For now: simple static list filtered by query
  const all = [
    "Sony WH-1000XM5 headphones",
    "iPhone 15 Pro",
    "Samsung Galaxy S24",
    "MacBook Air M3",
    "Nike Air Max",
    "Adidas Ultraboost",
    "boAt headphones",
    "Bose QuietComfort",
    "Apple AirPods",
    "gaming mouse",
    "mechanical keyboard",
    "running shoes",
    "air fryer",
    "robot vacuum",
    "skincare serum",
    "The Ordinary niacinamide",
    "OnePlus 12",
    "Realme GT Neo 5",
  ];

  const matches = all.filter((s) => s.toLowerCase().includes(q)).slice(0, 6);
  res.json({ suggestions: matches });
}

module.exports = { search, suggestions };
