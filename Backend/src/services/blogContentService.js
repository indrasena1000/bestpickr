// src/services/blogContentService.js
// ─────────────────────────────────────────────────────────────────
// Generates 3 original AI tech blog posts per day about the Indian
// consumer electronics market using GPT-4o-mini.
//
// Flow:
//   1. Pick random topics/categories (rotate to avoid repetition)
//   2. Call GPT-4o-mini → JSON with title, slug, content, tags, etc.
//   3. Fetch cover image from Unsplash API
//   4. Save to MongoDB as BlogPost with status: 'draft'
//   5. Return { generated, failed, posts: [...slugs] }
//
// COST: ~1500-2500 tokens per post × 3 = ~$0.002-0.004/day
// ─────────────────────────────────────────────────────────────────
'use strict';

const OpenAI  = require('openai');
const axios   = require('axios');
const logger  = require('../utils/logger');
const { BlogPost } = require('../models/index.js');

// ── OPENAI CLIENT (lazy init — same pattern as aiAnalysisService) ─
let openai = null;
function getOpenAIClient() {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

// ── CONSTANTS ────────────────────────────────────────────────────
const MODEL           = 'gpt-4o-mini';
const TEMPERATURE     = 0.8; // Higher temp for more creative writing
const MAX_TOKENS      = 2500;
const FALLBACK_IMAGE  = 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800';

const CATEGORIES = [
  'Smartphones', 'Laptops', 'Deals', 'Industry News', 'Audio', 'Wearables', 'Televisions',
];

const TOPIC_ROTATIONS = [
  'Write a new device launch and first impressions article for a recently released product in the Indian market',
  'Write a value buying guide (e.g. "best phones under ₹15,000 in 2026" or "best earbuds under ₹3,000")',
  'Write a head-to-head comparison of two popular competing products at the same price point in India',
  'Write a weekly deals and offers roundup — best discounts on Amazon.in and Flipkart this week',
  'Write practical tech tips for Indian consumers (e.g. how to spot fake reviews, how to check warranty)',
  'Write Indian tech industry news — new brand launches, 5G expansion, price drops, upcoming products',
];

// ── SYSTEM PROMPT ────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a senior tech journalist writing for bestpickr.in, India's AI-powered product comparison platform. Write completely original content — never copy or paraphrase from other sources. Focus exclusively on the Indian market with prices in INR and availability on Amazon.in and Flipkart. Your tone is friendly, knowledgeable, and helpful — like a trusted friend who deeply understands tech. Always end with a natural call-to-action directing readers to bestpickr.in to compare prices with AI before buying.

You MUST respond with a valid JSON object containing these exact fields:
{
  "title": "SEO-optimized title including year 2026 where natural",
  "slug": "lowercase-hyphenated-slug-max-60-chars",
  "excerpt": "2-3 sentences including primary keyword, used as meta description. 120-160 chars.",
  "content": "Full post as clean HTML using ONLY <h2> <h3> <p> <ul> <li> <strong> tags. 400-600 words. Include 3-4 subheadings. End with a paragraph containing a CTA linking to https://bestpickr.in with anchor text like 'compare prices on bestpickr'.",
  "category": "One of: Smartphones, Laptops, Deals, Industry News, Audio, Wearables, Televisions",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "unsplashQuery": "2-3 word query for relevant cover image e.g. 'smartphone review india'",
  "readTimeMinutes": 3
}`;

// ── GENERATE A SINGLE BLOG POST ──────────────────────────────────
async function generateSinglePost(topicHint, categoryHint) {
  const userPrompt = `${topicHint}. Focus on the category: ${categoryHint}. Make it specific, practical, and useful for Indian buyers in 2026. Include real product names, approximate INR prices, and platform availability.`;

  // Call GPT-4o-mini
  const response = await getOpenAIClient().chat.completions.create({
    model:           MODEL,
    temperature:     TEMPERATURE,
    max_tokens:      MAX_TOKENS,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt },
    ],
  });

  // Parse JSON (strip markdown fences if present)
  const raw  = response.choices[0].message.content.replace(/```json\n?|```/g, '').trim();
  const data = JSON.parse(raw);

  // Validate required fields
  if (!data.title || !data.slug || !data.excerpt || !data.content) {
    throw new Error('GPT response missing required fields: title, slug, excerpt, or content');
  }

  // Sanitize slug
  data.slug = data.slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  // Fetch cover image from Unsplash
  let coverImage    = FALLBACK_IMAGE;
  let coverImageAlt = data.title;

  if (process.env.UNSPLASH_ACCESS_KEY) {
    try {
      const imgRes = await axios.get('https://api.unsplash.com/photos/random', {
        params: {
          query:          data.unsplashQuery || categoryHint,
          orientation:    'landscape',
          content_filter: 'high',
        },
        headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
        timeout: 8000,
      });
      coverImage    = imgRes.data?.urls?.regular || FALLBACK_IMAGE;
      coverImageAlt = imgRes.data?.alt_description || imgRes.data?.description || data.title;
    } catch (unsplashErr) {
      logger.warn(`[BlogContent] Unsplash fetch failed for "${data.unsplashQuery}" — using fallback`, {
        error: unsplashErr.message,
      });
    }
  } else {
    logger.warn('[BlogContent] UNSPLASH_ACCESS_KEY not set — using fallback image');
  }

  // Save to MongoDB as draft
  const post = new BlogPost({
    slug:            data.slug,
    title:           data.title,
    excerpt:         data.excerpt,
    content:         data.content,
    coverImage,
    coverImageAlt,
    category:        data.category || categoryHint,
    tags:            Array.isArray(data.tags) ? data.tags.slice(0, 10) : [],
    status:          'draft',
    aiGenerated:     true,
    readTimeMinutes: data.readTimeMinutes || 3,
  });

  await post.save();
  logger.info(`[BlogContent] Saved draft: "${post.title}" (${post.slug})`);
  return post;
}

// ── GENERATE 3 DAILY POSTS ───────────────────────────────────────
// Picks 3 different topic/category combos, runs them in parallel
// via Promise.allSettled so one failure doesn't block the others.
async function generateDailyBlogs() {
  logger.info('[BlogContent] Starting daily blog generation (3 posts)');

  // Pick 3 varied combos from the rotation arrays
  const today = new Date().getDate(); // 1-31, used to deterministically rotate
  const combos = [
    {
      topic:    TOPIC_ROTATIONS[today % TOPIC_ROTATIONS.length],
      category: CATEGORIES[today % CATEGORIES.length],
    },
    {
      topic:    TOPIC_ROTATIONS[(today + 2) % TOPIC_ROTATIONS.length],
      category: CATEGORIES[(today + 2) % CATEGORIES.length],
    },
    {
      topic:    TOPIC_ROTATIONS[(today + 4) % TOPIC_ROTATIONS.length],
      category: CATEGORIES[(today + 4) % CATEGORIES.length],
    },
  ];

  const results = await Promise.allSettled(
    combos.map(({ topic, category }) => generateSinglePost(topic, category))
  );

  let generated = 0;
  let failed    = 0;
  const posts   = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      generated++;
      posts.push(result.value.slug);
    } else {
      failed++;
      logger.error(`[BlogContent] Post ${i + 1} failed`, { error: result.reason?.message || result.reason });
    }
  });

  logger.info(`[BlogContent] Done — generated: ${generated}, failed: ${failed}`);
  return { generated, failed, posts };
}

module.exports = { generateDailyBlogs };
