require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const IORedis = require("ioredis");
const mongoose = require("mongoose");

async function run() {
  // ── Redis ─────────────────────────────────────────────────────
  const client = new IORedis(process.env.REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: true,
    connectTimeout: 10000,
  });
  await client.connect();
  const all = await client.keys("bestpickr:search:*");
  console.log("Redis search keys (" + all.length + "):");
  all.forEach((k) => console.log("  " + k));

  const toDelete = all.filter(
    (k) =>
      k.includes("hp") ||
      k.includes("13th") ||
      k.includes("intel") ||
      k.includes("i3") ||
      k.includes("1315") ||
      k.includes("undefined") ||
      k.includes("laptop"),
  );
  for (const k of toDelete) {
    await client.del(k);
    console.log("DELETED:", k);
  }
  console.log("Redis done. Deleted " + toDelete.length + " keys.");
  await client.quit();

  // ── MongoDB SearchCache ────────────────────────────────────────
  await mongoose.connect(process.env.MONGODB_URI);
  const SC = mongoose.model(
    "SearchCache",
    new mongoose.Schema({ normalizedQuery: String }, { strict: false }),
    "searchcaches",
  );

  const allDocs = await SC.find({}, { normalizedQuery: 1, _id: 0 }).lean();
  console.log("\nMongoDB SearchCache entries (" + allDocs.length + "):");
  allDocs.forEach((d) => console.log("  " + d.normalizedQuery));

  const r1 = await SC.deleteMany({
    normalizedQuery: { $regex: "hp|13th|i3|1315|intel", $options: "i" },
  });
  const r2 = await SC.deleteMany({
    normalizedQuery: { $regex: "^undefined$", $options: "i" },
  });
  console.log("\nDeleted HP/intel entries:", r1.deletedCount);
  console.log("Deleted undefined entries:", r2.deletedCount);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
