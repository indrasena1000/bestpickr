#!/usr/bin/env node
/**
 * directImportBlogs.js — Import all blog .md files directly into MongoDB
 * Usage: node scripts/directImportBlogs.js
 * 
 * This bypasses the HTTP API entirely — connects to MongoDB via Mongoose
 * directly, so no running server is required.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// ── Load .env ────────────────────────────────────────────────────
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  });
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error("MONGODB_URI not set in .env"); process.exit(1); }

// ── BlogPost Schema (minimal, mirrors models/index.js) ────────────
const { Schema } = mongoose;
const blogPostSchema = new Schema({
  title:           { type: String, required: true, trim: true },
  slug:            { type: String, required: true, trim: true, lowercase: true },
  excerpt:         { type: String, required: true, trim: true },
  content:         { type: String, required: true },
  tags:            [String],
  category:        { type: String, default: null },
  coverImage:      { type: String, default: null },
  coverImageAlt:   { type: String, default: null },
  status:          { type: String, enum: ["draft","published"], default: "draft" },
  aiGenerated:     { type: Boolean, default: false },
  publishedAt:     { type: Date, default: null },
  readTimeMinutes: { type: Number, default: 1 },
  createdAt:       { type: Date, default: Date.now },
  updatedAt:       { type: Date, default: Date.now },
});
blogPostSchema.index({ slug: 1 }, { unique: true });

// ── mdToHtml — same as blog.js ────────────────────────────────────
function mdToHtml(md) {
  const lines = md.split("\n");
  const out = [];
  let inList = false, inOl = false, inTable = false, inPara = false, inCode = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Fenced code blocks
    if (line.trimStart().startsWith("```")) {
      if (!inCode) {
        if (inPara) { out.push("</p>"); inPara = false; }
        if (inList) { out.push("</ul>"); inList = false; }
        if (inOl)   { out.push("</ol>"); inOl = false; }
        out.push('<pre><code>'); inCode = true;
      } else { out.push("</code></pre>"); inCode = false; }
      continue;
    }
    if (inCode) { out.push(escapeHtml(line)); continue; }

    // Helper: close open blocks
    const closeBlocks = () => {
      if (inPara)  { out.push("</p>"); inPara = false; }
      if (inList)  { out.push("</ul>"); inList = false; }
      if (inOl)    { out.push("</ol>"); inOl = false; }
      if (inTable) { out.push("</tbody></table>"); inTable = false; }
    };

    // Headings
    if (/^#{1,6}\s/.test(line)) {
      closeBlocks();
      const level = line.match(/^(#+)/)[1].length;
      const text = inline(line.replace(/^#+\s*/, ""));
      const id = line.replace(/^#+\s*/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-");
      out.push(`<h${level} id="${id}">${text}</h${level}>`);
      continue;
    }

    // HR
    if (/^---+$/.test(line.trim())) {
      closeBlocks(); out.push("<hr>"); continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      closeBlocks();
      out.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`);
      continue;
    }

    // Ordered list item
    if (/^\d+\.\s/.test(line)) {
      if (inPara) { out.push("</p>"); inPara = false; }
      if (inList) { out.push("</ul>"); inList = false; }
      if (!inOl)  { out.push("<ol>"); inOl = true; }
      out.push(`<li>${inline(line.replace(/^\d+\.\s/, ""))}</li>`);
      continue;
    }

    // Unordered list item
    if (/^[-*]\s/.test(line)) {
      if (inPara) { out.push("</p>"); inPara = false; }
      if (inOl)  { out.push("</ol>"); inOl = false; }
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.replace(/^[-*]\s/, ""))}</li>`);
      continue;
    }

    // Table (| col | col |)
    if (line.startsWith("|")) {
      if (!inTable) {
        closeBlocks();
        out.push('<table><thead>');
        const cells = line.split("|").filter((_,j,a)=>j>0&&j<a.length-1).map(c=>`<th>${inline(c.trim())}</th>`);
        out.push("<tr>" + cells.join("") + "</tr>");
        out.push("</thead><tbody>");
        inTable = true;
        i++; // skip separator line
        continue;
      } else {
        const cells = line.split("|").filter((_,j,a)=>j>0&&j<a.length-1).map(c=>`<td>${inline(c.trim())}</td>`);
        out.push("<tr>" + cells.join("") + "</tr>");
        continue;
      }
    }

    // Empty line
    if (!line.trim()) {
      if (inPara)  { out.push("</p>"); inPara = false; }
      if (inList)  { out.push("</ul>"); inList = false; }
      if (inOl)    { out.push("</ol>"); inOl = false; }
      if (inTable) { out.push("</tbody></table>"); inTable = false; }
      continue;
    }

    // Paragraph
    if (inList)  { out.push("</ul>"); inList = false; }
    if (inOl)    { out.push("</ol>"); inOl = false; }
    if (inTable) { out.push("</tbody></table>"); inTable = false; }
    if (!inPara) { out.push("<p>"); inPara = true; }
    else          out.push("<br>");
    out.push(inline(line));
  }

  if (inPara)  out.push("</p>");
  if (inList)  out.push("</ul>");
  if (inOl)    out.push("</ol>");
  if (inTable) out.push("</tbody></table>");
  if (inCode)  out.push("</code></pre>");
  return out.join("\n");
}

function escapeHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function inline(s) {
  return s
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>");
}

// ── Blog definitions ─────────────────────────────────────────────
const BLOGS_DIR = path.resolve(__dirname, "../blogs");
const BLOGS = [
  { slug: "how-to-spot-fake-reviews-amazon-india",    file: "01-spot-fake-reviews.md",          tags: ["fake reviews","amazon","india","shopping tips"] },
  { slug: "best-time-to-buy-electronics-india",       file: "02-best-time-to-buy.md",           tags: ["best deals","electronics","india","timing"] },
  { slug: "amazon-vs-flipkart-vs-myntra-india",       file: "03-amazon-vs-flipkart.md",         tags: ["amazon","flipkart","myntra","comparison","india"] },
  { slug: "how-to-get-best-price-online-india",       file: "04-get-best-price.md",             tags: ["price comparison","deals","india","money saving"] },
  { slug: "why-high-rated-products-disappoint-india", file: "05-high-rated-disappointments.md", tags: ["reviews","india","product quality","ratings"] },
  { slug: "online-shopping-guide-india-beginners",    file: "06-beginners-guide.md",            tags: ["beginners","guide","india","online shopping"] },
  { slug: "how-ai-is-changing-online-shopping-india", file: "07-ai-shopping.md",                tags: ["ai","online shopping","india","technology"] },
  { slug: "price-comparison-tips-indian-shoppers",    file: "08-price-comparison.md",           tags: ["price comparison","tips","india","savings"] },
  { slug: "big-billion-days-vs-great-indian-festival",file: "09-big-billion-vs-gif.md",         tags: ["big billion day","great indian festival","flipkart","amazon","sale"] },
  { slug: "why-same-product-different-prices-india",  file: "10-price-differences.md",          tags: ["price differences","india","online shopping","dynamic pricing"] },
];

function extractMeta(raw) {
  const lines = raw.split("\n");
  let title = null, excerpt = null, contentStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("# ")) { title = lines[i].slice(2).trim(); contentStart = i + 1; break; }
  }
  if (!title) throw new Error("No # H1 heading found");
  for (let i = contentStart; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l && !l.startsWith("#") && !l.startsWith(">") && !l.startsWith("-") && !l.startsWith("*") && !l.startsWith("|")) {
      excerpt = l.replace(/\*\*/g,"").replace(/\*/g,"").slice(0, 300);
      break;
    }
  }
  if (!excerpt || excerpt.length < 10) throw new Error("Could not extract excerpt");
  return { title, excerpt };
}

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
  });
  console.log("Connected!\n");

  // Use existing model if registered (when running inside a context that already registered it),
  // otherwise compile it fresh.
  const BlogPost = mongoose.models.BlogPost || mongoose.model("BlogPost", blogPostSchema);

  let created = 0, skipped = 0, failed = 0;

  for (const { slug, file, tags } of BLOGS) {
    const filePath = path.join(BLOGS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.error(`  [MISSING] ${file}`);
      failed++;
      continue;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    let title, excerpt;
    try {
      ({ title, excerpt } = extractMeta(raw));
    } catch (e) {
      console.error(`  [PARSE_ERR] ${file}: ${e.message}`);
      failed++;
      continue;
    }

    const htmlContent = mdToHtml(raw);
    const wordCount = htmlContent.replace(/<[^>]+>/g," ").split(/\s+/).filter(Boolean).length;
    const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

    const existing = await BlogPost.findOne({ slug }).lean();
    if (existing) {
      console.log(`  [SKIP] ${slug} (already exists)`);
      skipped++;
      continue;
    }

    try {
      const post = await BlogPost.create({
        title, slug, excerpt,
        content: htmlContent,
        tags: tags || [],
        status: "published",
        aiGenerated: false,
        publishedAt: new Date(),
        readTimeMinutes,
      });
      console.log(`  [OK] ${post.title}`);
      console.log(`       ${readTimeMinutes} min read | ${wordCount} words`);
      console.log(`       https://bestpickr.in/blog/${post.slug}\n`);
      created++;
    } catch (err) {
      if (err.code === 11000) {
        console.log(`  [SKIP] ${slug} (duplicate key)`);
        skipped++;
      } else {
        console.error(`  [FAIL] ${slug}: ${err.message}`);
        failed++;
      }
    }
  }

  console.log("\n─────────────────────────────────────");
  console.log(`Done: ${created} created, ${skipped} skipped, ${failed} failed`);
  console.log("─────────────────────────────────────");
  await mongoose.disconnect();
}

run().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
