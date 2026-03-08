"use strict";
require("dotenv").config();
const Redis = require("ioredis");

async function purge() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log("REDIS_URL not set");
    process.exit(1);
  }
  const r = new Redis(url, {
    tls: url.startsWith("rediss://")
      ? { rejectUnauthorized: false }
      : undefined,
    lazyConnect: false,
  });
  await new Promise((res) => r.once("ready", res));
  console.log("Redis connected");

  const patterns = [
    "bestpickr:search:*sony*tv*",
    "bestpickr:search:*sony*tele*",
    "bestpickr:search:*television*sony*",
  ];

  let total = 0;
  for (const pat of patterns) {
    const keys = await r.keys(pat).catch(() => []);
    if (keys.length > 0) {
      console.log(`Pattern "${pat}" → ${keys.length} keys`);
      for (const k of keys) {
        await r.del(k);
        console.log("  Deleted:", k);
        total++;
      }
    } else {
      console.log(`Pattern "${pat}" → 0 keys`);
    }
  }

  console.log(`\nTotal deleted: ${total}`);
  process.exit(0);
}

purge().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
