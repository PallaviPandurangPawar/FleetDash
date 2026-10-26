const express = require('express');
const controller = require('../controllers/geofenceController');

const router = express.Router();

router.post('/', controller.createGeofence);
router.get('/', controller.getGeofences);
router.get('/:id', controller.getGeofenceById);
router.put('/:id', controller.updateGeofence);
router.delete('/:id', controller.deleteGeofence);

module.exports = router;