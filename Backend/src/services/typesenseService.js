// src/services/typesenseService.js — Typesense Search Engine Integration
// ─────────────────────────────────────────────────────────────────
// Self-hosted Typesense replaces manual keyword mapping with intelligent,
// typo-tolerant, relevance-ranked search.
//
// HOW IT FITS THE ARCHITECTURE:
//   1. Products indexed here when fetched from Amazon (indexProduct)
//   2. Search route checks Typesense first (searchProducts)
//   3. If Typesense has no results → fall through to Redis/Amazon pipeline
//   4. Suggestions endpoint uses Typesense autocomplete (getSuggestions)
//   5. Trending tracked via Redis sorted set (trackSearch / getTrending)
//
// COLLECTION SCHEMA:
//   products — all Amazon products indexed after fetch
//   searches — analytics/trending stored in Redis (no Typesense collection needed)
//
// ENV VARS:
//   TYPESENSE_API_KEY  — your Typesense server API key (required)
//   TYPESENSE_HOST     — default: localhost
//   TYPESENSE_PORT     — default: 8108
//   TYPESENSE_PROTOCOL — default: http
// ─────────────────────────────────────────────────────────────────
"use strict";

const logger = require("../utils/logger");
const SYNONYMS = require("../utils/synonyms");

// ── Lazy-loaded so the server starts even when Typesense is offline ──
let Typesense = null;
let client = null;
let _ready = false; // true once collection verified to exist

const COLLECTION = "products";
const SEARCH_COLLECTION = "search_queries"; // for autocomplete suggestions

// ── Product schema ──────────────────────────────────────────────────────────
const PRODUCT_SCHEMA = {
  name: COLLECTION,
  fields: [
    { name: "id", type: "string" },                              // ASIN
    { name: "title", type: "string" },
    { name: "brand", type: "string", facet: true, optional: true },
    { name: "category", type: "string", facet: true, optional: true },
    { name: "price", type: "float", optional: true },
    { name: "rating", type: "float", optional: true },
    { name: "reviewCount", type: "int32", optional: true },
    { name: "image", type: "string", optional: true, index: false },
    { name: "description", type: "string", optional: true },
    { name: "tags", type: "string[]", optional: true },
    { name: "source", type: "string", optional: true },
    { name: "aiScore", type: "float", optional: true },
    { name: "affiliateUrl", type: "string", optional: true, index: false },
    { name: "flipkartPrice", type: "float", optional: true },
    { name: "flipkartUrl", type: "string", optional: true, index: false },
    { name: "inStock", type: "bool", optional: true },
    { name: "indexedAt", type: "int64" },                        // epoch ms for freshness
  ],
  default_sorting_field: "indexedAt",
  // Overrides: heavily weight title, then brand/category/tags
  // (used when no sort_by is specified in request)
};

// ── Search queries collection — for autocomplete ────────────────────────────
const SEARCH_QUERIES_SCHEMA = {
  name: SEARCH_COLLECTION,
  fields: [
    { name: "q", type: "string" },
    { name: "count", type: "int32" },
    { name: "updatedAt", type: "int64" },
  ],
  default_sorting_field: "count",
};

// ═════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═════════════════════════════════════════════════════════════════

function getClient() {
  if (client) return client;
  if (!Typesense) {
    try {
      Typesense = require("typesense");
    } catch (e) {
      logger.warn("Typesense: npm package not installed — run: npm install typesense");
      return null;
    }
  }

  const apiKey = process.env.TYPESENSE_API_KEY;
  if (!apiKey) {
    logger.warn("Typesense: TYPESENSE_API_KEY not set — search will use fallback");
    return null;
  }

  const host = process.env.TYPESENSE_HOST || "localhost";
  const port = parseInt(process.env.TYPESENSE_PORT || "8108", 10);
  const protocol = process.env.TYPESENSE_PROTOCOL || "http";

  client = new Typesense.Client({
    nodes: [{ host, port, protocol }],
    apiKey,
    connectionTimeoutSeconds: 3,
    retryIntervalSeconds: 0.5,
    numRetries: 2,
    healthcheckIntervalSeconds: 60,
  });

  logger.info(`Typesense: client configured — ${protocol}://${host}:${port}`);
  return client;
}

/**
 * Ensure the products collection and search_queries collection exist.
 * Safe to call multiple times — idempotent (create-if-not-exists).
 * Called lazily on first search/index operation.
 */
