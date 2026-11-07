// Backend/tests/integration/admin.test.js
// Supertest tests for the admin API (/api/admin/*) and the admin-only vehicle delete.
// Uses the fleetdash_test database (see tests/setup.js). It creates "TEST-" vehicles and sample "FLEET-" data
// and removes them again.
const request = require('supertest');
const { app } = require('../../server');
const { connectDB, closeDB, mongoose } = require('../../src/config/db');
const Vehicle = require('../../src/models/Vehicle');
const Geofence = require('../../src/models/Geofence');
const Alert = require('../../src/models/Alert');
const TelemetryBucket = require('../../src/models/TelemetryBucket');
const simulatorService = require('../../src/services/simulatorService');
const { SEED_MARK } = require('../../scripts/seed');

const KEY = 'test-admin-key';
const OWN = /^(TEST-|FLEET-)/; // everything these tests create
const BASE_TIME = Date.UTC(2026, 0, 1, 12, 0, 0);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits until check() returns something truthy
async function waitFor(check, timeoutMs = 3000) {
  const start = Date.now();
  for (;;) {
    if (await check()) return true;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await sleep(50);
  }
}

const withKey = (req) => req.set('x-admin-key', KEY);

const createVehicle = (vehicleId) =>
  request(app).post('/api/vehicles').send({ vehicleId, plateNumber: 'wb 01 ab 1234' });

const ingest = (vehicleId, i) =>
  request(app)
    .post('/api/telemetry/ingest')
    .send({
      vehicleId,
      coordinates: [88.35, 22.55],
      speed: 40,
      timestamp: new Date(BASE_TIME + i * 1000).toISOString(),
    });

const bucketCount = (vehicleId) => TelemetryBucket.countDocuments({ vehicleId });
const seededFences = () => Geofence.countDocuments({ description: new RegExp(`^${SEED_MARK}`) });

const generate = (body) => withKey(request(app).post('/api/admin/vehicles/generate')).send(body);
const reset = (body) => withKey(request(app).post('/api/admin/reset')).send(body);
const startSim = (body) => withKey(request(app).post('/api/admin/simulator/start')).send(body);
const simStatus = async () => (await withKey(request(app).get('/api/admin/simulator/status'))).body.simulator;

async function cleanUp() {
  await Vehicle.deleteMany({ vehicleId: OWN });
  await TelemetryBucket.deleteMany({ vehicleId: OWN });
  await Alert.deleteMany({ vehicleId: OWN });
  await Geofence.deleteMany({ description: new RegExp(`^${SEED_MARK}`) }); // the test database holds nothing worth keeping
}

beforeAll(async () => {
  process.env.ADMIN_API_KEY = KEY;
  await connectDB();
  expect(mongoose.connection.readyState).toBe(1); // 1 = connected. If this fails, start MongoDB.
  await cleanUp();
});

beforeEach(cleanUp);

afterAll(async () => {
  simulatorService.stop();
  await sleep(500); // a simulator round that was already running may still be writing
  await cleanUp();
  await closeDB();
  delete process.env.ADMIN_API_KEY;
});

describe('admin key', () => {
  test('rejects a request without the key (401)', async () => {
    const res = await request(app).get('/api/admin/ping');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/Admin key required/);
  });

  test('rejects a wrong key (401)', async () => {
    const res = await request(app).get('/api/admin/ping').set('x-admin-key', 'wrong-key');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid admin key');
  });

  test('accepts the right key', async () => {
    const res = await withKey(request(app).get('/api/admin/ping'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, admin: true });
  });

  test('stays closed (503) when the server has no admin key configured', async () => {
    delete process.env.ADMIN_API_KEY;
    try {
      const res = await withKey(request(app).get('/api/admin/ping'));
      expect(res.status).toBe(503);
    } finally {
      process.env.ADMIN_API_KEY = KEY;
    }
  });
});

