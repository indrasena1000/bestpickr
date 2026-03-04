#!/usr/bin/env node
// scripts/publishBlogs.js
// ─────────────────────────────────────────────────────────────────
// One-shot script: reads all markdown files from Backend/blogs/,
// converts them to HTML, and publishes them to MongoDB as blog posts.
//
// Usage:
//   node scripts/publishBlogs.js
//
// Behaviour:
//   - Skips posts whose slug already exists (idempotent — safe to re-run)
//   - Publishes immediately (status: "published")
//   - Spreads publishedAt dates over the past 10 days for a natural look
// ─────────────────────────────────────────────────────────────────
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs        = require('fs');
const path      = require('path');
const mongoose  = require('mongoose');
const { BlogPost } = require('../src/models/index.js');

// ── MONGO CONNECT ─────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌  MONGODB_URI not set in .env');
  process.exit(1);
}

// ── SIMPLE MARKDOWN → HTML CONVERTER ─────────────────────────────
// Handles all elements used in these blog files without extra deps.
function mdToHtml(md) {
  const lines = md.split('\n');
  const out   = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // HR
    if (/^---+$/.test(line.trim())) {
      out.push('<hr>');
      i++;
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      out.push(`<h${level}>${inline(hMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote (consecutive lines)
    if (line.startsWith('> ')) {
      const bqLines = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        bqLines.push(inline(lines[i].replace(/^>\s?/, '')));
        i++;
      }
      out.push(`<blockquote><p>${bqLines.join('<br>')}</p></blockquote>`);
      continue;
    }

    // Unordered list (consecutive lines)
    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Blank line → skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — collect until blank line
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' &&
           !lines[i].startsWith('#') && !lines[i].startsWith('> ') &&
           !/^[-*]\s/.test(lines[i]) && !/^---+$/.test(lines[i].trim()) &&
           !/^\d+\.\s/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      out.push(`<p>${inline(paraLines.join(' '))}</p>`);
    }
  }

  return out.join('\n');
}

// Inline element parser: bold, italic, inline-code, links
function inline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

// Count words for read time estimate
function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

// ── BLOG METADATA ─────────────────────────────────────────────────
// Map each filename → slug, category, tags, coverImage
const BLOG_META = {
  '01-spot-fake-reviews.md': {
    slug:        'how-to-spot-fake-reviews-amazon-india',
    category:    'Deals',
    tags:        ['fake reviews', 'amazon', 'review tips', 'online shopping', 'india'],
    coverImage:  'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&auto=format&fit=crop',
    coverImageAlt: 'Customer reading product reviews on a smartphone',
  },
  '02-best-time-to-buy.md': {
    slug:        'best-time-to-buy-electronics-india',
    category:    'Deals',
    tags:        ['deals', 'sale season', 'electronics', 'india', 'amazon', 'flipkart'],
    coverImage:  'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&auto=format&fit=crop',
    coverImageAlt: 'Indian shopping sale with colourful discounts',
  },
  '03-amazon-vs-flipkart.md': {
    slug:        'amazon-vs-flipkart-vs-myntra-which-to-use',
    category:    'Deals',
    tags:        ['amazon', 'flipkart', 'myntra', 'platform comparison', 'india'],
    coverImage:  'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800&auto=format&fit=crop',
    coverImageAlt: 'Online shopping app on a mobile phone',
  },
  '04-get-best-price.md': {
    slug:        'how-to-get-best-price-online-india',
    category:    'Deals',
    tags:        ['price tips', 'deals', 'best price', 'online shopping', 'india'],
    coverImage:  'https://images.unsplash.com/photo-1556742393-d75f468bfcb0?w=800&auto=format&fit=crop',
    coverImageAlt: 'Person comparing prices on a laptop',
  },
  '05-high-rated-disappointments.md': {
    slug:        'why-high-rated-amazon-products-disappoint',
    category:    'Deals',
    tags:        ['star ratings', 'product quality', 'amazon', 'fake reviews', 'india'],
    coverImage:  'https://images.unsplash.com/photo-1599008633840-052c7f756385?w=800&auto=format&fit=crop',
    coverImageAlt: 'Star rating review on a phone screen',
  },
  '06-beginners-guide.md': {
    slug:        'beginners-guide-online-shopping-india',
    category:    'Deals',
    tags:        ['beginner', 'guide', 'online shopping', 'india', 'amazon', 'flipkart'],
    coverImage:  'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=800&auto=format&fit=crop',
    coverImageAlt: 'Smiling person with shopping bags',
  },
  '07-ai-shopping.md': {
    slug:        'how-ai-is-changing-online-shopping-india',
    category:    'Industry News',
    tags:        ['ai', 'artificial intelligence', 'online shopping', 'india', 'technology'],
    coverImage:  'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=800&auto=format&fit=crop',
    coverImageAlt: 'AI technology concept with glowing circuitry',
  },
  '08-price-comparison.md': {
    slug:        'price-comparison-tips-indian-shoppers',
    category:    'Deals',
    tags:        ['price comparison', 'deals', 'tips', 'india', 'online shopping'],
    coverImage:  'https://images.unsplash.com/photo-1580828343064-fde4fc206bc6?w=800&auto=format&fit=crop',
    coverImageAlt: 'Price tags and comparison chart',
  },
  '09-big-billion-vs-gif.md': {
    slug:        'big-billion-days-vs-great-indian-festival',
    category:    'Deals',
    tags:        ['big billion days', 'great indian festival', 'flipkart', 'amazon', 'sale'],
    coverImage:  'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&auto=format&fit=crop',
    coverImageAlt: 'Vibrant festive shopping sale banners',
  },
  '10-price-differences.md': {
    slug:        'why-same-product-different-prices-amazon-flipkart',
    category:    'Deals',
    tags:        ['pricing', 'amazon', 'flipkart', 'price difference', 'india'],
    coverImage:  'https://images.unsplash.com/photo-1661956602153-23384936a1d3?w=800&auto=format&fit=crop',
    coverImageAlt: 'Price tags showing different values',
  },
};

// ── MAIN ──────────────────────────────────────────────────────────
async function main() {
  console.log('🔗  Connecting to MongoDB…');
  await mongoose.connect(MONGO_URI);
  console.log('✅  Connected\n');

  const blogsDir = path.resolve(__dirname, '../blogs');
  const files    = fs.readdirSync(blogsDir)
                     .filter(f => f.endsWith('.md') && f !== 'README.md')
                     .sort();

  console.log(`📂  Found ${files.length} markdown files\n`);

  let published = 0;
  let skipped   = 0;
  let failed    = 0;

  // Spread publishedAt dates naturally — one per day going backwards from today
  const now = new Date();

  for (let idx = 0; idx < files.length; idx++) {
    const filename = files[idx];
    const meta     = BLOG_META[filename];

    if (!meta) {
      console.warn(`⚠️   No metadata for ${filename} — skipping`);
      skipped++;
      continue;
    }

    // Check if already exists
    const existing = await BlogPost.findOne({ slug: meta.slug }).lean();
    if (existing) {
      console.log(`⏭️   Already exists: ${meta.slug}`);
      skipped++;
      continue;
    }

    // Read & parse markdown
    const rawMd  = fs.readFileSync(path.join(blogsDir, filename), 'utf8');
    const lines  = rawMd.split('\n');

    // Extract title from first # line
    const titleLine = lines.find(l => l.startsWith('# '));
    const title     = titleLine ? titleLine.replace(/^#\s+/, '').trim() : filename;

    // Extract excerpt: first non-empty paragraph that isn't a blockquote and isn't the title
    let excerpt = '';
    for (const line of lines) {
      if (!line.trim() || line.startsWith('#') || line.startsWith('>') || line.startsWith('!')) continue;
      excerpt = line.trim().slice(0, 200);
      if (excerpt.length === 200) excerpt += '…';
      break;
    }

    // Convert to HTML
    const content = mdToHtml(rawMd);

    // Read time estimate (200 wpm)
    const wc             = wordCount(rawMd);
    const readTimeMinutes = Math.max(2, Math.round(wc / 200));

    // Spread dates: file 0 = 10 days ago, file 9 = 1 day ago
    const daysAgo   = files.length - idx;
    const pubDate   = new Date(now);
    pubDate.setDate(pubDate.getDate() - daysAgo);
    pubDate.setHours(9, 0, 0, 0); // 9 AM IST

    try {
      await BlogPost.create({
        slug:           meta.slug,
        title,
        excerpt,
        content,
        coverImage:     meta.coverImage,
        coverImageAlt:  meta.coverImageAlt,
        category:       meta.category,
        tags:           meta.tags,
        status:         'published',
        aiGenerated:    false,
        publishedAt:    pubDate,
        readTimeMinutes,
        createdAt:      pubDate,
        updatedAt:      pubDate,
      });

      console.log(`✅  Published: "${title}"`);
      console.log(`    slug: ${meta.slug}`);
      console.log(`    readTime: ${readTimeMinutes} min | words: ${wc} | date: ${pubDate.toDateString()}\n`);
      published++;
    } catch (err) {
      console.error(`❌  Failed: ${filename} — ${err.message}`);
      failed++;
    }
  }

  console.log('─────────────────────────────────');
  console.log(`📊  Summary: ${published} published | ${skipped} skipped | ${failed} failed`);
  console.log('─────────────────────────────────');

  await mongoose.disconnect();
  console.log('🔌  Disconnected. Done.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
