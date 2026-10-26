const mongoose = require('mongoose');

/**
 * A geofence is a polygon (GeoJSON) that vehicles are expected to stay inside.
 * vehicleIds empty = the geofence applies to every vehicle.
 */
const geofenceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    polygon: {
      type: { type: String, enum: ['Polygon'], default: 'Polygon' },
      coordinates: { type: [[[Number]]], required: true }, // [ring][point][lon, lat]
    },
    vehicleIds: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

geofenceSchema.index({ active: 1 });

module.exports = mongoose.model('Geofence', geofenceSchema);