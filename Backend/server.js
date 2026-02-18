// server.js — bestpickr API Server
// ─────────────────────────────────────────────────────────────────
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const { PrismaClient } = require("@prisma/client");
const logger = require("./src/utils/logger");

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5001;

// ── MIDDLEWARE ───────────────────────────────────────────────────
// helmet: sets security headers (XSS protection, no-sniff, etc.)
app.use(helmet());

// cors: allow requests from our React frontend
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || "http://localhost:5173",
      /\.vercel\.app$/,
      "https://bestpickr.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.options("*", cors()); // preflight for all routes

// compression: gzip responses (smaller = faster)
app.use(compression());

// morgan: HTTP request logger
app.use(
  morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }),
);

// body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// rate limiting: prevent API abuse
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// ── ROUTES ───────────────────────────────────────────────────────
app.use("/api/search",    require("./src/routes/search"));
app.use("/api/products",  require("./src/routes/products"));
app.use("/api/categories",require("./src/routes/categories"));
app.use("/api/health",    require("./src/routes/health"));
// Analytics: track visitors, clicks, send Telegram reports
const { router: analyticsRouter, sendTelegram } = require("./src/routes/analytics");
app.use("/api/analytics", analyticsRouter);

// ── ROOT ──────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    app: "bestpickr API",
    version: "1.0.0",
    status: "running",
    docs: "See README.md for API documentation",
  });
});

// ── 404 HANDLER ──────────────────────────────────────────────────
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
    // Test database connection
    await prisma.$connect();
    logger.info("✅ Database connected");

    app.listen(PORT, () => {
      logger.info(`🚀 bestpickr API running on http://localhost:${PORT}`);
      logger.info(`📦 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (err) {
    logger.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  prisma.$disconnect();
  process.exit(0);
});
process.on("SIGTERM", () => {
  prisma.$disconnect();
  process.exit(0);
});

start();
