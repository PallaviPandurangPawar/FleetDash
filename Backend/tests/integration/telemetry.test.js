// Backend/tests/integration/telemetry.test.js
// Supertest tests for /api/telemetry.
// Uses the fleetdash_test database (see tests/setup.js). All test data uses vehicle IDs starting with "TEST-".
const request = require('supertest');
const { app } = require('../../server');
const { connectDB, closeDB, mongoose } = require('../../src/config/db');
const TelemetryBucket = require('../../src/models/TelemetryBucket');
const config = require('../../src/config/config');
const { MAX_BATCH_SIZE } = require('../../src/middlewares/validateTelemetry');

const TEST_IDS = /^TEST-/;
const BASE_TIME = Date.UTC(2026, 0, 1, 12, 0, 0);

// A valid reading; i shifts position, speed and time so readings are distinguishable
const reading = (i = 0, extra = {}) => ({
  coordinates: [88.36 + i * 0.001, 22.57],
  speed: 30 + i,
  timestamp: new Date(BASE_TIME + i * 1000).toISOString(),
  ...extra,
});

const postIngest = (body) => request(app).post('/api/telemetry/ingest').send(body);
const postBatch = (body) => request(app).post('/api/telemetry/ingest-batch').send(body);

beforeAll(async () => {
  await connectDB();
  expect(mongoose.connection.readyState).toBe(1); // 1 = connected. If this fails, start MongoDB.
  await TelemetryBucket.deleteMany({ vehicleId: TEST_IDS });
});

afterAll(async () => {
  await TelemetryBucket.deleteMany({ vehicleId: TEST_IDS });
  await closeDB();
});

describe('GET /api/health', () => {
  test('reports the service as ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('POST /api/telemetry/ingest', () => {
  test('stores a valid reading and returns 201', async () => {
    const res = await postIngest({ vehicleId: 'TEST-SINGLE', ...reading(0) });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      vehicleId: 'TEST-SINGLE',
      bucketCount: 1,
      isBucketFull: false,
    });
    expect(res.body.bucketId).toBeDefined();
  });

  test.each([
    ['longitude above 180', { vehicleId: 'TEST-BAD', coordinates: [200, 22.5] }],
    ['latitude above 90', { vehicleId: 'TEST-BAD', coordinates: [88.3, 95] }],
    ['a missing vehicleId', { coordinates: [88.3, 22.5] }],
    ['a vehicleId that is not a string', { vehicleId: 12345, coordinates: [88.3, 22.5] }],
    ['a vehicleId longer than 16 characters', { vehicleId: 'TEST-' + 'X'.repeat(12), coordinates: [88.3, 22.5] }],
    ['a vehicleId with illegal characters', { vehicleId: 'TEST 01', coordinates: [88.3, 22.5] }],
    ['missing coordinates', { vehicleId: 'TEST-BAD' }],
    ['coordinates with three values', { vehicleId: 'TEST-BAD', coordinates: [1, 2, 3] }],
    ['a negative speed', { vehicleId: 'TEST-BAD', coordinates: [88.3, 22.5], speed: -5 }],
    ['an invalid timestamp', { vehicleId: 'TEST-BAD', coordinates: [88.3, 22.5], timestamp: 'not-a-date' }],
  ])('rejects %s with 400', async (_name, body) => {
    const res = await postIngest(body);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.error).toBe('string');
  });

  test('rejected readings are never stored', async () => {
    expect(await TelemetryBucket.countDocuments({ vehicleId: 'TEST-BAD' })).toBe(0);
  });

  test('malformed JSON returns 400 without leaking a stack trace', async () => {
    const res = await request(app)
      .post('/api/telemetry/ingest')
      .set('Content-Type', 'application/json')
      .send('{bad');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.status).toBe(400);
    expect(res.body.error.stack).toBeUndefined();
  });

  test('concurrent readings for one vehicle share one bucket (no duplicate buckets)', async () => {
    const responses = await Promise.all(
      [0, 1, 2, 3, 4].map((i) => postIngest({ vehicleId: 'TEST-GROUP', ...reading(i) }))
    );
    responses.forEach((res) => expect(res.status).toBe(201));

    const stats = await request(app).get('/api/telemetry/TEST-GROUP/bucket-stats');
    expect(stats.body.bucketPatternStats.totalBuckets).toBe(1);
    expect(stats.body.bucketPatternStats.totalReadings).toBe(5);
  });
});

