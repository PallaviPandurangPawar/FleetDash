// Backend/scripts/seed.js
// Puts sample vehicles and geofences into MongoDB so the dashboard has something to show.
//
//   npm run seed                      10 vehicles (FLEET-001 ...) and 3 sample geofences
//   node scripts/seed.js --count=50   50 vehicles
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
async function runSeed({ count = 10, reset = false } = {}) {
  if (reset) return removeSeeded();

  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > MAX_COUNT) {
    throw new Error(`count must be a whole number from 1 to ${MAX_COUNT}`);
  }

  const vehicles = Array.from({ length: n }, (_, i) => buildVehicle(i));
  const geofences = buildGeofences(vehicles.map((v) => v.vehicleId));

  return {
    vehicles: await insertMissing(Vehicle, vehicles, 'vehicleId'),
    geofences: await insertMissing(Geofence, geofences, 'name'),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');
  const countArg = args.find((a) => a.startsWith('--count='));
  const count = countArg ? countArg.split('=')[1] : 10;

  if (config.nodeEnv === 'production' && !args.includes('--force')) {
    console.error('Refusing to touch the database when NODE_ENV=production. Add --force if you really mean it.');
    process.exit(1);
  }

  try {
    await mongoose.connect(config.mongoUri);
    console.log(`Connected to database "${mongoose.connection.name}"`);

    const result = await runSeed({ count, reset });

    if (reset) {
      const r = result.removed;
      console.log(`Removed: ${r.vehicles} vehicles, ${r.geofences} geofences, ${r.telemetryBuckets} telemetry buckets, ${r.alerts} alerts`);
    } else {
      console.log(`Vehicles:  ${result.vehicles.created} created, ${result.vehicles.existing} already there`);
      console.log(`Geofences: ${result.geofences.created} created, ${result.geofences.existing} already there`);
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