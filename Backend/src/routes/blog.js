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
const { generateDailyBlogs } = require('../services/blogContentService.js');

// ── HELPERS ──────────────────────────────────────────────────────

function authCheck(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : header;
  const valid  = process.env.ADMIN_TOKEN || 'bestpickr-admin-2025';
  if (token !== valid) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

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
router.get('/admin/posts', authCheck, async (req, res) => {
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
// Manually trigger generation (also used by admin dashboard button)
router.post('/admin/generate', authCheck, async (req, res) => {
  logger.info('[Blog] Admin triggered blog generation');
  try {
    const result = await generateDailyBlogs();
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('[Blog] /admin/generate error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: PATCH /admin/posts/:id/publish ────────────────────────
router.patch('/admin/posts/:id/publish', authCheck, async (req, res) => {
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
router.patch('/admin/posts/:id/unpublish', authCheck, async (req, res) => {
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
router.delete('/admin/posts/:id', authCheck, async (req, res) => {
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

module.exports = router;
