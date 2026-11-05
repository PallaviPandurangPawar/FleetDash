// Backend/src/services/simulatorService.js
// Drives the registered vehicles around Kolkata and stores their GPS readings, like a real fleet would.
// Started and stopped through the admin API (see adminRoutes.js). Readings go straight into the ingestion
// service, so no HTTP calls and no vehicle registration are needed.
const Vehicle = require('../models/Vehicle');
const ingestionService = require('./ingestionService');

const CENTER = { lon: 88.3639, lat: 22.5726 }; // Kolkata

const LIMITS = {
  count: { min: 1, max: 500, fallback: 20 },
  intervalMs: { min: 250, max: 10000, fallback: 1000 },
  // timeScale makes trucks move faster on the map (10 = each tick simulates 10 seconds of driving)
  timeScale: { min: 1, max: 100, fallback: 10 },
};

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function checkOption(name, value) {
  const { min, max, fallback } = LIMITS[name];
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw httpError(400, `${name} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

// Builds the moving state of one truck from its database record
function toTruck(doc) {
  const [lon, lat] = (doc.lastKnownLocation && doc.lastKnownLocation.coordinates) || [0, 0];
  const hasPosition = Math.abs(lon) > 1 || Math.abs(lat) > 1; // new vehicles start at [0, 0]
  const fuel = doc.lastTelemetry && doc.lastTelemetry.fuelLevel;

  return {
    vehicleId: doc.vehicleId,
    lon: hasPosition ? lon : CENTER.lon + (Math.random() - 0.5) * 0.1,
    lat: hasPosition ? lat : CENTER.lat + (Math.random() - 0.5) * 0.1,
    heading: Math.random() * 360,
    speed: 20 + Math.random() * 40,
    fuel: Number.isFinite(fuel) && fuel > 5 ? fuel : 60 + Math.random() * 40,
  };
}

class SimulatorService {
  constructor() {
    this.timer = null;
    this.ticking = false; // true while one round of readings is still being stored
    this.trucks = [];
    this.running = false;
    this.requested = 0;
    this.intervalMs = LIMITS.intervalMs.fallback;
    this.timeScale = LIMITS.timeScale.fallback;
    this.startedAt = null;
    this.sent = 0;
    this.failed = 0;
    this.lastError = null;
  }

  /** Starts (or restarts) the simulation. Options: count, intervalMs, timeScale (all optional). */
  async start(options = {}) {
    const count = checkOption('count', options.count);
    const intervalMs = checkOption('intervalMs', options.intervalMs);
    const timeScale = checkOption('timeScale', options.timeScale);

    const docs = await Vehicle.find({}, 'vehicleId lastKnownLocation lastTelemetry')
      .sort({ vehicleId: 1 })
      .limit(count)
      .lean();

    if (docs.length === 0) {
      throw httpError(409, 'No vehicles are registered yet: generate or add vehicles first');
    }

    this.stop(); // restart cleanly when it is already running

    this.trucks = docs.map(toTruck);
    this.requested = count;
    this.intervalMs = intervalMs;
    this.timeScale = timeScale;
    this.startedAt = new Date().toISOString();
    this.sent = 0;
    this.failed = 0;
    this.lastError = null;
    this.running = true;

    this.timer = setInterval(() => this._tick(), intervalMs);
    this.timer.unref(); // never keeps the program alive on its own

    return this.status();
  }

  /** Stops the simulation. The counters stay visible until the next start. Safe to call at any time. */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    return this.status();
  }

  status() {
    return {
      running: this.running,
      vehicles: this.trucks.length,
      requested: this.requested,
      intervalMs: this.intervalMs,
      timeScale: this.timeScale,
      startedAt: this.startedAt,
      sent: this.sent,
      failed: this.failed,
      lastError: this.lastError,
    };
  }

    /** Drops simulated trucks whose vehicle no longer exists (after a delete, trim or reset). */
  async dropMissingVehicles() {
    if (this.trucks.length === 0) return;

    const ids = this.trucks.map((truck) => truck.vehicleId);
    const existing = await Vehicle.find({ vehicleId: { $in: ids } }, 'vehicleId').lean();
    const stillThere = new Set(existing.map((doc) => doc.vehicleId));

    this.trucks = this.trucks.filter((truck) => stillThere.has(truck.vehicleId));
  }
  
  _move(truck) {
    truck.heading = (truck.heading + (Math.random() - 0.5) * 30 + 360) % 360;
    truck.speed = Math.max(0, Math.min(80, truck.speed + (Math.random() - 0.5) * 10));
    truck.fuel = Math.max(5, truck.fuel - 0.01);

    const hours = (this.intervalMs / 3600000) * this.timeScale;
    const distKm = truck.speed * hours;
    const rad = (truck.heading * Math.PI) / 180;
    truck.lat += (distKm * Math.cos(rad)) / 110.574;
    truck.lon += (distKm * Math.sin(rad)) / (111.32 * Math.cos((truck.lat * Math.PI) / 180));
  }

  async _tick() {
    if (this.ticking) return; // the previous round is still being stored: skip this one
    this.ticking = true;

    try {
      await Promise.all(
        this.trucks.map(async (truck) => {
          this._move(truck);
          try {
            await ingestionService.add(truck.vehicleId, {
              vehicleId: truck.vehicleId,
              coordinates: [truck.lon, truck.lat],
              speed: Math.round(truck.speed),
              heading: Math.round(truck.heading),
              fuelLevel: Number(truck.fuel.toFixed(1)),
              engineTemp: 80 + Math.round(Math.random() * 15),
              ignition: true,
            });
            this.sent += 1;
          } catch (err) {
            this.failed += 1;
            this.lastError = err.message;
          }
        })
      );
    } finally {
      this.ticking = false;
    }
  }
}

module.exports = new SimulatorService();