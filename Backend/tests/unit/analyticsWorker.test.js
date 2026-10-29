// Backend/tests/unit/analyticsWorker.test.js
// Tests for the analytics maths (haversine, point in polygon, trip analytics, geofence checks)
// and for running the same tasks inside real worker threads.
const path = require('path');
const {
  haversineDistance,
  isPointInPolygon,
  computeTripAnalytics,
  evaluateGeofences,
} = require('../../src/workers/analyticsWorker');
const defaultPool = require('../../src/workers/workerPool');

const { WorkerPool } = defaultPool;
const WORKER_PATH = path.join(__dirname, '../../src/workers/analyticsWorker.js');

const ONE_DEGREE_KM = 111.19; // 6371 km * pi / 180
const BASE = Date.UTC(2026, 0, 1, 12, 0, 0);
const MINUTE = 60 * 1000;

// A reading i minutes after the start, moving north by 0.01 degrees (about 1.11 km) per reading
const reading = (i, speed, extra = {}) => ({
  timestamp: new Date(BASE + i * MINUTE).toISOString(),
  coordinates: [88, 22 + i * 0.01],
  speed,
  ...extra,
});
const trip = (speeds) => speeds.map((speed, i) => reading(i, speed));

const SQUARE = [[88.3, 22.5], [88.4, 22.5], [88.4, 22.6], [88.3, 22.6], [88.3, 22.5]];
const SMALL_SQUARE = [[88.34, 22.54], [88.36, 22.54], [88.36, 22.56], [88.34, 22.56], [88.34, 22.54]];

describe('haversineDistance', () => {
  test('is 0 for the same point', () => {
    expect(haversineDistance([88, 22], [88, 22])).toBe(0);
  });

  test('one degree of latitude is about 111.19 km', () => {
    expect(haversineDistance([88, 22], [88, 23])).toBeCloseTo(ONE_DEGREE_KM, 1);
  });

  test('one degree of longitude is about 111.19 km at the equator and about half of that at 60 degrees north', () => {
    expect(haversineDistance([0, 0], [1, 0])).toBeCloseTo(ONE_DEGREE_KM, 1);
    expect(haversineDistance([0, 60], [1, 60])).toBeCloseTo(55.6, 1);
  });

  test('gives the same distance in both directions', () => {
    const a = [88.3639, 22.5726];
    const b = [77.1025, 28.7041];
    expect(haversineDistance(a, b)).toBeCloseTo(haversineDistance(b, a), 6);
  });

  test('Kolkata to Delhi is roughly 1,300 km', () => {
    const km = haversineDistance([88.3639, 22.5726], [77.1025, 28.7041]);
    expect(km).toBeGreaterThan(1300);
    expect(km).toBeLessThan(1330);
  });
});

describe('isPointInPolygon', () => {
  test('finds points inside and outside a square', () => {
    expect(isPointInPolygon([88.35, 22.55], SQUARE)).toBe(true);
    expect(isPointInPolygon([88.5, 22.55], SQUARE)).toBe(false); // right
    expect(isPointInPolygon([88.2, 22.55], SQUARE)).toBe(false); // left
    expect(isPointInPolygon([88.35, 22.7], SQUARE)).toBe(false); // above
    expect(isPointInPolygon([88.35, 22.4], SQUARE)).toBe(false); // below
  });

  test('handles a polygon that is not a rectangle (L shape)', () => {
    const lShape = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
    expect(isPointInPolygon([1, 3], lShape)).toBe(true); // upright part
    expect(isPointInPolygon([3, 1], lShape)).toBe(true); // lower arm
    expect(isPointInPolygon([3, 3], lShape)).toBe(false); // the notch
  });
});

