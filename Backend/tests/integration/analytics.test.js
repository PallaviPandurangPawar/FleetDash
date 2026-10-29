// Backend/tests/integration/analytics.test.js
// Supertest tests for /api/analytics (trip summary, geofence check, worker stats).
// Uses the fleetdash_test database (see tests/setup.js). Test data starts with "TEST-".
const request = require('supertest');
const { app } = require('../../server');
const { connectDB, closeDB, mongoose } = require('../../src/config/db');
const TelemetryBucket = require('../../src/models/TelemetryBucket');

const TEST_IDS = /^TEST-/;
const BASE = Date.UTC(2026, 0, 1, 12, 0, 0);
const MINUTE = 60 * 1000;
const SQUARE = [[88.3, 22.5], [88.4, 22.5], [88.4, 22.6], [88.3, 22.6], [88.3, 22.5]];
const TINY_SQUARE = [[88.34, 22.54], [88.355, 22.54], [88.355, 22.555], [88.34, 22.555], [88.34, 22.54]];

// Reading i minutes after the start, moving north by 0.01 degrees (about 1.11 km) each time
const reading = (i, speed, extra = {}) => ({
  coordinates: [88, 22 + i * 0.01],
  speed,
  timestamp: new Date(BASE + i * MINUTE).toISOString(),
  ...extra,
});

const loadTrip = (vehicleId, speeds) =>
  request(app)
    .post('/api/telemetry/ingest-batch')
    .send({ vehicleId, readings: speeds.map((speed, i) => reading(i, speed)) });

const summary = (vehicleId, query = '') => request(app).get(`/api/analytics/trip-summary/${vehicleId}${query}`);
const geofenceCheck = (body) => request(app).post('/api/analytics/geofence-check').send(body);
const minutes = (n) => new Date(BASE + n * MINUTE).toISOString();

beforeAll(async () => {
  await connectDB();
  expect(mongoose.connection.readyState).toBe(1); // 1 = connected. If this fails, start MongoDB.
  await TelemetryBucket.deleteMany({ vehicleId: TEST_IDS });

  expect((await loadTrip('TEST-AN-TRIP', [60, 85, 90, 70])).status).toBe(201);
  expect((await loadTrip('TEST-AN-BRAKE', [80, 40, 40])).status).toBe(201);

  // Three positions: two inside the square, one outside
  const geoReadings = [
    reading(0, 30, { coordinates: [88.35, 22.55] }),
    reading(1, 30, { coordinates: [88.36, 22.56] }),
    reading(2, 30, { coordinates: [88.5, 22.55] }),
  ];
  const res = await request(app).post('/api/telemetry/ingest-batch').send({ vehicleId: 'TEST-AN-GEO', readings: geoReadings });
  expect(res.status).toBe(201);
});

afterAll(async () => {
  await TelemetryBucket.deleteMany({ vehicleId: TEST_IDS });
  await closeDB();
});

