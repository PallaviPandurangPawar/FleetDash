const Vehicle = require('../models/Vehicle');

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
    const { status, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const vehicles = await Vehicle.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10));

    const total = await Vehicle.countDocuments(filter);

    res.json({
      success: true,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
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

    // Prevent direct manual overwrite of telemetry through this endpoint
    delete updates.lastTelemetry;
    delete updates.lastKnownLocation;

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