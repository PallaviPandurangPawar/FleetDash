const Alert = require('../models/Alert');
const redisService = require('./redisService');

/**
 * Saves a geofence event, prints it and broadcasts it to connected clients.
 * Never throws: a failed alert must not affect telemetry ingestion.
 */
async function recordEvent(event) {
  try {
    const alert = await Alert.create({
      type: event.type,
      vehicleId: event.vehicleId,
      geofenceId: event.geofenceId,
      geofenceName: event.geofenceName,
      location: { type: 'Point', coordinates: [event.lon, event.lat] },
      occurredAt: new Date(event.timestamp),
    });

    const what = event.type === 'exit' ? 'LEFT' : 'ENTERED';
    console.log(
      `[Geofence] ALERT ${event.vehicleId} ${what} "${event.geofenceName}" at [${event.lon.toFixed(4)}, ${event.lat.toFixed(4)}]`
    );

    redisService.publishAlert({
      id: String(alert._id),
      type: event.type,
      vehicleId: event.vehicleId,
      geofenceId: event.geofenceId,
      geofenceName: event.geofenceName,
      lon: event.lon,
      lat: event.lat,
      occurredAt: event.timestamp,
    });

    return alert;
  } catch (err) {
    console.error(`[Geofence] could not save alert: ${err.message}`);
    return null;
  }
}

module.exports = { recordEvent };