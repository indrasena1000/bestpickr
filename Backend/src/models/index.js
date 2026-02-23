// models/index.js — bestpickr.in Mongoose Schemas
// ─────────────────────────────────────────────────────────────────
// MongoDB schemas for the bestpickr AI product ranking platform.
//
// ARCHITECTURE RULES:
//   • Raw review text is NEVER stored — only AI-generated insights
//   • Reviews are fetched → analyzed by GPT-4o-mini → discarded
//   • AI analysis only re-runs when:
//       - Review count increases by 100+
//       - Analysis is 7+ days old
//   • Each data type has its own Redis TTL (see redis.js)
//   • MongoDB is the durable store; Redis handles speed
//
// SCHEMAS:
//   1. ProductAnalysis  — AI analysis results per product
//   2. ProductListing   — Product details from Amazon PA-API + scrapers
//   3. SearchCache      — Cached search results (6hr TTL via MongoDB TTL index)
//   4. PriceAlert       — User price-drop notification subscriptions
// ─────────────────────────────────────────────────────────────────
"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

// ═════════════════════════════════════════════════════════════════
// SCHEMA 1: ProductAnalysis
// ═════════════════════════════════════════════════════════════════
// Stores AI analysis output for each product.
// One document per ASIN. Updated when review count changes by 100+
// or analysis is older than 7 days.
//
// IMPORTANT: Raw review text is NEVER stored here.
// The AI pipeline: fetch reviews → GPT-4o-mini analysis → store
// insights → discard raw text (same session).
// ─────────────────────────────────────────────────────────────────

const productAnalysisSchema = new Schema(
  {
    // ── Identifiers ─────────────────────────────────────────────
    asin: {
      type: String,
      required: [true, "ASIN is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    productName: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      lowercase: true,
      index: true,
    },
    brand: {
      type: String,
      trim: true,
      default: null,
    },

    // ── AI Scoring ──────────────────────────────────────────────
    // Master score (0–10) computed by GPT-4o-mini from review analysis
    aiScore: {
      type: Number,
      min: [0, "AI score cannot be below 0"],
      max: [10, "AI score cannot exceed 10"],
      default: null,
    },

    // Per-aspect scores — flexible Map so AI can return any aspects
    // e.g. { "build_quality": 8.2, "battery_life": 7.5, "comfort": 9.1 }
    aspectScores: {
      type: Map,
      of: {
        type: Number,
        min: 0,
        max: 10,
      },
      default: () => new Map(),
    },

    // ── Sentiment Breakdown ─────────────────────────────────────
    // Percentages must sum to ~100 (allow minor rounding variance)
    overallSentiment: {
      positive: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },
      neutral: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },
      negative: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },
    },

    // ── AI-Generated Insights (human-readable strings) ──────────
    // These are the core value proposition — summarized from reviews
    whatPeopleLove: {
      type: [String],
      default: [],
      // e.g. ["Incredible noise cancellation", "Comfortable for 8+ hour wear"]
    },
    commonComplaints: {
      type: [String],
      default: [],
      // e.g. ["Ear cups get warm in summer", "Carrying case is bulky"]
    },
    redFlags: {
      type: [String],
      default: [],
      // e.g. ["Multiple reports of hinge cracking after 6 months"]
    },

    // ── Recommendations ─────────────────────────────────────────
    buyRecommendation: {
      type: String,
      trim: true,
      default: null,
      // e.g. "Best-in-class ANC headphones for frequent flyers and office use"
    },
    avoidIf: {
      type: String,
      trim: true,
      default: null,
      // e.g. "You need a microphone for calls — the built-in mic is mediocre"
    },

    // ── Review Authenticity Assessment ───────────────────────────
    authenticityBadge: {
      type: String,
      enum: {
        values: ["high", "medium", "suspicious"],
        message:
          '"{VALUE}" is not a valid authenticity badge. Use: high, medium, or suspicious',
      },
      default: "medium",
    },
    authenticityFlags: {
      type: [String],
      default: [],
      // e.g. ["23% of 5-star reviews are single-sentence", "Verified purchase ratio: 67%"]
    },

    // ── Analysis Metadata ───────────────────────────────────────
    reviewsAnalyzed: {
      type: Number,
      min: 0,
      default: 0,
    },
    confidenceLevel: {
      type: String,
      enum: {
        values: ["high", "medium", "low"],
        message:
          '"{VALUE}" is not a valid confidence level. Use: high, medium, or low',
      },
      default: "low",
    },
    analysisDate: {
      type: Date,
      default: Date.now,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false, // We manage lastUpdated via pre-save hook
    collection: "product_analyses",
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true, versionKey: false },
  },
);

