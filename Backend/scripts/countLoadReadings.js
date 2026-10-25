require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config/config');
const TelemetryBucket = require('../src/models/TelemetryBucket');

(async () => {
  try {
    await mongoose.connect(config.mongoUri);

    const [r] = await TelemetryBucket.aggregate([
      { $match: { vehicleId: /^LOAD-/ } },
      { $group: { _id: null, buckets: { $sum: 1 }, readings: { $sum: '$count' } } },
    ]);
    console.log(`LOAD-* buckets: ${r ? r.buckets : 0} | readings stored: ${r ? r.readings : 0}`);

    if (process.argv.includes('--delete')) {
      const del = await TelemetryBucket.deleteMany({ vehicleId: /^LOAD-/ });
      console.log(`Deleted ${del.deletedCount} test buckets`);
    }
  } catch (err) {
    console.error('Failed:', err.message);
  } finally {
    await mongoose.disconnect();
  }
})();