// Acts like a browser: connects to Socket.io and counts the live updates it receives.
// Usage: node scripts/socketListener.js
const { io } = require('socket.io-client');

const URL = process.env.URL || 'http://localhost:5000';
const socket = io(URL);

let total = 0;
let lastWindow = 0;

socket.on('connect', () => console.log(`Connected to ${URL} as ${socket.id}`));
socket.on('disconnect', () => console.log('Disconnected'));

socket.on('vehicle:update', (update) => {
  total += 1;
  lastWindow += 1;
  if (total <= 3) console.log('sample update:', JSON.stringify(update));
});

setInterval(() => {
  console.log(`[listener] updates in last 5 s: ${lastWindow} | total: ${total}`);
  lastWindow = 0;
}, 5000);