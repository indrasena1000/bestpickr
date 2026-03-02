#!/usr/bin/env node
// scripts/debugScraper.js — See the raw HTML from ScraperAPI to diagnose selector issues
"use strict";
require("dotenv").config();

const { fetchViaScraperAPI } = require("../src/utils/scraperApi");
const cheerio = require("cheerio");

const ASIN = process.argv[2] || "B0G92LZJD3";

async function main() {
  const url = `https://www.amazon.in/product-reviews/${ASIN}/?ie=UTF8&reviewerType=all_reviews&filterByStar=all_stars&pageNumber=1&sortBy=recent`;
  console.log(`\nFetching: ${url}\n`);

  const { data, fromCache } = await fetchViaScraperAPI(url, {
    render: true,
    timeout: 60000,
  });

  console.log(`From cache: ${fromCache}`);
  console.log(`HTML length: ${data.length} bytes\n`);

  const $ = cheerio.load(data);

  // Check if we're blocked / CAPTCHA
  const title = $("title").text().trim();
  console.log(`Page title: "${title}"`);

  const bodyText = $("body").text().slice(0, 500);
  if (
    bodyText.toLowerCase().includes("captcha") ||
    bodyText.toLowerCase().includes("robot")
  ) {
    console.log("\n🚫 CAPTCHA DETECTED — ScraperAPI is being blocked");
    console.log("Try using render=true or a different country_code");
    process.exit(1);
  }

  // Try multiple possible review selectors
  const selectors = [
    { name: 'data-hook="review" (original)', sel: 'div[data-hook="review"]' },
    { name: 'data-hook="review-body"', sel: 'span[data-hook="review-body"]' },
    { name: ".review-text-content", sel: ".review-text-content" },
    { name: ".a-expander-content", sel: ".a-expander-content" },
    { name: "#cm_cr-review_list", sel: "#cm_cr-review_list" },
    { name: ".review", sel: ".review" },
    { name: "li.review", sel: "li.review" },
    { name: "div[data-reviews-state]", sel: "div[data-reviews-state]" },
    { name: ".cr-widget-content", sel: ".cr-widget-content" },
  ];

  console.log("\n─── SELECTOR HITS ──────────────────────────────────────");
  for (const { name, sel } of selectors) {
    const count = $(sel).length;
    console.log(`  ${count > 0 ? "✅" : "❌"} [${count}] ${name}`);
  }

  // Print raw HTML sections containing "review" for manual inspection
  console.log("\n─── FIRST 3000 CHARS OF BODY ───────────────────────────");
  console.log($("body").html().slice(0, 3000));

  console.log('\n─── SEARCH FOR "review" IN HTML (first 5 matches) ──────');
  const html = data.toLowerCase();
  let pos = 0;
  let found = 0;
  while ((pos = html.indexOf("data-hook", pos)) !== -1 && found < 10) {
    const snippet = data.slice(Math.max(0, pos - 10), pos + 80);
    console.log(`  pos ${pos}: ${snippet.replace(/\n/g, " ")}`);
    pos += 9;
    found++;
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