// ── Indexes ─────────────────────────────────────────────────────
// Primary lookup: one analysis per ASIN (unique)
productAnalysisSchema.index({ asin: 1 }, { unique: true });
// Category leaderboard: top AI scores within a category
productAnalysisSchema.index({ category: 1, aiScore: -1 });
// Stale analysis detection for cron: find oldest analyses first
productAnalysisSchema.index({ analysisDate: 1 });
// Brand-level queries: "Show all Samsung product analyses"
productAnalysisSchema.index({ brand: 1, aiScore: -1 });
// Authenticity filtering: find suspicious products
productAnalysisSchema.index({ authenticityBadge: 1 });

// ── Virtual: Check if analysis is stale (7+ days old) ───────────
productAnalysisSchema.virtual("isStale").get(function () {
  if (!this.analysisDate) return true;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - this.analysisDate.getTime() > sevenDaysMs;
});

// ── Pre-save Hook: Auto-update lastUpdated ──────────────────────
productAnalysisSchema.pre("save", async function () {
  this.lastUpdated = new Date();
});

productAnalysisSchema.pre("findOneAndUpdate", async function () {
  this.set({ lastUpdated: new Date() });
});

// ── Static: Check if re-analysis is needed ──────────────────────
// Returns true if:
//   - Product has never been analyzed, OR
//   - Analysis is 7+ days old, OR
//   - Review count increased by 100+ since last analysis
productAnalysisSchema.statics.needsReanalysis = async function (
  asin,
  currentReviewCount,
) {
  const existing = await this.findOne({ asin: asin.toUpperCase() })
    .select("analysisDate reviewsAnalyzed")
    .lean();

  // Never analyzed → definitely needs analysis
  if (!existing) return true;

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const isOld = Date.now() - existing.analysisDate.getTime() > sevenDaysMs;
  const reviewJump =
    currentReviewCount - (existing.reviewsAnalyzed || 0) >= 100;

  return isOld || reviewJump;
};

// ═════════════════════════════════════════════════════════════════
// SCHEMA 2: ProductListing
// ═════════════════════════════════════════════════════════════════
// Stores product details from Amazon PA-API and scraped platforms.
// One document per ASIN. Multi-platform prices stored in one doc
// for easy "best price" comparison.
//
// Aligns with the existing scorer.js aggregateGroup() output and
// the rankingAgent.js saveProductsToDb() flow.
// ─────────────────────────────────────────────────────────────────

const priceHistoryEntrySchema = new Schema(
  {
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    platform: {
      type: String,
      enum: ["amazon", "flipkart", "myntra"],
      required: true,
      lowercase: true,
    },
  },
  { _id: false }, // Sub-documents don't need their own _id
);

