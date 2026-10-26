const bucketService = require('./bucketService');
const redisService = require('./redisService');
const geofenceService = require('./geofenceService');
const alertService = require('./alertService');
const config = require('../config/config');
const { normalizeReading } = require('../utils/validators');

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
      const result = await bucketService.ingestBatch(
        vehicleId,
        queue.map((item) => item.raw)
      );
      const last = result.buckets[result.buckets.length - 1];
      const response = {
        success: true,
        bucketId: last.bucketId,
        vehicleId,
        bucketCount: last.bucketCount,
        isBucketFull: last.bucketCount >= config.bucketMaxSize,
      };
      queue.forEach((item) => item.resolve(response));

      // After the data is safely stored: tell the real-time layer and check geofences.
      // Neither of these can fail or delay the request.
      const newest = normalizeReading(queue[queue.length - 1].raw);
      if (newest) {
        const update = {
          vehicleId,
          lon: newest.location.coordinates[0],
          lat: newest.location.coordinates[1],
          speed: newest.speed,
          heading: newest.heading,
          fuelLevel: newest.fuelLevel,
          ignition: newest.ignition,
          timestamp: newest.timestamp.getTime(),
        };

        redisService.publishVehicleUpdate(update);

        try {
          geofenceService.check(update).forEach((event) => alertService.recordEvent(event));
        } catch (err) {
          console.error(`[Geofence] check failed: ${err.message}`);
        }
      }
    } catch (err) {
      queue.forEach((item) => item.reject(err));
    } finally {
      this.busy.delete(vehicleId);
      if (this.pending.size > 0) this._schedule();
    }
  }
}

module.exports = new IngestionService();