async function ensureCollections() {
  if (_ready) return true;

  const c = getClient();
  if (!c) return false;

  try {
    // ── Products collection ─────────────────────────────────────
    let productsExist = false;
    try {
      await c.collections(COLLECTION).retrieve();
      productsExist = true;
      logger.info("Typesense: products collection already exists");
    } catch (e) {
      if (e.httpStatus === 404) {
        await c.collections().create(PRODUCT_SCHEMA);
        logger.info("Typesense: created products collection");
      } else {
        throw e;
      }
    }

    // ── Search queries collection (autocomplete) ────────────────
    try {
      await c.collections(SEARCH_COLLECTION).retrieve();
    } catch (e) {
      if (e.httpStatus === 404) {
        await c.collections().create(SEARCH_QUERIES_SCHEMA);
        logger.info("Typesense: created search_queries collection");
      }
    }

    // ── Synonyms ────────────────────────────────────────────────
    await initSynonyms(c);

    _ready = true;
    return true;
  } catch (err) {
    logger.warn(`Typesense: ensureCollections failed — ${err.message}`);
    return false;
  }
}

/**
 * Push synonym rules into Typesense.
 * Typesense supports one-way synonyms (directional) and equivalents (multi-way).
 */
async function initSynonyms(c) {
  try {
    const { equivalents = [], directional = [] } = SYNONYMS;

    for (const { id, synonyms } of equivalents) {
      await c
        .collections(COLLECTION)
        .synonyms()
        .upsert(id, { synonyms });
    }

    for (const { id, root, synonyms } of directional) {
      await c
        .collections(COLLECTION)
        .synonyms()
        .upsert(id, { root, synonyms });
    }

    logger.info(
      `Typesense: ${equivalents.length} equivalent + ${directional.length} directional synonyms loaded`,
    );
  } catch (err) {
    logger.warn(`Typesense: synonym init failed — ${err.message}`);
  }
}

// ═════════════════════════════════════════════════════════════════
// INDEXING
// ═════════════════════════════════════════════════════════════════

/**
 * Transform a bestpickr product (from formatProductResult or enrichProduct)
 * into a Typesense document.
 */
function productToDocument(product) {
  const asin =
    product.asin ||
    product.platformId ||
    product.id ||
    null;
  if (!asin) return null;

  // Build tags array from category + features
  const tags = [];
  if (product.category) tags.push(product.category.toLowerCase());
  if (Array.isArray(product.features)) {
    product.features
      .slice(0, 5)
      .forEach((f) => typeof f === "string" && tags.push(f.toLowerCase().slice(0, 80)));
  }

  // Description: join features into a searchable sentence
  const description =
    product.description ||
    (Array.isArray(product.features) && product.features.length > 0
      ? product.features.slice(0, 3).join(". ")
      : "") ||
    "";

  const price =
    product.lowestPrice ||
    product.price ||
    product.amazonPrice ||
    null;

  const rating =
    product.avgRating ||
    product.rating ||
    product.amazonRating ||
    null;

  return {
    id: asin,
    title: (product.name || product.title || "Unknown Product").slice(0, 500),
    brand: product.brand || "",
    category: product.category || "",
    price: price ? parseFloat(price) : 0,
    rating: rating ? parseFloat(rating) : 0,
    reviewCount: parseInt(product.reviewCount || product.totalReviews || 0, 10),
    image: product.imageUrl || product.image || "",
    description: description.slice(0, 1000),
    tags,
    source: product.platform || product.source || "amazon",
    aiScore: product.aiScore ? parseFloat(product.aiScore) : 0,
    affiliateUrl: product.affiliateUrl || product.amazonUrl || product.url || "",
    flipkartPrice: product.flipkartPrice ? parseFloat(product.flipkartPrice) : 0,
    flipkartUrl: product.flipkartUrl || "",
    inStock: product.inStock !== false,
    indexedAt: Date.now(),
  };
}

/**
 * Index a single product into Typesense.
 * Upserts — if the ASIN already exists it will be updated.
 * Non-blocking: errors are logged but never thrown.
 */
async function indexProduct(product) {
  try {
    const ready = await ensureCollections();
    if (!ready) return;

    const doc = productToDocument(product);
    if (!doc) return;

    const c = getClient();
    await c.collections(COLLECTION).documents().upsert(doc);
    logger.debug(`Typesense: indexed ${doc.id} "${doc.title.slice(0, 40)}"`);
  } catch (err) {
    // Non-fatal — regular search still works via Redis/Amazon
    logger.warn(`Typesense: indexProduct failed for ${product?.asin} — ${err.message}`);
  }
}

/**
 * Bulk-index an array of products in one API call.
 * Used when a category snapshot is refreshed.
 */
