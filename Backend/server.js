// server.js — bestpickr API Server
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const { PrismaClient } = require("@prisma/client");
const logger = require("./src/utils/logger");
const {
  connectRedis,
  disconnectRedis,
  getCacheInfo,
  getClient: getRedisClient,
} = require("./src/utils/redis");
const {
  connectMongoDB,
  disconnectMongoDB,
  getMongoStatus,
} = require("./src/utils/mongodb");

// ── CRON IMPORTS ──────────────────────────────────────────────────
const {
  setSearchAgent,
  startCron,
  stopCron,
} = require("./src/cron/categoryPreloader");
const {
  startNightlyRefresh,
  stopNightlyRefresh,
} = require("./src/jobs/nightlyRefresh");
const {
  setPrisma: setTelegramPrisma,
  startTelegramReport,
  stopTelegramReport,
} = require("./src/jobs/telegramReport");
const snapshotCron = require("./src/cron/rankingSnapshotCron");
const priceRefreshCron = require("./src/cron/priceRefreshCron");
const autoSeedCron = require("./src/cron/autoSeedCron");

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5001;

// ── CORS ─────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || "http://localhost:5173",
  "https://bestpickr.in",
  "https://www.bestpickr.in",
  /\.vercel\.app$/, // allows all *.vercel.app preview URLs
];
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
app.options("*", cors());

// ── MIDDLEWARE ────────────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(
  morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Global rate limiter — non-search routes only (products, categories, blog, admin).
// Search has its own per-query limiter in search.js so it is excluded here.
// 600 requests / 15 min per IP = comfortable headroom for real users browsing the app.
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  skip: (req) => req.path.startsWith("/search"), // search has its own limiter
});
app.use("/api/", limiter);

// ── ROUTES ────────────────────────────────────────────────────────
app.use("/api/search", require("./src/routes/search"));
app.use("/api/products", require("./src/routes/products"));
app.use("/api/categories", require("./src/routes/categories"));
app.use("/api/health", require("./src/routes/health"));

const { router: analyticsRouter } = require("./src/routes/analytics");
app.use("/api/analytics", analyticsRouter);

app.use("/api/admin", require("./src/routes/admin"));
app.use("/api/blog", require("./src/routes/blog"));

// ── STATUS ENDPOINT ──────────────────────────────────────────────
app.get("/api/status", async (req, res) => {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (_) {}

  const cache = await getCacheInfo();
  const mongo = getMongoStatus();

  res.json({
    status: "running",
    database: {
      postgres: dbOk ? "connected" : "disconnected",
      mongodb: mongo.connected ? "connected" : mongo.status,
    },
    redis: cache.connected ? "connected" : "disconnected",
    cachedQueries: cache.totalKeys || 0,
    env: process.env.NODE_ENV,
    uptime: Math.round(process.uptime()) + "s",
  });
});

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── GLOBAL ERROR HANDLER ──────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);
  const status = err.statusCode || err.status || 500;
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message;
  res.status(status).json({ error: message });
});