describe('computeTripAnalytics', () => {
  test('returns safe defaults for no readings', () => {
    const empty = {
      totalPoints: 0,
      totalDistanceKm: 0,
      durationMinutes: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      speedingCount: 0,
      harshBrakingCount: 0,
      idleDurationMinutes: 0,
      safetyScore: 100,
    };
    expect(computeTripAnalytics([])).toEqual(empty);
    expect(computeTripAnalytics(null)).toEqual(empty);
  });

  test('summarises a simple trip', () => {
    expect(computeTripAnalytics(trip([10, 20, 30]))).toEqual({
      totalPoints: 3,
      totalDistanceKm: 2.22, // two legs of about 1.11 km
      durationMinutes: 2,
      avgSpeed: 20,
      maxSpeed: 30,
      speedingCount: 0,
      harshBrakingCount: 0,
      idleDurationMinutes: 0,
      safetyScore: 100,
    });
  });

  test('counts speeding above the limit (default 80) and lowers the safety score by 2 each', () => {
    const result = computeTripAnalytics(trip([60, 85, 90, 70]));
    expect(result.speedingCount).toBe(2);
    expect(result.safetyScore).toBe(96);
  });

  test('speeding uses the speedLimit option', () => {
    const result = computeTripAnalytics(trip([60, 85, 90, 70]), { speedLimit: 65 });
    expect(result.speedingCount).toBe(3);
    expect(result.safetyScore).toBe(94);
  });

  test('driving exactly at the limit is not speeding', () => {
    expect(computeTripAnalytics(trip([80])).speedingCount).toBe(0);
  });

  test('counts harsh braking (speed drop above 25) and lowers the safety score by 5 each', () => {
    const result = computeTripAnalytics(trip([80, 40, 40]));
    expect(result.harshBrakingCount).toBe(1);
    expect(result.safetyScore).toBe(95);
  });

  test('harsh braking uses the harshBrakeThreshold option, and a drop of exactly 25 does not count', () => {
    expect(computeTripAnalytics(trip([80, 40, 40]), { harshBrakeThreshold: 50 }).harshBrakingCount).toBe(0);
    expect(computeTripAnalytics(trip([50, 25])).harshBrakingCount).toBe(0);
  });

  test('works out idle time from readings under 2 km/h', () => {
    const result = computeTripAnalytics(trip([0, 0, 10, 10]));
    expect(result.durationMinutes).toBe(3);
    expect(result.idleDurationMinutes).toBe(1.5); // half of the readings are idle
    expect(result.avgSpeed).toBe(5);
  });

  test('the safety score never drops below 10', () => {
    const result = computeTripAnalytics(Array.from({ length: 100 }, (_, i) => reading(i, 100)));
    expect(result.speedingCount).toBe(100);
    expect(result.safetyScore).toBe(10);
  });

  test('reads positions in both formats (plain coordinates and bucket location)', () => {
    const plain = trip([10, 10, 10]);
    const bucketStyle = plain.map((r) => ({ timestamp: r.timestamp, speed: r.speed, location: { coordinates: r.coordinates } }));

    expect(computeTripAnalytics(bucketStyle).totalDistanceKm).toBe(computeTripAnalytics(plain).totalDistanceKm);
    expect(computeTripAnalytics(bucketStyle).totalDistanceKm).toBe(2.22);
  });

  test('ignores impossible GPS jumps of 100 km or more between two readings', () => {
    const result = computeTripAnalytics([
      reading(0, 10, { coordinates: [0, 0] }),
      reading(1, 10, { coordinates: [10, 10] }),
    ]);
    expect(result.totalDistanceKm).toBe(0);
  });

  test('treats a missing speed as 0 (idle)', () => {
    const result = computeTripAnalytics([
      { timestamp: reading(0, 0).timestamp, coordinates: [88, 22] },
      { timestamp: reading(1, 0).timestamp, coordinates: [88, 22] },
    ]);
    expect(result.avgSpeed).toBe(0);
    expect(result.maxSpeed).toBe(0);
    expect(result.idleDurationMinutes).toBe(1);
  });

  test('the duration is never negative, even if the timestamps are in the wrong order', () => {
    expect(computeTripAnalytics([reading(5, 10), reading(0, 10)]).durationMinutes).toBe(0);
  });
});

