const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const workerPool = require('../workers/workerPool');

router.get('/health', (_req, res) => {
  const dbState =
    mongoose.connection.readyState === 1
      ? 'connected'
      : mongoose.connection.readyState === 2
      ? 'connecting'
      : 'disconnected';

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'FleetDash Backend Engine',
    database: dbState,
    workerPool: workerPool.getStats(),
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    memoryUsageMB: Math.round(process.memoryUsage().rss / (1024 * 1024)),
  });
});

module.exports = router;
