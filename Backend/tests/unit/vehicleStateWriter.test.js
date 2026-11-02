// Backend/tests/unit/vehicleStateWriter.test.js
// Needs MongoDB running. Uses the fleetdash_test database (see tests/setup.js).
const vehicleStateWriter = require('../../src/services/vehicleStateWriter');
const Vehicle = require('../../src/models/Vehicle');
const { connectDB, closeDB, mongoose } = require('../../src/config/db');

const BASE = Date.UTC(2026, 0, 1, 12, 0, 0);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, timeoutMs = 4000) {
  const start = Date.now();
  for (;;) {
    if (await check()) return true;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await sleep(50);
  }
}

// A validated reading, as the batch parser produces it
const reading = (seconds, speed, ignition = true, coordinates = [88.36, 22.57]) => ({
  timestamp: new Date(BASE + seconds * 1000),
  location: { type: 'Point', coordinates },
  speed,
  fuelLevel: 70,
  engineTemp: 90,
  batteryVoltage: 12.5,
  ignition,
});

const load = (vehicleId) => Vehicle.findOne({ vehicleId }).lean();

beforeAll(async () => {
  await connectDB();
  expect(mongoose.connection.readyState).toBe(1); // 1 = connected. If this fails, start MongoDB.
  await Vehicle.deleteMany({ vehicleId: /^TEST-VW/ });
  await Vehicle.create({ vehicleId: 'TEST-VW-1', plateNumber: 'VW 1' });
  await Vehicle.create({ vehicleId: 'TEST-VW-2', plateNumber: 'VW 2' });
  await Vehicle.create({ vehicleId: 'TEST-VW-3', plateNumber: 'VW 3' });
});

afterAll(async () => {
  await vehicleStateWriter.flush();
  await Vehicle.deleteMany({ vehicleId: /^TEST-VW/ });
  await closeDB();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('vehicleStateWriter', () => {
  test('writes the newest reading of every vehicle in ONE bulk write', async () => {
    const bulk = jest.spyOn(Vehicle, 'bulkWrite');

    vehicleStateWriter.record('TEST-VW-1', reading(1, 10));
    vehicleStateWriter.record('TEST-VW-1', reading(2, 50, true, [88.4, 22.6]));
    vehicleStateWriter.record('TEST-VW-2', reading(1, 0, false));
    await vehicleStateWriter.flush();

    expect(bulk).toHaveBeenCalledTimes(1);
    expect(bulk.mock.calls[0][0]).toHaveLength(2); // two vehicles, not three readings

    const first = await load('TEST-VW-1');
    expect(first.lastTelemetry.speed).toBe(50);
    expect(first.lastKnownLocation.coordinates).toEqual([88.4, 22.6]);
    expect(first.status).toBe('in_transit');
  });

  test('an older reading never replaces a newer one that is waiting', async () => {
    vehicleStateWriter.record('TEST-VW-1', reading(20, 70));
    vehicleStateWriter.record('TEST-VW-1', reading(10, 5)); // arrives late
    await vehicleStateWriter.flush();

    expect((await load('TEST-VW-1')).lastTelemetry.speed).toBe(70);
  });

  test.each([
    ['moving fast', 60, true, 'in_transit'],
    ['stopped with the engine on', 0, true, 'idle'],
    ['stopped with the engine off', 0, false, 'offline'],
    ['crawling at exactly 3 km/h', 3, true, 'idle'],
  ])('sets the status for a vehicle %s', async (_name, speed, ignition, expected) => {
    vehicleStateWriter.record('TEST-VW-3', reading(30, speed, ignition));
    await vehicleStateWriter.flush();

    expect((await load('TEST-VW-3')).status).toBe(expected);
  });

  test('writes by itself after a short time', async () => {
    vehicleStateWriter.record('TEST-VW-2', reading(40, 33));

    await waitFor(async () => (await load('TEST-VW-2')).lastTelemetry.speed === 33);
  });

  test('does nothing when nothing is waiting', async () => {
    const bulk = jest.spyOn(Vehicle, 'bulkWrite');

    await vehicleStateWriter.flush();

    expect(bulk).not.toHaveBeenCalled();
  });

  test('a failing write is logged and does not throw', async () => {
    jest.spyOn(Vehicle, 'bulkWrite').mockRejectedValueOnce(new Error('db down'));
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});

    vehicleStateWriter.record('TEST-VW-1', reading(50, 1));

    await expect(vehicleStateWriter.flush()).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith('[Vehicle Update Error] db down');
  });
});