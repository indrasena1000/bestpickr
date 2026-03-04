// src/routes/blog.js
// ─────────────────────────────────────────────────────────────────
// Blog endpoints for bestpickr.in
//
// PUBLIC (no auth):
//   GET  /api/blog/posts              — paginated published posts
//   GET  /api/blog/posts/latest       — 5 most recent published
//   GET  /api/blog/posts/week         — published in last 7 days grouped by date
//   GET  /api/blog/posts/:slug        — single published post
//
// INTERNAL CRON (no auth — called by Vercel cron scheduler):
//   POST /api/blog/cron/generate      — triggers blog generation
//
// ADMIN (requires Authorization: Bearer {ADMIN_TOKEN}):
//   GET    /api/blog/admin/posts              — all posts (drafts + published)
//   POST   /api/blog/admin/generate           — trigger generation manually
//   PATCH  /api/blog/admin/posts/:id/publish  — publish a draft
//   PATCH  /api/blog/admin/posts/:id/unpublish— unpublish to draft
//   DELETE /api/blog/admin/posts/:id          — hard delete
//
// MongoDB is non-fatal — all endpoints return graceful empty arrays
// if MongoDB is disconnected.
// ─────────────────────────────────────────────────────────────────
"use strict";

const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const { BlogPost } = require("../models/index.js");
const {
  generateDailyBlogs,
  generateThreeDrafts,
  deduplicateExistingPosts,
} = require("../services/blogContentService.js");

// ── HELPERS ──────────────────────────────────────────────────────

const verifyAdmin = require("../middleware/verifyAdmin");

// Group an array of posts by their publishedAt date (YYYY-MM-DD)
function groupByDate(posts) {
  const grouped = {};
  posts.forEach((post) => {
    const key = new Date(post.publishedAt).toISOString().slice(0, 10);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(post);
  });
  return grouped;
}

// Minimal projection for list views (omit full HTML content)
const LIST_PROJECTION = { content: 0 };

