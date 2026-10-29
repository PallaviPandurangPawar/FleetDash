// Backend/tests/integration/geofences.test.js
// Supertest tests for /api/geofences and /api/alerts, plus end-to-end geofence breach detection.
// Uses the fleetdash_test database (see tests/setup.js). All test data starts with "TEST-".
const request = require('supertest');
const { app } = require('../../server');
const { connectDB, closeDB, mongoose } = require('../../src/config/db');
const Geofence = require('../../src/models/Geofence');
const Alert = require('../../src/models/Alert');
const TelemetryBucket = require('../../src/models/TelemetryBucket');
const geofenceService = require('../../src/services/geofenceService');

const TEST_IDS = /^TEST-/;
const BASE_TIME = Date.UTC(2026, 0, 1, 12, 0, 0);
const UNKNOWN_ID = '507f1f77bcf86cd799439011'; // a valid ObjectId that does not exist

// A square zone. [88.35, 22.55] is inside it, [88.50, 22.55] is outside.
const SQUARE = [[[88.3, 22.5], [88.4, 22.5], [88.4, 22.6], [88.3, 22.6], [88.3, 22.5]]];
const INSIDE = [88.35, 22.55];
const OUTSIDE = [88.5, 22.55];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits until check() returns something truthy (alerts are saved a moment after the ingest response)
async function waitFor(check, timeoutMs = 3000) {
  const start = Date.now();
  for (;;) {
    if (await check()) return true;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await sleep(50);
  }
}

// CRUD test geofences are limited to a vehicle that never exists, so they cannot affect other tests
const createFence = (overrides = {}) =>
  request(app)
    .post('/api/geofences')
    .send({ name: 'TEST-FENCE', coordinates: SQUARE, vehicleIds: ['TEST-NONE'], ...overrides });

const sendPosition = (vehicleId, coordinates, i) =>
  request(app)
    .post('/api/telemetry/ingest')
    .send({
      vehicleId,
      coordinates,
      speed: 40,
      timestamp: new Date(BASE_TIME + i * 1000).toISOString(),
    });

const alertsFor = (vehicleId, query = '') => request(app).get(`/api/alerts?vehicleId=${vehicleId}${query}`);

