const { createClient } = require('../config/redis');

const CHANNEL = 'fleet:updates'; // newest position per vehicle
const ALERT_CHANNEL = 'fleet:alerts'; // geofence alerts
const publisher = createClient('pub');

async function publish(channel, payload) {
  try {
    await publisher.publish(channel, JSON.stringify(payload));
  } catch (err) {
    console.error(`[Redis] publish to ${channel} failed: ${err.message}`);
  }
}

/** Publishes the latest position of a vehicle. Never throws. */
function publishVehicleUpdate(update) {
  return publish(CHANNEL, update);
}

/** Publishes a geofence alert. Never throws. */
function publishAlert(alert) {
  return publish(ALERT_CHANNEL, alert);
}

/** Connection state of the publisher: "ready" when healthy, "reconnecting" or "end" otherwise */
function getStatus() {
  return publisher.status;
}

/** Closes the publisher connection (used when the server shuts down) */
async function close() {
  if (publisher.status === 'end') return;
  try {
    await publisher.quit();
  } catch (_err) {
    publisher.disconnect();
  }
}

module.exports = { CHANNEL, ALERT_CHANNEL, publishVehicleUpdate, publishAlert, getStatus, close };