describe('POST /api/telemetry/ingest-batch', () => {
  test('ingests a valid batch', async () => {
    const res = await postBatch({ vehicleId: 'TEST-BATCH', readings: [reading(0), reading(1), reading(2)] });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.ingestedCount).toBe(3);
    expect(res.body.rejectedCount).toBe(0);
    expect(res.body.buckets).toHaveLength(1);
  });

  test('skips invalid readings and reports how many were rejected', async () => {
    const res = await postBatch({
      vehicleId: 'TEST-MIXED',
      readings: [reading(0), { coordinates: [500, 500] }, reading(1)],
    });

    expect(res.status).toBe(201);
    expect(res.body.ingestedCount).toBe(2);
    expect(res.body.rejectedCount).toBe(1);
  });

  test('spills into new buckets when full (large batch is parsed in a worker thread)', async () => {
    const total = config.bucketMaxSize * 2 + 10;
    const readings = Array.from({ length: total }, (_, i) => reading(i));

    const res = await postBatch({ vehicleId: 'TEST-BIGBATCH', readings });

    expect(res.status).toBe(201);
    expect(res.body.ingestedCount).toBe(total);
    expect(res.body.buckets).toHaveLength(3);
    expect(res.body.buckets.reduce((sum, b) => sum + b.added, 0)).toBe(total);

    const stats = await request(app).get('/api/telemetry/TEST-BIGBATCH/bucket-stats');
    expect(stats.body.bucketPatternStats.totalBuckets).toBe(3);
    expect(stats.body.bucketPatternStats.totalReadings).toBe(total);
  });

  test.each([
    ['a missing vehicleId', { readings: [reading(0)] }],
    ['a vehicleId longer than 16 characters', { vehicleId: 'TEST-' + 'X'.repeat(12), readings: [reading(0)] }],
    ['readings that are not an array', { vehicleId: 'TEST-BAD', readings: 'nope' }],
    ['an empty readings array', { vehicleId: 'TEST-BAD', readings: [] }],
  ])('rejects %s with 400', async (_name, body) => {
    const res = await postBatch(body);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('rejects a batch larger than MAX_BATCH_SIZE', async () => {
    const readings = Array.from({ length: MAX_BATCH_SIZE + 1 }, () => ({ coordinates: [88.3, 22.5] }));
    const res = await postBatch({ vehicleId: 'TEST-HUGE', readings });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain(String(MAX_BATCH_SIZE));
  });
});

describe('GET /api/telemetry/:vehicleId', () => {
  test('returns stored readings in time order', async () => {
    // Sent out of order on purpose
    await postBatch({ vehicleId: 'TEST-HISTORY', readings: [reading(2), reading(0), reading(1)] });

    const res = await request(app).get('/api/telemetry/TEST-HISTORY');

    expect(res.status).toBe(200);
    expect(res.body.vehicleId).toBe('TEST-HISTORY');
    expect(res.body.count).toBe(3);
    expect(res.body.readings.map((r) => r.speed)).toEqual([30, 31, 32]);
  });

  test('limit returns only the newest readings', async () => {
    await postBatch({ vehicleId: 'TEST-LIMIT', readings: [0, 1, 2, 3, 4].map((i) => reading(i)) });

    const res = await request(app).get('/api/telemetry/TEST-LIMIT?limit=2');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.readings.map((r) => r.speed)).toEqual([33, 34]);
  });

  test('an unknown vehicle returns an empty list', async () => {
    const res = await request(app).get('/api/telemetry/TEST-NOBODY');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.readings).toEqual([]);
  });
});

describe('GET /api/telemetry/:vehicleId/bucket-stats', () => {
  test('returns totals for a vehicle', async () => {
    const res = await request(app).get('/api/telemetry/TEST-HISTORY/bucket-stats');

    expect(res.status).toBe(200);
    expect(res.body.bucketPatternStats.totalReadings).toBe(3);
    expect(res.body.bucketPatternStats.maxOverallSpeed).toBe(32);
  });

  test('an unknown vehicle returns zero totals', async () => {
    const res = await request(app).get('/api/telemetry/TEST-NOBODY/bucket-stats');

    expect(res.body.bucketPatternStats.totalBuckets).toBe(0);
    expect(res.body.bucketPatternStats.totalReadings).toBe(0);
  });
});

describe('unknown routes', () => {
  test('return 404 in the standard error format', async () => {
    const res = await request(app).get('/api/telemetry/a/b/c');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});