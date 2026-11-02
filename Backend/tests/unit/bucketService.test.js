// Backend/tests/unit/bucketService.test.js
// Tests for the MongoDB bucket pattern logic.
// Needs MongoDB running. Uses the fleetdash_test database (see tests/setup.js). Test data starts with "TEST-".
const bucketService = require('../../src/services/bucketService');
const parsePool = require('../../src/workers/parsePool');
const TelemetryBucket = require('../../src/models/TelemetryBucket');
const config = require('../../src/config/config');
const { connectDB, closeDB, mongoose } = require('../../src/config/db');

const MAX = config.bucketMaxSize; // readings per bucket
const TEST_IDS = /^TEST-/;
const BASE = Date.UTC(2026, 0, 1, 12, 0, 0);

// The reading with number i, i seconds after the start
const reading = (i, extra = {}) => ({
  coordinates: [88.3 + i * 0.0001, 22.5],
  speed: 20,
  timestamp: new Date(BASE + i * 1000).toISOString(),
  ...extra,
});
const readings = (from, count, extra = {}) => Array.from({ length: count }, (_, k) => reading(from + k, extra));
const single = (vehicleId, i, extra) => bucketService.ingestTelemetry({ vehicleId, ...reading(i, extra) });
const bucketsOf = (vehicleId) => TelemetryBucket.find({ vehicleId }).sort({ bucketStartTime: 1 }).lean();

beforeAll(async () => {
  await connectDB();
  expect(mongoose.connection.readyState).toBe(1); // 1 = connected. If this fails, start MongoDB.
  await TelemetryBucket.deleteMany({ vehicleId: TEST_IDS });
});

afterAll(async () => {
  await TelemetryBucket.deleteMany({ vehicleId: TEST_IDS });
  await closeDB();
  if (parsePool.terminate) await parsePool.terminate();
});

describe('ingestTelemetry (one reading)', () => {
  test('creates the first bucket for a vehicle', async () => {
    const res = await single('TEST-BS-FIRST', 0, { speed: 42, fuelLevel: 80 });

    expect(res).toMatchObject({ success: true, vehicleId: 'TEST-BS-FIRST', bucketCount: 1, isBucketFull: false });

    const [bucket] = await bucketsOf('TEST-BS-FIRST');
    expect(bucket.count).toBe(1);
    expect(bucket.readings).toHaveLength(1);
    expect(bucket.readings[0].location.coordinates).toEqual([88.3, 22.5]);
    expect(bucket.summary).toMatchObject({
      minSpeed: 42,
      maxSpeed: 42,
      sumSpeed: 42,
      avgSpeed: 42,
      minFuelLevel: 80,
      maxFuelLevel: 80,
    });
  });

  test('adds to the open bucket and keeps the summary up to date', async () => {
    const id = 'TEST-BS-APPEND';
    await single(id, 0, { speed: 10, fuelLevel: 90, engineTemp: 80 });
    await single(id, 1, { speed: 50, fuelLevel: 70, engineTemp: 95 });
    const res = await single(id, 2, { speed: 30, fuelLevel: 80, engineTemp: 90 });

    expect(res.bucketCount).toBe(3);

    const buckets = await bucketsOf(id);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].summary).toMatchObject({
      minSpeed: 10,
      maxSpeed: 50,
      sumSpeed: 90,
      minFuelLevel: 70,
      maxFuelLevel: 90,
      maxEngineTemp: 95,
    });
    expect(buckets[0].bucketEndTime.getTime()).toBe(BASE + 2000);
  });

  test('uses defaults when optional fields are missing', async () => {
    await bucketService.ingestTelemetry({
      vehicleId: 'TEST-BS-DEFAULTS',
      coordinates: [88.3, 22.5],
      timestamp: new Date(BASE).toISOString(),
    });

    const [bucket] = await bucketsOf('TEST-BS-DEFAULTS');
    expect(bucket.readings[0]).toMatchObject({ speed: 0, fuelLevel: 100, engineTemp: 85, heading: 0, ignition: true });
  });

  test('starts a new bucket when the open one is full', async () => {
    const id = 'TEST-BS-FULL';
    await bucketService.ingestBatch(id, readings(0, MAX));

    const res = await single(id, MAX);

    expect(res.bucketCount).toBe(1);
    const buckets = await bucketsOf(id);
    expect(buckets.map((b) => b.count)).toEqual([MAX, 1]);
  });

  test('reports isBucketFull when the last free slot is used', async () => {
    const id = 'TEST-BS-LASTSLOT';
    await bucketService.ingestBatch(id, readings(0, MAX - 1));

    const res = await single(id, MAX - 1);

    expect(res.bucketCount).toBe(MAX);
    expect(res.isBucketFull).toBe(true);
  });
});