// ── PUBLIC: GET /posts ────────────────────────────────────────────
// Returns published posts with optional category filter + pagination
router.get("/posts", async (req, res) => {
  try {
    const { category, limit: rawLimit, page: rawPage } = req.query;
    const limit = Math.min(parseInt(rawLimit) || 12, 50);
    const page = Math.max(parseInt(rawPage) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = { status: "published" };
    if (category && category !== "All") filter.category = category;

    const [posts, total] = await Promise.all([
      BlogPost.find(filter, LIST_PROJECTION)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BlogPost.countDocuments(filter),
    ]);

    res.json({
      success: true,
      posts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error("[Blog] GET /posts error", { error: err.message });
    res.json({ success: true, posts: [], total: 0, page: 1, totalPages: 0 });
  }
});

// ── PUBLIC: GET /posts/latest ─────────────────────────────────────
// Returns 5 most recent published posts — used in homepage + carousel
router.get("/posts/latest", async (req, res) => {
  try {
    const posts = await BlogPost.find({ status: "published" }, LIST_PROJECTION)
      .sort({ publishedAt: -1 })
      .limit(5)
      .lean();
    res.json({ success: true, posts });
  } catch (err) {
    logger.error("[Blog] GET /posts/latest error", { error: err.message });
    res.json({ success: true, posts: [] });
  }
});

// ── PUBLIC: GET /posts/week ───────────────────────────────────────
// Published in last 7 days, grouped by date (YYYY-MM-DD)
router.get("/posts/week", async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const posts = await BlogPost.find(
      { status: "published", publishedAt: { $gte: sevenDaysAgo } },
      LIST_PROJECTION,
    )
      .sort({ publishedAt: -1 })
      .lean();

    res.json({ success: true, grouped: groupByDate(posts) });
  } catch (err) {
    logger.error("[Blog] GET /posts/week error", { error: err.message });
    res.json({ success: true, grouped: {} });
  }
});

// ── PUBLIC: GET /posts/:slug ──────────────────────────────────────
// Single published post — includes full HTML content
router.get("/posts/:slug", async (req, res) => {
  try {
    const post = await BlogPost.findOne({
      slug: req.params.slug,
      status: "published",
    }).lean();

    if (!post)
      return res.status(404).json({ success: false, error: "Post not found" });
    res.json({ success: true, post });
  } catch (err) {
    logger.error("[Blog] GET /posts/:slug error", { error: err.message });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ── INTERNAL CRON: POST /cron/generate ────────────────────────────
// Called by Vercel cron scheduler — no auth required (Vercel-only endpoint)
router.post("/cron/generate", async (req, res) => {
  logger.info("[Blog] Vercel cron triggered blog generation");
  try {
    const result = await generateDailyBlogs();
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error("[Blog] /cron/generate error", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: GET /admin/posts ───────────────────────────────────────
// All posts including drafts
router.get("/admin/posts", verifyAdmin, async (req, res) => {
  try {
    const posts = await BlogPost.find({}).sort({ createdAt: -1 }).lean();

    const draftCount = posts.filter((p) => p.status === "draft").length;
    const publishedCount = posts.filter((p) => p.status === "published").length;

    res.json({ success: true, posts, draftCount, publishedCount });
  } catch (err) {
    logger.error("[Blog] GET /admin/posts error", { error: err.message });
    res.json({ success: true, posts: [], draftCount: 0, publishedCount: 0 });
  }
});

// ── ADMIN: POST /admin/generate ───────────────────────────────────
// Manually trigger generation — generates 3 drafts (2 tech + 1 e-commerce)
router.post("/admin/generate", verifyAdmin, async (req, res) => {
  logger.info("[Blog] Admin triggered 3-draft generation");
  try {
    const result = await generateThreeDrafts();
    const message =
      result.generated > 0
        ? `${result.generated} draft${result.generated !== 1 ? "s" : ""} generated successfully`
        : result.skipped > 0
          ? `All ${result.skipped} drafts already exist for today — no duplicates created`
          : "Generation failed — check backend logs";
    res.json({ success: true, ...result, message });
  } catch (err) {
    logger.error("[Blog] /admin/generate error", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: POST /admin/deduplicate ──────────────────────────────
// Scans all existing posts and deletes any >= 70% similar duplicates.
// Keeps the oldest copy; removes newer near-duplicates.
router.post("/admin/deduplicate", verifyAdmin, async (req, res) => {
  logger.info("[Blog] Admin triggered deduplication");
  try {
    const result = await deduplicateExistingPosts();
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error("[Blog] /admin/deduplicate error", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: PATCH /admin/posts/:id/publish ────────────────────────
router.patch("/admin/posts/:id/publish", verifyAdmin, async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndUpdate(
      req.params.id,
      { status: "published", publishedAt: new Date() },
      { new: true },
    ).lean();

    if (!post)
      return res.status(404).json({ success: false, error: "Post not found" });
    logger.info(`[Blog] Published: "${post.title}"`);
    res.json({ success: true, post });
  } catch (err) {
    logger.error("[Blog] PATCH /publish error", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: PATCH /admin/posts/:id/unpublish ──────────────────────
router.patch("/admin/posts/:id/unpublish", verifyAdmin, async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndUpdate(
      req.params.id,
      { status: "draft", publishedAt: null },
      { new: true },
    ).lean();

    if (!post)
      return res.status(404).json({ success: false, error: "Post not found" });
    logger.info(`[Blog] Unpublished: "${post.title}"`);
    res.json({ success: true, post });
  } catch (err) {
    logger.error("[Blog] PATCH /unpublish error", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: DELETE /admin/posts/:id ───────────────────────────────
router.delete("/admin/posts/:id", verifyAdmin, async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndDelete(req.params.id).lean();
    if (!post)
      return res.status(404).json({ success: false, error: "Post not found" });
    logger.info(`[Blog] Deleted: "${post.title}"`);
    res.json({ success: true });
  } catch (err) {
    logger.error("[Blog] DELETE error", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: POST /admin/posts ─────────────────────────────────────
// Create a new blog post directly (manual/curated content).
// Content can be HTML or Markdown. Pass contentFormat:"markdown" to auto-convert.
// Required fields: title, slug, excerpt, content
// Optional: contentFormat ("html"|"markdown"), tags, category, coverImage,
//           coverImageAlt, status ("draft"|"published")
// ─────────────────────────────────────────────────────────────────

/**
 * Minimal but sufficient Markdown→HTML converter for SEO blog content.
 * Handles: h1-h3, bold, italic, inline code, links, images, blockquotes,
 * unordered/ordered lists, tables, horizontal rules, paragraphs.
 */
function mdToHtml(md) {
  let html = md
    // Fenced code blocks
    .replace(
      /```[\s\S]*?```/g,
      (m) => `<pre><code>${m.slice(3, -3).trim()}</code></pre>`,
    )
    // Blockquotes
    .replace(/^>\s?(.+)$/gm, (_, t) => `<blockquote>${t.trim()}</blockquote>`)
    // Headers
    .replace(/^### (.+)$/gm, (_, t) => `<h3>${t.trim()}</h3>`)
    .replace(/^## (.+)$/gm, (_, t) => `<h2>${t.trim()}</h2>`)
    .replace(/^# (.+)$/gm, (_, t) => `<h1>${t.trim()}</h1>`)
    // Horizontal rule
    .replace(/^---+$/gm, "<hr/>")
    // Bold + italic combos first
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Images before links
    .replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      '<img src="$2" alt="$1" loading="lazy"/>',
    )
    // Links
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );

  // Tables
  html = html.replace(/((?:^[|].+[|]\r?\n)+)/gm, (tableBlock) => {
    const rows = tableBlock
      .trim()
      .split("\n")
      .filter((r) => !/^[|\s:\-]+$/.test(r));
    if (rows.length < 1) return tableBlock;
    const makeRow = (row, tag) =>
      "<tr>" +
      row
        .split("|")
        .filter((_, i, a) => i > 0 && i < a.length - 1)
        .map((cell) => `<${tag}>${cell.trim()}</${tag}>`)
        .join("") +
      "</tr>";
    const [header, ...body] = rows;
    return `<table><thead>${makeRow(header, "th")}</thead><tbody>${body.map((r) => makeRow(r, "td")).join("")}</tbody></table>`;
  });

  // Unordered lists (-, *, +)
  html = html.replace(
    /(^[ \t]*[-*+] .+\n?)+/gm,
    (block) =>
      "<ul>" +
      block
        .trim()
        .split("\n")
        .map((l) => `<li>${l.replace(/^[ \t]*[-*+] /, "").trim()}</li>`)
        .join("") +
      "</ul>",
  );

  // Ordered lists (1. item)
  html = html.replace(
    /(^[ \t]*\d+\. .+\n?)+/gm,
    (block) =>
      "<ol>" +
      block
        .trim()
        .split("\n")
        .map((l) => `<li>${l.replace(/^[ \t]*\d+\. /, "").trim()}</li>`)
        .join("") +
      "</ol>",
  );

  // Paragraphs
  const lines = html.split("\n");
  const out = [];
  let inPara = false;
  const blockTag =
    /^<(h[1-6]|ul|ol|blockquote|pre|table|thead|tbody|tr|td|th|hr|img)/;
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (inPara) {
        out.push("</p>");
        inPara = false;
      }
      continue;
    }
    if (blockTag.test(t)) {
      if (inPara) {
        out.push("</p>");
        inPara = false;
      }
      out.push(t);
    } else {
      if (!inPara) {
        out.push("<p>");
        inPara = true;
      }
      out.push(t);
    }
  }
  if (inPara) out.push("</p>");
  return out.join("\n");
}

router.post("/admin/posts", verifyAdmin, async (req, res) => {
  const {
    title,
    slug,
    excerpt,
    content,
    contentFormat = "html",
    tags = [],
    category = null,
    coverImage = null,
    coverImageAlt = null,
    status = "draft",
  } = req.body;

  if (!title?.trim())
    return res.status(400).json({ success: false, error: "title is required" });
  if (!slug?.trim())
    return res.status(400).json({ success: false, error: "slug is required" });
  if (!excerpt?.trim())
    return res
      .status(400)
      .json({ success: false, error: "excerpt is required" });
  if (!content?.trim())
    return res
      .status(400)
      .json({ success: false, error: "content is required" });

  // Convert markdown → HTML if requested
  const htmlContent =
    contentFormat === "markdown" ? mdToHtml(content) : content;

  // Auto-calculate reading time (~200 words/min, strip HTML tags first)
  const wordCount = htmlContent
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  try {
    const existing = await BlogPost.findOne({
      slug: slug.trim().toLowerCase(),
    }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Slug "${slug}" already exists. Use a different slug or update the existing post.`,
      });
    }

    const post = await BlogPost.create({
      title: title.trim(),
      slug: slug.trim().toLowerCase(),
      excerpt: excerpt.trim(),
      content: htmlContent,
      tags: Array.isArray(tags)
        ? tags.map((t) => t.trim()).filter(Boolean)
        : [],
      category: category || null,
      coverImage: coverImage || null,
      coverImageAlt: coverImageAlt || null,
      status,
      aiGenerated: false,
      publishedAt: status === "published" ? new Date() : null,
      readTimeMinutes,
    });

    logger.info(`[Blog] Created post: "${post.title}" (${status})`);
    res.status(201).json({ success: true, post });
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ success: false, error: `Slug "${slug}" already exists.` });
    }
    logger.error("[Blog] POST /admin/posts error", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: PATCH /admin/posts/:id ───────────────────────────────
// Update any field of an existing post (title, content, status, etc.)
router.patch("/admin/posts/:id", verifyAdmin, async (req, res) => {
  const allowed = [
    "title",
    "excerpt",
    "content",
    "tags",
    "category",
    "coverImage",
    "coverImageAlt",
    "status",
  ];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (updates.status === "published") updates.publishedAt = new Date();
  if (updates.status === "draft") updates.publishedAt = null;
  if (updates.content) {
    const words = updates.content
      .replace(/<[^>]+>/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
    updates.readTimeMinutes = Math.max(1, Math.ceil(words / 200));
  }
  updates.updatedAt = new Date();
  try {
    const post = await BlogPost.findByIdAndUpdate(req.params.id, updates, {
      new: true,
    }).lean();
    if (!post)
      return res.status(404).json({ success: false, error: "Post not found" });
    logger.info(`[Blog] Updated post: "${post.title}"`);
    res.json({ success: true, post });
  } catch (err) {
    logger.error("[Blog] PATCH /admin/posts/:id error", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: GET /admin/analytics ───────────────────────────────────
// Aggregates blog-specific events from PostgreSQL (via Prisma) so the
// admin dashboard can show per-post views, traffic sources, read depth,
// device split, and trending posts — everything a blog publisher needs.
//
// Event conventions stored in the PageView table:
//   eventType = 'blog_view'       → query=slug, productName=title, page=category
//   eventType = 'blog_read_depth' → query=slug, screenWidth=depth% (0-100)
router.get("/admin/analytics", verifyAdmin, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    if (!prisma) {
      return res.json({
        success: true,
        stats: null,
        message: "Prisma not connected",
      });
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalViews,
      weekViews,
      todayViews,
      uniqueReaders,
      topPosts,
      trafficSources,
      depthStats,
      mobileCount,
      desktopCount,
      recentEvents,
    ] = await Promise.all([
      // ① Total all-time blog views
      prisma.pageView.count({ where: { eventType: "blog_view" } }),

      // ② Views this week
      prisma.pageView.count({
        where: { eventType: "blog_view", createdAt: { gte: weekAgo } },
      }),

      // ③ Views today
      prisma.pageView.count({
        where: { eventType: "blog_view", createdAt: { gte: todayStart } },
      }),

      // ④ Unique readers (distinct visitorIds)
      prisma.pageView.groupBy({
        by: ["visitorId"],
        where: { eventType: "blog_view" },
      }),

      // ⑤ Top 5 posts by view count (query = slug, productName = title)
      prisma.pageView.groupBy({
        by: ["query", "productName"],
        where: { eventType: "blog_view", query: { not: null } },
        _count: { query: true },
        orderBy: { _count: { query: "desc" } },
        take: 5,
      }),

      // ⑥ Traffic sources (referrer field)
      prisma.pageView.groupBy({
        by: ["referrer"],
        where: { eventType: "blog_view" },
        _count: { referrer: true },
        orderBy: { _count: { referrer: "desc" } },
        take: 30,
      }),

      // ⑦ Average read depth across all sessions
      prisma.pageView.aggregate({
        where: { eventType: "blog_read_depth", screenWidth: { not: null } },
        _avg: { screenWidth: true },
        _count: { screenWidth: true },
      }),

      // ⑧ Mobile readers (screenWidth < 768 on blog_view events)
      prisma.pageView.count({
        where: { eventType: "blog_view", screenWidth: { lt: 768, not: null } },
      }),

      // ⑨ Desktop readers (screenWidth >= 768)
      prisma.pageView.count({
        where: { eventType: "blog_view", screenWidth: { gte: 768 } },
      }),

      // ⑩ Last 20 blog events for live feed
      prisma.pageView.findMany({
        where: { eventType: { in: ["blog_view", "blog_read_depth"] } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          createdAt: true,
          eventType: true,
          query: true,
          productName: true,
          page: true,
          screenWidth: true,
          referrer: true,
        },
      }),
    ]);

    // Bucket referrers into meaningful sources
    const sourceMap = { instagram: 0, google: 0, direct: 0, other: 0 };
    trafficSources.forEach((s) => {
      const ref = (s.referrer || "direct").toLowerCase();
      const n = s._count.referrer;
      if (!ref || ref === "direct") sourceMap.direct += n;
      else if (ref.includes("instagram") || ref.includes("t.co"))
        sourceMap.instagram += n;
      else if (
        ref.includes("google") ||
        ref.includes("bing") ||
        ref.includes("yahoo")
      )
        sourceMap.google += n;
      else sourceMap.other += n;
    });

    res.json({
      success: true,
      stats: {
        totalViews,
        weekViews,
        todayViews,
        uniqueReaders: uniqueReaders.length,
        avgReadDepth: Math.round(depthStats._avg.screenWidth || 0),
        readDepthSamples: depthStats._count.screenWidth || 0,
        topPosts: topPosts.map((p) => ({
          slug: p.query,
          title: p.productName || p.query,
          views: p._count.query,
        })),
        sources: sourceMap,
        devices: { mobile: mobileCount, desktop: desktopCount },
        recentActivity: recentEvents.map((e) => ({
          time: e.createdAt,
          type: e.eventType,
          slug: e.query,
          title: e.productName,
          category: e.page,
          depth: e.eventType === "blog_read_depth" ? e.screenWidth : null,
          source: e.referrer || "direct",
        })),
      },
    });
  } catch (err) {
    logger.error("[Blog] GET /admin/analytics error", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUBLIC: GET /sitemap-slugs ────────────────────────────────────
// Returns all published slugs + updatedAt for dynamic sitemap generation.
// Used by: search console integration, Vercel cron sitemap pings.
router.get("/sitemap-slugs", async (req, res) => {
  try {
    const posts = await BlogPost.find(
      { status: "published" },
      { slug: 1, updatedAt: 1, publishedAt: 1 },
    )
      .sort({ publishedAt: -1 })
      .lean();

    const slugs = posts.map((p) => ({
      slug: p.slug,
      url: `https://bestpickr.in/blog/${p.slug}`,
      updatedAt: p.updatedAt || p.publishedAt,
    }));

    res.json({ success: true, total: slugs.length, slugs });
  } catch (err) {
    logger.error("[Blog] GET /sitemap-slugs error", { error: err.message });
    res.json({ success: true, total: 0, slugs: [] });
  }
});

module.exports = router;