describe('evaluateGeofences', () => {
  const readings = [
    { timestamp: 't1', coordinates: [88.35, 22.55], speed: 10 }, // inside both fences
    { timestamp: 't2', location: { coordinates: [88.31, 22.51] }, speed: 30 }, // inside A only (bucket format)
    { timestamp: 't3', coordinates: [88.5, 22.55], speed: 5 }, // outside
    { timestamp: 't4', speed: 1 }, // no position
  ];
  const fences = [
    { name: 'A', polygon: SQUARE },
    { name: 'B', polygon: SMALL_SQUARE },
  ];

  test('reports every reading that is inside each geofence', () => {
    const events = evaluateGeofences(readings, fences);

    expect(events.map((e) => `${e.geofenceName}:${e.timestamp}`)).toEqual(['A:t1', 'A:t2', 'B:t1']);
    expect(events[0]).toEqual({
      geofenceName: 'A',
      timestamp: 't1',
      coordinates: [88.35, 22.55],
      speed: 10,
    });
  });

  test('skips readings without a position', () => {
    const events = evaluateGeofences(readings, fences);
    expect(events.some((e) => e.timestamp === 't4')).toBe(false);
  });

  test('returns nothing for no geofences or no readings', () => {
    expect(evaluateGeofences(readings, [])).toEqual([]);
    expect(evaluateGeofences([], fences)).toEqual([]);
  });
});

describe('the same tasks inside real worker threads', () => {
  let pool;

  beforeAll(() => {
    pool = new WorkerPool(WORKER_PATH, 2);
  });

  afterAll(async () => {
    await pool.terminate();
    await defaultPool.terminate(); // the pool the app creates when workerPool.js is loaded
  });

  test('HAVERSINE_DISTANCE', async () => {
    const result = await pool.runTask('HAVERSINE_DISTANCE', { coord1: [88, 22], coord2: [88, 23] });
    expect(result.distanceKm).toBeCloseTo(ONE_DEGREE_KM, 1);
  });

  test('COMPUTE_TRIP_ANALYTICS gives the same result as calling the function directly', async () => {
    const readingsList = trip([60, 85, 90, 70]);
    const result = await pool.runTask('COMPUTE_TRIP_ANALYTICS', { readings: readingsList, options: { speedLimit: 65 } });

    expect(result).toEqual(computeTripAnalytics(readingsList, { speedLimit: 65 }));
  });

  test('EVALUATE_GEOFENCES gives the same result as calling the function directly', async () => {
    const readingsList = [{ timestamp: 't1', coordinates: [88.35, 22.55], speed: 10 }];
    const fenceList = [{ name: 'A', polygon: SQUARE }];
    const result = await pool.runTask('EVALUATE_GEOFENCES', { readings: readingsList, geofences: fenceList });

    expect(result).toEqual(evaluateGeofences(readingsList, fenceList));
  });

  test('an unknown task type is rejected with a clear message', async () => {
    await expect(pool.runTask('NOPE', {})).rejects.toThrow('Unknown task type: NOPE');
  });

  test('many tasks at once are queued and all finish', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => pool.runTask('HAVERSINE_DISTANCE', { coord1: [88, 22], coord2: [88, 23] }))
    );

    results.forEach((r) => expect(r.distanceKm).toBeCloseTo(ONE_DEGREE_KM, 1));
    const stats = pool.getStats();
    expect(stats.pendingTasks).toBe(0);
    expect(stats.completedTasks).toBeGreaterThanOrEqual(20);
  });

  test('a terminated pool refuses new tasks', async () => {
    const shortLived = new WorkerPool(WORKER_PATH, 1);
    await shortLived.terminate();

    await expect(shortLived.runTask('HAVERSINE_DISTANCE', { coord1: [0, 0], coord2: [0, 1] })).rejects.toThrow(
      'terminated'
    );
  });
});