const workerPool = require('../workers/workerPool');
const bucketService = require('../services/bucketService');

exports.getTripAnalytics = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const { vehicleId } = req.params;
    const { startTime: queryStart, endTime: queryEnd, limit = 2000, speedLimit, harshBrakeThreshold } = req.query;

    const readings = await bucketService.getVehicleReadings(vehicleId, queryStart, queryEnd, parseInt(limit, 10));

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
    const { vehicleId, geofences, limit = 1000 } = req.body;
    if (!vehicleId || !Array.isArray(geofences) || geofences.length === 0) {
      return res.status(400).json({ error: 'vehicleId and a non-empty geofences array are required' });
    }

    const readings = await bucketService.getVehicleReadings(vehicleId, null, null, parseInt(limit, 10));
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
