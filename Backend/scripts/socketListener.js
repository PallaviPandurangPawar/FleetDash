// Acts like a browser: connects to Socket.io, decodes the binary batches
// and reports how many live updates it receives.
// Usage: node scripts/socketListener.js
const { io } = require('socket.io-client');
const { decodeBatch } = require('../src/utils/binaryCodec');

const URL = process.env.URL || 'http://localhost:5000';
const socket = io(URL);

let totalUpdates = 0;
let totalBytes = 0;
let messages = 0;
let windowUpdates = 0;
let windowMessages = 0;
let sampled = false;

socket.on('connect', () => console.log(`Connected to ${URL} as ${socket.id}`));
socket.on('disconnect', () => console.log('Disconnected'));

socket.on('vehicles:binary', (data) => {
  const updates = decodeBatch(data);
  const bytes = data.byteLength !== undefined ? data.byteLength : data.length;

  messages += 1;
  windowMessages += 1;
  totalUpdates += updates.length;
  windowUpdates += updates.length;
  totalBytes += bytes;

  if (!sampled && updates.length > 0) {
    sampled = true;
    const json = JSON.stringify(updates[0]).length;
    console.log('sample update:', JSON.stringify(updates[0]));
    console.log(`message size: ${bytes} bytes for ${updates.length} vehicles`);
    console.log(`one vehicle: 56 bytes binary vs about ${json} bytes as JSON text`);
  }
});

setInterval(() => {
  console.log(
    `[listener] last 5 s: ${windowUpdates} updates in ${windowMessages} messages | total updates: ${totalUpdates}`
  );
  windowUpdates = 0;
  windowMessages = 0;
}, 5000);