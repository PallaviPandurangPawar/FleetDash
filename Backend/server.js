require('dotenv').config();

const express = require('express');
const cors = require('cors');
const config = require('./src/config/config');
const { connectDB, closeDB } = require('./src/config/db');
const workerPool = require('./src/workers/workerPool');
const { initSocketServer } = require('./src/sockets/socketServer');

// Routes
const healthRoutes = require('./src/routes/healthRoutes');
const vehicleRoutes = require('./src/routes/vehicleRoutes');
const telemetryRoutes = require('./src/routes/telemetryRoutes');
const analyticsRoutes = require('./src/routes/analyticsRoutes');
const geofenceRoutes = require('./src/routes/geofenceRoutes');
const alertRoutes = require('./src/routes/alertRoutes');
const { errorHandler, notFoundHandler } = require('./src/middlewares/errorHandler');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Request logging middleware (set LOG_REQUESTS=false to disable, e.g. for load tests)
if (process.env.LOG_REQUESTS !== 'false') {
  app.use((req, _res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    next();
  });
}

// Root Information Endpoint
app.get('/', (_req, res) => {
  res.json({
    project: 'FleetDash Backend Engine',
    version: '1.0.0',
    description: 'Fleet Management API optimized with Worker Threads and MongoDB Bucket Pattern',
    endpoints: {
      health: 'GET /api/health',
      vehicles: '/api/vehicles',
      telemetry: '/api/telemetry',
      analytics: '/api/analytics',
      geofences: '/api/geofences',
      alerts: '/api/alerts',
    },
  });
});

// Mount Routes
app.use('/api', healthRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/geofences', geofenceRoutes);
app.use('/api/alerts', alertRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

let serverInstance = null;

async function startServer() {
  await connectDB();

  serverInstance = app.listen(config.port, () => {
    console.log(`====================================================`);
    console.log(`🚀 FleetDash Backend Server listening on port ${config.port}`);
    console.log(`⚡ Worker Threads Pool: ${config.workerPoolSize} threads active`);
    console.log(`📦 MongoDB Bucket Pattern: max ${config.bucketMaxSize} readings/bucket`);
    console.log(`====================================================`);
  });

  initSocketServer(serverInstance);

  return serverInstance;
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Commencing graceful shutdown...`);

  if (serverInstance) {
    serverInstance.close(() => {
      console.log('[Server] HTTP server closed');
    });
  }

  try {
    await workerPool.terminate();
    await closeDB();
    console.log('[Server] Graceful shutdown completed cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('[Server] Error during graceful shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

if (require.main === module) {
  startServer().catch((error) => {
    console.error('[Server] Fatal startup error:', error);
    process.exit(1);
  });
}

module.exports = { app, startServer };