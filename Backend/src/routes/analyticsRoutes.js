const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

router.get('/trip-summary/:vehicleId', analyticsController.getTripAnalytics);
router.post('/geofence-check', analyticsController.evaluateGeofences);
router.get('/worker-stats', analyticsController.getWorkerStats);

module.exports = router;
