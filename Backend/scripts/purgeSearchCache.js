#!/usr/bin/env node
"use strict";

// Purge Redis + Mongo search cache for one query.
// Usage:
//   node scripts/purgeSearchCache.js "water purifiers under 10k"
//   node scripts/purgeSearchCache.js "water purifiers under 10k" appliances

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const IORedis = require("ioredis");
const mongoose = require("mongoose");
const { normalize, buildSearchKey } = require("../src/utils/queryNormalizer");

const rawQuery = process.argv[2];
const categoryArg = (process.argv[3] || "").trim().toLowerCase();

if (!rawQuery || !rawQuery.trim()) {
  console.error('Usage: node scripts/purgeSearchCache.js "<query>" [category]');
  process.exit(1);
}

const normalizedQuery = normalize(rawQuery);

async function purgeRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[Redis] REDIS_URL not set — skipping Redis purge");
    return;
  }

  const client = new IORedis(url, {
    tls: url.startsWith("rediss://")
      ? { rejectUnauthorized: false }
      : undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });

  await client.connect();

  const keys = new Set();

  if (categoryArg) {
    const exact = buildSearchKey(rawQuery, categoryArg);
    keys.add(exact);
    keys.add(`bestpickr:search:lock:${exact}`);
  } else {
    const pattern = `bestpickr:search:${normalizedQuery}:*`;
    const lockPattern = `bestpickr:search:lock:bestpickr:search:${normalizedQuery}:*`;

    const found = await client.keys(pattern);
    const foundLocks = await client.keys(lockPattern);

    found.forEach((k) => keys.add(k));
    foundLocks.forEach((k) => keys.add(k));
  }

  // Legacy keys that may exist from older cache implementations.
  keys.add(`search:${normalizedQuery}`);
  keys.add(`bp:search:${normalizedQuery}`);

  const list = Array.from(keys);
  let deleted = 0;

  for (const k of list) {
    const d = await client.del(k);
    if (d) {
      deleted += 1;
      console.log(`[Redis] deleted: ${k}`);
    }
  }

  console.log(`[Redis] purge complete — deleted ${deleted} key(s)`);
  await client.quit();
}

async function purgeMongo() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) {
    console.warn("[Mongo] MONGODB_URI not set — skipping Mongo purge");
    return;
  }

  await mongoose.connect(uri);

  const SearchCache = mongoose.model(
    "SearchCache",
    new mongoose.Schema(
      {
        normalizedQuery: String,
        category: String,
      },
      { strict: false },
    ),
    "searchcaches",
  );

  const where = categoryArg
    ? { normalizedQuery, category: categoryArg }
    : { normalizedQuery };

  const res = await SearchCache.deleteMany(where);
  console.log(`[Mongo] purge complete — deleted ${res.deletedCount} doc(s)`);

  await mongoose.disconnect();
}

(async () => {
  console.log(`Query: ${rawQuery}`);
  console.log(`Normalized: ${normalizedQuery}`);
  console.log(`Category: ${categoryArg || "(all categories)"}`);

  await purgeRedis().catch((e) =>
    console.error(`[Redis] purge failed: ${e.message}`),
  );
  await purgeMongo().catch((e) =>
    console.error(`[Mongo] purge failed: ${e.message}`),
  );
})();
