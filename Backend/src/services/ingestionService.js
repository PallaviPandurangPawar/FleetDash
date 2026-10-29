const bucketService = require('./bucketService');
const redisService = require('./redisService');
const geofenceService = require('./geofenceService');
const alertService = require('./alertService');
const config = require('../config/config');
const { parseBatch } = require('../utils/validators');

/** Turns a validated reading into the small message used by the real-time layer and the geofence service */
function toUpdate(vehicleId, reading) {
  return {
    vehicleId,
    lon: reading.location.coordinates[0],
    lat: reading.location.coordinates[1],
    speed: reading.speed,
    heading: reading.heading,
    fuelLevel: reading.fuelLevel,
    ignition: reading.ignition,
    timestamp: reading.timestamp.getTime(),
  };
}

/**
 * Group-commit buffer for telemetry ingestion.
 * Readings that arrive within a few milliseconds are written to MongoDB together,
 * one batch per vehicle. Each request is answered only AFTER its reading is stored.
 */
class IngestionService {
  constructor() {
    this.pending = new Map(); // vehicleId -> [{ raw, resolve, reject }]
    this.busy = new Set(); // vehicles with a write in progress
    this.timer = null;
    this.flushMs = parseInt(process.env.FLUSH_INTERVAL_MS, 10) || 10;
  }

  add(vehicleId, raw) {
    return new Promise((resolve, reject) => {
      let queue = this.pending.get(vehicleId);
      if (!queue) {
        queue = [];
        this.pending.set(vehicleId, queue);
      }
      queue.push({ raw, resolve, reject });
      this._schedule();
    });
  }

  _schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this._flush();
    }, this.flushMs);
  }

  _flush() {
    for (const [vehicleId, queue] of this.pending) {
      // Only one write per vehicle at a time (prevents duplicate buckets)
      if (this.busy.has(vehicleId)) continue;
      this.pending.delete(vehicleId);
      this._write(vehicleId, queue);
    }
    if (this.pending.size > 0) this._schedule();
  }

  async _write(vehicleId, queue) {
    this.busy.add(vehicleId);
    try {
      const rawReadings = queue.map((item) => item.raw);
      const result = await bucketService.ingestBatch(vehicleId, rawReadings);
      const last = result.buckets[result.buckets.length - 1];
      const response = {
        success: true,
        bucketId: last.bucketId,
        vehicleId,
        bucketCount: last.bucketCount,
        isBucketFull: last.bucketCount >= config.bucketMaxSize,
      };
      queue.forEach((item) => item.resolve(response));

      // After the data is safely stored (and the requests answered)
      this.afterStore(vehicleId, rawReadings);
    } catch (err) {
      queue.forEach((item) => item.reject(err));
    } finally {
      this.busy.delete(vehicleId);
      if (this.pending.size > 0) this._schedule();
    }
  }

  /**
   * Runs after readings are stored, for single readings and for batch uploads:
   * - publishes the newest position to the real-time layer
   * - checks EVERY reading against the geofences, oldest first, so a quick exit
   *   and re-entry between two readings is not missed
   * Never throws and never delays a request.
   */
  afterStore(vehicleId, rawReadings) {
    try {
      const readings = parseBatch(rawReadings).valid; // validated and sorted oldest first
      if (readings.length === 0) return;

      const updates = readings.map((reading) => toUpdate(vehicleId, reading));
      redisService.publishVehicleUpdate(updates[updates.length - 1]);

      for (const update of updates) {
        geofenceService.check(update).forEach((event) => alertService.recordEvent(event));
      }
    } catch (err) {
      console.error(`[Geofence] check failed: ${err.message}`);
    }
  }
}

module.exports = new IngestionService();