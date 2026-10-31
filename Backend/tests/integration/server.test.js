// Backend/tests/integration/server.test.js
// Starts the real server (HTTP + Socket.io) on a free port and stops it again.
// Needs MongoDB and Redis running. Uses the fleetdash_test database (see tests/setup.js).
const request = require('supertest');
const { io: connectClient } = require('socket.io-client');
const { app, startServer, stopServer } = require('../../server');
const { mongoose } = require('../../src/config/db');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, timeoutMs = 5000) {
  const start = Date.now();
  for (;;) {
    if (await check()) return true;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await sleep(50);
  }
}

const health = async () => (await request(app).get('/api/health')).body;

let server;
let client;

afterAll(async () => {
  if (client) client.disconnect();
  await stopServer();
});

describe('starting the server', () => {
  test('listens on a free port, serves the root page and reports the real-time layer', async () => {
    server = await startServer(0);
    const { port } = server.address();

    expect(server.listening).toBe(true);
    expect(mongoose.connection.readyState).toBe(1); // 1 = connected. If this fails, start MongoDB.

    const root = await request(app).get('/');
    expect(root.status).toBe(200);
    expect(root.body.project).toBe('FleetDash Backend Engine');

    await waitFor(async () => (await health()).realtime.redis === 'ready'); // if this hangs, start Redis
    expect(await health()).toMatchObject({
      status: 'ok',
      database: 'connected',
      realtime: { redis: 'ready', socketServer: 'running', socketClients: 0 },
    });

    client = connectClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });

    await waitFor(async () => (await health()).realtime.socketClients === 1);
  });
});

describe('stopping the server', () => {
  test('disconnects clients, closes the port, the database and the real-time layer', async () => {
    const disconnected = new Promise((resolve) => client.once('disconnect', resolve));

    await stopServer();
    await disconnected;

    expect(server.listening).toBe(false);
    expect(mongoose.connection.readyState).toBe(0);

    expect(await health()).toMatchObject({
      database: 'disconnected',
      realtime: { socketServer: 'not started', socketClients: 0 },
    });
  });

  test('stopping again is safe', async () => {
    await expect(stopServer()).resolves.toBeUndefined();
  });
});