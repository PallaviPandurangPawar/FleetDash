const TelemetryBucket = require('../models/TelemetryBucket');
const Vehicle = require('../models/Vehicle');
const config = require('../config/config');
const { parseBatch } = require('../utils/validators');
const parsePool = require('../workers/parsePool');
const vehicleStateWriter = require('./vehicleStateWriter');

// Batches with at least this many readings are parsed in a worker thread
const PARSE_OFFLOAD_THRESHOLD = parseInt(process.env.PARSE_OFFLOAD_THRESHOLD, 10) || 200;

// Hourly buckets: one bucket holds the readings of one vehicle for one clock hour (UTC).
// config.bucketMaxSize is only a safety cap: when a vehicle sends more readings in one hour than the cap,
// another bucket is started for the same hour.
const HOUR_MS = 60 * 60 * 1000;
const hourStartOf = (timeMs) => Math.floor(timeMs / HOUR_MS) * HOUR_MS;
const hourRange = (hourMs) => ({ $gte: new Date(hourMs), $lt: new Date(hourMs + HOUR_MS) });

class BucketService {
  constructor() {
    // vehicleId -> { _id, count, hour } of the bucket (of that clock hour) that still has room,
    // so a write needs no lookup first. Only a hint: a wrong guess is caught by the guard in the update.
    this.openBuckets = new Map();
  }

  /**
   * Ingests a single telemetry reading using the MongoDB hourly bucket pattern.
   * Atomically appends to the open bucket of the reading's clock hour, or creates a new bucket
   * (first reading of an hour, or the cap is reached).
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

    // The open bucket of THIS clock hour. A reading of a new hour finds none and starts a new bucket.
    const hourMs = hourStartOf(readingTime.getTime());

    let bucket = await TelemetryBucket.findOneAndUpdate(
      { vehicleId, bucketStartTime: hourRange(hourMs), count: { $lt: maxCount } },
      {
        $push: { readings: reading },
        $inc: { count: 1, 'summary.sumSpeed': reading.speed },
        $min: {
          bucketStartTime: readingTime,
          'summary.minSpeed': reading.speed,
          'summary.minFuelLevel': reading.fuelLevel,
        },
        $max: {
          bucketEndTime: readingTime,
          'summary.maxSpeed': reading.speed,
          'summary.maxFuelLevel': reading.fuelLevel,
          'summary.maxEngineTemp': reading.engineTemp,
        },
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
   * The bucket of a vehicle, for one clock hour, that still has room. Remembered in memory after the
   * first lookup, so most writes need no lookup at all. A wrong guess is caught by the guard in the update.
   * Buckets written by the old count-based version are found too, when they started inside that hour.
   */
  async _findOpenBucket(vehicleId, hourMs, maxCount) {
    const remembered = this.openBuckets.get(vehicleId);
    if (remembered && remembered.hour === hourMs && remembered.count < maxCount) return remembered;

    const open = await TelemetryBucket.findOne({
      vehicleId,
      bucketStartTime: hourRange(hourMs),
      count: { $lt: maxCount },
    })
      .sort({ bucketStartTime: -1 })
      .select('_id count')
      .lean();

    if (open) this.openBuckets.set(vehicleId, { _id: open._id, count: open.count, hour: hourMs });
    else this.openBuckets.delete(vehicleId);
    return open;
  }

  _rememberOpenBucket(vehicleId, bucketDoc, hourMs, maxCount) {
    if (bucketDoc.count < maxCount) {
      this.openBuckets.set(vehicleId, { _id: bucketDoc._id, count: bucketDoc.count, hour: hourMs });
    } else {
      this.openBuckets.delete(vehicleId);
    }
  }

  /**
   * Fast batch ingestion: one database write per bucket instead of one per reading.
   * The readings are split by clock hour; each hour goes into the open bucket of that hour
   * (a new bucket is started when there is none, or when the safety cap is reached).
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

    // Split by clock hour. The readings are sorted oldest first, so every hour's list is sorted too.
    const hours = new Map(); // hour start (ms) -> readings of that hour
    for (const r of valid) {
      const hourMs = hourStartOf(r.timestamp.getTime());
      if (!hours.has(hourMs)) hours.set(hourMs, []);
      hours.get(hourMs).push(r);
    }

    const buckets = [];

    for (const [hourMs, hourReadings] of hours) {
      let remaining = hourReadings;

      while (remaining.length > 0) {
        const open = await this._findOpenBucket(vehicleId, hourMs, maxCount);

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
              $min: {
                bucketStartTime: chunk[0].timestamp, // a late reading can be older than the bucket's first one
                'summary.minSpeed': s.minSpeed,
                'summary.minFuelLevel': s.minFuel,
              },
              $max: {
                bucketEndTime: chunk[chunk.length - 1].timestamp,
                'summary.maxSpeed': s.maxSpeed,
                'summary.maxFuelLevel': s.maxFuel,
                'summary.maxEngineTemp': s.maxTemp,
              },
            },
            { new: true }
          )
            .select('_id count')
            .lean();

          if (!bucketDoc) {
            // The bucket changed or was removed behind our back: forget it and look again
            this.openBuckets.delete(vehicleId);
            continue;
          }
        } else {
          // No open bucket for this hour: create a new one
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

        this._rememberOpenBucket(vehicleId, bucketDoc, hourMs, maxCount);
        remaining = remaining.slice(chunk.length);
        buckets.push({ bucketId: bucketDoc._id, added: chunk.length, bucketCount: bucketDoc.count });
      }
    }

    // The vehicle's latest position is written together with the other vehicles every half second
    if (valid.length > 0) {
      vehicleStateWriter.record(vehicleId, valid[valid.length - 1]);
    }

    return { ingestedCount: valid.length, rejectedCount, buckets };
  }

  async getVehicleReadings(vehicleId, startTime, endTime, limit = 500) {
    const query = { vehicleId };
    // A bucket overlaps the time window if it ends after the start and begins before the end
    if (startTime) query.bucketEndTime = { $gte: new Date(startTime) };
    if (endTime) query.bucketStartTime = { $lte: new Date(endTime) };

    const startMs = startTime ? new Date(startTime).getTime() : null;
    const endMs = endTime ? new Date(endTime).getTime() : null;

    // Buckets are read newest first and reading stops as soon as there are enough readings.
    // (A bucket can hold few readings, so the number of buckets to read cannot be calculated in advance.)
    const allReadings = [];
    const cursor = TelemetryBucket.find(query).sort({ bucketStartTime: -1 }).lean().cursor();

    for await (const bucket of cursor) {
      for (const r of bucket.readings) {
        const t = new Date(r.timestamp).getTime();
        if ((startMs === null || t >= startMs) && (endMs === null || t <= endMs)) {
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
      if (allReadings.length >= limit) break;
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