describe('ingestBatch (many readings)', () => {
  test('rejects an empty or invalid list', async () => {
    await expect(bucketService.ingestBatch('TEST-BS-EMPTY', [])).rejects.toThrow('non-empty array');
    await expect(bucketService.ingestBatch('TEST-BS-EMPTY', 'nope')).rejects.toThrow('non-empty array');
  });

  test('creates a bucket with a correct summary', async () => {
    const id = 'TEST-BS-SUMMARY';
    const list = [
      reading(0, { speed: 10, fuelLevel: 90, engineTemp: 80 }),
      reading(1, { speed: 20, fuelLevel: 60, engineTemp: 100 }),
      reading(2, { speed: 30, fuelLevel: 75, engineTemp: 90 }),
    ];

    const res = await bucketService.ingestBatch(id, list);

    expect(res.ingestedCount).toBe(3);
    expect(res.rejectedCount).toBe(0);
    expect(res.buckets).toHaveLength(1);
    expect(res.buckets[0]).toMatchObject({ added: 3, bucketCount: 3 });

    const [bucket] = await bucketsOf(id);
    expect(bucket.summary).toMatchObject({
      minSpeed: 10,
      maxSpeed: 30,
      sumSpeed: 60,
      avgSpeed: 20,
      minFuelLevel: 60,
      maxFuelLevel: 90,
      maxEngineTemp: 100,
    });
  });

  test('sorts readings by time, whatever order they arrive in', async () => {
    const id = 'TEST-BS-SORT';
    await bucketService.ingestBatch(id, [reading(2), reading(0), reading(1)]);

    const [bucket] = await bucketsOf(id);
    expect(bucket.bucketStartTime.getTime()).toBe(BASE);
    expect(bucket.bucketEndTime.getTime()).toBe(BASE + 2000);
    expect(bucket.readings.map((r) => r.timestamp.getTime())).toEqual([BASE, BASE + 1000, BASE + 2000]);
  });

  test('counts and skips invalid readings', async () => {
    const id = 'TEST-BS-INVALID';
    const res = await bucketService.ingestBatch(id, [
      reading(0),
      { coordinates: [500, 500] },
      { coordinates: [88, 22], speed: -1 },
      reading(1),
    ]);

    expect(res.ingestedCount).toBe(2);
    expect(res.rejectedCount).toBe(2);
    const [bucket] = await bucketsOf(id);
    expect(bucket.count).toBe(2);
  });

  test('stores nothing when every reading is invalid', async () => {
    const id = 'TEST-BS-ALLBAD';
    const res = await bucketService.ingestBatch(id, [{ coordinates: [500, 500] }]);

    expect(res).toEqual({ ingestedCount: 0, rejectedCount: 1, buckets: [] });
    expect(await bucketsOf(id)).toHaveLength(0);
  });

  test('fills the open bucket first, then starts a new one', async () => {
    const id = 'TEST-BS-SPILL';
    const first = Math.floor(MAX / 3);
    await bucketService.ingestBatch(id, readings(0, first));

    const res = await bucketService.ingestBatch(id, readings(first, MAX));

    expect(res.buckets.map((b) => b.added)).toEqual([MAX - first, first]);
    const buckets = await bucketsOf(id);
    expect(buckets.map((b) => b.count)).toEqual([MAX, first]);
  });

  test('splits a large batch over several buckets', async () => {
    const id = 'TEST-BS-LARGE';
    const total = MAX * 2 + 10;

    const res = await bucketService.ingestBatch(id, readings(0, total));

    expect(res.ingestedCount).toBe(total);
    expect(res.buckets).toHaveLength(3);
    const buckets = await bucketsOf(id);
    expect(buckets.map((b) => b.count)).toEqual([MAX, MAX, 10]);
  });
});

