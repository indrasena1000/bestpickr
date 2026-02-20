// src/utils/mongodb.js — MongoDB (Mongoose) Connection Manager
// ─────────────────────────────────────────────────────────────────
// Handles Mongoose connection lifecycle for bestpickr.
// Mirrors the pattern used in redis.js — clean connect/disconnect
// with graceful fallback if MONGODB_URI is not set.
//
// DUAL DATABASE ARCHITECTURE:
//   PostgreSQL (Prisma)  → Existing data: Products, Reviews, PriceHistory,
//                          SearchCache, Categories, PageViews, SiteConfig
//   MongoDB (Mongoose)   → New AI layer: ProductAnalysis, ProductListing,
//                          SearchCache (TTL), PriceAlerts
//
// Both databases run side-by-side. MongoDB handles AI-specific data
// that benefits from flexible schemas (aspectScores Map, dynamic
// insight arrays, embedded priceHistory sub-documents).
// ─────────────────────────────────────────────────────────────────
"use strict";

const mongoose = require("mongoose");
const logger = require("./logger");

// ── CONNECTION OPTIONS ──────────────────────────────────────────
// Tuned for production MongoDB Atlas (or any hosted MongoDB).
// These match the connection patterns used in redis.js.
const MONGOOSE_OPTIONS = {
  // Connection pool: max 10 connections (matches Neon pooler limits)
  maxPoolSize: 10,
  minPoolSize: 2,

  // Timeouts
  serverSelectionTimeoutMS: 10000, // 10s to find a server
  socketTimeoutMS: 45000, // 45s socket timeout
  connectTimeoutMS: 15000, // 15s initial connect

  // Heartbeat: check server health every 30s
  heartbeatFrequencyMS: 30000,

  // Auto-index in dev, skip in production (create indexes manually)
  autoIndex: process.env.NODE_ENV !== "production",

  // Buffer commands while connecting (matches redis enableOfflineQueue behavior)
  bufferCommands: true,
  bufferTimeoutMS: 10000,
};

// ── CONNECT ─────────────────────────────────────────────────────
// Called from server.js during startup. Non-fatal — app works
// without MongoDB (Prisma/Postgres handles core data).
async function connectMongoDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    logger.warn(
      "MongoDB: MONGODB_URI not set — Mongoose features disabled " +
        "(AI analysis, price alerts, MongoDB search cache will not work)",
    );
    return false;
  }

  // Mask credentials in logs: mongodb+srv://user:****@cluster...
  const maskedUri = uri.replace(/:([^@]+)@/, ":****@");
  logger.info(`MongoDB: connecting to ${maskedUri}`);

  try {
    await mongoose.connect(uri, MONGOOSE_OPTIONS);
    logger.info("MongoDB: ✅ connected successfully");

    // ── Connection Event Listeners ────────────────────────────
    mongoose.connection.on("error", (err) => {
      logger.error(`MongoDB error: ${err.message}`);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB: disconnected");
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("MongoDB: ✅ reconnected");
    });

    // Log database name and host for verification
    const { host, port, name } = mongoose.connection;
    logger.info(`MongoDB: db="${name}" host="${host}" port="${port || "SRV"}"`);

    return true;
  } catch (err) {
    logger.error(`MongoDB: ❌ connection failed — ${err.message}`);
    logger.error(
      "MongoDB tip: Check MONGODB_URI format. " +
        "For Atlas: mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/bestpickr?retryWrites=true&w=majority",
    );
    return false;
  }
}

// ── DISCONNECT ──────────────────────────────────────────────────
// Called during graceful shutdown (SIGINT/SIGTERM).
async function disconnectMongoDB() {
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
      logger.info("MongoDB: disconnected gracefully");
    } catch (err) {
      logger.error(`MongoDB: disconnect error — ${err.message}`);
    }
  }
}

// ── STATUS CHECK ────────────────────────────────────────────────
// Used by /api/status endpoint to report MongoDB health.
// readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
function getMongoStatus() {
  const state = mongoose.connection.readyState;
  const stateMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  return {
    connected: state === 1,
    status: stateMap[state] || "unknown",
    host: mongoose.connection.host || null,
    database: mongoose.connection.name || null,
  };
}

module.exports = {
  connectMongoDB,
  disconnectMongoDB,
  getMongoStatus,
};