describe('DELETE /api/vehicles/:vehicleId', () => {
  test('needs the admin key: without it the vehicle stays', async () => {
    await createVehicle('TEST-DEL-A');

    const res = await request(app).delete('/api/vehicles/TEST-DEL-A');

    expect(res.status).toBe(401);
    expect(await Vehicle.countDocuments({ vehicleId: 'TEST-DEL-A' })).toBe(1);
  });

  test('returns 404 for a vehicle that does not exist', async () => {
    const res = await withKey(request(app).delete('/api/vehicles/TEST-NOPE'));
    expect(res.status).toBe(404);
    expect(typeof res.body.error).toBe('string');
  });

  test('deletes the vehicle but keeps its history by default', async () => {
    await createVehicle('TEST-DEL-B');
    await ingest('TEST-DEL-B', 0);
    await waitFor(async () => (await bucketCount('TEST-DEL-B')) > 0);

    const res = await withKey(request(app).delete('/api/vehicles/TEST-DEL-B'));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      deleted: 'TEST-DEL-B',
      historyDeleted: false,
      removed: { telemetryBuckets: 0, alerts: 0 },
    });
    expect(await Vehicle.countDocuments({ vehicleId: 'TEST-DEL-B' })).toBe(0);
    expect(await bucketCount('TEST-DEL-B')).toBeGreaterThan(0);
  });

  test('with deleteHistory=true it also removes the telemetry buckets and alerts', async () => {
    await createVehicle('TEST-DEL-C');
    await ingest('TEST-DEL-C', 0);
    await waitFor(async () => (await bucketCount('TEST-DEL-C')) > 0);
    await Alert.create({
      type: 'exit',
      vehicleId: 'TEST-DEL-C',
      geofenceId: new mongoose.Types.ObjectId(),
      geofenceName: 'TEST-ZONE',
      location: { type: 'Point', coordinates: [88.5, 22.55] },
      occurredAt: new Date(BASE_TIME),
    });

    const res = await withKey(request(app).delete('/api/vehicles/TEST-DEL-C?deleteHistory=true'));

    expect(res.status).toBe(200);
    expect(res.body.historyDeleted).toBe(true);
    expect(res.body.removed.alerts).toBe(1);
    expect(res.body.removed.telemetryBuckets).toBeGreaterThan(0);
    expect(await bucketCount('TEST-DEL-C')).toBe(0);
    expect(await Alert.countDocuments({ vehicleId: 'TEST-DEL-C' })).toBe(0);
  });
});

describe('POST /api/admin/vehicles/generate', () => {
  test('needs the admin key', async () => {
    const res = await request(app).post('/api/admin/vehicles/generate').send({ count: 2 });
    expect(res.status).toBe(401);
    expect(await Vehicle.countDocuments({ vehicleId: /^FLEET-/ })).toBe(0);
  });

  test.each([[0], [501], [2.5], ['5'], [undefined]])('rejects count %p with 400', async (count) => {
    const res = await generate({ count });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('count must be a whole number from 1 to 500');
  });

  test('rejects a trim value that is not true or false', async () => {
    const res = await generate({ count: 3, trim: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('trim must be true or false');
  });

  test('creates the sample vehicles, adds only the missing ones and keeps edits', async () => {
    const first = await generate({ count: 3 });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ success: true, requested: 3, created: 3, alreadyThere: 0, removed: 0 });
    expect(await Vehicle.countDocuments({ vehicleId: /^FLEET-/ })).toBe(3);

    await Vehicle.updateOne({ vehicleId: 'FLEET-001' }, { driverName: 'Changed Driver' });

    const second = await generate({ count: 5 });
    expect(second.body).toMatchObject({ created: 2, alreadyThere: 3, removed: 0 });
    expect(second.body.totalVehicles).toBe(await Vehicle.countDocuments());
    expect((await Vehicle.findOne({ vehicleId: 'FLEET-001' }).lean()).driverName).toBe('Changed Driver');
  });

  test('with trim it removes only the sample vehicles above the count', async () => {
    await createVehicle('TEST-KEEP');
    await generate({ count: 5 });

    const res = await generate({ count: 2, trim: true });

    expect(res.body).toMatchObject({ created: 0, alreadyThere: 2, removed: 3 });
    const ids = (await Vehicle.find({ vehicleId: OWN }).lean()).map((v) => v.vehicleId).sort();
    expect(ids).toEqual(['FLEET-001', 'FLEET-002', 'TEST-KEEP']);
  });

  test('does not bring back sample geofences that were deleted', async () => {
    expect(await seededFences()).toBe(0);
    await generate({ count: 3 });
    expect(await seededFences()).toBe(0);
  });
});

