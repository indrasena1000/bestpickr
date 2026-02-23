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

// ── SIMILARITY / DEDUPLICATION HELPERS ──────────────────────────
const SIMILARITY_THRESHOLD = 0.70; // 70 % Jaccard similarity → reject

// Common English + Hindi-transliteration stop words to ignore
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of',
  'is','it','its','be','as','up','by','do','we','my','so','if',
  'how','out','what','when','with','from','that','this','are',
  'was','were','been','has','have','had','can','will','not','all',
  'one','our','your','best','get','more','vs','top','india',
  'indian','2026','rupees','inr','buy','price','online','review',
]);

/**
 * Tokenises text: strips HTML, lowercases, splits into words,
 * removes stop words and short tokens.
 */
function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')       // strip HTML tags
    .replace(/[^a-z0-9\s]/g, ' ')  // keep alphanumeric only
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Jaccard similarity between two text strings (0 … 1).
 * Uses SET overlap so word-frequency doesn't inflate the score.
 */
function jaccardSimilarity(textA, textB) {
  const setA = new Set(tokenize(textA));
  const setB = new Set(tokenize(textB));
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const unionSize    = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

/**
 * Queries MongoDB for existing posts and returns the first one whose
 * combined title+excerpt similarity with the candidate exceeds the threshold.
 * Returns { slug, title, similarity } or null.
 */
async function findSimilarExistingPost(title, excerpt) {
  const existing = await BlogPost
    .find({}, { title: 1, excerpt: 1, slug: 1 })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  const candidateText = `${title} ${excerpt}`;

  for (const post of existing) {
    const existingText = `${post.title} ${post.excerpt || ''}`;
    const sim = jaccardSimilarity(candidateText, existingText);
    if (sim >= SIMILARITY_THRESHOLD) {
      return { slug: post.slug, title: post.title, similarity: sim };
    }
  }
  return null;
}

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

  // Sanitize slug — always derived from the title, not GPT's suggestion,
  // so it's deterministic and immune to GPT hallucinations.
  const baseSlug = data.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')   // strip special chars
    .trim()
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/-+/g, '-')            // collapse multiple hyphens
    .slice(0, 72);                  // cap at 72 so suffix "-10" still fits under 80

  // ── SLUG COLLISION — single-query resolution ─────────────────
  // Fetch all existing slugs that match "base-slug" or "base-slug-N"
  // in one DB round-trip, then pick the next free suffix.
  const slugPattern = new RegExp(`^${baseSlug}(-\\d+)?$`);
  const takenSlugs = await BlogPost
    .find({ slug: slugPattern }, { slug: 1, _id: 0 })
    .lean()
    .then(docs => new Set(docs.map(d => d.slug)));

  let resolvedSlug = baseSlug;
  if (takenSlugs.has(resolvedSlug)) {
    let n = 2;
    while (takenSlugs.has(`${baseSlug}-${n}`) && n <= 20) n++;
    resolvedSlug = `${baseSlug}-${n}`;
    logger.warn(`[BlogContent] Slug resolved: "${baseSlug}" → "${resolvedSlug}"`);
  }
  data.slug = resolvedSlug;

  // 2. Semantic similarity — reject if ≥ 70 % Jaccard match
  const similar = await findSimilarExistingPost(data.title, data.excerpt);
  if (similar) {
    throw new Error(
      `Duplicate content detected (${(similar.similarity * 100).toFixed(0)}% similar to ` +
      `"${similar.title}" [${similar.slug}]). Skipping generation.`
    );
  }
  // ────────────────────────────────────────────────────────────

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

  // Save — catch MongoDB duplicate key (code 11000) in case a concurrent
  // request claimed the same slug in the window between our check and save.
  try {
    await post.save();
  } catch (saveErr) {
    if (saveErr.code === 11000) {
      // Append timestamp suffix and retry once — virtually impossible to collide again
      post.slug = `${data.slug}-${Date.now().toString(36)}`;
      await post.save();
      logger.warn(`[BlogContent] Race condition on slug — retried with suffix: "${post.slug}"`);
    } else {
      throw saveErr;
    }
  }
  logger.info(`[BlogContent] Saved draft: "${post.title}" (${post.slug})`);
  return post;
}

// ── GENERATE 3 DAILY POSTS ───────────────────────────────────────
// Runs combos SEQUENTIALLY so each dedup check sees posts that were
// just saved by earlier iterations — avoids parallel race conditions.
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

  // Sequential — not parallel — so each post's dupe check sees all
  // previously generated posts that were saved in the same run.
  const results = [];
  for (const { topic, category } of combos) {
    try {
      const post = await generateSinglePost(topic, category);
      results.push({ status: 'fulfilled', value: post });
    } catch (err) {
      results.push({ status: 'rejected', reason: err });
    }
  }

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

// ── PURGE EXISTING DUPLICATES ────────────────────────────────────
/**
 * Scans ALL existing BlogPosts and removes duplicates / near-duplicates
 * (>= SIMILARITY_THRESHOLD Jaccard on title+excerpt).
 *
 * Strategy: iterate posts oldest→newest; for each post compare against
 * all EARLIER unique posts. If ≥ 70 % similar, mark it for deletion
 * (keeps the oldest copy, removes the newer duplicate).
 *
 * Returns { removed, kept, details } for the admin API response.
 */
async function deduplicateExistingPosts() {
  logger.info('[BlogContent] Starting deduplication of existing posts…');

  const all = await BlogPost
    .find({}, { _id: 1, slug: 1, title: 1, excerpt: 1, createdAt: 1 })
    .sort({ createdAt: 1 })   // oldest first → we keep the original
    .lean();

  const kept    = [];   // posts we're keeping (unique)
  const removed = [];   // posts we're deleting (duplicates)

  for (const candidate of all) {
    const candidateText = `${candidate.title} ${candidate.excerpt || ''}`;
    let isDuplicate = false;

    for (const unique of kept) {
      const uniqueText = `${unique.title} ${unique.excerpt || ''}`;
      const sim = jaccardSimilarity(candidateText, uniqueText);
      if (sim >= SIMILARITY_THRESHOLD) {
        logger.warn(
          `[BlogContent] Duplicate found: "${candidate.title}" ` +
          `(${(sim * 100).toFixed(0)}% similar to "${unique.title}") — removing`
        );
        removed.push({ slug: candidate.slug, title: candidate.title, similarTo: unique.slug, similarity: sim });
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      kept.push(candidate);
    }
  }

  // Delete duplicates in one batch
  if (removed.length > 0) {
    const idsToDelete = removed.map(r => {
      const match = all.find(p => p.slug === r.slug);
      return match?._id;
    }).filter(Boolean);

    await BlogPost.deleteMany({ _id: { $in: idsToDelete } });
    logger.info(`[BlogContent] Deduplication complete — removed ${removed.length} duplicates, kept ${kept.length} posts`);
  } else {
    logger.info('[BlogContent] Deduplication complete — no duplicates found');
  }

  return { removed: removed.length, kept: kept.length, details: removed };
}

module.exports = { generateDailyBlogs, deduplicateExistingPosts };
