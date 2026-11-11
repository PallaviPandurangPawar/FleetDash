const mongoose = require('mongoose');

/**
 * MongoDB Bucket Pattern Schema for Fleet Telemetry
 *
 * Hourly buckets: one document holds the readings of ONE vehicle for ONE clock hour (UTC).
 * `maxCount` is a safety cap: if a vehicle sends so many readings in one hour that the document would
 * grow too big, another bucket is started for the same hour.
 * Older buckets written by the previous count-based version (a fixed number of readings, any hours) are
 * still read the same way: history and statistics only use bucketStartTime, bucketEndTime and count.
 * Pre-aggregates metrics directly in the bucket header for fast analytics.
 */
const readingSubSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, required: true, default: Date.now },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [longitude, latitude]
    },
    speed: { type: Number, required: true, min: 0 },
    fuelLevel: { type: Number, default: 100, min: 0, max: 100 },
    engineTemp: { type: Number, default: 85 },
    batteryVoltage: { type: Number, default: 12.6 },
    odometerKm: { type: Number, default: 0 },
    heading: { type: Number, default: 0 },
    ignition: { type: Boolean, default: true },
    alerts: { type: [String], default: [] },
  },
  { _id: false }
);

const telemetryBucketSchema = new mongoose.Schema(
  {
    vehicleId: { type: String, required: true },
    bucketStartTime: { type: Date, required: true },
    bucketEndTime: { type: Date, required: true },
    count: { type: Number, required: true, default: 0 },
    maxCount: { type: Number, required: true, default: 1000 },
    summary: {
      minSpeed: { type: Number, default: 0 },
      maxSpeed: { type: Number, default: 0 },
      sumSpeed: { type: Number, default: 0 },
      avgSpeed: { type: Number, default: 0 },
      minFuelLevel: { type: Number, default: 100 },
      maxFuelLevel: { type: Number, default: 100 },
      maxEngineTemp: { type: Number, default: 0 },
      totalDistanceKm: { type: Number, default: 0 },
    },
    readings: [readingSubSchema],
  },
  { timestamps: true }
);

// One compound index serves both:
//  - ingest: find the open bucket of a vehicle for one clock hour (vehicleId, bucketStartTime inside the hour, count < cap)
//  - history: find a vehicle's buckets in a time range
telemetryBucketSchema.index({ vehicleId: 1, bucketStartTime: -1, count: 1 });

module.exports = mongoose.model('TelemetryBucket', telemetryBucketSchema);