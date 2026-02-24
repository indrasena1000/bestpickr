// src/services/blogContentService.js
// ─────────────────────────────────────────────────────────────────
// Generates 1 "Top 5 Global Tech News" blog post per day.
//
// Flow:
//   1. Fetch real tech news from multiple RSS feeds (last 24 hours)
//   2. Feed raw articles to GPT-4o-mini as grounded source material
//   3. GPT rewrites them as an original, SEO-optimised news roundup
//   4. Fetch cover image from Unsplash
//   5. Save to MongoDB as BlogPost with status: 'draft'
//   6. Return { generated, failed, posts: [...slugs] }
//
// Why RSS?  GPT-4o-mini has no live internet access.  Pulling from
// RSS feeds gives GPT real, datestamped articles to summarise —
// so every post reflects actual same-day headlines, never stale content.
//
// COST: ~2500–4000 tokens per run ≈ $0.001–0.002/day
// ─────────────────────────────────────────────────────────────────
'use strict';

const OpenAI  = require('openai');
const axios   = require('axios');
const cheerio = require('cheerio');
const logger  = require('../utils/logger');
const { BlogPost } = require('../models/index.js');

// ── OPENAI CLIENT (lazy init) ─────────────────────────────────────
let openai = null;
function getOpenAIClient() {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

// ── CONSTANTS ─────────────────────────────────────────────────────
const MODEL          = 'gpt-4o-mini';
const TEMPERATURE    = 0.65; // Lower = more factual, less hallucination
const MAX_TOKENS     = 4000;
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800';

// ── RSS FEED SOURCES ──────────────────────────────────────────────
// Covers: AI, Big Tech, Startups, Cybersecurity, Gadgets globally
const RSS_FEEDS = [
  { url: 'https://techcrunch.com/feed/',                    source: 'TechCrunch'      },
  { url: 'https://www.theverge.com/rss/index.xml',          source: 'The Verge'       },
  { url: 'http://feeds.arstechnica.com/arstechnica/index',  source: 'Ars Technica'    },
  { url: 'https://www.wired.com/feed/rss',                  source: 'WIRED'           },
  { url: 'https://venturebeat.com/feed/',                   source: 'VentureBeat'     },
  { url: 'https://feeds.feedburner.com/TheHackersNews',     source: 'The Hacker News' },
  { url: 'https://www.zdnet.com/news/rss.xml',              source: 'ZDNet'           },
  { url: 'https://www.engadget.com/rss.xml',                source: 'Engadget'        },
];

// ── SYSTEM PROMPT ─────────────────────────────────────────────────
const NEWS_SYSTEM_PROMPT = `You are a professional global tech news editor writing for bestpickr.in.

Your task: write one "Top 5 Global Tech News" daily roundup blog post using ONLY the real news articles provided by the user.

STRICT EDITORIAL RULES:
1. Base every claim on the provided articles — never invent facts, dates, or quotes.
2. Rewrite all summaries entirely in your own original language. Zero copied or near-copied sentences from sources.
3. Select 5 stories that span diverse categories: AI & Machine Learning, Big Tech (Apple/Google/Microsoft/Meta/Amazon/Tesla/Samsung), Startups & Funding, Cybersecurity, Gadgets launched this week.
4. Each story must cite a verifiable source from the input articles.
5. Do NOT include old product releases (pre-2026) unless the article covers a brand-new 2026 update.
6. If fewer than 5 valid articles exist, include fewer items and state clearly why.
7. Writing must feel fresh, credible, and distinct from any other tech publication.

You MUST respond with a valid JSON object — no markdown fences, just raw JSON:
{
  "title": "Top 5 Global Tech News – [Month DD, YYYY]: [hook keyword from biggest story]",
  "slug": "top-5-tech-news-YYYY-MM-DD",
  "excerpt": "2–3 sentence meta description 120–160 chars covering today's top tech categories.",
  "content": "Full post as clean HTML using ONLY <h2> <h3> <p> <ul> <li> <strong> <em> <hr> tags.",
  "category": "Industry News",
  "tags": ["tech news today", "global tech news", "AI news", "placeholder-tag4", "placeholder-tag5"],
  "unsplashQuery": "global technology news 2026",
  "readTimeMinutes": 5
}

HTML CONTENT STRUCTURE — follow this exactly:

<h2>Top 5 Global Tech News – [Full Date]</h2>
<p>[1–2 sentence intro painting today's tech landscape — make it compelling and specific to today's stories]</p>

[Repeat the following block for each of the 5 stories:]

<h3>🔹 [SEO-Optimised Headline — clear, specific, keyword-rich, present tense]</h3>
<p><strong>📅 Published:</strong> [Exact publication date, e.g. February 24, 2026] &nbsp;|&nbsp; <strong>🌍 Source:</strong> <a href="[original article URL]" target="_blank" rel="noopener noreferrer">[Source Name]</a></p>
<p>[4–6 line summary written 100% in your own original words using your training knowledge of this topic. You have NOT been given the publisher's text — write every word yourself. Be specific and factual.]</p>
<p><strong>🔎 Why It Matters:</strong> [2–3 lines on broader business, societal, or technology significance.]</p>

[After all 5 stories:]

<hr>
<h3>📌 Today's Key Takeaway</h3>
<p>[1–2 paragraphs synthesising the day's overall tech narrative — what common themes emerge across these stories?]</p>

<h3>🏷️ SEO Tags</h3>
<p>[tag1] · [tag2] · [tag3] · [tag4] · [tag5]</p>
<p><em>Meta: [Exactly 160-character SEO meta description for this post]</em></p>`;

// ── FETCH RECENT RSS TECH NEWS ─────────────────────────────────────
/**
 * Pulls articles from multiple tech RSS feeds published in the last 24 hours.
 * Returns an array sorted newest-first.
 */
async function fetchRecentTechNews() {
  const cutoff   = Date.now() - 24 * 60 * 60 * 1000; // 24 h ago
  const allItems = [];

  await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      try {
        const res = await axios.get(feed.url, {
          timeout: 12000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; bestpickr-newsbot/1.0; +https://bestpickr.in)',
            'Accept':     'application/rss+xml, application/xml, text/xml, */*',
          },
        });

        const $ = cheerio.load(res.data, { xmlMode: true });

        // Support both <item> (RSS 2.0) and <entry> (Atom)
        const items = [];
        $('item, entry').each((_, el) => {
          const $el = $(el);

          const pubDateRaw =
            $el.find('pubDate').first().text().trim() ||
            $el.find('published').first().text().trim() ||
            $el.find('updated').first().text().trim();

          const published = pubDateRaw ? new Date(pubDateRaw) : null;
          if (!published || isNaN(published.getTime())) return;
          if (published.getTime() < cutoff)               return;  // older than 24 h

          const title = $el.find('title').first().text().trim();
          if (!title) return;

          // Link: RSS <link> text OR Atom <link href="…">
          const link =
            $el.find('link').first().text().trim() ||
            $el.find('link').first().attr('href')  || '';

          // NOTE: We deliberately do NOT extract description/content from the feed.
          // Copyright belongs to the publisher — only the headline (factual, not
          // copyrightable) and metadata (date, source) are used. GPT writes all
          // summaries from scratch based on the headline alone.
          items.push({ title, link, pubDate: published.toISOString(), source: feed.source });
        });

        allItems.push(...items);
        logger.info(`[BlogContent] RSS ${feed.source}: ${items.length} article(s) in last 24 h`);
      } catch (err) {
        logger.warn(`[BlogContent] RSS fetch failed — ${feed.source}: ${err.message}`);
      }
    })
  );

  // Sort newest-first and remove obvious duplicate titles
  const seen  = new Set();
  const dedup = allItems
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .filter((a) => {
      const key = a.title.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  logger.info(`[BlogContent] Total unique RSS articles (last 24 h): ${dedup.length}`);
  return dedup;
}

// ── BUILD USER PROMPT FROM ARTICLES ──────────────────────────────
// LEGAL NOTE: Only headline + date + source are passed to GPT.
// No description or excerpt text from publishers is included.
// Headlines are factual (not protected by copyright). GPT writes
// all summaries independently based on the headline alone.
function buildUserPrompt(articles, todayStr, todayISO) {
  let newsBlock = '';

  if (articles.length === 0) {
    newsBlock =
      'No RSS articles were found in the last 24 hours from the configured sources. ' +
      'Please write a post clearly stating that no major verifiable global tech updates ' +
      'were available at publication time, and briefly explain why news cycles can have quiet days.';
  } else {
    newsBlock = articles
      .slice(0, 20) // cap at 20 to stay within token budget
      .map((a, i) => {
        const pubFormatted = new Date(a.pubDate).toUTCString();
        return [
          `[Article ${i + 1}]`,
          `Headline: ${a.title}`,
          `Source:   ${a.source}`,
          `Date:     ${pubFormatted}`,
          `URL:      ${a.link || 'N/A'}`,
        ].join('\n');
      })
      .join('\n\n---\n\n');
  }

  return [
    `Today is ${todayStr} (${todayISO}).`,
    '',
    'Here are real tech headlines published in the last 24 hours (headline + metadata only):',
    '',
    newsBlock,
    '',
    `Based on ONLY these headlines, write the "Top 5 Global Tech News" blog post for ${todayStr}.`,
    '- Pick the 5 most globally significant stories covering diverse categories.',
    `- Use the slug exactly: "top-5-tech-news-${todayISO}".`,
    '- Write ALL summaries 100% in your own original language — you have NOT been given any',
    '  publisher description text, so every word of your summary must come from your own knowledge',
    '  of the topic suggested by the headline.',
    '- Attribute source name and publication date for each story.',
    '- Include the original article URL as a "Read more" link inside the HTML for each story.',
  ].join('\n');
}

// ── CALL GPT-4o-mini ──────────────────────────────────────────────
async function callGPT(userPrompt) {
  const response = await getOpenAIClient().chat.completions.create({
    model:           MODEL,
    temperature:     TEMPERATURE,
    max_tokens:      MAX_TOKENS,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: NEWS_SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt          },
    ],
  });

  const raw  = response.choices[0].message.content.replace(/```json\n?|```/g, '').trim();
  const data = JSON.parse(raw);

  if (!data.title || !data.slug || !data.excerpt || !data.content) {
    throw new Error('GPT response missing required fields: title, slug, excerpt, or content');
  }

  return data;
}

