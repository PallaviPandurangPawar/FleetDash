require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config/config');
const TelemetryBucket = require('../src/models/TelemetryBucket');

const VEHICLE_ID = process.argv[2] || 'TRK-001';
const RUNS = 20;

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

    const explain = await TelemetryBucket.find({ vehicleId: VEHICLE_ID, count: { $lt: config.bucketMaxSize } })
      .sort({ bucketStartTime: -1 })
      .limit(1)
      .explain('executionStats');
    const stats = explain.executionStats;
    console.log('--- Server-side execution (explain) ---');
    console.log(`Server execution time: ${stats.executionTimeMillis} ms`);
    console.log(`Docs examined: ${stats.totalDocsExamined} | Index keys examined: ${stats.totalKeysExamined}`);
    console.log('');

    console.log(`--- Round-trip timings (${RUNS} runs each) ---`);
    await time('1. Find newest open bucket (used by ingest)', () =>
      TelemetryBucket.findOne({ vehicleId: VEHICLE_ID, count: { $lt: config.bucketMaxSize } })
        .sort({ bucketStartTime: -1 })
        .select('_id count')
        .lean()
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