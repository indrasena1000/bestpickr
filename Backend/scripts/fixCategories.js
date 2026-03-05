// Fix DB: list all tables, create missing schema tables, fix categories
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const CANONICAL_CATEGORIES = [
  { slug: "mobile", name: "Smartphones", emoji: "📱" },
  { slug: "laptop", name: "Laptops", emoji: "💻" },
  { slug: "headphones", name: "Headphones", emoji: "🎧" },
  { slug: "televisions", name: "Televisions", emoji: "📺" },
  { slug: "appliances", name: "Appliances", emoji: "🍳" },
  { slug: "gaming", name: "Gaming", emoji: "🎮" },
  { slug: "camera", name: "Cameras", emoji: "📷" },
  { slug: "tablets", name: "Tablets", emoji: "📟" },
  { slug: "smartwatch", name: "Smartwatches", emoji: "⌚" },
  { slug: "footwear", name: "Footwear", emoji: "👟" },
  { slug: "skincare", name: "Skincare", emoji: "✨" },
  { slug: "fashion", name: "Fashion", emoji: "👗" },
];

const CANONICAL_SLUGS = CANONICAL_CATEGORIES.map((c) => c.slug);

async function main() {
  // ── 1. List what tables currently exist ─────────────────────────
  const existing = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  console.log(
    "Existing tables:",
    existing.map((t) => t.tablename).join(", ") || "(none)",
  );

  // ── 2. Ensure Platform enum ──────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Platform') THEN
        CREATE TYPE "Platform" AS ENUM ('AMAZON', 'FLIPKART', 'MYNTRA');
      END IF;
    END $$;
  `);

  // ── 3. Create missing tables ─────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Product" (
      "id"             TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "name"           TEXT NOT NULL,
      "brand"          TEXT,
      "category"       TEXT,
      "imageUrl"       TEXT,
      "description"    TEXT,
      "platform"       "Platform" NOT NULL,
      "platformId"     TEXT NOT NULL,
      "platformUrl"    TEXT NOT NULL,
      "affiliateUrl"   TEXT,
      "currentPrice"   DOUBLE PRECISION NOT NULL,
      "originalPrice"  DOUBLE PRECISION,
      "currency"       TEXT NOT NULL DEFAULT 'INR',
      "inStock"        BOOLEAN NOT NULL DEFAULT true,
      "platformRating" DOUBLE PRECISION,
      "reviewCount"    INTEGER NOT NULL DEFAULT 0,
      "aiScore"        DOUBLE PRECISION,
      "lastScored"     TIMESTAMP(3),
      "productGroupId" TEXT,
      CONSTRAINT "Product_platform_platformId_key" UNIQUE ("platform", "platformId")
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Product_category_idx" ON "Product"("category")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Product_aiScore_idx" ON "Product"("aiScore")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Product_productGroupId_idx" ON "Product"("productGroupId")`,
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Review" (
      "id"               TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "productId"        TEXT NOT NULL,
      "platform"         "Platform" NOT NULL,
      "totalCount"       INTEGER NOT NULL DEFAULT 0,
      "averageRating"    DOUBLE PRECISION,
      "positiveCount"    INTEGER NOT NULL DEFAULT 0,
      "neutralCount"     INTEGER NOT NULL DEFAULT 0,
      "negativeCount"    INTEGER NOT NULL DEFAULT 0,
      "positivePct"      DOUBLE PRECISION,
      "negativePct"      DOUBLE PRECISION,
      "praiseSummary"    TEXT,
      "complaintSummary" TEXT,
      "analyzedAt"       TIMESTAMP(3),
      CONSTRAINT "Review_productId_platform_key" UNIQUE ("productId", "platform"),
      CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PriceHistory" (
      "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "productId"  TEXT NOT NULL,
      "price"      DOUBLE PRECISION NOT NULL,
      "currency"   TEXT NOT NULL DEFAULT 'INR',
      CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PriceHistory_productId_recordedAt_idx" ON "PriceHistory"("productId", "recordedAt")`,
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SearchCache" (
      "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt"  TIMESTAMP(3) NOT NULL,
      "query"      TEXT NOT NULL,
      "category"   TEXT,
      "resultJson" JSONB NOT NULL,
      "hitCount"   INTEGER NOT NULL DEFAULT 1,
      CONSTRAINT "SearchCache_query_category_key" UNIQUE ("query", "category")
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "SearchCache_expiresAt_idx" ON "SearchCache"("expiresAt")`,
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Category" (
      "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "slug"         TEXT NOT NULL UNIQUE,
      "name"         TEXT NOT NULL,
      "emoji"        TEXT NOT NULL,
      "productCount" INTEGER NOT NULL DEFAULT 0
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PageView" (
      "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "sessionId"    TEXT NOT NULL,
      "visitorId"    TEXT NOT NULL,
      "eventType"    TEXT NOT NULL,
      "page"         TEXT,
      "query"        TEXT,
      "productName"  TEXT,
      "productId"    TEXT,
      "affiliateUrl" TEXT,
      "referrer"     TEXT,
      "userAgent"    TEXT,
      "screenWidth"  INTEGER,
      "path"         TEXT
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PageView_createdAt_idx" ON "PageView"("createdAt")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PageView_visitorId_idx" ON "PageView"("visitorId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PageView_eventType_idx" ON "PageView"("eventType")`,
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SiteConfig" (
      "id"        TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "key"       TEXT NOT NULL UNIQUE,
      "value"     TEXT NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "SiteConfig_key_idx" ON "SiteConfig"("key")`,
  );

  console.log("All schema tables created/verified ✓");

  // ── 4. Fix categories ────────────────────────────────────────────
  const all = await prisma.$queryRaw`SELECT slug FROM "Category"`;
  const stale = all.filter((c) => !CANONICAL_SLUGS.includes(c.slug));
  if (stale.length > 0) {
    for (const c of stale) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "Category" WHERE slug = $1`,
        c.slug,
      );
    }
    console.log(
      `Deleted stale categories: ${stale.map((c) => c.slug).join(", ")}`,
    );
  }

  for (const cat of CANONICAL_CATEGORIES) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Category" (id, slug, name, emoji, "productCount")
       VALUES (gen_random_uuid()::text, $1, $2, $3, 0)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, emoji = EXCLUDED.emoji`,
      cat.slug,
      cat.name,
      cat.emoji,
    );
  }

  const final =
    await prisma.$queryRaw`SELECT slug, name, emoji FROM "Category" ORDER BY name ASC`;
  console.log("\nCategories:");
  final.forEach((c) => console.log(`  ${c.emoji} ${c.slug} — ${c.name}`));

  const afterTables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  console.log(
    "\nAll tables now:",
    afterTables.map((t) => t.tablename).join(", "),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
