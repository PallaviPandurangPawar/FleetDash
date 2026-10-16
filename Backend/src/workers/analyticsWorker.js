const { parentPort } = require('worker_threads');

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function haversineDistance(coord1, coord2) {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function isPointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

function computeTripAnalytics(readings, options = {}) {
  const speedLimit = options.speedLimit || 80;
  const harshBrakeThreshold = options.harshBrakeThreshold || 25;

  if (!readings || readings.length === 0) {
    return {
      totalPoints: 0,
      totalDistanceKm: 0,
      durationMinutes: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      speedingCount: 0,
      harshBrakingCount: 0,
      idleDurationMinutes: 0,
      safetyScore: 100,
    };
  }

  let totalDistanceKm = 0;
  let maxSpeed = 0;
  let sumSpeed = 0;
  let speedingCount = 0;
  let harshBrakingCount = 0;
  let idlePings = 0;

  for (let i = 0; i < readings.length; i++) {
    const current = readings[i];
    const currentSpeed = current.speed || 0;

    sumSpeed += currentSpeed;
    if (currentSpeed > maxSpeed) maxSpeed = currentSpeed;
    if (currentSpeed > speedLimit) speedingCount++;
    if (currentSpeed < 2) idlePings++;

    if (i > 0) {
      const prev = readings[i - 1];
      const prevCoords = prev.location?.coordinates || prev.coordinates;
      const currCoords = current.location?.coordinates || current.coordinates;

      if (prevCoords && currCoords) {
        const dist = haversineDistance(prevCoords, currCoords);
        if (!isNaN(dist) && dist < 100) {
          totalDistanceKm += dist;
        }
      }

      const speedDiff = (prev.speed || 0) - currentSpeed;
      if (speedDiff > harshBrakeThreshold) {
        harshBrakingCount++;
      }
    }
  }

  const startTime = new Date(readings[0].timestamp).getTime();
  const endTime = new Date(readings[readings.length - 1].timestamp).getTime();
  const durationMinutes = Math.max(0, (endTime - startTime) / (1000 * 60));
  const idleRatio = readings.length > 0 ? idlePings / readings.length : 0;
  const idleDurationMinutes = durationMinutes * idleRatio;
  const avgSpeed = readings.length > 0 ? sumSpeed / readings.length : 0;

  let safetyDeduction = speedingCount * 2 + harshBrakingCount * 5;
  const safetyScore = Math.max(10, Math.min(100, Math.round(100 - safetyDeduction)));

  return {
    totalPoints: readings.length,
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
    durationMinutes: Number(durationMinutes.toFixed(1)),
    avgSpeed: Number(avgSpeed.toFixed(1)),
    maxSpeed: Number(maxSpeed.toFixed(1)),
    speedingCount,
    harshBrakingCount,
    idleDurationMinutes: Number(idleDurationMinutes.toFixed(1)),
    safetyScore,
  };
}

function evaluateGeofences(readings, geofences) {
  const events = [];
  for (const fence of geofences) {
    const { name, polygon } = fence;
    for (const reading of readings) {
      const coords = reading.location?.coordinates || reading.coordinates;
      if (coords && isPointInPolygon(coords, polygon)) {
        events.push({
          geofenceName: name,
          timestamp: reading.timestamp,
          coordinates: coords,
          speed: reading.speed,
        });
      }
    }
  }
  return events;
}

if (parentPort) {
  parentPort.on('message', (task) => {
    const { taskId, type, payload } = task;
    try {
      let result;
      switch (type) {
        case 'COMPUTE_TRIP_ANALYTICS':
          result = computeTripAnalytics(payload.readings, payload.options);
          break;
        case 'EVALUATE_GEOFENCES':
          result = evaluateGeofences(payload.readings, payload.geofences);
          break;
        case 'HAVERSINE_DISTANCE':
          result = { distanceKm: haversineDistance(payload.coord1, payload.coord2) };
          break;
        default:
          throw new Error(`Unknown task type: ${type}`);
      }
      parentPort.postMessage({ taskId, success: true, data: result });
    } catch (error) {
      parentPort.postMessage({ taskId, success: false, error: error.message });
    }
  });
}
