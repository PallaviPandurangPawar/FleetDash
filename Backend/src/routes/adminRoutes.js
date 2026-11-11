// Backend/src/routes/adminRoutes.js
// Admin-only routes. Every route in this file needs the x-admin-key header.
const express = require('express');
const { requireAdminKey } = require('../middlewares/requireAdminKey');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.use(requireAdminKey);

// Lets the frontend (and you) check that a key is correct
router.get('/ping', (_req, res) => {
  res.json({ success: true, admin: true });
});

// Create (and optionally trim) the sample FLEET-xxx vehicles
router.post('/vehicles/generate', adminController.generateVehicles);


// Remove the sample data (optionally put the default sample data back)
router.post('/reset', adminController.resetSampleData);

// Control the vehicle simulator
router.post('/simulator/start', adminController.startSimulator);
router.post('/simulator/stop', adminController.stopSimulator);
router.get('/simulator/status', adminController.getSimulatorStatus);

module.exports = router;