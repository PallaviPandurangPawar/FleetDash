// Backend/scripts/seed.js
// Puts sample vehicles and geofences into MongoDB so the dashboard has something to show.
//
//   npm run seed                      10 vehicles (FLEET-001 ...) and 3 sample geofences
//   node scripts/seed.js --count=50   50 vehicles
//   node scripts/seed.js --history=24 also add 24 finished hours of sample telemetry (one hourly bucket per
//                                     vehicle per hour, one reading per minute). Up to 72 hours.
//   npm run seed:reset                removes ONLY what this script created: vehicles named FLEET-xxx,
//                                     geofences marked "Seeded sample geofence", and their telemetry and alerts
//
// Safe to run again: existing vehicles and geofences are never changed or duplicated.
require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config/config');
const Vehicle = require('../src/models/Vehicle');
const Geofence = require('../src/models/Geofence');
const TelemetryBucket = require('../src/models/TelemetryBucket');
const Alert = require('../src/models/Alert');

const VEHICLE_PREFIX = 'FLEET-';
const SEED_MARK = 'Seeded sample geofence'; // every geofence made by this script starts its description with this
const MAX_COUNT = 500;
const CENTER = { lon: 88.3639, lat: 22.5726 }; // Kolkata
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const READINGS_PER_HOUR = 60; // sample history: one reading per minute
const MAX_HISTORY_HOURS = 72;

const MAKES = [
  ['Tata', 'Prima'],
  ['Ashok Leyland', 'Boss'],
  ['Mahindra', 'Blazo'],
  ['Eicher', 'Pro 3015'],
  ['BharatBenz', '1215R'],
];
const DRIVERS = [
  'Ravi Kumar',
  'Anita Das',
  'Sourav Ghosh',
  'Meera Nair',
  'Imran Sheikh',
  'Pooja Sen',
  'Arjun Mehta',
  'Kavita Roy',
  'Dipak Paul',
  'Neha Verma',
];

// A rectangle as a GeoJSON polygon ring (the last point repeats the first)
function rectangle(minLon, minLat, maxLon, maxLat) {
  return [[[minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]]];
}

function buildVehicle(i) {
  const col = i % 5;
  const row = Math.floor(i / 5) % 10;
  const lon = CENTER.lon + (col - 2) * 0.01;
  const lat = CENTER.lat + (row - 4.5) * 0.008;
  const [make, model] = MAKES[i % MAKES.length];

  return {
    vehicleId: `${VEHICLE_PREFIX}${String(i + 1).padStart(3, '0')}`,
    plateNumber: `WB 02 AB ${1001 + i}`,
    make,
    model,
    year: 2018 + (i % 7),
    driverName: DRIVERS[i % DRIVERS.length],
    status: 'idle',
    lastKnownLocation: {
      type: 'Point',
      coordinates: [Number(lon.toFixed(5)), Number(lat.toFixed(5))],
      updatedAt: new Date(),
    },
  };
}

function buildGeofences(vehicleIds) {
  const zone = (name, text, coordinates, ids) => ({
    name,
    description: `${SEED_MARK}: ${text}`,
    polygon: { type: 'Polygon', coordinates },
    vehicleIds: ids,
    active: true,
  });

  return [
    zone('Kolkata Central Zone', 'the central area, applies to every vehicle', rectangle(88.3, 22.5, 88.4, 22.65), []),
    zone('Howrah Depot', 'depot area for the first three vehicles', rectangle(88.3, 22.57, 88.34, 22.61), vehicleIds.slice(0, 3)),
    zone('Salt Lake Sector V', 'IT hub area, applies to every vehicle', rectangle(88.4, 22.56, 88.44, 22.6), []),
  ];
}

// Adds the documents that do not exist yet. Existing ones (same key) are left exactly as they are.
async function insertMissing(Model, docs, key) {
  const operations = docs.map((doc) => {
    const { [key]: keyValue, ...rest } = doc;
    return {
      updateOne: {
        filter: { [key]: keyValue },
        update: { $setOnInsert: rest },
        upsert: true,
      },
    };
  });

  const result = await Model.bulkWrite(operations);
  return { created: result.upsertedCount, existing: docs.length - result.upsertedCount };
}

// One finished hour of sample telemetry for a vehicle, as ONE hourly bucket: a reading every minute,
// the vehicle driving a slow loop around its start position. The values depend only on the time, so
// running the seed again produces exactly the same data.
function buildHistoryBucket(vehicle, index, hourStartMs) {
  const [lon, lat] = vehicle.lastKnownLocation.coordinates;
  const readings = [];

  for (let k = 0; k < READINGS_PER_HOUR; k++) {
    const t = hourStartMs + k * MINUTE_MS;
    const angle = t / (10 * MINUTE_MS) + index; // radians: one loop in about 63 minutes
    readings.push({
      timestamp: new Date(t),
      location: {
        type: 'Point',
        coordinates: [Number((lon + 0.004 * Math.cos(angle)).toFixed(5)), Number((lat + 0.004 * Math.sin(angle)).toFixed(5))],
      },
      speed: Number((25 + 15 * Math.sin(angle * 3)).toFixed(1)),
      fuelLevel: Number((100 - ((t / MINUTE_MS) % 3000) / 50).toFixed(1)),
      engineTemp: Number((85 + 5 * Math.sin(angle)).toFixed(1)),
      batteryVoltage: 12.6,
      odometerKm: 0,
      heading: Math.round((((angle * 180) / Math.PI) % 360) + 90) % 360,
      ignition: true,
      alerts: [],
    });
  }

  const speeds = readings.map((r) => r.speed);
  const fuels = readings.map((r) => r.fuelLevel);
  const sumSpeed = speeds.reduce((a, b) => a + b, 0);

  return {
    vehicleId: vehicle.vehicleId,
    bucketStartTime: readings[0].timestamp,
    bucketEndTime: readings[readings.length - 1].timestamp,
    count: readings.length,
    maxCount: config.bucketMaxSize,
    summary: {
      minSpeed: Math.min(...speeds),
      maxSpeed: Math.max(...speeds),
      sumSpeed: Number(sumSpeed.toFixed(1)),
      avgSpeed: Number((sumSpeed / readings.length).toFixed(2)),
      minFuelLevel: Math.min(...fuels),
      maxFuelLevel: Math.max(...fuels),
      maxEngineTemp: Math.max(...readings.map((r) => r.engineTemp)),
      totalDistanceKm: 0,
    },
    readings,
  };
}