describe('POST /api/admin/reset', () => {
  test('needs the admin key', async () => {
    const res = await request(app).post('/api/admin/reset').send({ confirm: true });
    expect(res.status).toBe(401);
  });

  test.each([[{}], [{ confirm: 'yes' }], [{ confirm: false }]])('needs confirm: true (got %p)', async (body) => {
    await generate({ count: 2 });
    const res = await reset(body);
    expect(res.status).toBe(400);
    expect(await Vehicle.countDocuments({ vehicleId: /^FLEET-/ })).toBe(2); // nothing was removed
  });

  test('rejects a restore value that is not true or false', async () => {
    const res = await reset({ confirm: true, restore: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('restore must be true or false');
  });

  test('removes only the sample data, and can put the defaults back', async () => {
    await createVehicle('TEST-OWN');

    const restored = await reset({ confirm: true, restore: true });
    expect(restored.status).toBe(200);
    expect(restored.body.restored.vehicles.created).toBe(10);
    expect(restored.body.restored.geofences.created).toBe(3);
    expect(await seededFences()).toBe(3);

    const cleared = await reset({ confirm: true });
    expect(cleared.status).toBe(200);
    expect(cleared.body.restored).toBeNull();
    expect(cleared.body.removed).toMatchObject({ vehicles: 10, geofences: 3 });

    expect(await Vehicle.countDocuments({ vehicleId: /^FLEET-/ })).toBe(0);
    expect(await seededFences()).toBe(0);
    expect(await Vehicle.countDocuments({ vehicleId: 'TEST-OWN' })).toBe(1); // your own data is untouched
  });
});

describe('simulator routes', () => {
  afterEach(async () => {
    simulatorService.stop();
    await sleep(400); // a round that was already running may still finish
  });

  test.each([
    ['post', '/api/admin/simulator/start'],
    ['post', '/api/admin/simulator/stop'],
    ['get', '/api/admin/simulator/status'],
  ])('%s %s needs the admin key', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });

  test.each([
    [{ count: 0 }],
    [{ count: 501 }],
    [{ count: 2.5 }],
    [{ count: '5' }],
    [{ intervalMs: 100 }],
    [{ timeScale: 0 }],
  ])('rejects the options %p with 400 and does not start', async (options) => {
    await generate({ count: 2 });

    const res = await startSim(options);

    expect(res.status).toBe(400);
    expect((await simStatus()).running).toBe(false);
  });

  test('reports that it is stopped when it was never started', async () => {
    const res = await withKey(request(app).get('/api/admin/simulator/status'));
    expect(res.status).toBe(200);
    expect(res.body.simulator.running).toBe(false);
  });

  test('starts, stores readings for the registered vehicles, and stops', async () => {
    await generate({ count: 3 });

    const started = await startSim({ count: 3, intervalMs: 250 });
    expect(started.status).toBe(200);
    expect(started.body.simulator).toMatchObject({
      running: true,
      vehicles: 3,
      requested: 3,
      intervalMs: 250,
      failed: 0,
    });

    await waitFor(async () => (await simStatus()).sent > 0, 5000);
    await waitFor(async () => (await bucketCount('FLEET-001')) > 0);

    const stopped = await withKey(request(app).post('/api/admin/simulator/stop'));
    expect(stopped.body.simulator.running).toBe(false);

    await sleep(600); // a round that was already running may still finish
    const sentAfterStop = (await simStatus()).sent;
    await sleep(600);
    expect((await simStatus()).sent).toBe(sentAfterStop); // nothing more is sent
  });

  test('drives only as many vehicles as exist', async () => {
    await generate({ count: 2 });

    const res = await startSim({ count: 5, intervalMs: 250 });

    expect(res.body.simulator).toMatchObject({ vehicles: 2, requested: 5 });
  });

  test('stops driving a vehicle that was deleted', async () => {
    await generate({ count: 3 });
    await startSim({ count: 3, intervalMs: 250 });
    expect((await simStatus()).vehicles).toBe(3);

    const deleted = await withKey(request(app).delete('/api/vehicles/FLEET-003'));

    expect(deleted.status).toBe(200);
    expect((await simStatus()).vehicles).toBe(2);
  });
});