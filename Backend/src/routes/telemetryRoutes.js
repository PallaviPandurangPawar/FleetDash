const express = require('express');
const router = express.Router();
const telemetryController = require('../controllers/telemetryController');
const { validateIngest, validateIngestBatch } = require('../middlewares/validateTelemetry');

router.post('/ingest', validateIngest, telemetryController.ingestTelemetry);
router.post('/ingest-batch', validateIngestBatch, telemetryController.ingestBatch);
router.get('/:vehicleId', telemetryController.getVehicleReadings);
router.get('/:vehicleId/bucket-stats', telemetryController.getBucketStats);

module.exports = router;