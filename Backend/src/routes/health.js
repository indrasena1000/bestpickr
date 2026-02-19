// src/routes/health.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { getCacheInfo } = require('../utils/redis');
const router  = express.Router();
const prisma  = new PrismaClient();

// GET /api/health — overall system health
router.get('/', async (req, res) => {
  let dbStatus = 'ok';
  try { await prisma.$queryRaw`SELECT 1`; } catch { dbStatus = 'error'; }

  const cacheInfo = await getCacheInfo();

  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      redis:    cacheInfo.connected ? 'ok' : 'disconnected',
      api:      'ok',
    },
    cache: {
      connected:  cacheInfo.connected,
      totalKeys:  cacheInfo.totalKeys || 0,
      ttlHours:   Math.round((parseInt(process.env.CACHE_TTL_SECONDS) || 21600) / 3600),
    },
  });
});

// GET /api/health/cache — detailed cache debug info
router.get('/cache', async (req, res) => {
  const cacheInfo = await getCacheInfo();
  res.json(cacheInfo);
});

module.exports = router;
