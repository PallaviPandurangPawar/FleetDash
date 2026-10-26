// Acts like a browser: connects to Socket.io, decodes the binary batches,
// reports update counts and prints live geofence alerts.
// Usage: node scripts/socketListener.js
const { io } = require('socket.io-client');
const { decodeBatch } = require('../src/utils/binaryCodec');

const URL = process.env.URL || 'http://localhost:5000';
const socket = io(URL);

let totalUpdates = 0;
let windowUpdates = 0;
let windowMessages = 0;
let alerts = 0;
let sampled = false;

socket.on('connect', () => console.log(`Connected to ${URL} as ${socket.id}`));
socket.on('disconnect', () => console.log('Disconnected'));

socket.on('vehicles:binary', (data) => {
  const updates = decodeBatch(data);
  const bytes = data.byteLength !== undefined ? data.byteLength : data.length;

  windowMessages += 1;
  totalUpdates += updates.length;
  windowUpdates += updates.length;

  if (!sampled && updates.length > 0) {
    sampled = true;
    const json = JSON.stringify(updates[0]).length;
    console.log('sample update:', JSON.stringify(updates[0]));
    console.log(`message size: ${bytes} bytes for ${updates.length} vehicles`);
    console.log(`one vehicle: 56 bytes binary vs about ${json} bytes as JSON text`);
  }
});

socket.on('geofence:alert', (alert) => {
  alerts += 1;
  const what = alert.type === 'exit' ? 'LEFT' : 'ENTERED';
  console.log(`>>> LIVE ALERT: ${alert.vehicleId} ${what} "${alert.geofenceName}" at [${alert.lon.toFixed(4)}, ${alert.lat.toFixed(4)}]`);
});

setInterval(() => {
  console.log(
    `[listener] last 5 s: ${windowUpdates} updates in ${windowMessages} messages | total updates: ${totalUpdates} | alerts: ${alerts}`
  );
  windowUpdates = 0;
  windowMessages = 0;
}, 5000);