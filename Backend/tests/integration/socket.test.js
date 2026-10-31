// Backend/tests/integration/socket.test.js
// Real-time tests: Redis -> Socket.io -> binary message -> client.
// Needs MongoDB and Redis running. Uses the fleetdash_test database. Test data starts with "TEST-".
const http = require('http');
const request = require('supertest');
const { io: connectClient } = require('socket.io-client');
const { app } = require('../../server');
const { connectDB, closeDB, mongoose } = require('../../src/config/db');
const { initSocketServer } = require('../../src/sockets/socketServer');
const { publishVehicleUpdate, publishAlert } = require('../../src/services/redisService');
const { decodeBatch } = require('../../src/utils/binaryCodec');
const EVENTS = require('../../src/sockets/events');
const geofenceService = require('../../src/services/geofenceService');
const Geofence = require('../../src/models/Geofence');
const Alert = require('../../src/models/Alert');
const TelemetryBucket = require('../../src/models/TelemetryBucket');

const TEST_IDS = /^TEST-/;
const SQUARE = [[[88.3, 22.5], [88.4, 22.5], [88.4, 22.6], [88.3, 22.6], [88.3, 22.5]]];
const INSIDE = [88.35, 22.55];
const OUTSIDE = [88.5, 22.55];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits until check() returns something truthy
async function waitFor(check, timeoutMs = 5000) {
  const start = Date.now();
  for (;;) {
    if (await check()) return true;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await sleep(50);
  }
}

// Redis does not keep messages for subscribers that are not ready yet,
// so publish again every moment until the client has received what it should
async function publishUntil(publishFn, isDone, timeoutMs = 5000) {
  const start = Date.now();
  while (!isDone()) {
    await publishFn();
    await sleep(120);
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for the socket message');
  }
}

const update = (vehicleId, overrides = {}) => ({
  vehicleId,
  lon: 88.36,
  lat: 22.57,
  speed: 40,
  heading: 90,
  fuelLevel: 75,
  ignition: true,
  timestamp: Date.now(),
  ...overrides,
});

let httpServer;
let io;
let url;
let clients = [];

async function connect() {
  const client = connectClient(url, { transports: ['websocket'], forceNew: true });
  clients.push(client);
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  return client;
}

// Collects every vehicle batch a client receives (raw bytes and decoded records)
function collectBatches(client) {
  const batches = [];
  client.on(EVENTS.VEHICLE_BATCH, (data) => batches.push({ raw: data, updates: decodeBatch(data) }));
  return batches;
}

const recordsFor = (batches, vehicleId) =>
  batches.flatMap((b) => b.updates).filter((u) => u.vehicleId === vehicleId);

async function cleanUp() {
  await Geofence.deleteMany({ name: TEST_IDS });
  await Alert.deleteMany({ vehicleId: TEST_IDS });
  await TelemetryBucket.deleteMany({ vehicleId: TEST_IDS });
}

