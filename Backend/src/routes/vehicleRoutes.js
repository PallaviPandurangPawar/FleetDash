const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const { requireAdminKey } = require('../middlewares/requireAdminKey');

router.post('/', vehicleController.createVehicle);
router.get('/', vehicleController.getVehicles);
router.get('/:vehicleId', vehicleController.getVehicleById);
router.put('/:vehicleId', vehicleController.updateVehicle);
router.delete('/:vehicleId', requireAdminKey, vehicleController.deleteVehicle);

module.exports = router;
