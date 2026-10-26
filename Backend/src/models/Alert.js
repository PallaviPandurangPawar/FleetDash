const mongoose = require('mongoose');

/**
 * One geofence event for one vehicle: it left a zone ('exit') or came back ('enter').
 */
const alertSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['exit', 'enter'], required: true },
    vehicleId: { type: String, required: true },
    geofenceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    geofenceName: { type: String, default: '' },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [longitude, latitude]
    },
    occurredAt: { type: Date, required: true },
    acknowledged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

alertSchema.index({ createdAt: -1 });
alertSchema.index({ vehicleId: 1, createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);