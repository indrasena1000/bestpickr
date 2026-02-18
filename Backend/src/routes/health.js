// src/routes/health.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router  = express.Router();
const prisma  = new PrismaClient();

router.get('/', async (req, res) => {
  let dbStatus = 'ok';
  try { await prisma.$queryRaw`SELECT 1`; } catch { dbStatus = 'error'; }
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    services:  { database: dbStatus, api: 'ok' },
  });
});

module.exports = router;