const productListingSchema = new Schema(
  {
    // ── Core Identity ───────────────────────────────────────────
    asin: {
      type: String,
      required: [true, "ASIN is required"],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Product title is required"],
      trim: true,
    },
    brand: {
      type: String,
      trim: true,
      default: null,
    },
    category: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      default: null,
    },
    imageUrl: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Amazon Data (PA-API) ────────────────────────────────────
    amazonPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    amazonUrl: {
      type: String,
      trim: true,
      default: null,
      // Affiliate link: https://amazon.in/dp/B0XXXXX?tag=bestpickr-21
    },
    amazonRating: {
      type: Number,
      min: 0,
      max: 5,
      default: null,
    },
    amazonReviewCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    // ── Flipkart Data (Cuelinks affiliate) ──────────────────────
    flipkartPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    flipkartUrl: {
      type: String,
      trim: true,
      default: null,
      // Cuelinks affiliate redirect URL
    },

    // ── Myntra Data (Cuelinks affiliate) ────────────────────────
    myntraPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    myntraUrl: {
      type: String,
      trim: true,
      default: null,
      // Cuelinks affiliate redirect URL
    },

    // ── Cross-Platform Comparison ───────────────────────────────
    bestPrice: {
      type: Number,
      min: 0,
      default: null,
      // Auto-computed by pre-save hook: lowest across all platforms
    },
    bestPlatform: {
      type: String,
      enum: ["amazon", "flipkart", "myntra", null],
      default: null,
      lowercase: true,
    },
    inStock: {
      type: Boolean,
      default: true,
    },

    // ── Price History ───────────────────────────────────────────
    // Array of snapshots for price-trend charts on frontend
    priceHistory: {
      type: [priceHistoryEntrySchema],
      default: [],
    },

    // ── Timestamps ──────────────────────────────────────────────
    lastPriceUpdate: {
      type: Date,
      default: Date.now,
    },
    lastDataRefresh: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // Adds createdAt + updatedAt automatically
    collection: "product_listings",
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true, versionKey: false },
  },
);

// ── Indexes ─────────────────────────────────────────────────────
// Category browsing with price sort (category page)
productListingSchema.index({ category: 1, bestPrice: 1 });
// Brand browsing
productListingSchema.index({ brand: 1 });
// Stale data detection: nightly cron finds products not refreshed recently
productListingSchema.index({ lastDataRefresh: 1 });
// Stock filter: "Show in-stock products in this category"
productListingSchema.index({ inStock: 1, category: 1 });
// Price range queries
productListingSchema.index({ bestPrice: 1 });

// ── Virtual: Savings across platforms ───────────────────────────
productListingSchema.virtual("priceSavings").get(function () {
  const prices = [
    this.amazonPrice,
    this.flipkartPrice,
    this.myntraPrice,
  ].filter(Boolean);
  if (prices.length < 2) return 0;
  return Math.max(...prices) - Math.min(...prices);
});

// ── Virtual: Number of platforms with pricing ───────────────────
productListingSchema.virtual("platformCount").get(function () {
  let count = 0;
  if (this.amazonPrice) count++;
  if (this.flipkartPrice) count++;
  if (this.myntraPrice) count++;
  return count;
});

// ── Pre-save Hook: Auto-compute bestPrice & bestPlatform ────────
productListingSchema.pre("save", async function () {
  const prices = [];
  if (this.amazonPrice && this.amazonPrice > 0) {
    prices.push({ price: this.amazonPrice, platform: "amazon" });
  }
  if (this.flipkartPrice && this.flipkartPrice > 0) {
    prices.push({ price: this.flipkartPrice, platform: "flipkart" });
  }
  if (this.myntraPrice && this.myntraPrice > 0) {
    prices.push({ price: this.myntraPrice, platform: "myntra" });
  }

  if (prices.length > 0) {
    prices.sort((a, b) => a.price - b.price);
    this.bestPrice = prices[0].price;
    this.bestPlatform = prices[0].platform;
  } else {
    this.bestPrice = null;
    this.bestPlatform = null;
  }

  this.lastDataRefresh = new Date();
});

productListingSchema.pre("findOneAndUpdate", async function () {
  this.set({ lastDataRefresh: new Date() });
});

