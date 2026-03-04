#!/usr/bin/env node
/**
 * e2eTest.js — Release 1 End-to-End Test Suite
 * Tests every critical API path + all search scenarios for bestpickr.
 *
 * Usage:
 *   ~/.nvm/versions/node/v20.19.6/bin/node scripts/e2eTest.js
 *   ~/.nvm/versions/node/v20.19.6/bin/node scripts/e2eTest.js --base http://localhost:5001
 *   ~/.nvm/versions/node/v20.19.6/bin/node scripts/e2eTest.js --base https://api.bestpickr.in
 */
"use strict";

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:5001";

const TIMEOUT_MS = 30000;
const SEARCH_TIMEOUT_MS = 45000; // live scrapes can take 20-30s

// ── ANSI colours ──────────────────────────────────────────────────
const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const B = (s) => `\x1b[1m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

let passed = 0,
  failed = 0,
  warned = 0;

// ── Helpers ───────────────────────────────────────────────────────
async function req(path, opts = {}, timeoutMs = TIMEOUT_MS) {
  const url = BASE + path;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, ...opts });
    clearTimeout(timer);
    let json = null;
    try {
      json = await res.json();
    } catch (_) {}
    return { status: res.status, json, url };
  } catch (e) {
    clearTimeout(timer);
    return { status: 0, error: e.message, url };
  }
}

function pass(label, detail = "") {
  passed++;
  console.log(`  ${G("✓")} ${label} ${detail ? DIM(detail) : ""}`);
}
function fail(label, detail = "") {
  failed++;
  console.log(`  ${R("✗")} ${B(label)} ${detail ? R(detail) : ""}`);
}
function warn(label, detail = "") {
  warned++;
  console.log(`  ${Y("⚠")} ${label} ${detail ? Y(detail) : ""}`);
}

function section(name) {
  console.log(`\n${B(name)}`);
  console.log("─".repeat(50));
}

// ── Assertions ────────────────────────────────────────────────────
function assertStatus(label, r, expected = 200) {
  if (r.status === 0) return fail(label, `NETWORK ERROR: ${r.error}`);
  if (r.status === expected) return pass(label, `HTTP ${r.status}`);
  fail(label, `Expected ${expected}, got ${r.status}`);
}

function assertJson(label, r) {
  if (!r.json) return fail(label, "No JSON in response");
  pass(label, "JSON ok");
}

function assertField(label, obj, field, check) {
  const val = field.split(".").reduce((o, k) => o?.[k], obj);
  if (val === undefined || val === null)
    return fail(label, `Missing field: ${field}`);
  if (check && !check(val))
    return fail(
      label,
      `Field "${field}" failed check, got: ${JSON.stringify(val).slice(0, 60)}`,
    );
  pass(label, `${field} = ${JSON.stringify(val).slice(0, 60)}`);
}

function assertArray(label, arr, minLen = 1, fieldToShow = null) {
  if (!Array.isArray(arr)) return fail(label, `Not an array: ${typeof arr}`);
  if (arr.length < minLen)
    return fail(label, `Expected >=${minLen} items, got ${arr.length}`);
  const preview = fieldToShow
    ? arr
        .slice(0, 3)
        .map((i) => i[fieldToShow])
        .join(", ")
    : arr.length + " items";
  pass(label, preview);
}

function assertNoWrongCategory(label, items, query) {
  const WRONG_CATS = ["skincare", "beauty", "appliances", "clothing"];
  const queryLower = query.toLowerCase();
  const isElectronics =
    /\b(laptop|mobile|phone|headphone|monitor|tablet|watch)\b/.test(queryLower);
  if (!isElectronics) return;
  const wrong = items.filter((i) =>
    WRONG_CATS.includes((i.category || "").toLowerCase()),
  );
  if (wrong.length > 0) {
    fail(
      label,
      `${wrong.length} wrong-category items: ${wrong.map((i) => i.name?.slice(0, 30)).join(", ")}`,
    );
  } else {
    pass(
      label,
      `No wrong-category contamination (${items.length} items checked)`,
    );
  }
}

// ── TEST SECTIONS ─────────────────────────────────────────────────

async function testHealth() {
  section("1. HEALTH & CONNECTIVITY");
  const r = await req("/api/health");
  assertStatus("Health endpoint responds", r);
  if (r.json) {
    assertField(
      "Status is OK",
      r.json,
      "status",
      (v) => v === "ok" || v === "healthy" || v === "OK",
    );
    if (r.json.redis)
      assertField(
        "Redis connected",
        r.json,
        "redis",
        (v) => v === "connected" || v === true,
      );
    if (r.json.mongodb || r.json.mongo)
      assertField(
        "MongoDB connected",
        r.json,
        r.json.mongodb ? "mongodb" : "mongo",
      );
  }
}

async function testSearch() {
  section("2. SEARCH — INTENT CLASSIFICATION");

  const tests = [
    // [query, expectedIntent, category]
    { q: "best headphones under 2000", intent: "CATEGORY", cat: "headphones" },
    { q: "Samsung Galaxy S24", intent: "PRODUCT_SPECIFIC", cat: "mobile" },
    { q: "Boat BassHeads 100", intent: "PRODUCT_SPECIFIC", cat: "headphones" },
    { q: "laptop", intent: "GENERIC", cat: "laptops" },
    { q: "Sony WH-1000XM5", intent: "PRODUCT_SPECIFIC", cat: "headphones" },
    { q: "best monitor under 20000", intent: "CATEGORY", cat: null },
    {
      q: "HP 15 13th Gen Intel Core i3-1315U",
      intent: "PRODUCT_SPECIFIC",
      cat: "laptops",
    },
  ];

  for (const t of tests) {
    const r = await req(
      `/api/search?q=${encodeURIComponent(t.q)}&limit=10`,
      {},
      SEARCH_TIMEOUT_MS,
    );
    const label = `"${t.q}"`;
    if (r.status === 0) {
      fail(label, `Network error: ${r.error}`);
      continue;
    }
    if (r.status !== 200) {
      fail(label, `HTTP ${r.status}`);
      continue;
    }
    const d = r.json;
    if (!d) {
      fail(label, "No JSON");
      continue;
    }

    // Intent
    const intent = d.intent || d.meta?.intent;
    if (t.intent && intent !== t.intent) {
      warn(`${label} intent`, `Expected ${t.intent}, got ${intent || "null"}`);
    } else {
      pass(`${label} intent = ${intent}`);
    }

    // Category contamination check
    const items = d.results || d.suggestions || d.products || [];
    if (items.length > 0) {
      assertNoWrongCategory(`${label} no wrong-category`, items, t.q);
    } else {
      warn(`${label}`, "0 results returned");
    }

    // Source
    const source = d.source || d.meta?.source;
    if (source) pass(`  source = ${source}`);
  }
}

async function testSearchEdgeCases() {
  section("3. SEARCH — EDGE CASES");

  // Empty query
  const r1 = await req("/api/search?q=");
  if (r1.status === 400 || r1.status === 422) pass("Empty query → 400/422");
  else if (r1.status === 200) warn("Empty query → 200 (should ideally be 400)");
  else fail("Empty query", `HTTP ${r1.status}`);

  // Very short query
  const r2 = await req("/api/search?q=a");
  if (r2.status !== 0)
    pass("Single char query → responds", `HTTP ${r2.status}`);
  else fail("Single char query", r2.error);

  // Special chars
  const r3 = await req(
    "/api/search?q=" + encodeURIComponent("best phone < ₹10000"),
  );
  if (r3.status === 200) pass("Special chars in query");
  else warn("Special chars in query", `HTTP ${r3.status}`);

  // Undefined string (old bug)
  const r4 = await req("/api/search?q=undefined");
  if (r4.status === 400 || (r4.json && r4.json.error))
    pass('"undefined" query rejected');
  else warn('"undefined" query', "Not rejected — may log noise");

  // Query that previously had wrong results
  const r5 = await req(
    "/api/search?q=" +
      encodeURIComponent("HP 15 13th gen Intel Core i3-1315U") +
      "&limit=5",
    {},
    SEARCH_TIMEOUT_MS,
  );
  if (r5.status === 200 && r5.json) {
    const items = r5.json.results || r5.json.suggestions || [];
    const skincare = items.filter((i) =>
      ["skincare", "beauty"].includes((i.category || "").toLowerCase()),
    );
    if (skincare.length > 0) {
      fail(
        "HP laptop — no skincare contamination",
        `Still has ${skincare.length} wrong items: ${skincare.map((i) => i.name?.slice(0, 25)).join(", ")}`,
      );
    } else if (items.length === 0) {
      warn("HP laptop", "0 results (may be fetching live, retry in 10s)");
    } else {
      pass(
        "HP laptop — results are relevant",
        `First: "${items[0]?.name?.slice(0, 40)}"`,
      );
    }
  }
}

async function testSearchFilters() {
  section("4. SEARCH — WITH FILTERS");

  const queries = [
    { q: "best headphones", params: "&maxPrice=2000" },
    { q: "laptop", params: "&minScore=7" },
    { q: "smartphone", params: "&platform=amazon" },
  ];

  for (const t of queries) {
    const r = await req(
      `/api/search?q=${encodeURIComponent(t.q)}${t.params}&limit=10`,
    );
    const label = `"${t.q}"${t.params}`;
    if (r.status === 200)
      pass(
        label,
        `HTTP 200, ${(r.json?.results || r.json?.suggestions || []).length} items`,
      );
    else warn(label, `HTTP ${r.status}`);
  }
}

async function testTrending() {
  section("5. TRENDING & SUGGESTIONS");

  const r1 = await req("/api/search/trending");
  assertStatus("Trending endpoint", r1);
  if (r1.json) {
    const items = r1.json.trending || r1.json;
    if (Array.isArray(items))
      pass("Trending returns array", `${items.length} items`);
    else
      warn(
        "Trending",
        "Unexpected shape: " + JSON.stringify(r1.json).slice(0, 80),
      );
  }

  const r2 = await req("/api/search/suggestions?q=headphone");
  assertStatus("Suggestions endpoint", r2);
}

async function testProducts() {
  section("6. PRODUCTS API");

  const r1 = await req("/api/products/top-india?limit=10");
  assertStatus("Top India products", r1);
  if (r1.json) {
    const items = r1.json.products || r1.json;
    if (Array.isArray(items) && items.length > 0) {
      assertArray("Top India has products", items, 1, "name");
      // Verify shape
      const p = items[0];
      if (!p.name) fail("Product has name field");
      else pass("Product has name field", p.name?.slice(0, 40));
      if (p.aiScore !== undefined || p.score !== undefined)
        pass("Product has score");
      else warn("Product missing aiScore/score");
      if (p.platforms && p.platforms.length > 0) pass("Product has platforms");
      else warn("Product missing platforms");
    }
  }

  const r2 = await req("/api/products/top?limit=5");
  assertStatus("Top products endpoint", r2);
}

async function testCategories() {
  section("7. CATEGORIES API");

  const r1 = await req("/api/categories");
  assertStatus("Categories list", r1);
  if (r1.json) {
    const cats = r1.json.categories || r1.json;
    if (Array.isArray(cats))
      pass("Categories returns array", `${cats.length} items`);
    else warn("Categories", "Unexpected shape");
  }
}

async function testBlog() {
  section("8. BLOG API");

  const r1 = await req("/api/blog/posts");
  assertStatus("Blog posts", r1);

  const r2 = await req("/api/blog/posts/latest");
  assertStatus("Blog latest post", r2);
}

async function testAnalytics() {
  section("9. ANALYTICS");

  // POST analytics event
  const r1 = await req("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType: "page_view",
      page: "e2e_test",
      query: "test",
      visitorId: "e2e-test-runner",
      sessionId: "e2e-session",
    }),
  });
  if (r1.status === 200 || r1.status === 201) pass("Analytics event POST");
  else warn("Analytics event POST", `HTTP ${r1.status}`);

  // GET stats
  const r2 = await req("/api/analytics/stats");
  if (r2.status === 200 || r2.status === 401)
    pass("Analytics stats endpoint", `HTTP ${r2.status}`);
  else warn("Analytics stats", `HTTP ${r2.status}`);
}

async function testResponseTimes() {
  section("10. PERFORMANCE — RESPONSE TIMES");

  const queries = [
    { q: "headphones", label: "GENERIC search" },
    { q: "Sony WH-1000XM5", label: "PRODUCT_SPECIFIC search" },
    { q: "best laptop under 50000", label: "CATEGORY search" },
  ];

  for (const t of queries) {
    const start = Date.now();
    const r = await req(`/api/search?q=${encodeURIComponent(t.q)}&limit=10`);
    const ms = Date.now() - start;
    const source = r.json?.source || r.json?.meta?.source || "?";
    const label = `${t.label} [${source}]`;
    if (ms < 300) pass(label, `${ms}ms ← FAST`);
    else if (ms < 1500) pass(label, `${ms}ms`);
    else if (ms < 5000) warn(label, `${ms}ms — slow (>1.5s)`);
    else fail(label, `${ms}ms — very slow (>5s)`);
  }
}

// ── SUMMARY ───────────────────────────────────────────────────────
async function main() {
  console.log(B(`\nbestpickr Release 1 — End-to-End Test Suite`));
  console.log(`Target: ${Y(BASE)}`);
  console.log(`Time:   ${new Date().toLocaleString("en-IN")}\n`);

  await testHealth();
  await testSearch();
  await testSearchEdgeCases();
  await testSearchFilters();
  await testTrending();
  await testProducts();
  await testCategories();
  await testBlog();
  await testAnalytics();
  await testResponseTimes();

  const total = passed + failed + warned;
  console.log("\n" + "═".repeat(50));
  console.log(B("RESULTS"));
  console.log("═".repeat(50));
  console.log(`  ${G("PASS")}  ${passed}/${total}`);
  if (warned > 0)
    console.log(`  ${Y("WARN")}  ${warned}/${total}  (non-blocking)`);
  if (failed > 0) {
    console.log(`  ${R("FAIL")}  ${failed}/${total}`);
    console.log(`\n${R("⚠ Fix failures before releasing.")}`);
    process.exit(1);
  } else if (warned > 5) {
    console.log(`\n${Y("Review warnings before releasing.")}`);
    process.exit(0);
  } else {
    console.log(`\n${G("✅ All checks passed — ready to release!")}`);
    process.exit(0);
  }
}

main().catch((e) => {
  console.error(R("Fatal test error: " + e.message));
  process.exit(1);
});
