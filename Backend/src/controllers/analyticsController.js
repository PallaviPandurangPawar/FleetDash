const workerPool = require('../workers/workerPool');
const bucketService = require('../services/bucketService');

const MAX_READINGS = 10000;

// Safe reading limit: a missing or bad value falls back to the default
function parseLimit(value, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, MAX_READINGS);
}

// A geofence for the geofence check needs a name and a ring of at least 3 [longitude, latitude] positions
function geofenceProblem(fence, index) {
  if (!fence || typeof fence.name !== 'string' || fence.name === '') {
    return `geofences[${index}] needs a name`;
  }
  const ring = fence.polygon;
  const validRing =
    Array.isArray(ring) &&
    ring.length >= 3 &&
    ring.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  if (!validRing) {
    return `geofences[${index}].polygon must be an array of at least 3 [longitude, latitude] positions`;
  }
  return null;
}

exports.getTripAnalytics = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const { vehicleId } = req.params;
    const { startTime: queryStart, endTime: queryEnd, speedLimit, harshBrakeThreshold } = req.query;
    const limit = parseLimit(req.query.limit, 2000);

    const readings = await bucketService.getVehicleReadings(vehicleId, queryStart, queryEnd, limit);

    if (readings.length === 0) {
      return res.json({
        success: true,
        vehicleId,
        message: 'No telemetry data found for the specified window',
        analytics: null,
      });
    }

    const analytics = await workerPool.runTask('COMPUTE_TRIP_ANALYTICS', {
      readings,
      options: {
        speedLimit: speedLimit ? Number(speedLimit) : 80,
        harshBrakeThreshold: harshBrakeThreshold ? Number(harshBrakeThreshold) : 25,
      },
    });

    const executionTimeMs = Date.now() - startTime;

    res.json({
      success: true,
      vehicleId,
      processedBy: 'worker_threads',
      executionTimeMs,
      analytics,
    });
  } catch (error) {
    next(error);
  }
};

exports.evaluateGeofences = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const { vehicleId, geofences } = req.body;
    if (!vehicleId || !Array.isArray(geofences) || geofences.length === 0) {
      return res.status(400).json({ error: 'vehicleId and a non-empty geofences array are required' });
    }

    for (let i = 0; i < geofences.length; i++) {
      const problem = geofenceProblem(geofences[i], i);
      if (problem) return res.status(400).json({ error: problem });
    }

    const limit = parseLimit(req.body.limit, 1000);
    const readings = await bucketService.getVehicleReadings(vehicleId, null, null, limit);
    const breaches = await workerPool.runTask('EVALUATE_GEOFENCES', { readings, geofences });
    const executionTimeMs = Date.now() - startTime;

    res.json({
      success: true,
      vehicleId,
      processedBy: 'worker_threads',
      executionTimeMs,
      totalBreachesFound: breaches.length,
      breaches,
    });
  } catch (error) {
    next(error);
  }
};

exports.getWorkerStats = async (req, res) => {
  const stats = workerPool.getStats();
  res.json({
    success: true,
    workerPool: stats,
    memoryUsage: process.memoryUsage(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
};