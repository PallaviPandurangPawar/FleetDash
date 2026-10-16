const bucketService = require('../services/bucketService');

exports.ingestTelemetry = async (req, res, next) => {
  try {
    const { vehicleId, coordinates } = req.body;
    if (!vehicleId) return res.status(400).json({ error: 'vehicleId is required' });
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
      return res.status(400).json({ error: 'coordinates must be an array of [longitude, latitude]' });
    }
    const result = await bucketService.ingestTelemetry(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

exports.ingestBatch = async (req, res, next) => {
  try {
    const { vehicleId, readings } = req.body;
    if (!vehicleId || !Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({ error: 'vehicleId and a non-empty readings array are required' });
    }
    const results = await bucketService.ingestBatch(vehicleId, readings);
    res.status(201).json({ success: true, vehicleId, ingestedCount: results.length, details: results });
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
