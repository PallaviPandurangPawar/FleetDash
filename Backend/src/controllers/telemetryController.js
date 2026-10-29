const bucketService = require('../services/bucketService');
const ingestionService = require('../services/ingestionService');

// Input is already validated by middlewares/validateTelemetry.js

exports.ingestTelemetry = async (req, res, next) => {
  try {
    const result = await ingestionService.add(req.body.vehicleId, req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

exports.ingestBatch = async (req, res, next) => {
  try {
    const { vehicleId, readings } = req.body;
    const result = await bucketService.ingestBatch(vehicleId, readings);
    res.status(201).json({ success: true, vehicleId, ...result });

    // After the response: update the live map and check geofences for every stored reading
    ingestionService.afterStore(vehicleId, readings);
  } catch (error) {
    next(error);
  }
};

exports.getVehicleReadings = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;
    const { startTime, endTime, limit = 500 } = req.query;
    const readings = await bucketService.getVehicleReadings(vehicleId, startTime, endTime, parseInt(limit, 10));
    res.json({ success: true, vehicleId, count: readings.length, readings });
  } catch (error) {
    next(error);
  }
};

exports.getBucketStats = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;
    const stats = await bucketService.getBucketStats(vehicleId);
    res.json({ success: true, vehicleId, bucketPatternStats: stats });
  } catch (error) {
    next(error);
  }
};