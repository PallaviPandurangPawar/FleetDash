const Vehicle = require('../models/Vehicle');
const TelemetryBucket = require('../models/TelemetryBucket');
const Alert = require('../models/Alert');

exports.createVehicle = async (req, res, next) => {
  try {
    const { vehicleId, plateNumber, make, model, year, driverName } = req.body;

    if (!vehicleId || !plateNumber) {
      return res.status(400).json({ error: 'vehicleId and plateNumber are required' });
    }

    const existing = await Vehicle.findOne({ vehicleId });
    if (existing) {
      return res.status(409).json({ error: `Vehicle ${vehicleId} already exists` });
    }

    const vehicle = await Vehicle.create({
      vehicleId,
      plateNumber,
      make,
      model,
      year,
      driverName,
    });

    res.status(201).json({ success: true, vehicle });
  } catch (error) {
    next(error);
  }
};

exports.getVehicles = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    // Safe paging: bad values fall back to defaults instead of crashing
    const pageSize = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const pageNumber = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const vehicles = await Vehicle.find(filter)
      .sort({ updatedAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    const total = await Vehicle.countDocuments(filter);

    res.json({
      success: true,
      total,
      page: pageNumber,
      totalPages: Math.ceil(total / pageSize),
      vehicles,
    });
  } catch (error) {
    next(error);
  }
};

exports.getVehicleById = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;
    const vehicle = await Vehicle.findOne({ vehicleId });

    if (!vehicle) {
      return res.status(404).json({ error: `Vehicle ${vehicleId} not found` });
    }

    res.json({ success: true, vehicle });
  } catch (error) {
    next(error);
  }
};

exports.updateVehicle = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;
    const updates = req.body;

    // Telemetry comes from the ingest API, and the vehicleId is the vehicle's identity:
    // neither can be changed through this endpoint
    delete updates.lastTelemetry;
    delete updates.lastKnownLocation;
    delete updates.vehicleId;

    const vehicle = await Vehicle.findOneAndUpdate({ vehicleId }, updates, {
      new: true,
      runValidators: true,
    });

    if (!vehicle) {
      return res.status(404).json({ error: `Vehicle ${vehicleId} not found` });
    }

    res.json({ success: true, vehicle });
  } catch (error) {
    next(error);
  }
};


exports.deleteVehicle = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;
    const deleteHistory = req.query.deleteHistory === 'true';

    const deleted = await Vehicle.findOneAndDelete({ vehicleId });
    if (!deleted) {
      return res.status(404).json({ error: `Vehicle ${vehicleId} not found` });
    }

    // Optional clean-up of this vehicle's stored history
    let removed = { telemetryBuckets: 0, alerts: 0 };
    if (deleteHistory) {
      const [buckets, alerts] = await Promise.all([
        TelemetryBucket.deleteMany({ vehicleId }),
        Alert.deleteMany({ vehicleId }),
      ]);
      removed = { telemetryBuckets: buckets.deletedCount, alerts: alerts.deletedCount };
    }

    res.json({ success: true, deleted: vehicleId, historyDeleted: deleteHistory, removed });
  } catch (error) {
    next(error);
  }
};