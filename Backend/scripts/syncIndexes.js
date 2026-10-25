require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config/config');
const TelemetryBucket = require('../src/models/TelemetryBucket');

(async () => {
  try {
    await mongoose.connect(config.mongoUri);
    await TelemetryBucket.syncIndexes();
    const indexes = await TelemetryBucket.collection.indexes();
    console.log('Indexes now on telemetrybuckets:');
    indexes.forEach((i) => console.log(' -', i.name));
  } catch (err) {
    console.error('Sync failed:', err.message);
  } finally {
    await mongoose.disconnect();
  }
})();