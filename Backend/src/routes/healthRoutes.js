const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const workerPool = require('../workers/workerPool');
const redisService = require('../services/redisService');

router.get('/health', (req, res) => {
  const dbState =
    mongoose.connection.readyState === 1
      ? 'connected'
      : mongoose.connection.readyState === 2
      ? 'connecting'
      : 'disconnected';

  const io = req.app.get('io'); // set when the real-time server is running

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'FleetDash Backend Engine',
    database: dbState,
    workerPool: workerPool.getStats(),
    realtime: {
      redis: redisService.getStatus(),
      socketServer: io ? 'running' : 'not started',
      socketClients: io ? io.engine.clientsCount : 0,
    },
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    memoryUsageMB: Math.round(process.memoryUsage().rss / (1024 * 1024)),
  });
});

module.exports = router;