// ── Static: Add price history entry and update current price ────
productListingSchema.statics.recordPrice = async function (
  asin,
  platform,
  price,
) {
  const platformKey = platform.toLowerCase();
  const priceField = `${platformKey}Price`;

  return this.findOneAndUpdate(
    { asin: asin.toUpperCase() },
    {
      $set: {
        [priceField]: price,
        lastPriceUpdate: new Date(),
      },
      $push: {
        priceHistory: {
          $each: [{ price, platform: platformKey, date: new Date() }],
          $slice: -365, // Keep last 365 entries max (roughly 1 year of daily checks)
        },
      },
    },
    { new: true },
  );
};

// ═════════════════════════════════════════════════════════════════
// SCHEMA 3: SearchCache
// ═════════════════════════════════════════════════════════════════
// MongoDB-level search result cache (complements Redis).
// Redis = hot cache (6hr TTL, in-memory speed).
// MongoDB = warm cache (6hr TTL via TTL index, survives Redis flush).
//
// Flow: Redis miss → check MongoDB SearchCache → if miss → live scrape
//
// Aligns with redis.js key format: bestpickr:search:<normalized>:<category>
// and queryNormalizer.js buildSearchKey() logic.
// ─────────────────────────────────────────────────────────────────

const searchCacheSchema = new Schema(
  {
    query: {
      type: String,
      required: [true, "Search query is required"],
      trim: true,
      index: true,
    },
    // Normalized: lowercase + trimmed + stopwords removed
    // "best Sony headphones" and "sony headphones" → same normalizedQuery
    normalizedQuery: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    // Array of ASIN strings referencing ProductListing documents
    results: {
      type: [String],
      default: [],
    },
    totalResults: {
      type: Number,
      min: 0,
      default: 0,
    },
    // MongoDB TTL index auto-deletes this document after 6 hours
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false, // We only need createdAt for the TTL index
    collection: "search_caches",
    toJSON: { versionKey: false },
    toObject: { versionKey: false },
  },
);

// ── Indexes ─────────────────────────────────────────────────────
// TTL index: MongoDB automatically deletes docs 6 hours after createdAt
searchCacheSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 21600 }, // 6 hours = 21,600 seconds
);
// Deduplicated lookups by normalized query (one cache entry per unique query)
searchCacheSchema.index({ normalizedQuery: 1 }, { unique: true });

// ── Pre-save: Auto-compute normalizedQuery and totalResults ─────
searchCacheSchema.pre("save", async function () {
  if (this.query && !this.normalizedQuery) {
    this.normalizedQuery = this.query
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ") // collapse whitespace
      .replace(/[^\w\s-]/g, ""); // strip special chars
  }
  this.totalResults = this.results ? this.results.length : 0;
});

// ═════════════════════════════════════════════════════════════════
// SCHEMA 4: PriceAlert
// ═════════════════════════════════════════════════════════════════
// User-subscribed price-drop notifications.
// Checked by the nightly cron job (12 AM IST via categoryPreloader.js).
// When currentPrice drops ≤ targetPrice → trigger email notification.
// ─────────────────────────────────────────────────────────────────

const priceAlertSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required for price alerts"],
      trim: true,
      lowercase: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        "Please provide a valid email address",
      ],
    },
    asin: {
      type: String,
      required: [true, "ASIN is required"],
      trim: true,
      uppercase: true,
    },
    productName: {
      type: String,
      trim: true,
      default: null,
    },
    targetPrice: {
      type: Number,
      required: [true, "Target price is required"],
      min: [1, "Target price must be at least ₹1"],
    },
    currentPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    platform: {
      type: String,
      enum: {
        values: ["amazon", "flipkart", "myntra", "any"],
        message:
          '"{VALUE}" is not a valid platform. Use: amazon, flipkart, myntra, or any',
      },
      default: "any",
      lowercase: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    triggeredAt: {
      type: Date,
      default: null,
    },
    notificationsSent: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: false,
    collection: "price_alerts",
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true, versionKey: false },
  },
);

