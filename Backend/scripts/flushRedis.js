require("dotenv").config();
const IORedis = require("ioredis");
const url = process.env.REDIS_URL;
if (!url) {
  console.error("REDIS_URL not set");
  process.exit(1);
}
const client = new IORedis(url, {
  tls: url.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 2,
});

(async () => {
  await client.connect();
  const all = await client.keys("*");
  console.log("Total Redis keys:", all.length);
  if (!all.length) {
    console.log("Redis already empty");
    await client.quit();
    return;
  }
  // Group by prefix for reporting
  const byPrefix = {};
  for (const k of all) {
    const prefix = k.split(":")[0];
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
  }
  console.log("Keys by prefix:", JSON.stringify(byPrefix, null, 2));
  await client.del(all);
  console.log(`Deleted ALL ${all.length} keys ✓`);
  await client.quit();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
