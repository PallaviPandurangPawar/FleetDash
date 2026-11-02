require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config/config');
const TelemetryBucket = require('../src/models/TelemetryBucket');

const VEHICLE_ID = process.argv[2] || 'TRK-001';
const RUNS = 20;
const HOUR_MS = 60 * 60 * 1000;

async function time(label, fn) {
  await fn(); // warm-up run, not counted
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const start = process.hrtime.bigint();
    await fn();
    times.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const p95 = times[Math.floor(times.length * 0.95) - 1];
  console.log(`${label}\n   avg ${avg.toFixed(2)} ms | p95 ${p95.toFixed(2)} ms | min ${times[0].toFixed(2)} ms`);
}

(async () => {
  try {
    await mongoose.connect(config.mongoUri);

    // Buckets are hourly: the ingest looks for the open bucket of one clock hour.
    // Use the hour of the vehicle's newest bucket, so the lookup finds something.
    const newest = await TelemetryBucket.findOne({ vehicleId: VEHICLE_ID })
      .sort({ bucketStartTime: -1 })
      .select('bucketStartTime')
      .lean();
    if (!newest) {
      console.log(`No buckets found for ${VEHICLE_ID}. Create some data first (for example a load test).`);
      return;
    }
    const hourMs = Math.floor(newest.bucketStartTime.getTime() / HOUR_MS) * HOUR_MS;
    const thisHour = { $gte: new Date(hourMs), $lt: new Date(hourMs + HOUR_MS) };
    const openFilter = { vehicleId: VEHICLE_ID, bucketStartTime: thisHour, count: { $lt: config.bucketMaxSize } };

    const [totals] = await TelemetryBucket.aggregate([
      { $match: { vehicleId: VEHICLE_ID } },
      { $group: { _id: null, buckets: { $sum: 1 }, readings: { $sum: '$count' } } },
    ]);
    console.log(`Vehicle ${VEHICLE_ID}: ${totals.buckets} bucket(s), ${totals.readings} readings, safety cap ${config.bucketMaxSize}`);
    console.log(`Open-bucket lookup is for the hour starting ${new Date(hourMs).toISOString()}`);
    console.log('');

    const explain = await TelemetryBucket.find(openFilter).sort({ bucketStartTime: -1 }).limit(1).explain('executionStats');
    const stats = explain.executionStats;
    console.log('--- Server-side execution (explain) ---');
    console.log(`Server execution time: ${stats.executionTimeMillis} ms`);
    console.log(`Docs examined: ${stats.totalDocsExamined} | Index keys examined: ${stats.totalKeysExamined}`);
    console.log('');

    console.log(`--- Round-trip timings (${RUNS} runs each) ---`);
    await time('1. Find the open bucket of one clock hour (used by ingest)', () =>
      TelemetryBucket.findOne(openFilter).sort({ bucketStartTime: -1 }).select('_id count').lean()
    );
    await time('2. Latest 5 buckets for a vehicle (history)', () =>
      TelemetryBucket.find({ vehicleId: VEHICLE_ID })
        .sort({ bucketStartTime: -1 })
        .limit(5)
        .select('-readings')
        .lean()
    );
  } catch (err) {
    console.error('Benchmark failed:', err.message);
  } finally {
    await mongoose.disconnect();
  }
})();