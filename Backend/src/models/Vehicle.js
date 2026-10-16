const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    vehicleId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    plateNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    make: { type: String, default: 'Generic' },
    model: { type: String, default: 'Truck' },
    year: { type: Number, default: 2024 },
    driverName: { type: String, default: 'Unassigned' },
    status: {
      type: String,
      enum: ['active', 'idle', 'in_transit', 'maintenance', 'offline'],
      default: 'idle',
      index: true,
    },
    lastKnownLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
      updatedAt: { type: Date, default: Date.now },
    },
    lastTelemetry: {
      speed: { type: Number, default: 0 },
      fuelLevel: { type: Number, default: 100 },
      engineTemp: { type: Number, default: 85 },
      batteryVoltage: { type: Number, default: 12.6 },
      timestamp: { type: Date, default: Date.now },
    },
  },
  {
    timestamps: true,
  }
);

vehicleSchema.index({ 'lastKnownLocation.coordinates': '2dsphere' });

module.exports = mongoose.model('Vehicle', vehicleSchema);
