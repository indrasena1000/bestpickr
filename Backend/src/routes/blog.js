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
'use strict';

const express = require('express');
const router  = express.Router();
const logger  = require('../utils/logger');
const { BlogPost } = require('../models/index.js');
const { generateDailyBlogs, generateThreeDrafts, deduplicateExistingPosts } = require('../services/blogContentService.js');

// ── HELPERS ──────────────────────────────────────────────────────

const verifyAdmin = require('../middleware/verifyAdmin')

// Group an array of posts by their publishedAt date (YYYY-MM-DD)
function groupByDate(posts) {
  const grouped = {};
  posts.forEach(post => {
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
router.get('/posts', async (req, res) => {
  try {
    const { category, limit: rawLimit, page: rawPage } = req.query;
    const limit  = Math.min(parseInt(rawLimit) || 12, 50);
    const page   = Math.max(parseInt(rawPage)  || 1,  1);
    const skip   = (page - 1) * limit;

    const filter = { status: 'published' };
    if (category && category !== 'All') filter.category = category;

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
    logger.error('[Blog] GET /posts error', { error: err.message });
    res.json({ success: true, posts: [], total: 0, page: 1, totalPages: 0 });
  }
});

// ── PUBLIC: GET /posts/latest ─────────────────────────────────────
// Returns 5 most recent published posts — used in homepage + carousel
router.get('/posts/latest', async (req, res) => {
  try {
    const posts = await BlogPost.find({ status: 'published' }, LIST_PROJECTION)
      .sort({ publishedAt: -1 })
      .limit(5)
      .lean();
    res.json({ success: true, posts });
  } catch (err) {
    logger.error('[Blog] GET /posts/latest error', { error: err.message });
    res.json({ success: true, posts: [] });
  }
});

// ── PUBLIC: GET /posts/week ───────────────────────────────────────
// Published in last 7 days, grouped by date (YYYY-MM-DD)
router.get('/posts/week', async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const posts = await BlogPost.find(
      { status: 'published', publishedAt: { $gte: sevenDaysAgo } },
      LIST_PROJECTION,
    ).sort({ publishedAt: -1 }).lean();

    res.json({ success: true, grouped: groupByDate(posts) });
  } catch (err) {
    logger.error('[Blog] GET /posts/week error', { error: err.message });
    res.json({ success: true, grouped: {} });
  }
});

// ── PUBLIC: GET /posts/:slug ──────────────────────────────────────
// Single published post — includes full HTML content
router.get('/posts/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({
      slug:   req.params.slug,
      status: 'published',
    }).lean();

    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    res.json({ success: true, post });
  } catch (err) {
    logger.error('[Blog] GET /posts/:slug error', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── INTERNAL CRON: POST /cron/generate ────────────────────────────
// Called by Vercel cron scheduler — no auth required (Vercel-only endpoint)
router.post('/cron/generate', async (req, res) => {
  logger.info('[Blog] Vercel cron triggered blog generation');
  try {
    const result = await generateDailyBlogs();
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('[Blog] /cron/generate error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: GET /admin/posts ───────────────────────────────────────
// All posts including drafts
router.get('/admin/posts', verifyAdmin, async (req, res) => {
  try {
    const posts = await BlogPost.find({})
      .sort({ createdAt: -1 })
      .lean();

    const draftCount     = posts.filter(p => p.status === 'draft').length;
    const publishedCount = posts.filter(p => p.status === 'published').length;

    res.json({ success: true, posts, draftCount, publishedCount });
  } catch (err) {
    logger.error('[Blog] GET /admin/posts error', { error: err.message });
    res.json({ success: true, posts: [], draftCount: 0, publishedCount: 0 });
  }
});

// ── ADMIN: POST /admin/generate ───────────────────────────────────
// Manually trigger generation — generates 3 drafts (2 tech + 1 e-commerce)
router.post('/admin/generate', verifyAdmin, async (req, res) => {
  logger.info('[Blog] Admin triggered 3-draft generation');
  try {
    const result = await generateThreeDrafts();
    const message = result.generated > 0
      ? `${result.generated} draft${result.generated !== 1 ? 's' : ''} generated successfully`
      : result.skipped > 0
        ? `All ${result.skipped} drafts already exist for today — no duplicates created`
        : 'Generation failed — check backend logs';
    res.json({ success: true, ...result, message });
  } catch (err) {
    logger.error('[Blog] /admin/generate error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: POST /admin/deduplicate ──────────────────────────────
// Scans all existing posts and deletes any >= 70% similar duplicates.
// Keeps the oldest copy; removes newer near-duplicates.
router.post('/admin/deduplicate', verifyAdmin, async (req, res) => {
  logger.info('[Blog] Admin triggered deduplication');
  try {
    const result = await deduplicateExistingPosts();
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('[Blog] /admin/deduplicate error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: PATCH /admin/posts/:id/publish ────────────────────────
router.patch('/admin/posts/:id/publish', verifyAdmin, async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndUpdate(
      req.params.id,
      { status: 'published', publishedAt: new Date() },
      { new: true },
    ).lean();

    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    logger.info(`[Blog] Published: "${post.title}"`);
    res.json({ success: true, post });
  } catch (err) {
    logger.error('[Blog] PATCH /publish error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: PATCH /admin/posts/:id/unpublish ──────────────────────
router.patch('/admin/posts/:id/unpublish', verifyAdmin, async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndUpdate(
      req.params.id,
      { status: 'draft', publishedAt: null },
      { new: true },
    ).lean();

    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    logger.info(`[Blog] Unpublished: "${post.title}"`);
    res.json({ success: true, post });
  } catch (err) {
    logger.error('[Blog] PATCH /unpublish error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: DELETE /admin/posts/:id ───────────────────────────────
router.delete('/admin/posts/:id', verifyAdmin, async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndDelete(req.params.id).lean();
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    logger.info(`[Blog] Deleted: "${post.title}"`);
    res.json({ success: true });
  } catch (err) {
    logger.error('[Blog] DELETE error', { error: err.message });
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
router.get('/admin/analytics', verifyAdmin, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    if (!prisma) {
      return res.json({ success: true, stats: null, message: 'Prisma not connected' });
    }

    const weekAgo    = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
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
      prisma.pageView.count({ where: { eventType: 'blog_view' } }),

      // ② Views this week
      prisma.pageView.count({
        where: { eventType: 'blog_view', createdAt: { gte: weekAgo } },
      }),

      // ③ Views today
      prisma.pageView.count({
        where: { eventType: 'blog_view', createdAt: { gte: todayStart } },
      }),

      // ④ Unique readers (distinct visitorIds)
      prisma.pageView.groupBy({
        by: ['visitorId'],
        where: { eventType: 'blog_view' },
      }),

      // ⑤ Top 5 posts by view count (query = slug, productName = title)
      prisma.pageView.groupBy({
        by: ['query', 'productName'],
        where: { eventType: 'blog_view', query: { not: null } },
        _count: { query: true },
        orderBy: { _count: { query: 'desc' } },
        take: 5,
      }),

      // ⑥ Traffic sources (referrer field)
      prisma.pageView.groupBy({
        by: ['referrer'],
        where: { eventType: 'blog_view' },
        _count: { referrer: true },
        orderBy: { _count: { referrer: 'desc' } },
        take: 30,
      }),

      // ⑦ Average read depth across all sessions
      prisma.pageView.aggregate({
        where: { eventType: 'blog_read_depth', screenWidth: { not: null } },
        _avg:   { screenWidth: true },
        _count: { screenWidth: true },
      }),

      // ⑧ Mobile readers (screenWidth < 768 on blog_view events)
      prisma.pageView.count({
        where: { eventType: 'blog_view', screenWidth: { lt: 768, not: null } },
      }),

      // ⑨ Desktop readers (screenWidth >= 768)
      prisma.pageView.count({
        where: { eventType: 'blog_view', screenWidth: { gte: 768 } },
      }),

      // ⑩ Last 20 blog events for live feed
      prisma.pageView.findMany({
        where: { eventType: { in: ['blog_view', 'blog_read_depth'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          createdAt:   true,
          eventType:   true,
          query:       true,
          productName: true,
          page:        true,
          screenWidth: true,
          referrer:    true,
        },
      }),
    ]);

    // Bucket referrers into meaningful sources
    const sourceMap = { instagram: 0, google: 0, direct: 0, other: 0 };
    trafficSources.forEach(s => {
      const ref = (s.referrer || 'direct').toLowerCase();
      const n   = s._count.referrer;
      if (!ref || ref === 'direct')                              sourceMap.direct    += n;
      else if (ref.includes('instagram') || ref.includes('t.co')) sourceMap.instagram += n;
      else if (ref.includes('google') || ref.includes('bing') || ref.includes('yahoo')) sourceMap.google += n;
      else                                                       sourceMap.other     += n;
    });

    res.json({
      success: true,
      stats: {
        totalViews,
        weekViews,
        todayViews,
        uniqueReaders:   uniqueReaders.length,
        avgReadDepth:    Math.round(depthStats._avg.screenWidth || 0),
        readDepthSamples: depthStats._count.screenWidth || 0,
        topPosts: topPosts.map(p => ({
          slug:  p.query,
          title: p.productName || p.query,
          views: p._count.query,
        })),
        sources: sourceMap,
        devices: { mobile: mobileCount, desktop: desktopCount },
        recentActivity: recentEvents.map(e => ({
          time:     e.createdAt,
          type:     e.eventType,
          slug:     e.query,
          title:    e.productName,
          category: e.page,
          depth:    e.eventType === 'blog_read_depth' ? e.screenWidth : null,
          source:   e.referrer || 'direct',
        })),
      },
    });
  } catch (err) {
    logger.error('[Blog] GET /admin/analytics error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
