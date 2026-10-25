const { Server } = require('socket.io');
const { createClient } = require('../config/redis');
const { CHANNEL } = require('../services/redisService');
const EVENTS = require('./events');

/**
 * Attaches Socket.io to the HTTP server and relays every Redis update
 * to all connected clients.
 */
function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN || '*' },
  });

  // The subscriber queues its subscribe command until Redis is connected
  const subscriber = createClient('sub', { enableOfflineQueue: true });

  subscriber.subscribe(CHANNEL, (err) => {
    if (err) console.error(`[Socket.io] could not subscribe to ${CHANNEL}: ${err.message}`);
    else console.log(`[Socket.io] listening to Redis channel ${CHANNEL}`);
  });

  subscriber.on('message', (channel, message) => {
    if (channel !== CHANNEL) return;
    try {
      io.emit(EVENTS.VEHICLE_UPDATE, JSON.parse(message));
    } catch (err) {
      console.error(`[Socket.io] bad message skipped: ${err.message}`);
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.io] client connected: ${socket.id} (total ${io.engine.clientsCount})`);
    socket.on('disconnect', () => {
      console.log(`[Socket.io] client disconnected: ${socket.id} (total ${io.engine.clientsCount})`);
    });
  });

  return io;
}

module.exports = { initSocketServer };