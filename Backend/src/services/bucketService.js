const TelemetryBucket = require('../models/TelemetryBucket');
const Vehicle = require('../models/Vehicle');
const config = require('../config/config');
const { parseBatch } = require('../utils/validators');
const parsePool = require('../workers/parsePool');

// Batches with at least this many readings are parsed in a worker thread
const PARSE_OFFLOAD_THRESHOLD = parseInt(process.env.PARSE_OFFLOAD_THRESHOLD, 10) || 200;

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
    )
      .select('_id count')
      .lean();

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

    Vehicle.updateOne(
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
          status: reading.speed > 3 ? 'in_transit' : reading.ignition ? 'idle' : 'offline',
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

  /**
   * Calculates min / max / sum values for a chunk of readings.
   */
  _summarize(chunk) {
    const s = {
      minSpeed: Infinity,
      maxSpeed: -Infinity,
      sumSpeed: 0,
      minFuel: Infinity,
      maxFuel: -Infinity,
      maxTemp: -Infinity,
    };
    for (const r of chunk) {
      s.minSpeed = Math.min(s.minSpeed, r.speed);
      s.maxSpeed = Math.max(s.maxSpeed, r.speed);
      s.sumSpeed += r.speed;
      s.minFuel = Math.min(s.minFuel, r.fuelLevel);
      s.maxFuel = Math.max(s.maxFuel, r.fuelLevel);
      s.maxTemp = Math.max(s.maxTemp, r.engineTemp);
    }
    return s;
  }

  /**
   * Fast batch ingestion: one database write per bucket instead of one per reading.
   * Large batches are validated and sorted in a worker thread.
   */
  async ingestBatch(vehicleId, readingsList) {
    if (!Array.isArray(readingsList) || readingsList.length === 0) {
      throw new Error('readingsList must be a non-empty array');
    }

    const maxCount = config.bucketMaxSize;

    let parsed;
    if (readingsList.length >= PARSE_OFFLOAD_THRESHOLD) {
      console.log(`[Ingest] Offloading ${readingsList.length} readings to a parse worker`);
      parsed = await parsePool.runTask('parseBatch', { readings: readingsList });
    } else {
      parsed = parseBatch(readingsList);
    }
    const valid = parsed.valid;
    const rejectedCount = parsed.rejectedCount;

    const buckets = [];
    let remaining = valid;

    while (remaining.length > 0) {
      const open = await TelemetryBucket.findOne({ vehicleId, count: { $lt: maxCount } })
        .sort({ bucketStartTime: -1 })
        .select('_id count')
        .lean();

      let chunk;
      let bucketDoc;

      if (open) {
        // Fill the open bucket with as many readings as fit, in ONE write
        chunk = remaining.slice(0, maxCount - open.count);
        const s = this._summarize(chunk);

        bucketDoc = await TelemetryBucket.findOneAndUpdate(
          { _id: open._id, count: open.count }, // guard: skip if someone else changed it
          {
            $push: { readings: { $each: chunk } },
            $inc: { count: chunk.length, 'summary.sumSpeed': s.sumSpeed },
            $set: { bucketEndTime: chunk[chunk.length - 1].timestamp },
            $min: { 'summary.minSpeed': s.minSpeed, 'summary.minFuelLevel': s.minFuel },
            $max: {
              'summary.maxSpeed': s.maxSpeed,
              'summary.maxFuelLevel': s.maxFuel,
              'summary.maxEngineTemp': s.maxTemp,
            },
          },
          { new: true }
        )
          .select('_id count')
          .lean();

        if (!bucketDoc) continue; // bucket changed meanwhile, try again
      } else {
        // No open bucket: create a new one
        chunk = remaining.slice(0, maxCount);
        const s = this._summarize(chunk);

        bucketDoc = await TelemetryBucket.create({
          vehicleId,
          bucketStartTime: chunk[0].timestamp,
          bucketEndTime: chunk[chunk.length - 1].timestamp,
          count: chunk.length,
          maxCount,
          summary: {
            minSpeed: s.minSpeed,
            maxSpeed: s.maxSpeed,
            sumSpeed: s.sumSpeed,
            avgSpeed: Number((s.sumSpeed / chunk.length).toFixed(2)),
            minFuelLevel: s.minFuel,
            maxFuelLevel: s.maxFuel,
            maxEngineTemp: s.maxTemp,
            totalDistanceKm: 0,
          },
          readings: chunk,
        });
      }

      remaining = remaining.slice(chunk.length);
      buckets.push({ bucketId: bucketDoc._id, added: chunk.length, bucketCount: bucketDoc.count });
    }

    // Update the vehicle's latest position once, using the newest reading
    if (valid.length > 0) {
      const last = valid[valid.length - 1];
      Vehicle.updateOne(
        { vehicleId },
        {
          $set: {
            lastKnownLocation: { type: 'Point', coordinates: last.location.coordinates, updatedAt: last.timestamp },
            lastTelemetry: {
              speed: last.speed,
              fuelLevel: last.fuelLevel,
              engineTemp: last.engineTemp,
              batteryVoltage: last.batteryVoltage,
              timestamp: last.timestamp,
            },
            status: last.speed > 3 ? 'in_transit' : last.ignition ? 'idle' : 'offline',
          },
        }
      ).catch((err) => console.error(`[Vehicle Update Error] ${err.message}`));
    }

    return { ingestedCount: valid.length, rejectedCount, buckets };
  }

  async getVehicleReadings(vehicleId, startTime, endTime, limit = 500) {
    const query = { vehicleId };
    // A bucket overlaps the time window if it ends after the start and begins before the end
    if (startTime) query.bucketEndTime = { $gte: new Date(startTime) };
    if (endTime) query.bucketStartTime = { $lte: new Date(endTime) };

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