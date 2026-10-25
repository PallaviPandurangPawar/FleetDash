/**
 * Validates and normalizes one raw reading. Returns null if the reading is invalid.
 */
function normalizeReading(item) {
  const c = item && item.coordinates;
  if (!Array.isArray(c) || c.length !== 2) return null;

  const lon = Number(c[0]);
  const lat = Number(c[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;

  const speed = Number(item.speed ?? 0);
  if (!Number.isFinite(speed) || speed < 0) return null;

  const time = new Date(item.timestamp ?? Date.now());
  if (Number.isNaN(time.getTime())) return null;

  return {
    timestamp: time,
    location: { type: 'Point', coordinates: [lon, lat] },
    speed,
    fuelLevel: Number(item.fuelLevel ?? 100),
    engineTemp: Number(item.engineTemp ?? 85),
    batteryVoltage: Number(item.batteryVoltage ?? 12.6),
    odometerKm: Number(item.odometerKm ?? 0),
    heading: Number(item.heading ?? 0),
    ignition: item.ignition === undefined ? true : Boolean(item.ignition),
    alerts: Array.isArray(item.alerts) ? item.alerts : [],
  };
}

/**
 * Validates a whole batch: drops invalid readings and sorts the rest by time.
 */
function parseBatch(readings) {
  const valid = readings
    .map((r) => normalizeReading(r))
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);
  return { valid, rejectedCount: readings.length - valid.length };
}

module.exports = { normalizeReading, parseBatch };