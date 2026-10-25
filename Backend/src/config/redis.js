const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

/**
 * Creates a Redis connection. Separate connections are used for publishing and
 * subscribing because a subscribed connection can't run normal commands.
 */
function createClient(name, overrides = {}) {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false, // fail fast instead of piling up commands when Redis is down
    retryStrategy: (times) => Math.min(times * 200, 3000),
    ...overrides,
  });

  client.on('connect', () => console.log(`[Redis:${name}] connected`));
  client.on('error', (err) => console.error(`[Redis:${name}] ${err.message}`));

  return client;
}

module.exports = { createClient, REDIS_URL };