// Adds one bucket per vehicle for each of the last `hours` finished clock hours (UTC).
// An hour that already has a bucket for that vehicle is left exactly as it is.
async function seedHistory(vehicles, hours, now) {
  const currentHour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const operations = [];

  vehicles.forEach((vehicle, index) => {
    for (let h = hours; h >= 1; h--) {
      const hourStart = currentHour - h * HOUR_MS;
      const { vehicleId, ...rest } = buildHistoryBucket(vehicle, index, hourStart);
      operations.push({
        updateOne: {
          filter: { vehicleId, bucketStartTime: { $gte: new Date(hourStart), $lt: new Date(hourStart + HOUR_MS) } },
          update: { $setOnInsert: rest },
          upsert: true,
        },
      });
    }
  });

  let created = 0;
  for (let i = 0; i < operations.length; i += 500) {
    const result = await TelemetryBucket.bulkWrite(operations.slice(i, i + 500), { ordered: false });
    created += result.upsertedCount;
  }
  return { created, existing: operations.length - created };
}

async function removeSeeded() {
  const byVehicle = { vehicleId: { $regex: `^${VEHICLE_PREFIX}` } };

  const vehicles = await Vehicle.deleteMany(byVehicle);
  const telemetryBuckets = await TelemetryBucket.deleteMany(byVehicle);
  const alerts = await Alert.deleteMany(byVehicle);
  const geofences = await Geofence.deleteMany({ description: { $regex: `^${SEED_MARK}` } });

  return {
    removed: {
      vehicles: vehicles.deletedCount,
      geofences: geofences.deletedCount,
      telemetryBuckets: telemetryBuckets.deletedCount,
      alerts: alerts.deletedCount,
    },
  };
}

/**
 * Seeds (or, with reset, removes the seeded data). The caller opens and closes the database connection.
 */
async function runSeed({ count = 10, reset = false, history = 0, withGeofences = true, now = Date.now() } = {}) {
  if (reset) return removeSeeded();

  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > MAX_COUNT) {
    throw new Error(`count must be a whole number from 1 to ${MAX_COUNT}`);
  }

  const hours = Number(history);
  if (!Number.isInteger(hours) || hours < 0 || hours > MAX_HISTORY_HOURS) {
    throw new Error(`history must be a whole number of hours from 0 to ${MAX_HISTORY_HOURS}`);
  }

  const vehicles = Array.from({ length: n }, (_, i) => buildVehicle(i));
  const result = { vehicles: await insertMissing(Vehicle, vehicles, 'vehicleId') };

  // The admin "generate vehicles" API passes withGeofences: false so deleted geofences do not come back
  if (withGeofences) {
    const geofences = buildGeofences(vehicles.map((v) => v.vehicleId));
    result.geofences = await insertMissing(Geofence, geofences, 'name');
  }
  if (hours > 0) result.history = await seedHistory(vehicles, hours, now);
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');
  const countArg = args.find((a) => a.startsWith('--count='));
  const count = countArg ? countArg.split('=')[1] : 10;
  const historyArg = args.find((a) => a.startsWith('--history='));
  const history = historyArg ? historyArg.split('=')[1] : 0;

  if (config.nodeEnv === 'production' && !args.includes('--force')) {
    console.error('Refusing to touch the database when NODE_ENV=production. Add --force if you really mean it.');
    process.exit(1);
  }

  try {
    await mongoose.connect(config.mongoUri);
    console.log(`Connected to database "${mongoose.connection.name}"`);

    const result = await runSeed({ count, reset, history });

    if (reset) {
      const r = result.removed;
      console.log(`Removed: ${r.vehicles} vehicles, ${r.geofences} geofences, ${r.telemetryBuckets} telemetry buckets, ${r.alerts} alerts`);
    } else {
      console.log(`Vehicles:  ${result.vehicles.created} created, ${result.vehicles.existing} already there`);
      console.log(`Geofences: ${result.geofences.created} created, ${result.geofences.existing} already there`);
      if (result.history) {
        console.log(`History:   ${result.history.created} hourly buckets created, ${result.history.existing} already there`);
      }
    }
  } catch (err) {
    console.error(`Seed failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) main();

module.exports = { runSeed, VEHICLE_PREFIX, SEED_MARK };