async function cleanUp() {
  await Geofence.deleteMany({ name: TEST_IDS });
  await Alert.deleteMany({ vehicleId: TEST_IDS });
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

describe('POST /api/geofences', () => {
  test('creates a geofence and returns 201', async () => {
    const res = await createFence({ name: 'TEST-CREATE', description: 'created by a test' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.geofence).toMatchObject({ name: 'TEST-CREATE', description: 'created by a test', active: true });
    expect(res.body.geofence.polygon.coordinates).toEqual(SQUARE);
    expect(res.body.geofence._id).toBeDefined();
  });

  test.each([
    ['a missing name', { name: undefined }],
    ['coordinates that are not an array', { coordinates: 'nope' }],
    ['a ring that is not closed', { coordinates: [[[88.3, 22.5], [88.4, 22.5], [88.4, 22.6], [88.3, 22.6]]] }],
    ['a ring with too few points', { coordinates: [[[88.3, 22.5], [88.4, 22.5], [88.3, 22.5]]] }],
    ['a longitude above 180', { coordinates: [[[200, 0], [201, 0], [201, 1], [200, 0]]] }],
  ])('rejects %s with 400', async (_name, overrides) => {
    const res = await createFence({ name: 'TEST-BAD', ...overrides });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  test('rejected geofences are never stored', async () => {
    expect(await Geofence.countDocuments({ name: 'TEST-BAD' })).toBe(0);
  });
});

describe('GET /api/geofences', () => {
  test('lists geofences and filters by active', async () => {
    await createFence({ name: 'TEST-LIST-ACTIVE' });
    await createFence({ name: 'TEST-LIST-INACTIVE', active: false });

    const all = await request(app).get('/api/geofences');
    expect(all.status).toBe(200);
    expect(all.body.count).toBe(all.body.geofences.length);
    const names = all.body.geofences.map((g) => g.name);
    expect(names).toEqual(expect.arrayContaining(['TEST-LIST-ACTIVE', 'TEST-LIST-INACTIVE']));

    const inactive = await request(app).get('/api/geofences?active=false');
    expect(inactive.body.geofences.every((g) => g.active === false)).toBe(true);
    expect(inactive.body.geofences.map((g) => g.name)).toContain('TEST-LIST-INACTIVE');
    expect(inactive.body.geofences.map((g) => g.name)).not.toContain('TEST-LIST-ACTIVE');

    const active = await request(app).get('/api/geofences?active=true');
    expect(active.body.geofences.every((g) => g.active === true)).toBe(true);
    expect(active.body.geofences.map((g) => g.name)).not.toContain('TEST-LIST-INACTIVE');
  });
});

describe('GET, PUT and DELETE /api/geofences/:id', () => {
  let id;

  beforeAll(async () => {
    const res = await createFence({ name: 'TEST-ITEM' });
    id = res.body.geofence._id;
  });

  test('GET returns one geofence', async () => {
    const res = await request(app).get(`/api/geofences/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.geofence._id).toBe(id);
    expect(res.body.geofence.name).toBe('TEST-ITEM');
  });

  test('GET with an invalid id returns 400', async () => {
    const res = await request(app).get('/api/geofences/not-an-id');
    expect(res.status).toBe(400);
  });

  test('GET with an unknown id returns 404', async () => {
    const res = await request(app).get(`/api/geofences/${UNKNOWN_ID}`);
    expect(res.status).toBe(404);
  });

  test('PUT updates name, active flag and polygon', async () => {
    const newSquare = [[[88.1, 22.1], [88.2, 22.1], [88.2, 22.2], [88.1, 22.2], [88.1, 22.1]]];
    const res = await request(app)
      .put(`/api/geofences/${id}`)
      .send({ name: 'TEST-ITEM-RENAMED', active: false, coordinates: newSquare });

    expect(res.status).toBe(200);
    expect(res.body.geofence.name).toBe('TEST-ITEM-RENAMED');
    expect(res.body.geofence.active).toBe(false);
    expect(res.body.geofence.polygon.coordinates).toEqual(newSquare);
  });

  test('PUT with an invalid polygon returns 400 and keeps the old one', async () => {
    const res = await request(app).put(`/api/geofences/${id}`).send({ coordinates: 'nope' });
    expect(res.status).toBe(400);

    const stored = await Geofence.findById(id).lean();
    expect(stored.polygon.coordinates[0][0]).toEqual([88.1, 22.1]);
  });

  test('PUT with an invalid or unknown id returns 400 or 404', async () => {
    expect((await request(app).put('/api/geofences/not-an-id').send({ name: 'x' })).status).toBe(400);
    expect((await request(app).put(`/api/geofences/${UNKNOWN_ID}`).send({ name: 'x' })).status).toBe(404);
  });

  test('DELETE removes the geofence, and deleting again returns 404', async () => {
    const res = await request(app).delete(`/api/geofences/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(id);

    expect((await request(app).get(`/api/geofences/${id}`)).status).toBe(404);
    expect((await request(app).delete(`/api/geofences/${id}`)).status).toBe(404);
  });

  test('DELETE with an invalid id returns 400', async () => {
    const res = await request(app).delete('/api/geofences/not-an-id');
    expect(res.status).toBe(400);
  });
});

describe('geofence breach detection (end to end)', () => {
  let fenceId;

  beforeAll(async () => {
    const res = await createFence({ name: 'TEST-BREACH-ZONE', vehicleIds: ['TEST-GEO'] });
    fenceId = res.body.geofence._id;
    await geofenceService.refresh(); // load the new geofence into memory right away
  });

  test('the first position only teaches the service where the vehicle is (no alert)', async () => {
    const res = await sendPosition('TEST-GEO', INSIDE, 0);
    expect(res.status).toBe(201);

    await sleep(200);
    expect((await alertsFor('TEST-GEO')).body.total).toBe(0);
  });

  test('leaving the zone creates an exit alert', async () => {
    await sendPosition('TEST-GEO', OUTSIDE, 1);
    await waitFor(async () => (await alertsFor('TEST-GEO')).body.total === 1);

    const res = await alertsFor('TEST-GEO');
    const alert = res.body.alerts[0];
    expect(alert).toMatchObject({
      type: 'exit',
      vehicleId: 'TEST-GEO',
      geofenceId: fenceId,
      geofenceName: 'TEST-BREACH-ZONE',
      acknowledged: false,
    });
    expect(alert.location.coordinates).toEqual(OUTSIDE);
  });

  test('coming back creates an enter alert', async () => {
    await sendPosition('TEST-GEO', INSIDE, 2);
    await waitFor(async () => (await alertsFor('TEST-GEO')).body.total === 2);

    const res = await alertsFor('TEST-GEO');
    expect(res.body.alerts.map((a) => a.type).sort()).toEqual(['enter', 'exit']);
  });

  test('a vehicle that is not assigned to the geofence is ignored', async () => {
    await sendPosition('TEST-GEO-OTHER', INSIDE, 0);
    await sendPosition('TEST-GEO-OTHER', OUTSIDE, 1);

    await sleep(250);
    expect((await alertsFor('TEST-GEO-OTHER')).body.total).toBe(0);
  });

  test('an inactive geofence creates no alerts', async () => {
    await request(app).put(`/api/geofences/${fenceId}`).send({ active: false });
    await geofenceService.refresh();

    await sendPosition('TEST-GEO', OUTSIDE, 3);
    await sendPosition('TEST-GEO', INSIDE, 4);

    await sleep(250);
    expect((await alertsFor('TEST-GEO')).body.total).toBe(2); // still only the two from before
  });
});

describe('/api/alerts', () => {
  test('filters by type', async () => {
    const exits = await alertsFor('TEST-GEO', '&type=exit');
    expect(exits.body.total).toBe(1);
    expect(exits.body.alerts[0].type).toBe('exit');

    const enters = await alertsFor('TEST-GEO', '&type=enter');
    expect(enters.body.total).toBe(1);
  });

  test('supports paging', async () => {
    const res = await alertsFor('TEST-GEO', '&limit=1&page=2');

    expect(res.body.total).toBe(2);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.page).toBe(2);
    expect(res.body.alerts).toHaveLength(1);
  });

  test('summary counts alerts', async () => {
    const res = await request(app).get('/api/alerts/summary');

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(res.body.unacknowledged).toBeGreaterThanOrEqual(2);
    expect(res.body.exits).toBeGreaterThanOrEqual(1);
    expect(res.body.enters).toBeGreaterThanOrEqual(1);
  });

  test('acknowledges one alert', async () => {
    const list = await alertsFor('TEST-GEO', '&type=exit');
    const id = list.body.alerts[0]._id;

    const res = await request(app).patch(`/api/alerts/${id}/acknowledge`);

    expect(res.status).toBe(200);
    expect(res.body.alert.acknowledged).toBe(true);
  });

  test('acknowledge with an invalid or unknown id returns 400 or 404', async () => {
    expect((await request(app).patch('/api/alerts/not-an-id/acknowledge')).status).toBe(400);
    expect((await request(app).patch(`/api/alerts/${UNKNOWN_ID}/acknowledge`)).status).toBe(404);
  });

  test('acknowledge-all for one vehicle acknowledges the rest', async () => {
    const res = await request(app).post('/api/alerts/acknowledge-all').send({ vehicleId: 'TEST-GEO' });

    expect(res.status).toBe(200);
    expect(res.body.acknowledged).toBe(1); // the enter alert; the exit alert was acknowledged above

    const open = await alertsFor('TEST-GEO', '&acknowledged=false');
    expect(open.body.total).toBe(0);
  });
});


const ingestionService = require('../../src/services/ingestionService');

describe('geofence checks for batch uploads and queued readings', () => {
  beforeAll(async () => {
    const res = await createFence({
      name: 'TEST-BATCH-ZONE',
      vehicleIds: ['TEST-GEO-BATCH', 'TEST-GEO-QUEUE', 'TEST-GEO-OLD'],
    });
    expect(res.status).toBe(201);
    await geofenceService.refresh(); // load the new geofence into memory right away
  });

  // points is a list of [coordinates, seconds after the start]
  const sendBatch = (vehicleId, points) =>
    request(app)
      .post('/api/telemetry/ingest-batch')
      .send({
        vehicleId,
        readings: points.map(([coordinates, i]) => ({
          coordinates,
          speed: 40,
          timestamp: new Date(BASE_TIME + i * 1000).toISOString(),
        })),
      });

  test('a quick exit and re-entry inside one batch upload is detected', async () => {
    const res = await sendBatch('TEST-GEO-BATCH', [[INSIDE, 0], [OUTSIDE, 1], [INSIDE, 2]]);
    expect(res.status).toBe(201);

    await waitFor(async () => (await alertsFor('TEST-GEO-BATCH')).body.total === 2);

    const { alerts } = (await alertsFor('TEST-GEO-BATCH')).body;
    expect(alerts.map((a) => a.type).sort()).toEqual(['enter', 'exit']);
  });

  test('readings that arrive in the same moment are all checked, not only the last one', async () => {
    const raw = (coordinates, i) => ({
      coordinates,
      speed: 40,
      timestamp: new Date(BASE_TIME + i * 1000).toISOString(),
    });

    // All three are queued in the same moment, so they are written and checked as one group
    await Promise.all([
      ingestionService.add('TEST-GEO-QUEUE', raw(INSIDE, 0)),
      ingestionService.add('TEST-GEO-QUEUE', raw(OUTSIDE, 1)),
      ingestionService.add('TEST-GEO-QUEUE', raw(INSIDE, 2)),
    ]);

    await waitFor(async () => (await alertsFor('TEST-GEO-QUEUE')).body.total === 2);

    const { alerts } = (await alertsFor('TEST-GEO-QUEUE')).body;
    expect(alerts.map((a) => a.type).sort()).toEqual(['enter', 'exit']);
  });

  test('an older reading that arrives late does not turn the vehicle state back', async () => {
    const id = 'TEST-GEO-OLD';
    await sendPosition(id, INSIDE, 10); // the service learns the vehicle is inside
    await sendPosition(id, OUTSIDE, 20); // it leaves
    await waitFor(async () => (await alertsFor(id)).body.total === 1);

    const late = await sendBatch(id, [[INSIDE, 5]]); // older than what was already checked
    expect(late.status).toBe(201);
    await sendPosition(id, OUTSIDE, 30); // still outside: no change

    await sleep(300);
    expect((await alertsFor(id)).body.total).toBe(1); // still only the exit
  });
});