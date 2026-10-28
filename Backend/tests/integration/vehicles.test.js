// Backend/tests/integration/vehicles.test.js
// Supertest tests for /api/vehicles.
// Uses the fleetdash_test database (see tests/setup.js). All test data uses vehicle IDs starting with "TEST-".
const request = require('supertest');
const { app } = require('../../server');
const { connectDB, closeDB, mongoose } = require('../../src/config/db');
const Vehicle = require('../../src/models/Vehicle');
const TelemetryBucket = require('../../src/models/TelemetryBucket');

const TEST_IDS = /^TEST-/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits until check() returns something truthy (the vehicle's live state is updated just after the ingest response)
async function waitFor(check, timeoutMs = 3000) {
  const start = Date.now();
  for (;;) {
    if (await check()) return true;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await sleep(50);
  }
}

const createVehicle = (overrides = {}) =>
  request(app)
    .post('/api/vehicles')
    .send({ vehicleId: 'TEST-V1', plateNumber: 'wb 01 ab 1234', ...overrides });

const getVehicle = (vehicleId) => request(app).get(`/api/vehicles/${vehicleId}`);

async function cleanUp() {
  await Vehicle.deleteMany({ vehicleId: TEST_IDS });
  await TelemetryBucket.deleteMany({ vehicleId: TEST_IDS });
}

beforeAll(async () => {
  await connectDB();
  expect(mongoose.connection.readyState).toBe(1); // 1 = connected. If this fails, start MongoDB.
  await cleanUp();
});

afterAll(async () => {
  await cleanUp();
  await closeDB();
});

describe('POST /api/vehicles', () => {
  test('creates a vehicle and returns 201', async () => {
    const res = await createVehicle({
      vehicleId: 'TEST-CREATE',
      make: 'Tata',
      model: 'Prima',
      year: 2023,
      driverName: 'Ravi',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.vehicle).toMatchObject({
      vehicleId: 'TEST-CREATE',
      plateNumber: 'WB 01 AB 1234', // stored in capital letters
      make: 'Tata',
      model: 'Prima',
      year: 2023,
      driverName: 'Ravi',
      status: 'idle',
    });
  });

  test('fills in defaults for optional fields', async () => {
    const res = await createVehicle({ vehicleId: 'TEST-DEFAULTS' });

    expect(res.status).toBe(201);
    expect(res.body.vehicle).toMatchObject({
      make: 'Generic',
      model: 'Truck',
      year: 2024,
      driverName: 'Unassigned',
    });
  });

  test('rejects a duplicate vehicleId with 409', async () => {
    await createVehicle({ vehicleId: 'TEST-DUP' });
    const res = await createVehicle({ vehicleId: 'TEST-DUP' });

    expect(res.status).toBe(409);
    expect(typeof res.body.error).toBe('string');
    expect(await Vehicle.countDocuments({ vehicleId: 'TEST-DUP' })).toBe(1);
  });

  test.each([
    ['a missing vehicleId', { vehicleId: undefined }],
    ['a missing plateNumber', { vehicleId: 'TEST-BAD', plateNumber: undefined }],
  ])('rejects %s with 400', async (_name, overrides) => {
    const res = await createVehicle(overrides);

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  test('rejects an invalid year with 400 (not 500) and does not store it', async () => {
    const res = await createVehicle({ vehicleId: 'TEST-BADYEAR', year: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(await Vehicle.countDocuments({ vehicleId: 'TEST-BADYEAR' })).toBe(0);
  });
});

describe('GET /api/vehicles', () => {
  beforeAll(async () => {
    await createVehicle({ vehicleId: 'TEST-LIST-1' });
    await createVehicle({ vehicleId: 'TEST-LIST-2' });
    await createVehicle({ vehicleId: 'TEST-LIST-3' });
  });

  test('lists vehicles with paging information', async () => {
    const res = await request(app).get('/api/vehicles');

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(3);
    expect(res.body.page).toBe(1);
    expect(res.body.totalPages).toBeGreaterThanOrEqual(1);
    const ids = res.body.vehicles.map((v) => v.vehicleId);
    expect(ids).toEqual(expect.arrayContaining(['TEST-LIST-1', 'TEST-LIST-2', 'TEST-LIST-3']));
  });

  test('supports limit and page', async () => {
    const res = await request(app).get('/api/vehicles?limit=1&page=2');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.vehicles).toHaveLength(1);
  });

  test('filters by status', async () => {
    await request(app).put('/api/vehicles/TEST-LIST-2').send({ status: 'maintenance' });

    const res = await request(app).get('/api/vehicles?status=maintenance');

    expect(res.status).toBe(200);
    expect(res.body.vehicles.every((v) => v.status === 'maintenance')).toBe(true);
    expect(res.body.vehicles.map((v) => v.vehicleId)).toContain('TEST-LIST-2');
  });

  test.each([
    ['a non-numeric limit', '?limit=abc'],
    ['a negative page', '?page=-5'],
    ['a zero limit', '?limit=0'],
    ['a huge limit', '?limit=100000'],
  ])('handles %s without crashing', async (_name, query) => {
    const res = await request(app).get(`/api/vehicles${query}`);

    expect(res.status).toBe(200);
    expect(res.body.page).toBeGreaterThanOrEqual(1);
    expect(res.body.vehicles.length).toBeLessThanOrEqual(500);
  });
});

describe('GET /api/vehicles/:vehicleId', () => {
  test('returns one vehicle', async () => {
    await createVehicle({ vehicleId: 'TEST-ONE' });

    const res = await getVehicle('TEST-ONE');

    expect(res.status).toBe(200);
    expect(res.body.vehicle.vehicleId).toBe('TEST-ONE');
  });

  test('returns 404 for an unknown vehicle', async () => {
    const res = await getVehicle('TEST-NOBODY');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/vehicles/:vehicleId', () => {
  beforeAll(async () => {
    await createVehicle({ vehicleId: 'TEST-EDIT' });
  });

  test('updates driver and status', async () => {
    const res = await request(app)
      .put('/api/vehicles/TEST-EDIT')
      .send({ driverName: 'Anita', status: 'maintenance' });

    expect(res.status).toBe(200);
    expect(res.body.vehicle).toMatchObject({ vehicleId: 'TEST-EDIT', driverName: 'Anita', status: 'maintenance' });

    const stored = await getVehicle('TEST-EDIT');
    expect(stored.body.vehicle.driverName).toBe('Anita');
  });

  test('rejects an invalid status with 400 (not 500)', async () => {
    const res = await request(app).put('/api/vehicles/TEST-EDIT').send({ status: 'flying' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('returns 404 for an unknown vehicle', async () => {
    const res = await request(app).put('/api/vehicles/TEST-NOBODY').send({ driverName: 'x' });
    expect(res.status).toBe(404);
  });

  test('cannot overwrite telemetry through this endpoint', async () => {
    const res = await request(app)
      .put('/api/vehicles/TEST-EDIT')
      .send({ lastTelemetry: { speed: 999 }, lastKnownLocation: { type: 'Point', coordinates: [1, 1] } });

    expect(res.status).toBe(200);
    expect(res.body.vehicle.lastTelemetry.speed).toBe(0);
    expect(res.body.vehicle.lastKnownLocation.coordinates).toEqual([0, 0]);
  });

  test('cannot change the vehicleId', async () => {
    const res = await request(app).put('/api/vehicles/TEST-EDIT').send({ vehicleId: 'TEST-RENAMED' });

    expect(res.status).toBe(200);
    expect(res.body.vehicle.vehicleId).toBe('TEST-EDIT');
    expect(await Vehicle.countDocuments({ vehicleId: 'TEST-RENAMED' })).toBe(0);
  });
});

describe('live state from telemetry', () => {
  beforeAll(async () => {
    await createVehicle({ vehicleId: 'TEST-LIVE' });
  });

  const ingest = (body) => request(app).post('/api/telemetry/ingest').send({ vehicleId: 'TEST-LIVE', ...body });

  test('a moving reading updates position, speed and status to in_transit', async () => {
    const res = await ingest({ coordinates: [88.36, 22.57], speed: 50, fuelLevel: 80 });
    expect(res.status).toBe(201);

    await waitFor(async () => (await getVehicle('TEST-LIVE')).body.vehicle.status === 'in_transit');

    const { vehicle } = (await getVehicle('TEST-LIVE')).body;
    expect(vehicle.lastKnownLocation.coordinates).toEqual([88.36, 22.57]);
    expect(vehicle.lastTelemetry.speed).toBe(50);
    expect(vehicle.lastTelemetry.fuelLevel).toBe(80);
  });

  test('a stopped reading with the engine off sets the status to offline', async () => {
    await ingest({ coordinates: [88.37, 22.58], speed: 0, ignition: false });

    await waitFor(async () => (await getVehicle('TEST-LIVE')).body.vehicle.status === 'offline');
  });

  test('a stopped reading with the engine on sets the status to idle', async () => {
    await ingest({ coordinates: [88.37, 22.58], speed: 0, ignition: true });

    await waitFor(async () => (await getVehicle('TEST-LIVE')).body.vehicle.status === 'idle');
  });
});