beforeAll(async () => {
  await connectDB();
  expect(mongoose.connection.readyState).toBe(1); // 1 = connected. If this fails, start MongoDB.
  await cleanUp();

  httpServer = http.createServer();
  io = initSocketServer(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  url = `http://127.0.0.1:${httpServer.address().port}`;
  await io.ready; // the Redis subscription is active. If this hangs, start Redis.
});

afterAll(async () => {
  clients.forEach((c) => c.disconnect());
  await new Promise((resolve) => io.close(resolve));
  await cleanUp();
  await closeDB();
});

describe('vehicle updates over Socket.io', () => {
  test('are sent to a connected client as one binary message', async () => {
    const client = await connect();
    const batches = collectBatches(client);
    const ids = ['TEST-RT-1', 'TEST-RT-2', 'TEST-RT-3'];

    await publishUntil(
      () => Promise.all(ids.map((id, i) => publishVehicleUpdate(update(id, { speed: 55 + i })))),
      () => ids.every((id) => recordsFor(batches, id).length > 0)
    );

    expect(Buffer.isBuffer(batches[0].raw)).toBe(true);

    const [first] = recordsFor(batches, 'TEST-RT-1');
    expect(first).toMatchObject({
      vehicleId: 'TEST-RT-1',
      lon: 88.36,
      lat: 22.57,
      speed: 55,
      heading: 90,
      ignition: true,
    });
    expect(first.fuelLevel).toBeCloseTo(75, 1);
    expect(recordsFor(batches, 'TEST-RT-3')[0].speed).toBe(57);
  });

  test('contain each vehicle only once per message, with the newest data', async () => {
    const client = await connect();
    const batches = collectBatches(client);

    await publishUntil(
      async () => {
        await publishVehicleUpdate(update('TEST-RT-DUP', { speed: 10 }));
        await publishVehicleUpdate(update('TEST-RT-DUP', { speed: 20 }));
      },
      () => recordsFor(batches, 'TEST-RT-DUP').some((u) => u.speed === 20)
    );

    for (const batch of batches) {
      const ids = batch.updates.map((u) => u.vehicleId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test('reach every connected client', async () => {
    const clientA = await connect();
    const clientB = await connect();
    const batchesA = collectBatches(clientA);
    const batchesB = collectBatches(clientB);

    await publishUntil(
      () => publishVehicleUpdate(update('TEST-RT-MULTI')),
      () => recordsFor(batchesA, 'TEST-RT-MULTI').length > 0 && recordsFor(batchesB, 'TEST-RT-MULTI').length > 0
    );

    expect(recordsFor(batchesA, 'TEST-RT-MULTI')[0].lon).toBe(88.36);
    expect(recordsFor(batchesB, 'TEST-RT-MULTI')[0].lon).toBe(88.36);
  });
});

describe('geofence alerts over Socket.io', () => {
  test('are sent immediately as JSON', async () => {
    const client = await connect();
    const received = [];
    client.on(EVENTS.GEOFENCE_ALERT, (alert) => received.push(alert));

    const alert = {
      id: 'abc123',
      type: 'exit',
      vehicleId: 'TEST-RT-ALERT',
      geofenceId: '507f1f77bcf86cd799439011',
      geofenceName: 'TEST-RT-ZONE',
      lon: 88.5,
      lat: 22.55,
      occurredAt: 1792961029078,
    };

    await publishUntil(
      () => publishAlert(alert),
      () => received.some((a) => a.vehicleId === 'TEST-RT-ALERT')
    );

    expect(received.find((a) => a.vehicleId === 'TEST-RT-ALERT')).toEqual(alert);
  });
});

describe('end to end: HTTP ingest -> Redis -> Socket.io -> client', () => {
  test('a telemetry reading appears on the client as a binary update', async () => {
    const client = await connect();
    const batches = collectBatches(client);

    const res = await request(app)
      .post('/api/telemetry/ingest')
      .send({ vehicleId: 'TEST-RT-E2E', coordinates: [88.36, 22.57], speed: 42, heading: 180, fuelLevel: 60 });
    expect(res.status).toBe(201);

    await waitFor(() => recordsFor(batches, 'TEST-RT-E2E').length > 0);

    expect(recordsFor(batches, 'TEST-RT-E2E')[0]).toMatchObject({
      vehicleId: 'TEST-RT-E2E',
      lon: 88.36,
      lat: 22.57,
      speed: 42,
      heading: 180,
    });
  });

  test('a geofence breach appears on the client as a live alert', async () => {
    const created = await request(app)
      .post('/api/geofences')
      .send({ name: 'TEST-RT-ZONE', coordinates: SQUARE, vehicleIds: ['TEST-RT-GEO'] });
    expect(created.status).toBe(201);
    await geofenceService.refresh(); // load the new geofence into memory right away

    const client = await connect();
    const received = [];
    client.on(EVENTS.GEOFENCE_ALERT, (alert) => received.push(alert));

    const send = (coordinates) =>
      request(app).post('/api/telemetry/ingest').send({ vehicleId: 'TEST-RT-GEO', coordinates, speed: 40 });

    await send(INSIDE); // the first position only teaches the service where the vehicle is
    await send(OUTSIDE);

    await waitFor(() => received.some((a) => a.vehicleId === 'TEST-RT-GEO'));

    const alert = received.find((a) => a.vehicleId === 'TEST-RT-GEO');
    expect(alert).toMatchObject({
      type: 'exit',
      geofenceName: 'TEST-RT-ZONE',
      lon: 88.5,
      lat: 22.55,
    });
  });
});

describe('when nobody is connected', () => {
  test('old updates are dropped and not replayed to a client that connects later', async () => {
    clients.forEach((c) => c.disconnect());
    clients = [];
    await sleep(300); // let the server notice that everyone left

    for (let i = 0; i < 3; i++) {
      await publishVehicleUpdate(update('TEST-RT-OLD'));
      await sleep(50);
    }
    await sleep(400);

    const client = await connect();
    const batches = collectBatches(client);
    await sleep(500);

    expect(recordsFor(batches, 'TEST-RT-OLD')).toHaveLength(0);
  });
});



describe('batch uploads', () => {
  test('appear on the client as one update with the newest position', async () => {
    const client = await connect();
    const batches = collectBatches(client);

    const readings = [0, 1, 2].map((i) => ({
      coordinates: [88.31 + i * 0.01, 22.55],
      speed: 30 + i,
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
    }));
    const res = await request(app).post('/api/telemetry/ingest-batch').send({ vehicleId: 'TEST-RT-BATCH', readings });
    expect(res.status).toBe(201);

    await waitFor(() => recordsFor(batches, 'TEST-RT-BATCH').length > 0);
    await sleep(300); // make sure no older reading is sent after it

    const records = recordsFor(batches, 'TEST-RT-BATCH');
    expect(records).toHaveLength(1);
    expect(records[0].lon).toBeCloseTo(88.33, 5);
    expect(records[0].speed).toBe(32);
  });
});


const { createClient } = require('../../src/config/redis');

describe('bad messages on the Redis channel', () => {
  test('are skipped and the live updates keep working', async () => {
    const client = await connect();
    const batches = collectBatches(client);
    const rawPublisher = createClient('test-raw', { enableOfflineQueue: true });

    try {
      await publishUntil(
        async () => {
          await rawPublisher.publish('fleet:updates', 'this is not json');
          await publishVehicleUpdate(update('TEST-RT-AFTERBAD'));
        },
        () => recordsFor(batches, 'TEST-RT-AFTERBAD').length > 0
      );
    } finally {
      rawPublisher.disconnect();
    }

    expect(recordsFor(batches, 'TEST-RT-AFTERBAD')[0].lon).toBe(88.36);
  });
});