// ── START ─────────────────────────────────────────────────────────
async function start() {
  try {
    // Connect PostgreSQL (Prisma)
    await prisma.$connect();
    app.locals.prisma = prisma;
    logger.info("✅ Database (Postgres) connected");

    // Inject prisma into agents + services
    const { setPrisma } = require("./src/agents/rankingAgent");
    setPrisma(prisma);
    logger.info("✅ Prisma injected into rankingAgent");

    const {
      setPrisma: setSearchCtrlPrisma,
    } = require("./src/controllers/searchController");
    const {
      setPrisma: setProductMatchPrisma,
    } = require("./src/services/productMatchService");
    const {
      setPrisma: setLiveFetchPrisma,
    } = require("./src/services/liveProductFetchService");
    const {
      setPrisma: setRelatedSvcPrisma,
    } = require("./src/services/relatedProductService");
    const {
      setPrisma: setBgEnricherPrisma,
    } = require("./src/services/backgroundCategoryEnricher");
    setSearchCtrlPrisma(prisma);
    setProductMatchPrisma(prisma);
    setLiveFetchPrisma(prisma);
    setRelatedSvcPrisma(prisma);
    setBgEnricherPrisma(prisma);
    logger.info("✅ Prisma injected into all search services");

    // Auto-load dynamic brand detection from DB
    try {
      const brandRecords = await prisma.product.findMany({
        select: { brand: true },
        distinct: ["brand"],
        where: { brand: { not: null } },
      });
      const { setDynamicBrands } = require("./src/utils/productNameNormalizer");
      setDynamicBrands(brandRecords.map((b) => b.brand).filter(Boolean));
      logger.info(
        `✅ Dynamic brand detection loaded (${brandRecords.length} brands from DB)`,
      );
    } catch (brandErr) {
      logger.warn(
        `⚠️  Dynamic brand loading failed (non-fatal): ${brandErr.message}`,
      );
    }

    // Connect MongoDB
    const mongoOk = await connectMongoDB();
    if (mongoOk) {
      logger.info("✅ MongoDB (Mongoose) connected — AI analysis layer active");
    } else {
      logger.warn("⚠️  MongoDB not connected — AI analysis features disabled");
    }

    // Connect Redis
    await connectRedis();

    // ── CRONS ─────────────────────────────────────────────────────────

    // 1. Category preloader (runs at 12 AM IST)
    const {
      runSearchAgent,
      setPrisma: setAgentPrisma,
    } = require("./src/agents/rankingAgent");
    setAgentPrisma(prisma); // inject shared Prisma instance
    setSearchAgent(runSearchAgent); // wire up agent for preloader
    startCron();
    logger.info("✅ Category preloader cron started (12 AM IST)");

    // // 2. Ranking snapshot cron — enable later (heavier, needs more testing)
    // snapshotCron.init(getRedisClient(), prisma);
    // snapshotCron.start();
    // logger.info("✅ Ranking snapshot cron started (every 6h)");

    // // 3. Sub-type snapshot seeding — enable once snapshot cron is on
    // snapshotCron.runSubTypeSnapshot().catch(err =>
    //   logger.error(`SubTypeCron: startup seed failed: ${err.message}`)
    // );

    // // 4. Nightly product refresh (12:01 AM IST) — enable next week
    // startNightlyRefresh();
    // logger.info("✅ Nightly refresh job started (12:01 AM IST)");

    // // 5. Telegram daily report — enable when ready
    // setTelegramPrisma(prisma);
    // startTelegramReport();

    // // 6. Blog generation cron — enable when ready
    // const cron = require("node-cron");
    // const { runBlogGeneration } = require("./src/jobs/blogGenerator");
    // cron.schedule("30 3 * * *", runBlogGeneration);

    // 7. Daily price refresh (3:00 AM IST)
    priceRefreshCron.init(prisma);
    priceRefreshCron.startPriceRefresh();
    logger.info("✅ Price refresh cron started (daily 3:00 AM IST)");

    // 8. Auto-seed cron (Monday 3:10 AM IST) — re-runs top zero-result queries
    autoSeedCron.init(getRedisClient());
    autoSeedCron.startAutoSeedCron();
    logger.info("✅ Auto-seed cron scheduled (weekly Monday 3:10 AM IST)");

    // ── STARTUP PRELOAD: seed all categories immediately on first deploy ──
    // Runs 8s after boot so DB + Redis are fully ready. Non-blocking.
    // Skip if Redis already has category cache data (i.e. after a normal restart).
    const { preloadAllCategories } = require("./src/cron/categoryPreloader");
    setTimeout(() => {
      preloadAllCategories()
        .then((r) =>
          logger.info(
            `✅ Startup preload done: ${r.success}/${r.success + r.failed} categories cached`,
          ),
        )
        .catch((err) =>
          logger.warn(`⚠️  Startup preload failed (non-fatal): ${err.message}`),
        );
    }, 8000);
    logger.info("✅ Startup category preload scheduled (8s delay)");

    app.listen(PORT, () => {
      logger.info(`bestpickr API on http://localhost:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (err) {
    logger.error("❌ Failed to start:", err);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  stopCron();
  stopNightlyRefresh();
  stopTelegramReport();
  priceRefreshCron.stopPriceRefresh();
  disconnectRedis();
  await disconnectMongoDB();
  await prisma.$disconnect();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  stopCron();
  stopNightlyRefresh();
  stopTelegramReport();
  priceRefreshCron.stopPriceRefresh();
  disconnectRedis();
  await disconnectMongoDB();
  await prisma.$disconnect();
  process.exit(0);
});

start();