// ── FETCH UNSPLASH COVER IMAGE ────────────────────────────────────
async function fetchCoverImage(query, fallbackAlt) {
  if (!process.env.UNSPLASH_ACCESS_KEY) {
    logger.warn('[BlogContent] UNSPLASH_ACCESS_KEY not set — using fallback image');
    return { url: FALLBACK_IMAGE, alt: fallbackAlt };
  }

  try {
    const imgRes = await axios.get('https://api.unsplash.com/photos/random', {
      params:  { query, orientation: 'landscape', content_filter: 'high' },
      headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
      timeout: 8000,
    });
    return {
      url: imgRes.data?.urls?.regular || FALLBACK_IMAGE,
      alt: imgRes.data?.alt_description || imgRes.data?.description || fallbackAlt,
    };
  } catch (err) {
    logger.warn(`[BlogContent] Unsplash fetch failed: ${err.message}`);
    return { url: FALLBACK_IMAGE, alt: fallbackAlt };
  }
}

// ── MAIN: GENERATE DAILY TOP 5 TECH NEWS POST ────────────────────
/**
 * Called by the 9 AM cron job and admin/cron endpoints.
 * Generates exactly one "Top 5 Global Tech News" post per day,
 * grounded in real RSS articles fetched within the last 24 hours.
 *
 * Returns { generated, failed, posts: [...slugs], skipped? }
 */
