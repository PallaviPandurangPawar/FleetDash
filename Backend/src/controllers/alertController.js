const mongoose = require('mongoose');
const Alert = require('../models/Alert');

// GET /api/alerts?vehicleId=&type=exit|enter&acknowledged=true|false&limit=&page=
exports.getAlerts = async (req, res, next) => {
  try {
    const { vehicleId, type, acknowledged, limit = 50, page = 1 } = req.query;

    const filter = {};
    if (vehicleId) filter.vehicleId = vehicleId;
    if (type) filter.type = type;
    if (acknowledged !== undefined) filter.acknowledged = acknowledged === 'true';

    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);

    const [alerts, total] = await Promise.all([
      Alert.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Alert.countDocuments(filter),
    ]);

    res.json({ success: true, total, page: pageNumber, totalPages: Math.ceil(total / pageSize), alerts });
  } catch (error) {
    next(error);
  }
};

// GET /api/alerts/summary
exports.getSummary = async (_req, res, next) => {
  try {
    const [total, unacknowledged, exits, enters] = await Promise.all([
      Alert.countDocuments({}),
      Alert.countDocuments({ acknowledged: false }),
      Alert.countDocuments({ type: 'exit' }),
      Alert.countDocuments({ type: 'enter' }),
    ]);
    res.json({ success: true, total, unacknowledged, exits, enters });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/alerts/:id/acknowledge
exports.acknowledgeAlert = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid alert id' });

    const alert = await Alert.findByIdAndUpdate(id, { acknowledged: true }, { new: true });
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    res.json({ success: true, alert });
  } catch (error) {
    next(error);
  }
};

// POST /api/alerts/acknowledge-all   (optional body: { "vehicleId": "SIM-001" })
exports.acknowledgeAll = async (req, res, next) => {
  try {
    const filter = { acknowledged: false };
    if (req.body && req.body.vehicleId) filter.vehicleId = req.body.vehicleId;

    const result = await Alert.updateMany(filter, { acknowledged: true });
    res.json({ success: true, acknowledged: result.modifiedCount });
  } catch (error) {
    next(error);
  }
};