describe('GET /api/analytics/worker-stats', () => {
  test('reports the worker pool and process information', async () => {
    const res = await request(app).get('/api/analytics/worker-stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const pool = res.body.workerPool;
    expect(pool.poolSize).toBeGreaterThan(0);
    expect(pool.activeWorkers + pool.idleWorkers).toBe(pool.poolSize);
    expect(typeof pool.pendingTasks).toBe('number');
    expect(typeof pool.completedTasks).toBe('number');
    expect(typeof res.body.memoryUsage.heapUsed).toBe('number');
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

describe('GET /api/analytics/trip-summary/:vehicleId', () => {
  test('computes the trip analytics in a worker thread', async () => {
    const res = await summary('TEST-AN-TRIP');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, vehicleId: 'TEST-AN-TRIP', processedBy: 'worker_threads' });
    expect(typeof res.body.executionTimeMs).toBe('number');
    expect(res.body.analytics).toEqual({
      totalPoints: 4,
      totalDistanceKm: 3.34, // three legs of about 1.11 km
      durationMinutes: 3,
      avgSpeed: 76.3,
      maxSpeed: 90,
      speedingCount: 2, // 85 and 90 are above the default limit of 80
      harshBrakingCount: 0,
      idleDurationMinutes: 0,
      safetyScore: 96,
    });
  });

  test('speedLimit changes what counts as speeding', async () => {
    const res = await summary('TEST-AN-TRIP', '?speedLimit=65');

    expect(res.body.analytics.speedingCount).toBe(3);
    expect(res.body.analytics.safetyScore).toBe(94);
  });

  test('counts harsh braking, and harshBrakeThreshold changes the sensitivity', async () => {
    const normal = await summary('TEST-AN-BRAKE');
    expect(normal.body.analytics.harshBrakingCount).toBe(1);
    expect(normal.body.analytics.safetyScore).toBe(95);

    const relaxed = await summary('TEST-AN-BRAKE', '?harshBrakeThreshold=50');
    expect(relaxed.body.analytics.harshBrakingCount).toBe(0);
    expect(relaxed.body.analytics.safetyScore).toBe(100);
  });

  test('startTime and endTime select a time window', async () => {
    const res = await summary('TEST-AN-TRIP', `?startTime=${minutes(1)}&endTime=${minutes(2)}`);
    expect(res.body.analytics.totalPoints).toBe(2);
  });

  test('works with only an endTime (regression test for a crash)', async () => {
    const res = await summary('TEST-AN-TRIP', `?endTime=${minutes(1)}`);

    expect(res.status).toBe(200);
    expect(res.body.analytics.totalPoints).toBe(2);
  });

  test('works with only a startTime', async () => {
    const res = await summary('TEST-AN-TRIP', `?startTime=${minutes(2)}`);

    expect(res.status).toBe(200);
    expect(res.body.analytics.totalPoints).toBe(2);
  });

  test('limit keeps the newest readings', async () => {
    const res = await summary('TEST-AN-TRIP', '?limit=2');

    expect(res.body.analytics.totalPoints).toBe(2);
    expect(res.body.analytics.avgSpeed).toBe(80); // the last two speeds are 90 and 70
  });

  test.each([
    ['a non-numeric limit', '?limit=abc'],
    ['a zero limit', '?limit=0'],
    ['a negative limit', '?limit=-5'],
  ])('falls back to the default limit for %s', async (_name, query) => {
    const res = await summary('TEST-AN-TRIP', query);

    expect(res.status).toBe(200);
    expect(res.body.analytics.totalPoints).toBe(4);
  });

  test('an unknown vehicle returns a message and no analytics', async () => {
    const res = await summary('TEST-AN-NOBODY');

    expect(res.status).toBe(200);
    expect(res.body.analytics).toBeNull();
    expect(res.body.message).toContain('No telemetry');
  });
});

describe('POST /api/analytics/geofence-check', () => {
  test('finds the readings that are inside a geofence', async () => {
    const res = await geofenceCheck({ vehicleId: 'TEST-AN-GEO', geofences: [{ name: 'ZONE-A', polygon: SQUARE }] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, vehicleId: 'TEST-AN-GEO', processedBy: 'worker_threads' });
    expect(res.body.totalBreachesFound).toBe(2);
    expect(res.body.breaches.map((b) => b.geofenceName)).toEqual(['ZONE-A', 'ZONE-A']);
    expect(res.body.breaches[0].coordinates).toEqual([88.35, 22.55]);
    expect(res.body.breaches[0].speed).toBe(30);
  });

  test('checks several geofences at once', async () => {
    const res = await geofenceCheck({
      vehicleId: 'TEST-AN-GEO',
      geofences: [
        { name: 'ZONE-A', polygon: SQUARE },
        { name: 'ZONE-B', polygon: TINY_SQUARE },
      ],
    });

    expect(res.body.breaches.map((b) => b.geofenceName)).toEqual(['ZONE-A', 'ZONE-A', 'ZONE-B']);
  });

  test('an unknown vehicle has no breaches', async () => {
    const res = await geofenceCheck({ vehicleId: 'TEST-AN-NOBODY', geofences: [{ name: 'ZONE-A', polygon: SQUARE }] });

    expect(res.status).toBe(200);
    expect(res.body.totalBreachesFound).toBe(0);
    expect(res.body.breaches).toEqual([]);
  });

  test.each([
    ['a missing vehicleId', { geofences: [{ name: 'A', polygon: SQUARE }] }],
    ['geofences that are not an array', { vehicleId: 'TEST-AN-GEO', geofences: 'nope' }],
    ['an empty geofences array', { vehicleId: 'TEST-AN-GEO', geofences: [] }],
    ['a geofence without a name', { vehicleId: 'TEST-AN-GEO', geofences: [{ polygon: SQUARE }] }],
    ['a geofence without a polygon', { vehicleId: 'TEST-AN-GEO', geofences: [{ name: 'A' }] }],
    ['a polygon with only two points', { vehicleId: 'TEST-AN-GEO', geofences: [{ name: 'A', polygon: [[88.3, 22.5], [88.4, 22.5]] }] }],
    ['a polygon with positions that are not numbers', { vehicleId: 'TEST-AN-GEO', geofences: [{ name: 'A', polygon: [['x', 'y'], [1, 2], [3, 4]] }] }],
  ])('rejects %s with 400 (not 500)', async (_name, body) => {
    const res = await geofenceCheck(body);

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });
});