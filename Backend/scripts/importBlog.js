#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

// Load .env
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  });
}

const args = process.argv.slice(2);
const get = (f) => { const i = args.indexOf(f); return i !== -1 && args[i+1] ? args[i+1] : null; };

const slugArg     = get("--slug");
const fileArg     = get("--file");
const statusArg   = get("--status") || "published";
const titleArg    = get("--title");
const excerptArg  = get("--excerpt");
const categoryArg = get("--category");
const tagsArg     = get("--tags");

if (!slugArg || !fileArg) {
  console.error("Usage: node scripts/importBlog.js --slug <slug> --file <path.md> [--status published]");
  process.exit(1);
}
const filePath = path.resolve(fileArg);
if (!fs.existsSync(filePath)) { console.error("File not found: " + filePath); process.exit(1); }

const raw = fs.readFileSync(filePath, "utf8");
const lines = raw.split("\n");
let title = titleArg, excerpt = excerptArg, contentStart = 0;

if (!title) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("# ")) { title = lines[i].slice(2).trim(); contentStart = i + 1; break; }
  }
}
if (!title) { console.error("No # H1 heading found in file."); process.exit(1); }

if (!excerpt) {
  for (let i = contentStart; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l && !l.startsWith("#") && !l.startsWith(">") && !l.startsWith("-") && !l.startsWith("*") && !l.startsWith("|")) {
      excerpt = l.replace(/\*\*/g, "").replace(/\*/g, "").slice(0, 300);
      break;
    }
  }
}
if (!excerpt || excerpt.length < 10) { console.error("Could not extract excerpt."); process.exit(1); }

const VALID_CATS = ["Smartphones","Laptops","Deals","Industry News","Audio","Wearables","Televisions"];
const category = (categoryArg && VALID_CATS.includes(categoryArg)) ? categoryArg : null;
const tags = tagsArg ? tagsArg.split(",").map((t) => t.trim()).filter(Boolean) : [];

const BACKEND = process.env.BACKEND_URL || "http://localhost:5001";

function request(method, urlPath, body, bearer) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BACKEND);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        ...(bearer ? { "Authorization": "Bearer " + bearer } : {}),
      },
    };
    const req = client.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  const username = process.env.ADMIN_USER || "admin@bestpickr.in";
  const password = process.env.ADMIN_PASS;
  if (!password) { console.error("ADMIN_PASS not found in .env"); process.exit(1); }

  process.stdout.write("Logging in as " + username + "... ");
  const lr = await request("POST", "/api/admin/login", { username, password });
  if (lr.status !== 200 || !lr.body.accessToken) {
    console.log("FAILED");
    console.error("HTTP " + lr.status + ":", lr.body.error || lr.body);
    process.exit(1);
  }
  console.log("OK");
  const token = lr.body.accessToken;

  console.log("\nSlug:   " + slugArg);
  console.log("Title:  " + title);
  console.log("Status: " + statusArg);
  console.log("Words:  ~" + raw.split(/\s+/).length + "\n");

  const pr = await request("POST", "/api/blog/admin/posts", {
    title, slug: slugArg, excerpt, content: raw,
    contentFormat: "markdown", tags, category, status: statusArg,
  }, token);

  if (pr.status === 201 && pr.body.success) {
    const p = pr.body.post;
    console.log("Created: " + p.title);
    console.log("  ID:   " + p._id);
    console.log("  Read: " + p.readTimeMinutes + " min");
    console.log("  URL:  https://bestpickr.in/blog/" + p.slug + "\n");
  } else if (pr.status === 409) {
    console.warn("Skipped -- slug already exists: " + slugArg);
  } else {
    console.error("Failed (HTTP " + pr.status + "):", pr.body.error || pr.body);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
