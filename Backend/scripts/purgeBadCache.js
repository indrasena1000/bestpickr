/**
 * purgeBadCache.js — purges contaminated Redis + MongoDB cache entries
 * Usage: ~/.nvm/versions/node/v20.19.6/bin/node scripts/purgeBadCache.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const IORedis = require("ioredis");
const mongoose = require("mongoose");

const QUERIES_TO_PURGE = [
  "hp 15 13th gen intel core i3 1315u",
  "hp 15 13th gen intel core i3-1315u",
  "hp 15 13th gen i3 1315u",
  "hp 15 laptop",
];

function normalise(q) {
  return q
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function purgeRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("No REDIS_URL — skipping Redis");
    return;
  }
  const isTLS = url.startsWith("rediss://");
  const client = new IORedis(url, {
    tls: isTLS ? {} : undefined,
    enableOfflineQueue: true,
    lazyConnect: true,
    connectTimeout: 10000,
  });
  await client.connect();
  console.log("Redis connected");
  let n = 0;
  for (const q of QUERIES_TO_PURGE) {
    const norm = normalise(q);
    const words = norm
      .split(" ")
      .filter(function (w) {
        return w.length >= 2;
      })
      .slice(0, 3);
    const pattern = "*" + words.join("*") + "*";
    const found = await client.keys(pattern);
    const extra = ["search:" + norm, "bp:search:" + norm];
    const allKeys = Array.from(new Set(found.concat(extra)));
    for (const k of allKeys) {
      const deleted = await client.del(k);
      if (deleted) {
        console.log("  Redis deleted:", k);
        n++;
      }
    }
  }
  console.log("Redis purge done -", n, "key(s).");
  await client.quit();
}

async function purgeMongo() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) {
    console.warn("No MONGODB_URI — skipping MongoDB");
    return;
  }
  await mongoose.connect(uri);
  console.log("MongoDB connected");
  const SC = mongoose.model(
    "SearchCache",
    new mongoose.Schema({ normalizedQuery: String }, { strict: false }),
    "searchcaches",
  );
  let n = 0;
  for (const q of QUERIES_TO_PURGE) {
    const words = normalise(q)
      .split(" ")
      .filter(function (w) {
        return w.length >= 3;
      })
      .slice(0, 4);
    const r = await SC.deleteMany({
      normalizedQuery: { $regex: words.join(".*"), $options: "i" },
    });
    if (r.deletedCount) {
      console.log("  Mongo deleted", r.deletedCount, "doc(s) for:", q);
      n += r.deletedCount;
    }
  }
  console.log("MongoDB purge done -", n, "doc(s).");
  await mongoose.disconnect();
}

async function main() {
  await purgeRedis().catch(function (e) {
    console.error("Redis error:", e.message);
  });
  await purgeMongo().catch(function (e) {
    console.error("Mongo error:", e.message);
  });
  process.exit(0);
}

main();
