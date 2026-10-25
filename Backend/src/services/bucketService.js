const TelemetryBucket = require('../models/TelemetryBucket');
const Vehicle = require('../models/Vehicle');
const config = require('../config/config');

class BucketService {
  /**
   * Ingests a single telemetry reading using MongoDB Bucket Pattern.
   * Atomically appends to an open bucket or creates a new bucket if full.
   */
  async ingestTelemetry(data) {
    const {
      vehicleId,
      coordinates,
      speed = 0,
      fuelLevel = 100,
      engineTemp = 85,
      batteryVoltage = 12.6,
      odometerKm = 0,
      heading = 0,
      ignition = true,
      alerts = [],
      timestamp = new Date(),
    } = data;

    const readingTime = new Date(timestamp);
    const reading = {
      timestamp: readingTime,
      location: {
        type: 'Point',
        coordinates: [Number(coordinates[0]), Number(coordinates[1])],
      },
      speed: Number(speed),
      fuelLevel: Number(fuelLevel),
      engineTemp: Number(engineTemp),
      batteryVoltage: Number(batteryVoltage),
      odometerKm: Number(odometerKm),
      heading: Number(heading),
      ignition: Boolean(ignition),
      alerts: Array.isArray(alerts) ? alerts : [],
    };

    const maxCount = config.bucketMaxSize;

    let bucket = await TelemetryBucket.findOneAndUpdate(
      { vehicleId, count: { $lt: maxCount } },
      {
        $push: { readings: reading },
        $inc: { count: 1, 'summary.sumSpeed': reading.speed },
        $set: { bucketEndTime: readingTime },
        $min: { 'summary.minSpeed': reading.speed, 'summary.minFuelLevel': reading.fuelLevel },
        $max: { 'summary.maxSpeed': reading.speed, 'summary.maxFuelLevel': reading.fuelLevel, 'summary.maxEngineTemp': reading.engineTemp },
      },
      { new: true, sort: { bucketStartTime: -1 } }
    );

    if (!bucket) {
      bucket = await TelemetryBucket.create({
        vehicleId,
        bucketStartTime: readingTime,
        bucketEndTime: readingTime,
        count: 1,
        maxCount,
        summary: {
          minSpeed: reading.speed,
          maxSpeed: reading.speed,
          sumSpeed: reading.speed,
          avgSpeed: reading.speed,
          minFuelLevel: reading.fuelLevel,
          maxFuelLevel: reading.fuelLevel,
          maxEngineTemp: reading.engineTemp,
          totalDistanceKm: 0,
        },
        readings: [reading],
      });
    }

    Vehicle.findOneAndUpdate(
      { vehicleId },
      {
        $set: {
          lastKnownLocation: { type: 'Point', coordinates: reading.location.coordinates, updatedAt: readingTime },
          lastTelemetry: {
            speed: reading.speed,
            fuelLevel: reading.fuelLevel,
            engineTemp: reading.engineTemp,
            batteryVoltage: reading.batteryVoltage,
            timestamp: readingTime,
          },
          status: reading.speed > 3 ? 'in_transit' : reading.ignition ? 'idle' : 'active',
        },
      }
    ).catch((err) => console.error(`[Vehicle Update Error] ${err.message}`));

    return {
      success: true,
      bucketId: bucket._id,
      vehicleId,
      bucketCount: bucket.count,
      isBucketFull: bucket.count >= maxCount,
    };
  }

  async ingestBatch(vehicleId, readingsList) {
    if (!Array.isArray(readingsList) || readingsList.length === 0) {
      throw new Error('readingsList must be a non-empty array');
    }
    const results = [];
    for (const item of readingsList) {
      const res = await this.ingestTelemetry({ ...item, vehicleId });
      results.push(res);
    }
    return results;
  }

  async getVehicleReadings(vehicleId, startTime, endTime, limit = 500) {
    const query = { vehicleId };
    if (startTime || endTime) {
      query.bucketEndTime = {};
      if (startTime) query.bucketEndTime.$gte = new Date(startTime);
      if (endTime) query.bucketStartTime = { $lte: new Date(endTime) };
    }

    const buckets = await TelemetryBucket.find(query)
      .sort({ bucketStartTime: -1 })
      .limit(Math.ceil(limit / config.bucketMaxSize) + 2)
      .lean();

    const allReadings = [];
    for (const bucket of buckets) {
      for (const r of bucket.readings) {
        const t = new Date(r.timestamp).getTime();
        const startCheck = startTime ? t >= new Date(startTime).getTime() : true;
        const endCheck = endTime ? t <= new Date(endTime).getTime() : true;
        if (startCheck && endCheck) {
          allReadings.push({
            timestamp: r.timestamp,
            location: r.location,
            speed: r.speed,
            fuelLevel: r.fuelLevel,
            engineTemp: r.engineTemp,
            batteryVoltage: r.batteryVoltage,
            odometerKm: r.odometerKm,
            heading: r.heading,
            ignition: r.ignition,
          });
        }
      }
    }

    allReadings.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return allReadings.slice(-limit);
  }

  async getBucketStats(vehicleId) {
    const stats = await TelemetryBucket.aggregate([
      { $match: { vehicleId } },
      {
        $group: {
          _id: '$vehicleId',
          totalBuckets: { $sum: 1 },
          totalReadings: { $sum: '$count' },
          totalSpeed: { $sum: '$summary.sumSpeed' },
          firstReading: { $min: '$bucketStartTime' },
          lastReading: { $max: '$bucketEndTime' },
          maxOverallSpeed: { $max: '$summary.maxSpeed' },
          maxOverallEngineTemp: { $max: '$summary.maxEngineTemp' },
        },
      },
      {
        $addFields: {
          avgFleetSpeed: { $round: [{ $divide: ['$totalSpeed', '$totalReadings'] }, 2] },
        },
      },
      { $project: { totalSpeed: 0 } },
    ]);
    return stats[0] || { totalBuckets: 0, totalReadings: 0 };
  }
}

module.exports = new BucketService();