async function indexBatch(products) {
  if (!products || products.length === 0) return;

  try {
    const ready = await ensureCollections();
    if (!ready) return;

    const docs = products.map(productToDocument).filter(Boolean);
    if (docs.length === 0) return;

    const c = getClient();
    const result = await c
      .collections(COLLECTION)
      .documents()
      .import(docs, { action: "upsert" });

    const failed = result.filter((r) => !r.success);
    if (failed.length > 0) {
      logger.warn(`Typesense: batch import — ${failed.length}/${docs.length} failed`);
    } else {
      logger.info(`Typesense: batch indexed ${docs.length} products`);
    }
  } catch (err) {
    logger.warn(`Typesense: indexBatch failed — ${err.message}`);
  }
}

// ═════════════════════════════════════════════════════════════════
// SEARCH
// ═════════════════════════════════════════════════════════════════

/**
 * Search Typesense for products matching the query.
 *
 * Returns an array of raw Typesense hit documents (already in bestpickr shape),
 * or null if Typesense is unavailable or returns 0 results.
 *
 * Ranking priority (via sort_by):
 *   1. text_match (full-text relevance — exact title match scores highest)
 *   2. aiScore desc
 *   3. rating desc
 */
async function searchProducts(query, { category, brand, priceMax, priceMin, limit = 10 } = {}) {
  try {
    const ready = await ensureCollections();
    if (!ready) return null;

    const c = getClient();

    // ── Build filter string ─────────────────────────────────────
    const filterParts = [];
    filterParts.push("inStock:=true");

    if (category) {
      // Typesense filter_by uses exact match for facets
      filterParts.push(`category:=${category}`);
    }
    if (brand) {
      filterParts.push(`brand:=${brand}`);
    }
    if (priceMin != null && priceMin > 0) {
      filterParts.push(`price:>=${priceMin}`);
    }
    if (priceMax != null && priceMax > 0) {
      filterParts.push(`price:<=${priceMax}`);
    }

    const filterBy = filterParts.join(" && ");

    const params = {
      q: query,
      query_by: "title,brand,category,tags,description",
      query_by_weights: "10,5,4,3,2",  // title gets highest relevance weight
      sort_by: "_text_match:desc,aiScore:desc,rating:desc",
      num_typos: 2,                     // tolerate up to 2 typos (smrt watch → smart watch)
      prefix: true,                     // prefix search: "smartwa" → smartwatch
      per_page: limit,
      highlight_full_fields: "title",
      typo_tokens_threshold: 1,
      drop_tokens_threshold: 0,         // never drop query tokens — all words must match
    };

    // Only add filter_by if we have conditions beyond inStock
    // (inStock alone is already handled — category/brand are optional)
    if (filterBy) params.filter_by = filterBy;

    logger.info(`Typesense: searching "${query}" filter="${filterBy}"`);

    const result = await c.collections(COLLECTION).documents().search(params);

    const hits = result.hits || [];
    if (hits.length === 0) {
      logger.info(`Typesense: 0 results for "${query}"`);
      return null;
    }

    logger.info(`Typesense: ${hits.length} results for "${query}" (found ${result.found})`);

    // Return documents (already in bestpickr product shape from index time)
    return hits.map((h) => h.document);
  } catch (err) {
    // Typesense down or misconfigured — gracefully fall through
    if (err.httpStatus === 404 && err.message?.includes("Not Found")) {
      // Collection doesn't exist yet — reset flag so ensureCollections re-runs
      _ready = false;
    }
    logger.warn(`Typesense: search failed — ${err.message}`);
    return null;
  }
}

/**
 * Facet search — get all brands/categories for a query.
 * Used for filter UI population.
 */
async function getFacets(query) {
  try {
    const ready = await ensureCollections();
    if (!ready) return { brands: [], categories: [] };

    const c = getClient();
    const result = await c.collections(COLLECTION).documents().search({
      q: query,
      query_by: "title,brand,category",
      facet_by: "brand,category",
      max_facet_values: 10,
      per_page: 0,    // we only want facets, not documents
    });

    const brandFacet = result.facet_counts?.find((f) => f.field_name === "brand");
    const catFacet = result.facet_counts?.find((f) => f.field_name === "category");

    return {
      brands: brandFacet?.counts?.map((c) => c.value) || [],
      categories: catFacet?.counts?.map((c) => c.value) || [],
    };
  } catch (err) {
    logger.warn(`Typesense: getFacets failed — ${err.message}`);
    return { brands: [], categories: [] };
  }
}

