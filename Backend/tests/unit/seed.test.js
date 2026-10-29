// Backend/tests/unit/seed.test.js
// Tests for scripts/seed.js. Needs MongoDB running. Uses the fleetdash_test database (see tests/setup.js).
const { runSeed, VEHICLE_PREFIX, SEED_MARK } = require('../../scripts/seed');
const Vehicle = require('../../src/models/Vehicle');
const Geofence = require('../../src/models/Geofence');
const TelemetryBucket = require('../../src/models/TelemetryBucket');
const Alert = require('../../src/models/Alert');
const bucketService = require('../../src/services/bucketService');
const parsePool = require('../../src/workers/parsePool');
const { connectDB, closeDB, mongoose } = require('../../src/config/db');

const SEED_GEOFENCE_NAMES = ['Kolkata Central Zone', 'Howrah Depot', 'Salt Lake Sector V'];

const seededVehicles = () => Vehicle.countDocuments({ vehicleId: { $regex: `^${VEHICLE_PREFIX}` } });
const seededGeofences = () => Geofence.countDocuments({ description: { $regex: `^${SEED_MARK}` } });

async function cleanUp() {
  await runSeed({ reset: true });
  await Vehicle.deleteMany({ vehicleId: /^TEST-/ });
  await Geofence.deleteMany({ name: { $in: SEED_GEOFENCE_NAMES } }); // the test database holds nothing worth keeping
}

beforeAll(async () => {
  await connectDB();
  expect(mongoose.connection.readyState).toBe(1); // 1 = connected. If this fails, start MongoDB.
  await cleanUp();
});

afterAll(async () => {
  await cleanUp();
  await closeDB();
  if (parsePool.terminate) await parsePool.terminate();
});

describe('seeding', () => {
  test('creates the vehicles and the three sample geofences', async () => {
    const result = await runSeed({ count: 5 });

    expect(result.vehicles).toEqual({ created: 5, existing: 0 });
    expect(result.geofences).toEqual({ created: 3, existing: 0 });
    expect(await seededVehicles()).toBe(5);
    expect(await seededGeofences()).toBe(3);
  });

  test('the seeded vehicles are complete and start inside the central zone', async () => {
    const first = await Vehicle.findOne({ vehicleId: 'FLEET-001' }).lean();

    expect(first).toMatchObject({
      plateNumber: 'WB 02 AB 1001',
      make: 'Tata',
      model: 'Prima',
      driverName: 'Ravi Kumar',
      status: 'idle',
    });

    const all = await Vehicle.find({ vehicleId: { $regex: `^${VEHICLE_PREFIX}` } }).lean();
    all.forEach((v) => {
      const [lon, lat] = v.lastKnownLocation.coordinates;
      expect(lon).toBeGreaterThan(88.3);
      expect(lon).toBeLessThan(88.4);
      expect(lat).toBeGreaterThan(22.5);
      expect(lat).toBeLessThan(22.65);
    });
  });

  test('running it again changes nothing', async () => {
    const result = await runSeed({ count: 5 });

    expect(result.vehicles).toEqual({ created: 0, existing: 5 });
    expect(result.geofences).toEqual({ created: 0, existing: 3 });
    expect(await seededVehicles()).toBe(5);
    expect(await seededGeofences()).toBe(3);
  });

  test('a higher count adds only the missing vehicles', async () => {
    const result = await runSeed({ count: 8 });

    expect(result.vehicles).toEqual({ created: 3, existing: 5 });
    expect(await seededVehicles()).toBe(8);
  });

  test('never changes documents that already exist', async () => {
    await Vehicle.updateOne({ vehicleId: 'FLEET-001' }, { driverName: 'Changed Driver' });
    await Geofence.updateOne({ name: 'Salt Lake Sector V' }, { active: false });

    const result = await runSeed({ count: 8 });

    expect(result.vehicles).toEqual({ created: 0, existing: 8 });
    expect((await Vehicle.findOne({ vehicleId: 'FLEET-001' }).lean()).driverName).toBe('Changed Driver');
    expect((await Geofence.findOne({ name: 'Salt Lake Sector V' }).lean()).active).toBe(false);
  });

  test('does not overwrite, duplicate or delete a geofence you created yourself', async () => {
    await runSeed({ reset: true });
    await Geofence.create({
      name: 'Howrah Depot',
      description: 'mine',
      polygon: { type: 'Polygon', coordinates: [[[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]] },
    });

    const result = await runSeed({ count: 5 });

    expect(result.geofences).toEqual({ created: 2, existing: 1 });
    const mine = await Geofence.find({ name: 'Howrah Depot' }).lean();
    expect(mine).toHaveLength(1);
    expect(mine[0].description).toBe('mine');

    await runSeed({ reset: true });
    expect(await Geofence.countDocuments({ name: 'Howrah Depot' })).toBe(1); // reset left it alone
    await Geofence.deleteOne({ name: 'Howrah Depot' });
  });
});

describe('reset', () => {
  test('removes only what the seed created, including its telemetry and alerts', async () => {
    await runSeed({ count: 3 });
    await Vehicle.create({ vehicleId: 'TEST-SEED-KEEP', plateNumber: 'KEEP 1' });
    await bucketService.ingestBatch('FLEET-001', [{ coordinates: [88.35, 22.55], speed: 10 }]);
    await Alert.create({
      type: 'exit',
      vehicleId: 'FLEET-001',
      geofenceId: new mongoose.Types.ObjectId(),
      occurredAt: new Date(),
      location: { coordinates: [88.35, 22.55] },
    });

    const result = await runSeed({ reset: true });

    expect(result.removed).toEqual({ vehicles: 3, geofences: 3, telemetryBuckets: 1, alerts: 1 });
    expect(await seededVehicles()).toBe(0);
    expect(await seededGeofences()).toBe(0);
    expect(await Vehicle.countDocuments({ vehicleId: 'TEST-SEED-KEEP' })).toBe(1); // not touched
  });
});

describe('count validation', () => {
  test.each([0, -1, 501, 2.5, 'abc'])('rejects %p', async (count) => {
    await expect(runSeed({ count })).rejects.toThrow('count must be a whole number');
  });
});