async function generateDailyBlogs() {
  const today    = new Date();
  const todayISO = today.toISOString().slice(0, 10); // YYYY-MM-DD
  const todayStr = today.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const slug = `top-5-tech-news-${todayISO}`;

  logger.info(`[BlogContent] Starting Top 5 Tech News generation for ${todayISO}`);

  // ── IDEMPOTENCY: skip if today's post already exists ──────────
  const alreadyExists = await BlogPost.findOne({ slug }, { slug: 1 }).lean();
  if (alreadyExists) {
    logger.info(`[BlogContent] Post "${slug}" already exists — skipping duplicate run`);
    return { generated: 0, failed: 0, posts: [slug], skipped: true };
  }

  try {
    // Step 1 — Fetch real news from RSS feeds
    const articles = await fetchRecentTechNews();

    // Step 2 — Build prompt and call GPT
    const userPrompt = buildUserPrompt(articles, todayStr, todayISO);
    const data       = await callGPT(userPrompt);

    // Step 3 — Enforce deterministic slug (don't trust GPT for this)
    data.slug = slug;

    // Step 4 — Cover image
    const img = await fetchCoverImage(
      data.unsplashQuery || 'global technology news',
      data.title,
    );

    // Step 5 — Save draft to MongoDB
    const post = new BlogPost({
      slug:            data.slug,
      title:           data.title,
      excerpt:         data.excerpt,
      content:         data.content,
      coverImage:      img.url,
      coverImageAlt:   img.alt,
      category:        data.category || 'Industry News',
      tags:            Array.isArray(data.tags) ? data.tags.slice(0, 10) : [],
      status:          'draft',
      aiGenerated:     true,
      readTimeMinutes: data.readTimeMinutes || 5,
    });

    try {
      await post.save();
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        // Race condition: another process saved the same slug concurrently
        logger.warn(`[BlogContent] Slug race condition on "${slug}" — post already exists`);
        return { generated: 0, failed: 0, posts: [slug], skipped: true };
      }
      throw saveErr;
    }

    logger.info(`[BlogContent] Saved draft: "${post.title}" (${post.slug})`);
    logger.info(`[BlogContent] RSS articles used: ${articles.length} | Sources: ${[...new Set(articles.map(a => a.source))].join(', ') || 'none'}`);

    return { generated: 1, failed: 0, posts: [post.slug] };

  } catch (err) {
    logger.error('[BlogContent] Failed to generate Top 5 Tech News post', { error: err.message });
    return { generated: 0, failed: 1, posts: [] };
  }
}