// ═════════════════════════════════════════════════════════════════
// AUTOCOMPLETE SUGGESTIONS
// ═════════════════════════════════════════════════════════════════

/**
 * Get autocomplete suggestions from Typesense product titles.
 * Prefix-searches the title field with high typo tolerance.
 * Returns up to `limit` unique suggestion strings.
 */
async function getSuggestions(q, limit = 6) {
  if (!q || q.length < 2) return [];

  try {
    const ready = await ensureCollections();
    if (!ready) return [];

    const c = getClient();

    const result = await c.collections(COLLECTION).documents().search({
      q,
      query_by: "title,brand,category",
      per_page: limit * 2,   // fetch extra — we dedupe below
      prefix: true,
      num_typos: 1,
      highlight_full_fields: "title",
      sort_by: "_text_match:desc,aiScore:desc",
      // Only return in-stock items in suggestions
      filter_by: "inStock:=true",
    });

    const hits = result.hits || [];

    // Dedupe: one suggestion per unique title (trim at 60 chars for UI)
    const seen = new Set();
    const suggestions = [];
    for (const h of hits) {
      const title = h.document.title;
      const short = title.length > 60 ? title.slice(0, 57) + "…" : title;
      if (!seen.has(title)) {
        seen.add(title);
        suggestions.push(short);
        if (suggestions.length >= limit) break;
      }
    }
    return suggestions;
  } catch (err) {
    logger.warn(`Typesense: getSuggestions failed — ${err.message}`);
    return [];
  }
}

// ═════════════════════════════════════════════════════════════════
// SEARCH ANALYTICS & TRENDING
// ═════════════════════════════════════════════════════════════════
// We store trending in Redis (sorted set) — avoids another Typesense collection.
// trackSearch increments a sorted set score; getTrending reads top N queries.

/**
 * Record a search query for trending analytics.
 * Fire-and-forget — never blocks or throws.
 */
async function trackSearch(query, redis) {
  if (!query || !redis) return;
  try {
    const key = "typesense:trending";
    const normalized = query.toLowerCase().trim().slice(0, 80);
    // ZINCRBY: increment score by 1, or create with score 1
    await redis.zincrby(key, 1, normalized);
    // Keep the set bounded to 500 entries (remove lowest-scored when > 500)
    await redis.zremrangebyrank(key, 0, -501);
    // Expire after 7 days (trending resets weekly)
    await redis.expire(key, 7 * 24 * 60 * 60);
  } catch (err) {
    // Non-fatal
  }
}

/**
 * Get top N trending search queries from Redis sorted set.
 * Returns strings (not product objects).
 */
async function getTrending(redis, limit = 8) {
  if (!redis) return [];
  try {
    const key = "typesense:trending";
    // ZREVRANGE: highest scores first
    const items = await redis.zrevrange(key, 0, limit - 1);
    return items || [];
  } catch (err) {
    logger.warn(`Typesense: getTrending failed — ${err.message}`);
    return [];
  }
}

/**
 * Get search queries with zero results (miss tracking).
 * Useful for seeding the database with missing categories.
 */
async function getMisses(redis, limit = 20) {
  if (!redis) return [];
  try {
    const misses = await redis.zrevrange("typesense:misses", 0, limit - 1);
    return misses || [];
  } catch {
    return [];
  }
}

/**
 * Track a zero-result query (search miss).
 */
async function trackMiss(query, redis) {
  if (!query || !redis) return;
  try {
    await redis.zincrby("typesense:misses", 1, query.toLowerCase().trim());
    await redis.expire("typesense:misses", 30 * 24 * 60 * 60); // 30-day window
  } catch (_) {}
}

// ═════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═════════════════════════════════════════════════════════════════

async function healthCheck() {
  const c = getClient();
  if (!c) return { ok: false, reason: "client not configured" };

  try {
    const health = await c.health.retrieve();
    return { ok: health.ok === true, details: health };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Convert a formatted bestpickr product response into a Typesense document for
 * indexing. This is the public alias used by the search route and Amazon service.
 * Identical to productToDocument — exposed as `indexProductToTypesense` per spec.
 */
async function indexProductToTypesense(product) {
  return indexProduct(product);
}

module.exports = {
  // Core
  ensureCollections,
  healthCheck,

  // Indexing
  indexProduct,
  indexProductToTypesense,  // alias — matches requested function name
  indexBatch,

  // Search
  searchProducts,
  getFacets,

  // Suggestions & Analytics
  getSuggestions,
  trackSearch,
  getTrending,
  trackMiss,
  getMisses,
};
