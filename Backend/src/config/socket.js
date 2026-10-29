// Backend/src/config/socket.js
// Socket.io settings in one place.
//
// No Redis adapter is needed: every server instance subscribes to the Redis channels
// itself and sends the updates to its own clients, so several instances work side by side.
module.exports = {
  // How often the collected vehicle updates are sent to clients (ms)
  broadcastIntervalMs: parseInt(process.env.BROADCAST_INTERVAL_MS, 10) || 100,

  // Options passed to the Socket.io server (set CORS_ORIGIN in .env to limit who can connect)
  serverOptions() {
    return {
      cors: { origin: process.env.CORS_ORIGIN || '*' },
    };
  },
};