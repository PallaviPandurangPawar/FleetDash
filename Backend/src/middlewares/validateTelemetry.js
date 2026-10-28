// Backend/src/middlewares/validateTelemetry.js
// Checks incoming telemetry BEFORE it reaches the controller.
const { normalizeReading } = require('../utils/validators');

// The binary format stores the vehicle ID in 16 bytes, so longer IDs would be cut off.
const VEHICLE_ID_PATTERN = /^[A-Za-z0-9_-]{1,16}$/;
const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE, 10) || 5000;

function reject(res, message) {
  return res.status(400).json({ success: false, error: message });
}

function checkVehicleId(vehicleId) {
  if (typeof vehicleId !== 'string' || vehicleId.length === 0) {
    return 'vehicleId is required and must be a string';
  }
  if (!VEHICLE_ID_PATTERN.test(vehicleId)) {
    return 'vehicleId must be 1-16 characters: letters, numbers, "-" or "_"';
  }
  return null;
}

/** POST /api/telemetry/ingest : one reading */
function validateIngest(req, res, next) {
  const body = req.body || {};

  const idError = checkVehicleId(body.vehicleId);
  if (idError) return reject(res, idError);

  if (!Array.isArray(body.coordinates) || body.coordinates.length !== 2) {
    return reject(res, 'coordinates must be an array of [longitude, latitude]');
  }

  if (!normalizeReading(body)) {
    return reject(res, 'Invalid reading: check coordinate ranges (lon -180..180, lat -90..90), speed (>= 0) and timestamp');
  }

  next();
}

/** POST /api/telemetry/ingest-batch : many readings for one vehicle */
function validateIngestBatch(req, res, next) {
  const body = req.body || {};

  const idError = checkVehicleId(body.vehicleId);
  if (idError) return reject(res, idError);

  if (!Array.isArray(body.readings) || body.readings.length === 0) {
    return reject(res, 'readings must be a non-empty array');
  }

  if (body.readings.length > MAX_BATCH_SIZE) {
    return reject(res, `A batch can contain at most ${MAX_BATCH_SIZE} readings`);
  }

  next();
}

module.exports = { validateIngest, validateIngestBatch, MAX_BATCH_SIZE };