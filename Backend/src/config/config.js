const os = require('os');

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/fleetdash',
  workerPoolSize: parseInt(process.env.WORKER_POOL_SIZE, 10) || Math.max(2, Math.min(os.availableParallelism?.() || 4, 8)),
  // Safety cap of readings per hourly bucket (one bucket = one vehicle for one clock hour).
  // Only a vehicle that sends more than this in one hour gets a second bucket for that hour.
  bucketMaxSize: parseInt(process.env.BUCKET_MAX_SIZE, 10) || 1000,
  // How many incoming connections the operating system may queue while Node is busy.
  // Node's default is 511; thousands of load-test clients connecting at once overflow it
  // and the extra ones are refused ("connection refused").
  serverBacklog: parseInt(process.env.SERVER_BACKLOG, 10) || 4096,
};
