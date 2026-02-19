// server.js — bestpickr API Server
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const { PrismaClient } = require("@prisma/client");
const logger = require("./src/utils/logger");
const { connectRedis, disconnectRedis, getCacheInfo } = require("./src/utils/redis");
const { setSearchAgent, startCron, stopCron } = require("./src/cron/categoryPreloader");

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5001;

// ── CORS ─────────────────────────────────────────────────────────
// FIX: was a single string — must be an array to support multiple origins
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || "http://localhost:5173",
  "https://bestpickr.in",
  "https://www.bestpickr.in",
  /\.vercel\.app$/, // allows all *.vercel.app preview URLs
];
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
app.use("/api/", limiter);

// ── ROUTES ────────────────────────────────────────────────────────
app.use("/api/search", require("./src/routes/search"));
app.use("/api/products", require("./src/routes/products"));
app.use("/api/categories", require("./src/routes/categories"));
app.use("/api/health", require("./src/routes/health"));

// Analytics — FIX: these were missing from server.js completely
const { router: analyticsRouter } = require("./src/routes/analytics");
app.use("/api/analytics", analyticsRouter);

// Admin (maintenance mode) — FIX: also missing
app.use("/api/admin", require("./src/routes/admin"));

// ── STATUS ENDPOINT ──────────────────────────────────────────────
app.get("/api/status", async (req, res) => {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (_) {}

  const cache = await getCacheInfo();

  res.json({
    status: "running",
    database: dbOk ? "connected" : "disconnected",
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
    // Connect database
    await prisma.$connect();
    app.locals.prisma = prisma; // Share with routes that use req.app.locals.prisma
    logger.info("✅ Database (Postgres) connected");

    // FIX: Inject the shared prisma instance into rankingAgent
    // This ensures there is ONE PrismaClient across the whole app.
    // rankingAgent was previously creating its own — with Neon pooler
    // this causes connection exhaustion and silent DB save failures.
    const { setPrisma } = require("./src/agents/rankingAgent");
    setPrisma(prisma);
    logger.info("✅ Prisma injected into rankingAgent");

    // Connect Redis (non-fatal — app works without it)
    await connectRedis();

    // Wire cron: inject the ranking agent's search function into the preloader
    // This avoids circular dependencies (cron → rankingAgent → redis → ...)
    const { runSearchAgent } = require("./src/agents/rankingAgent");
    setSearchAgent(runSearchAgent);
    startCron();
    logger.info("✅ Cron scheduler started (preloads categories at 12 AM IST)");

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
  disconnectRedis();
  await prisma.$disconnect();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  stopCron();
  disconnectRedis();
  await prisma.$disconnect();
  process.exit(0);
});

start();
