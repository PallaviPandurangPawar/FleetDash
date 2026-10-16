const mongoose = require('mongoose');
const config = require('./config');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  try {
    const conn = await mongoose.connect(config.mongoUri, {
      maxPoolSize: 50, // Connection pool optimized for high-throughput bucket writes
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });

    isConnected = true;
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);

    mongoose.connection.on('error', (err) => {
      console.error('[Database] MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[Database] MongoDB disconnected. Attempting reconnect...');
      isConnected = false;
    });

    return conn;
  } catch (error) {
    console.error(`[Database] MongoDB Connection Failed: ${error.message}`);
    // Do not crash immediately; allow healthcheck to report database state
    return null;
  }
}

async function closeDB() {
  if (isConnected) {
    await mongoose.connection.close();
    isConnected = false;
    console.log('[Database] MongoDB connection closed cleanly');
  }
}

module.exports = { connectDB, closeDB, mongoose };
