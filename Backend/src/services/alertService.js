const Alert = require('../models/Alert');

/**
 * Saves a geofence event and prints it in the server log.
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
    return alert;
  } catch (err) {
    console.error(`[Geofence] could not save alert: ${err.message}`);
    return null;
  }
}

module.exports = { recordEvent };