// ── Indexes ─────────────────────────────────────────────────────
// Cron job query: "All active alerts for a given ASIN"
priceAlertSchema.index({ isActive: 1, asin: 1 });
// User lookup: "Show me my alerts"
priceAlertSchema.index({ email: 1, isActive: 1 });
// Prevent duplicate alerts: same user + product + platform
priceAlertSchema.index({ email: 1, asin: 1, platform: 1 }, { unique: true });
// Platform-specific batch processing during nightly cron
priceAlertSchema.index({ platform: 1, isActive: 1 });

// ── Virtual: Has the price alert been triggered? ────────────────
priceAlertSchema.virtual("isTriggered").get(function () {
  return this.currentPrice !== null && this.currentPrice <= this.targetPrice;
});

// ── Virtual: How much more the price needs to drop (%) ──────────
priceAlertSchema.virtual("dropNeeded").get(function () {
  if (!this.currentPrice || !this.targetPrice) return null;
  if (this.currentPrice <= this.targetPrice) return 0;
  return Math.round(
    ((this.currentPrice - this.targetPrice) / this.currentPrice) * 100,
  );
});

// ── Static: Find all alerts ready to fire ───────────────────────
// Used by the nightly cron: find active alerts where current price
// has dropped to or below the target
priceAlertSchema.statics.findTriggerable = function () {
  return this.find({
    isActive: true,
    currentPrice: { $ne: null },
    $expr: { $lte: ["$currentPrice", "$targetPrice"] },
  });
};

// ═════════════════════════════════════════════════════════════════
// SCHEMA 5: BlogPost
// ═════════════════════════════════════════════════════════════════
// AI-generated blog posts for bestpickr.in.
// Generated by GPT-4o-mini (3 posts/day), stored as drafts,
// published via Admin Dashboard. Images from Unsplash API.
// ─────────────────────────────────────────────────────────────────

const blogPostSchema = new Schema(
  {
    slug:            { type: String, required: [true, 'Slug is required'], unique: true, trim: true, lowercase: true },
    title:           { type: String, required: [true, 'Title is required'], trim: true },
    excerpt:         { type: String, required: [true, 'Excerpt is required'], trim: true },
    content:         { type: String, required: [true, 'Content is required'] },
    coverImage:      { type: String, trim: true, default: null },
    coverImageAlt:   { type: String, trim: true, default: null },
    category: {
      type: String,
      enum: {
        values: ['Smartphones', 'Laptops', 'Deals', 'Industry News', 'Audio', 'Wearables', 'Televisions'],
        message: '"{VALUE}" is not a valid blog category',
      },
      default: null,
    },
    tags:            { type: [String], default: [] },
    status: {
      type: String,
      enum: { values: ['draft', 'published'], message: '"{VALUE}" is not a valid status' },
      default: 'draft',
    },
    aiGenerated:     { type: Boolean, default: true },
    publishedAt:     { type: Date, default: null },
    readTimeMinutes: { type: Number, min: 1, default: 3 },
    createdAt:       { type: Date, default: Date.now },
    updatedAt:       { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    collection: 'blog_posts',
    toJSON:   { versionKey: false },
    toObject: { versionKey: false },
  }
);

// ── Indexes ─────────────────────────────────────────────────────
blogPostSchema.index({ slug: 1 }, { unique: true });
blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ category: 1, status: 1 });

// ── Pre-save Hook: Auto-update updatedAt ────────────────────────
blogPostSchema.pre('save', async function () {
  this.updatedAt = new Date();
});

// ═════════════════════════════════════════════════════════════════
// MODEL COMPILATION & NAMED EXPORTS
// ═════════════════════════════════════════════════════════════════

const ProductAnalysis = mongoose.model(
  "ProductAnalysis",
  productAnalysisSchema,
);
const ProductListing = mongoose.model("ProductListing", productListingSchema);
const SearchCache = mongoose.model("SearchCache", searchCacheSchema);
const PriceAlert = mongoose.model("PriceAlert", priceAlertSchema);
const BlogPost = mongoose.model("BlogPost", blogPostSchema);

module.exports = {
  ProductAnalysis,
  ProductListing,
  SearchCache,
  PriceAlert,
  BlogPost,
};
