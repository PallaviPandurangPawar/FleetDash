const { createClient } = require('../config/redis');

const CHANNEL = 'fleet:updates';
const publisher = createClient('pub');

/**
 * Publishes the latest position of a vehicle. Never throws: a Redis problem
 * must not stop telemetry from being saved.
 */
async function publishVehicleUpdate(update) {
  try {
    await publisher.publish(CHANNEL, JSON.stringify(update));
  } catch (err) {
    console.error(`[Redis] publish failed: ${err.message}`);
  }
}

module.exports = { CHANNEL, publishVehicleUpdate };