const mongoose = require('mongoose');
const turf = require('@turf/turf');
const Geofence = require('../models/Geofence');

// Returns an error message if the polygon is not valid, otherwise null
function validatePolygon(coordinates) {
  if (!Array.isArray(coordinates)) {
    return 'coordinates must be a GeoJSON polygon: [[[lon, lat], [lon, lat], ...]]';
  }
  try {
    turf.polygon(coordinates); // checks the ring is closed and has at least 4 points
  } catch (err) {
    return `Invalid polygon: ${err.message}`;
  }
  for (const ring of coordinates) {
    for (const [lon, lat] of ring) {
      if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        return 'Invalid polygon: longitude must be -180..180 and latitude -90..90';
      }
    }
  }
  return null;
}

exports.createGeofence = async (req, res, next) => {
  try {
    const { name, description, coordinates, vehicleIds, active } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const problem = validatePolygon(coordinates);
    if (problem) return res.status(400).json({ error: problem });

    const geofence = await Geofence.create({
      name,
      description,
      polygon: { type: 'Polygon', coordinates },
      vehicleIds: Array.isArray(vehicleIds) ? vehicleIds : [],
      active: active !== false,
    });
    res.status(201).json({ success: true, geofence });
  } catch (error) {
    next(error);
  }
};

exports.getGeofences = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.active !== undefined) filter.active = req.query.active === 'true';
    const geofences = await Geofence.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, count: geofences.length, geofences });
  } catch (error) {
    next(error);
  }
};

exports.getGeofenceById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid geofence id' });
    const geofence = await Geofence.findById(id);
    if (!geofence) return res.status(404).json({ error: 'Geofence not found' });
    res.json({ success: true, geofence });
  } catch (error) {
    next(error);
  }
};

exports.updateGeofence = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid geofence id' });

    const { name, description, coordinates, vehicleIds, active } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (Array.isArray(vehicleIds)) updates.vehicleIds = vehicleIds;
    if (active !== undefined) updates.active = Boolean(active);
    if (coordinates !== undefined) {
      const problem = validatePolygon(coordinates);
      if (problem) return res.status(400).json({ error: problem });
      updates.polygon = { type: 'Polygon', coordinates };
    }

    const geofence = await Geofence.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!geofence) return res.status(404).json({ error: 'Geofence not found' });
    res.json({ success: true, geofence });
  } catch (error) {
    next(error);
  }
};

exports.deleteGeofence = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid geofence id' });
    const geofence = await Geofence.findByIdAndDelete(id);
    if (!geofence) return res.status(404).json({ error: 'Geofence not found' });
    res.json({ success: true, deleted: id });
  } catch (error) {
    next(error);
  }
};