const mongoose = require('mongoose');
const Vehicle = require('../models/Vehicle');

// How long the newest positions are collected before they are written together
const FLUSH_MS = parseInt(process.env.VEHICLE_FLUSH_MS, 10) || 500;

/**
 * Keeps the "last known position" of the vehicles up to date without one database write per reading.
 * The newest reading of each vehicle is remembered and all of them are written in ONE bulk write
 * every half second. (The live map does not wait for this: it gets positions through Redis.)
 */
class VehicleStateWriter {
  constructor() {
    this.pending = new Map(); // vehicleId -> newest reading waiting to be written
    this.timer = null;
  }

  /** Remembers the newest reading of a vehicle. It is written with the next flush. */
  record(vehicleId, reading) {
    const waiting = this.pending.get(vehicleId);
    if (waiting && waiting.timestamp.getTime() > reading.timestamp.getTime()) return; // a newer one is waiting

    this.pending.set(vehicleId, reading);

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, FLUSH_MS);
      this.timer.unref(); // never keeps the program alive
    }
  }

  /** Writes everything that is waiting. Never throws. */
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.size === 0) return;
    if (mongoose.connection.readyState !== 1) {
      this.pending = new Map(); // the database is not reachable: the next readings bring newer positions anyway
      return;
    }

    const batch = this.pending;
    this.pending = new Map();

    const operations = [...batch].map(([vehicleId, last]) => ({
      updateOne: {
        filter: { vehicleId },
        update: {
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
        },
      },
    }));

    try {
      await Vehicle.bulkWrite(operations, { ordered: false });
    } catch (err) {
      console.error(`[Vehicle Update Error] ${err.message}`);
    }
  }
}

module.exports = new VehicleStateWriter();