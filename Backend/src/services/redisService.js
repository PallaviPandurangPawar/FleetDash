const { createClient, settings } = require('../config/redis');

const CHANNEL = 'fleet:updates'; // newest position per vehicle
const ALERT_CHANNEL = 'fleet:alerts'; // geofence alerts
const publisher = createClient('pub');

async function publish(channel, payload) {
  const message = JSON.stringify(payload);
  // In cluster mode a second try goes to another primary, so a node that is just going down loses nothing
  const attempts = settings.mode === 'cluster' ? 2 : 1;
  let lastError;

  for (let i = 0; i < attempts; i++) {
    try {
      await publisher.publish(channel, message);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  console.error(`[Redis] publish to ${channel} failed: ${lastError.message}`);
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

/** Waits for a promise, but gives up after `ms` so the health route can never hang */
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** One line of CLUSTER NODES -> { address, role, status } */
function parseNodeLine(line) {
  const parts = line.trim().split(' ');
  const flags = (parts[2] || '').split(',');
  let status = 'ok';
  if (flags.includes('fail')) status = 'fail';
  else if (flags.includes('fail?')) status = 'possibly-down';
  else if (flags.includes('handshake') || flags.includes('noaddr')) status = 'joining';

  return {
    address: (parts[1] || '').split('@')[0], // "10.66.77.11:6379@16379" -> "10.66.77.11:6379"
    role: flags.includes('master') ? 'primary' : 'replica',
    status,
  };
}

/** State of the Redis Cluster and its nodes, as the cluster itself reports them. Never throws. */
async function getClusterDetails() {
  const details = { state: 'unknown', primaries: 0, replicas: 0, nodes: [] };
  if (publisher.status !== 'ready') return details;

  try {
    const [info, nodeList] = await withTimeout(Promise.all([publisher.cluster('INFO'), publisher.cluster('NODES')]), 1500);

    const match = /cluster_state:(\w+)/.exec(info);
    details.state = match ? match[1] : 'unknown'; // "ok" when every slot is served, "fail" when not
    details.nodes = nodeList
      .split('\n')
      .filter((line) => line.trim())
      .map(parseNodeLine);
    details.primaries = details.nodes.filter((n) => n.role === 'primary').length;
    details.replicas = details.nodes.filter((n) => n.role === 'replica').length;
  } catch (_err) {
    // the cluster could not be asked right now: report "unknown"
  }
  return details;
}

/** Details of the Redis connection for the health route: mode, status and, in cluster mode, the cluster. Never throws. */
async function getDetails() {
  const details = { mode: settings.mode, status: getStatus() };
  if (settings.mode === 'cluster') details.cluster = await getClusterDetails();
  return details;
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

module.exports = { CHANNEL, ALERT_CHANNEL, publishVehicleUpdate, publishAlert, getStatus, getDetails, close };