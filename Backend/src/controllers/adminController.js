// Backend/src/controllers/adminController.js
// Admin-only actions. These routes are protected by requireAdminKey (see adminRoutes.js).
const Vehicle = require('../models/Vehicle');
const { runSeed, VEHICLE_PREFIX } = require('../../scripts/seed');
const simulatorService = require('../services/simulatorService');

const MAX_COUNT = 500;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/**
 * POST /api/admin/vehicles/generate   body: { "count": 25, "trim": false }
 * Makes sure the sample vehicles FLEET-001 ... FLEET-<count> exist (missing ones are created, existing ones
 * are not changed). With "trim": true, sample vehicles numbered above <count> are removed as well.
 */
exports.generateVehicles = async (req, res, next) => {
  try {
    const { count, trim = false } = req.body || {};

    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
      return next(badRequest(`count must be a whole number from 1 to ${MAX_COUNT}`));
    }
    if (typeof trim !== 'boolean') {
      return next(badRequest('trim must be true or false'));
    }

    const result = await runSeed({ count, withGeofences: false });

    let removed = 0;
    if (trim) {
      const sample = await Vehicle.find({ vehicleId: { $regex: `^${VEHICLE_PREFIX}\\d+$` } }, 'vehicleId').lean();
      const extraIds = sample
        .filter((v) => parseInt(v.vehicleId.slice(VEHICLE_PREFIX.length), 10) > count)
        .map((v) => v.vehicleId);

      if (extraIds.length > 0) {
        const deleted = await Vehicle.deleteMany({ vehicleId: { $in: extraIds } });
        removed = deleted.deletedCount;
        await simulatorService.dropMissingVehicles();
      }
    }

    const totalVehicles = await Vehicle.countDocuments({});

    res.json({
      success: true,
      requested: count,
      created: result.vehicles.created,
      alreadyThere: result.vehicles.existing,
      removed,
      totalVehicles,
    });
  } catch (err) {
    next(err);
  }
};


/**
 * POST /api/admin/reset   body: { "confirm": true, "restore": false }
 * Removes ONLY what the seed script created (FLEET-xxx vehicles, their telemetry and alerts, and the sample
 * geofences). With "restore": true the default sample data (10 vehicles and 3 geofences) is created again.
 */
exports.resetSampleData = async (req, res, next) => {
  try {
    const { confirm, restore = false } = req.body || {};

    if (confirm !== true) {
      return next(badRequest('Send {"confirm": true} to reset the sample data'));
    }
    if (typeof restore !== 'boolean') {
      return next(badRequest('restore must be true or false'));
    }

    const { removed } = await runSeed({ reset: true });
    await simulatorService.dropMissingVehicles();
    const restored = restore ? await runSeed({ count: 10 }) : null;

    res.json({ success: true, removed, restored });
  } catch (err) {
    next(err);
  }
};


/**
 * POST /api/admin/simulator/start   body (all optional): { "count": 20, "intervalMs": 1000, "timeScale": 10 }
 * Starts the simulator on the first <count> registered vehicles. If it is already running, it restarts.
 */
exports.startSimulator = async (req, res, next) => {
  try {
    const simulator = await simulatorService.start(req.body || {});
    res.json({ success: true, simulator });
  } catch (err) {
    next(err);
  }
};

/** POST /api/admin/simulator/stop */
exports.stopSimulator = (_req, res) => {
  res.json({ success: true, simulator: simulatorService.stop() });
};

/** GET /api/admin/simulator/status */
exports.getSimulatorStatus = (_req, res) => {
  res.json({ success: true, simulator: simulatorService.status() });
};