// ── SIMILARITY / DEDUPLICATION HELPERS ───────────────────────────
const SIMILARITY_THRESHOLD = 0.70;

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of',
  'is','it','its','be','as','up','by','do','we','my','so','if',
  'how','out','what','when','with','from','that','this','are',
  'was','were','been','has','have','had','can','will','not','all',
  'one','our','your','best','get','more','vs','top','india',
  'indian','2026','rupees','inr','buy','price','online','review',
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function jaccardSimilarity(textA, textB) {
  const setA = new Set(tokenize(textA));
  const setB = new Set(tokenize(textB));
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const unionSize    = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

// ── PURGE EXISTING DUPLICATES ─────────────────────────────────────
/**
 * Scans ALL existing BlogPosts and removes near-duplicates
 * (>= SIMILARITY_THRESHOLD Jaccard on title+excerpt).
 * Keeps the oldest copy; removes newer duplicates.
 */
async function deduplicateExistingPosts() {
  logger.info('[BlogContent] Starting deduplication of existing posts…');

  const all = await BlogPost
    .find({}, { _id: 1, slug: 1, title: 1, excerpt: 1, createdAt: 1 })
    .sort({ createdAt: 1 }) // oldest first → keep original
    .lean();

  const kept    = [];
  const removed = [];

  for (const candidate of all) {
    const candidateText = `${candidate.title} ${candidate.excerpt || ''}`;
    let isDuplicate = false;

    for (const unique of kept) {
      const uniqueText = `${unique.title} ${unique.excerpt || ''}`;
      const sim = jaccardSimilarity(candidateText, uniqueText);
      if (sim >= SIMILARITY_THRESHOLD) {
        logger.warn(
          `[BlogContent] Duplicate: "${candidate.title}" ` +
          `(${(sim * 100).toFixed(0)}% similar to "${unique.title}") — removing`,
        );
        removed.push({ slug: candidate.slug, title: candidate.title, similarTo: unique.slug, similarity: sim });
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) kept.push(candidate);
  }

  if (removed.length > 0) {
    const idsToDelete = removed
      .map(r => all.find(p => p.slug === r.slug)?._id)
      .filter(Boolean);

    await BlogPost.deleteMany({ _id: { $in: idsToDelete } });
    logger.info(`[BlogContent] Deduplication done — removed: ${removed.length}, kept: ${kept.length}`);
  } else {
    logger.info('[BlogContent] Deduplication done — no duplicates found');
  }

  return { removed: removed.length, kept: kept.length, details: removed };
}

module.exports = { generateDailyBlogs, deduplicateExistingPosts };
