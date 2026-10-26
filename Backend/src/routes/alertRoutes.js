const express = require('express');
const controller = require('../controllers/alertController');

const router = express.Router();

router.get('/', controller.getAlerts);
router.get('/summary', controller.getSummary);
router.post('/acknowledge-all', controller.acknowledgeAll);
router.patch('/:id/acknowledge', controller.acknowledgeAlert);

module.exports = router;