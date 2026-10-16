const os = require('os');

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/fleetdash',
  workerPoolSize: parseInt(process.env.WORKER_POOL_SIZE, 10) || Math.max(2, Math.min(os.availableParallelism?.() || 4, 8)),
  bucketMaxSize: parseInt(process.env.BUCKET_MAX_SIZE, 10) || 100,
};
