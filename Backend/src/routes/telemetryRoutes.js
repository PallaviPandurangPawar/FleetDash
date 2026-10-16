const express = require('express');
const router = express.Router();
const telemetryController = require('../controllers/telemetryController');

router.post('/ingest', telemetryController.ingestTelemetry);
router.post('/ingest-batch', telemetryController.ingestBatch);
router.get('/:vehicleId', telemetryController.getVehicleReadings);
router.get('/:vehicleId/bucket-stats', telemetryController.getBucketStats);

module.exports = router;
