// Drives registered vehicles along real OpenStreetMap road routes in the Kolkata service area.
// Routes are fetched from OSRM (configurable with OSRM_ROUTER_URL) and telemetry goes through ingestion.
const Vehicle = require('../models/Vehicle');
const ingestionService = require('./ingestionService');

const CENTER = { lon: 88.3639, lat: 22.5726 };
const SERVICE_BOUNDS = { minLon: 88.31, maxLon: 88.40, minLat: 22.52, maxLat: 22.63 };
const ROUTER_URL = (process.env.OSRM_ROUTER_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const ROUTE_RETRY_MS = 15000;
const MAX_VEHICLES = 500;

const LIMITS = {
  count: { min: 1, max: MAX_VEHICLES, fallback: 20 },
  intervalMs: { min: 250, max: 10000, fallback: 1000 },
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

function insideArea([lon, lat]) {
  return lon >= SERVICE_BOUNDS.minLon && lon <= SERVICE_BOUNDS.maxLon &&
    lat >= SERVICE_BOUNDS.minLat && lat <= SERVICE_BOUNDS.maxLat;
}

function insideCore([lon, lat]) {
  const inset = 0.018;
  return lon >= SERVICE_BOUNDS.minLon + inset && lon <= SERVICE_BOUNDS.maxLon - inset &&
    lat >= SERVICE_BOUNDS.minLat + inset && lat <= SERVICE_BOUNDS.maxLat - inset;
}

function randomPoint() {
  return [
    SERVICE_BOUNDS.minLon + 0.018 + Math.random() * (SERVICE_BOUNDS.maxLon - SERVICE_BOUNDS.minLon - 0.036),
    SERVICE_BOUNDS.minLat + 0.018 + Math.random() * (SERVICE_BOUNDS.maxLat - SERVICE_BOUNDS.minLat - 0.036),
  ];
}

function toTruck(doc) {
  const location = doc.lastKnownLocation?.coordinates || [];
  const position = insideCore(location) ? location : randomPoint();
  const fuel = doc.lastTelemetry?.fuelLevel;
  return {
    vehicleId: doc.vehicleId,
    lon: position[0],
    lat: position[1],
    heading: Math.random() * 360,
    speed: 20 + Math.random() * 25,
    fuel: Number.isFinite(fuel) && fuel > 5 ? fuel : 60 + Math.random() * 40,
    route: [],
    routeIndex: 0,
    retryRouteAt: 0,
    routing: false,
  };
}

function bearing(from, to) {
  const rad = Math.PI / 180;
  const y = Math.sin((to[0] - from[0]) * rad) * Math.cos(to[1] * rad);
  const x = Math.cos(from[1] * rad) * Math.sin(to[1] * rad) -
    Math.sin(from[1] * rad) * Math.cos(to[1] * rad) * Math.cos((to[0] - from[0]) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function routeBetween(from, to) {
  const url = `${ROUTER_URL}/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&steps=false`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Road router returned HTTP ${response.status}`);
  const result = await response.json();
  const coordinates = result.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) throw new Error('No drivable road route found');
  // Keep the in-zone portion of a real road route. At the boundary the truck replans toward
  // another in-zone destination, so the marker never wanders outside the operating area.
  const safeRoute = [];
  for (const coordinate of coordinates) {
    if (!insideArea(coordinate)) break;
    safeRoute.push(coordinate);
  }
  if (safeRoute.length < 2) throw new Error('No drivable road segment inside the fleet service area');
  return safeRoute;
}

async function mapWithConcurrency(items, limit, task) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await task(items[index]);
    }
  });
  await Promise.all(workers);
}

class SimulatorService {
  constructor() {
    this.timer = null;
    this.ticking = false;
    this.trucks = [];
    this.running = false;
    this.requested = 0;
    this.intervalMs = LIMITS.intervalMs.fallback;
    this.timeScale = LIMITS.timeScale.fallback;
    this.startedAt = null;
    this.sent = 0;
    this.failed = 0;
    this.lastError = null;
    this.routeFailures = 0;
    this.lastVehicleSyncAt = 0;
  }

  async start(options = {}) {
    const count = checkOption('count', options.count);
    const intervalMs = checkOption('intervalMs', options.intervalMs);
    const timeScale = checkOption('timeScale', options.timeScale);
    const docs = await Vehicle.find({}, 'vehicleId lastKnownLocation lastTelemetry').sort({ vehicleId: 1 }).limit(count).lean();
    if (docs.length === 0) throw httpError(409, 'No vehicles are registered yet: generate or add vehicles first');

    this.stop();
    this.trucks = docs.map(toTruck);
    this.requested = count;
    this.intervalMs = intervalMs;
    this.timeScale = timeScale;
    this.startedAt = new Date().toISOString();
    this.sent = 0;
    this.failed = 0;
    this.routeFailures = 0;
    this.lastError = null;
    this.running = true;

    // Route the initial fleet before advertising live movement; cap concurrency for public router fairness.
    await mapWithConcurrency(this.trucks, 4, async (truck) => {
      try { await this._planRoute(truck); }
      catch (err) {
        truck.retryRouteAt = Date.now() + ROUTE_RETRY_MS;
        this._recordRouteFailure(err);
      }
    });

    this.timer = setInterval(() => this._tick(), intervalMs);
    this.timer.unref();
    return this.status();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
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
      routeFailures: this.routeFailures,
      routingProvider: ROUTER_URL,
      lastError: this.lastError,
    };
  }

  async dropMissingVehicles() {
    if (this.trucks.length === 0) return;
    const ids = this.trucks.map((truck) => truck.vehicleId);
    const existing = await Vehicle.find({ vehicleId: { $in: ids } }, 'vehicleId').lean();
    const stillThere = new Set(existing.map((doc) => doc.vehicleId));
    this.trucks = this.trucks.filter((truck) => stillThere.has(truck.vehicleId));
  }

  async _planRoute(truck) {
    if (truck.routing) return;
    truck.routing = true;
    try {
      const from = [truck.lon, truck.lat];
      let route;
      let lastError;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          route = await routeBetween(from, randomPoint());
          break;
        } catch (err) { lastError = err; }
      }
      if (!route) throw lastError || new Error('Unable to find a route inside the service area');
      truck.route = route;
      truck.routeIndex = 1;
      truck.retryRouteAt = 0;
      truck.lon = route[0][0];
      truck.lat = route[0][1];
      truck.heading = bearing(route[0], route[1]);
    } finally {
      truck.routing = false;
    }
  }

  _recordRouteFailure(err) {
    this.routeFailures += 1;
    this.lastError = err.message;
  }

  async _syncNewVehicles() {
    if (Date.now() - this.lastVehicleSyncAt < 15000) return;
    this.lastVehicleSyncAt = Date.now();
    const docs = await Vehicle.find({}, 'vehicleId lastKnownLocation lastTelemetry').sort({ vehicleId: 1 }).limit(MAX_VEHICLES).lean();
    const known = new Set(this.trucks.map((truck) => truck.vehicleId));
    const additions = docs.filter((doc) => !known.has(doc.vehicleId)).map(toTruck);
    await mapWithConcurrency(additions, 4, async (truck) => {
      this.trucks.push(truck);
      try { await this._planRoute(truck); }
      catch (err) {
        truck.retryRouteAt = Date.now() + ROUTE_RETRY_MS;
        this._recordRouteFailure(err);
      }
    });
  }

  async _move(truck) {
    if (!truck.route.length || truck.routeIndex >= truck.route.length) {
      if (Date.now() < truck.retryRouteAt || truck.routing) return false;
      try { await this._planRoute(truck); }
      catch (err) {
        truck.retryRouteAt = Date.now() + ROUTE_RETRY_MS;
        this._recordRouteFailure(err);
        return false;
      }
    }

    truck.speed = Math.max(10, Math.min(55, truck.speed + (Math.random() - 0.5) * 5));
    truck.fuel = Math.max(5, truck.fuel - 0.002);
    let remainingKm = (truck.speed * (this.intervalMs / 3600000) * this.timeScale);

    while (remainingKm > 0 && truck.routeIndex < truck.route.length) {
      const from = [truck.lon, truck.lat];
      const to = truck.route[truck.routeIndex];
      const segmentKm = distanceKm(from, to);
      if (segmentKm <= remainingKm || segmentKm < 0.002) {
        truck.lon = to[0];
        truck.lat = to[1];
        truck.heading = bearing(from, to);
        remainingKm -= segmentKm;
        truck.routeIndex += 1;
      } else {
        const ratio = remainingKm / segmentKm;
        truck.lon += (to[0] - truck.lon) * ratio;
        truck.lat += (to[1] - truck.lat) * ratio;
        truck.heading = bearing(from, to);
        remainingKm = 0;
      }
    }

    if (!insideArea([truck.lon, truck.lat])) {
      // Do not publish an out-of-zone point; route it back into the service area.
      truck.lon = CENTER.lon;
      truck.lat = CENTER.lat;
      truck.route = [];
      truck.routeIndex = 0;
    }
    if (truck.routeIndex >= truck.route.length) truck.route = [];
    return true;
  }

  async _tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this._syncNewVehicles();
      await Promise.all(this.trucks.map(async (truck) => {
        try {
          const moved = await this._move(truck);
          if (!moved) return;
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
      }));
    } finally {
      this.ticking = false;
    }
  }
}

module.exports = new SimulatorService();