describe('getVehicleReadings', () => {
  const id = 'TEST-BS-READ';
  const speeds = (list) => list.map((r) => r.speed);

  beforeAll(async () => {
    // ten readings with speeds 0 to 9, one second apart
    await bucketService.ingestBatch(id, Array.from({ length: 10 }, (_, i) => reading(i, { speed: i })));
  });

  test('returns the readings oldest first', async () => {
    const result = await bucketService.getVehicleReadings(id);
    expect(speeds(result)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('limit keeps the newest readings', async () => {
    const result = await bucketService.getVehicleReadings(id, null, null, 3);
    expect(speeds(result)).toEqual([7, 8, 9]);
  });

  test('startTime and endTime select a time window (both ends included)', async () => {
    const start = new Date(BASE + 3000).toISOString();
    const end = new Date(BASE + 6000).toISOString();

    const result = await bucketService.getVehicleReadings(id, start, end);
    expect(speeds(result)).toEqual([3, 4, 5, 6]);
  });

  test('works with only a start or only an end', async () => {
    const from = await bucketService.getVehicleReadings(id, new Date(BASE + 8000).toISOString());
    expect(speeds(from)).toEqual([8, 9]);

    const until = await bucketService.getVehicleReadings(id, null, new Date(BASE + 1000).toISOString());
    expect(speeds(until)).toEqual([0, 1]);
  });

  test('returns an empty list for an unknown vehicle', async () => {
    expect(await bucketService.getVehicleReadings('TEST-BS-NOBODY')).toEqual([]);
  });
});

describe('getBucketStats', () => {
  const id = 'TEST-BS-STATS';
  const total = 150;
  const speedAt = (i) => i % 60;

  beforeAll(async () => {
    await bucketService.ingestBatch(id, Array.from({ length: total }, (_, i) => reading(i, { speed: speedAt(i) })));
  });

  test('adds up buckets and readings', async () => {
    const stats = await bucketService.getBucketStats(id);

    expect(stats.totalBuckets).toBe(Math.ceil(total / MAX));
    expect(stats.totalReadings).toBe(total);
  });

  test('reports speed, temperature and time range', async () => {
    const stats = await bucketService.getBucketStats(id);
    const sum = Array.from({ length: total }, (_, i) => speedAt(i)).reduce((a, b) => a + b, 0);

    expect(stats.maxOverallSpeed).toBe(59);
    expect(stats.maxOverallEngineTemp).toBe(85); // the default engine temperature
    expect(stats.avgFleetSpeed).toBeCloseTo(sum / total, 2);
    expect(stats.firstReading.getTime()).toBe(BASE);
    expect(stats.lastReading.getTime()).toBe(BASE + (total - 1) * 1000);
  });

  test('returns zero totals for an unknown vehicle', async () => {
    expect(await bucketService.getBucketStats('TEST-BS-NOBODY')).toEqual({ totalBuckets: 0, totalReadings: 0 });
  });
});



describe('the remembered open bucket', () => {
  test('keeps working when the bucket was deleted behind its back', async () => {
    const id = 'TEST-BS-GONE';
    await bucketService.ingestBatch(id, readings(0, 3));
    await TelemetryBucket.deleteMany({ vehicleId: id });

    const res = await bucketService.ingestBatch(id, readings(3, 2));

    expect(res.ingestedCount).toBe(2);
    expect((await bucketsOf(id)).map((b) => b.count)).toEqual([2]);
  });

  test('keeps working when another writer changed the bucket', async () => {
    const id = 'TEST-BS-SHARED';
    await bucketService.ingestBatch(id, readings(0, 3));
    await single(id, 3); // the single-reading path writes into the same open bucket

    const res = await bucketService.ingestBatch(id, readings(4, 2));

    expect(res.ingestedCount).toBe(2);
    expect((await bucketsOf(id)).map((b) => b.count)).toEqual([6]);
  });

  test('finds the open bucket again after a restart (empty memory)', async () => {
    const id = 'TEST-BS-RESTART';
    await bucketService.ingestBatch(id, readings(0, 3));
    bucketService.openBuckets.clear(); // what a freshly started server remembers

    await bucketService.ingestBatch(id, readings(3, 2));

    expect((await bucketsOf(id)).map((b) => b.count)).toEqual([5]);
  });
});


describe('hourly buckets', () => {
  const HOUR = 60 * 60 * 1000;
  const MINUTE = 60 * 1000;
  const at = (ms, extra = {}) => ({
    coordinates: [88.3, 22.5],
    speed: 20,
    timestamp: new Date(ms).toISOString(),
    ...extra,
  });
  const times = (bucket) => bucket.readings.map((r) => r.timestamp.getTime());

  test('single readings of one clock hour share a bucket, the next hour starts a new one', async () => {
    const id = 'TEST-BS-HOUR1';
    await bucketService.ingestTelemetry({ vehicleId: id, ...at(BASE + 10 * MINUTE) }); // 12:10:00
    await bucketService.ingestTelemetry({ vehicleId: id, ...at(BASE + HOUR - 1000) }); // 12:59:59
    await bucketService.ingestTelemetry({ vehicleId: id, ...at(BASE + HOUR) }); // 13:00:00 is a new hour

    const buckets = await bucketsOf(id);
    expect(buckets.map((b) => b.count)).toEqual([2, 1]);
    expect(buckets[0].bucketStartTime.getTime()).toBe(BASE + 10 * MINUTE);
    expect(buckets[0].bucketEndTime.getTime()).toBe(BASE + HOUR - 1000);
    expect(buckets[1].bucketStartTime.getTime()).toBe(BASE + HOUR);
  });

  test('a batch that crosses the hour boundary is split per hour', async () => {
    const id = 'TEST-BS-HOUR2';
    const res = await bucketService.ingestBatch(id, [
      at(BASE + HOUR + 1000),
      at(BASE + HOUR - 2000),
      at(BASE + HOUR - 1000),
      at(BASE + HOUR),
    ]);

    expect(res.ingestedCount).toBe(4);
    expect(res.buckets.map((b) => b.added)).toEqual([2, 2]);

    const buckets = await bucketsOf(id);
    expect(buckets.map((b) => b.count)).toEqual([2, 2]);
    expect(times(buckets[0])).toEqual([BASE + HOUR - 2000, BASE + HOUR - 1000]);
    expect(times(buckets[1])).toEqual([BASE + HOUR, BASE + HOUR + 1000]);
  });

  test('a later batch of the same hour is added to the bucket of that hour', async () => {
    const id = 'TEST-BS-HOUR3';
    await bucketService.ingestBatch(id, [at(BASE), at(BASE + 1000)]);
    await bucketService.ingestBatch(id, [at(BASE + HOUR - 1000)]); // still 12:xx
    await bucketService.ingestBatch(id, [at(BASE + HOUR)]); // 13:00

    expect((await bucketsOf(id)).map((b) => b.count)).toEqual([3, 1]);
  });

  test('a late reading goes back into the bucket of its own hour', async () => {
    const id = 'TEST-BS-LATE';
    await bucketService.ingestBatch(id, [at(BASE + HOUR), at(BASE + HOUR + 1000)]); // hour 13
    await bucketService.ingestBatch(id, [at(BASE + 30000)]); // hour 12, arrives late
    await bucketService.ingestBatch(id, [at(BASE + HOUR + 2000)]); // hour 13 again
    await bucketService.ingestBatch(id, [at(BASE + 20000)]); // hour 12, older than its first reading

    const buckets = await bucketsOf(id);
    expect(buckets.map((b) => b.count)).toEqual([2, 3]);
    expect(buckets[0].bucketStartTime.getTime()).toBe(BASE + 20000); // moved back to the older reading
    expect(buckets[0].bucketEndTime.getTime()).toBe(BASE + 30000);
  });

  test('when the cap is reached inside one hour, another bucket is made for the same hour', async () => {
    const id = 'TEST-BS-CAP';
    await bucketService.ingestBatch(id, readings(0, MAX + 5));

    const buckets = await bucketsOf(id);
    expect(buckets.map((b) => b.count)).toEqual([MAX, 5]);
    for (const b of buckets) {
      expect(b.bucketStartTime.getTime()).toBeGreaterThanOrEqual(BASE);
      expect(b.bucketStartTime.getTime()).toBeLessThan(BASE + HOUR);
    }
  });

  test('old count-based buckets stay readable and are not changed by a new hour', async () => {
    const id = 'TEST-BS-LEGACY';
    const point = { type: 'Point', coordinates: [88.3, 22.5] };
    // What the old code wrote: a bucket that covers two clock hours (12:30 to 13:10)
    await TelemetryBucket.create({
      vehicleId: id,
      bucketStartTime: new Date(BASE + 30 * MINUTE),
      bucketEndTime: new Date(BASE + HOUR + 10 * MINUTE),
      count: 2,
      maxCount: 100,
      summary: { minSpeed: 5, maxSpeed: 15, sumSpeed: 20, avgSpeed: 10 },
      readings: [
        { timestamp: new Date(BASE + 30 * MINUTE), location: point, speed: 5 },
        { timestamp: new Date(BASE + HOUR + 10 * MINUTE), location: point, speed: 15 },
      ],
    });

    expect((await bucketService.getVehicleReadings(id)).map((r) => r.speed)).toEqual([5, 15]);
    expect((await bucketService.getBucketStats(id)).totalReadings).toBe(2);

    await bucketService.ingestBatch(id, [at(BASE + 2 * HOUR, { speed: 25 })]); // a new hour

    const buckets = await bucketsOf(id);
    expect(buckets.map((b) => b.count)).toEqual([2, 1]);
    expect(buckets[0].readings).toHaveLength(2); // the old bucket is untouched
    expect((await bucketService.getVehicleReadings(id)).map((r) => r.speed)).toEqual([5, 15, 25]);
  });

  test('history works over many small buckets (one reading per hour)', async () => {
    const id = 'TEST-BS-SPARSE';
    for (let h = 0; h < 6; h++) {
      await bucketService.ingestBatch(id, [at(BASE + h * HOUR, { speed: h })]);
    }
    expect(await bucketsOf(id)).toHaveLength(6);

    const newest = await bucketService.getVehicleReadings(id, null, null, 4);
    expect(newest.map((r) => r.speed)).toEqual([2, 3, 4, 5]);

    const all = await bucketService.getVehicleReadings(id);
    expect(all.map((r) => r.speed)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});