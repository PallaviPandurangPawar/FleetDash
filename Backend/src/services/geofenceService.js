const turf = require('@turf/turf');
const Geofence = require('../models/Geofence');

const REFRESH_MS = parseInt(process.env.GEOFENCE_REFRESH_MS, 10) || 5000;

/**
 * Keeps the active geofences in memory and detects when a vehicle crosses a
 * boundary. The state (inside or outside) is remembered per vehicle and geofence.
 */
class GeofenceService {
  constructor() {
    this.fences = []; // { id, name, vehicleIds (Set or null = all), polygon, bbox }
    this.state = new Map(); // "vehicleId|geofenceId" -> true if the vehicle was inside
    this.started = false;
    this.lastCount = -1;
  }

  _start() {
    this.started = true;
    this.refresh();
    const timer = setInterval(() => this.refresh(), REFRESH_MS);
    timer.unref();
  }

  async refresh() {
    try {
      const docs = await Geofence.find({ active: true }).lean();
      this.fences = docs.map((d) => {
        const polygon = turf.polygon(d.polygon.coordinates);
        return {
          id: String(d._id),
          name: d.name,
          vehicleIds: d.vehicleIds && d.vehicleIds.length > 0 ? new Set(d.vehicleIds) : null,
          polygon,
          bbox: turf.bbox(polygon),
        };
      });

      // Forget the state of geofences that were deleted or switched off
      const alive = new Set(this.fences.map((f) => f.id));
      for (const key of this.state.keys()) {
        if (!alive.has(key.split('|')[1])) this.state.delete(key);
      }

      if (this.fences.length !== this.lastCount) {
        console.log(`[Geofence] ${this.fences.length} active geofence(s) loaded`);
        this.lastCount = this.fences.length;
      }
    } catch (err) {
      console.error(`[Geofence] could not load geofences: ${err.message}`);
    }
  }

  _isInside(point, update, fence) {
    // Cheap rectangle test first, the exact polygon test only if it passes
    const [minX, minY, maxX, maxY] = fence.bbox;
    if (update.lon < minX || update.lon > maxX || update.lat < minY || update.lat > maxY) return false;
    return turf.booleanPointInPolygon(point, fence.polygon);
  }

  /**
   * Checks one vehicle position. Returns the list of events (exit / enter)
   * caused by this position. Usually empty.
   */
  check(update) {
    if (!this.started) this._start();
    if (this.fences.length === 0) return [];

    const point = turf.point([update.lon, update.lat]);
    const events = [];

    for (const fence of this.fences) {
      if (fence.vehicleIds && !fence.vehicleIds.has(update.vehicleId)) continue;

      const inside = this._isInside(point, update, fence);
      const key = `${update.vehicleId}|${fence.id}`;
      const wasInside = this.state.get(key);
      this.state.set(key, inside);

      // First time we see this vehicle, or no change: nothing to report
      if (wasInside === undefined || wasInside === inside) continue;

      events.push({
        type: inside ? 'enter' : 'exit',
        vehicleId: update.vehicleId,
        geofenceId: fence.id,
        geofenceName: fence.name,
        lon: update.lon,
        lat: update.lat,
        timestamp: update.timestamp,
      });
    }

    return events;
  }
}

module.exports = new GeofenceService();