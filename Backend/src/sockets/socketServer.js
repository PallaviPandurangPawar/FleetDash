const { Server } = require('socket.io');
const { createClient } = require('../config/redis');
const socketConfig = require('../config/socket');
const { CHANNEL, ALERT_CHANNEL } = require('../services/redisService');
const { encodeBatch } = require('../utils/binaryCodec');
const EVENTS = require('./events');

/**
 * Attaches Socket.io to the HTTP server.
 * - Vehicle updates arrive from Redis, are collected for a short window (the newest
 *   update per vehicle wins) and are sent to all clients as ONE binary message.
 * - Geofence alerts are rare, so each one is sent immediately as a JSON message.
 */
function initSocketServer(httpServer) {
  const io = new Server(httpServer, socketConfig.serverOptions());

  const pendingUpdates = new Map(); // vehicleId -> latest update

  // The subscriber queues its subscribe command until Redis is connected
  const subscriber = createClient('sub', { enableOfflineQueue: true });

  // Resolves when the Redis subscription is active (tests wait for this before publishing)
  io.ready = new Promise((resolve) => {
    subscriber.subscribe(CHANNEL, ALERT_CHANNEL, (err) => {
      if (err) console.error(`[Socket.io] could not subscribe: ${err.message}`);
      else console.log(`[Socket.io] listening to Redis channels ${CHANNEL} and ${ALERT_CHANNEL}`);
      resolve();
    });
  });

  subscriber.on('message', (channel, message) => {
    try {
      const data = JSON.parse(message);
      if (channel === CHANNEL) {
        pendingUpdates.set(data.vehicleId, data);
      } else if (channel === ALERT_CHANNEL) {
        io.emit(EVENTS.GEOFENCE_ALERT, data);
      }
    } catch (err) {
      console.error(`[Socket.io] bad message skipped: ${err.message}`);
    }
  });

  const broadcastTimer = setInterval(() => {
    if (pendingUpdates.size === 0) return;

    // Nobody is connected: drop the updates instead of building useless messages
    if (io.engine.clientsCount === 0) {
      pendingUpdates.clear();
      return;
    }

    const payload = encodeBatch([...pendingUpdates.values()]);
    pendingUpdates.clear();
    io.emit(EVENTS.VEHICLE_BATCH, payload);
  }, socketConfig.broadcastIntervalMs);

  // Closing the server also stops the timer and the Redis subscription
  const closeServer = io.close.bind(io);
  io.close = (callback) => {
    clearInterval(broadcastTimer);
    subscriber.disconnect();
    return closeServer(callback);
  };

  io.on('connection', (socket) => {
    console.log(`[Socket.io] client connected: ${socket.id} (total ${io.engine.clientsCount})`);
    socket.on('disconnect', () => {
      console.log(`[Socket.io] client disconnected: ${socket.id} (total ${io.engine.clientsCount})`);
    });
  });

  return io;
}

module.exports = { initSocketServer };