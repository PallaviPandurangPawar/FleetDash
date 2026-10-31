// Backend/tests/unit/db.test.js
// Needs MongoDB running. Uses the fleetdash_test database (see tests/setup.js).
const { connectDB, closeDB, mongoose } = require('../../src/config/db');

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('database connection', () => {
  test('connects, ignores a second connect call, and closes cleanly', async () => {
    const connection = await connectDB();

    expect(connection).toBeTruthy();
    expect(mongoose.connection.readyState).toBe(1); // 1 = connected. If this fails, start MongoDB.
    expect(mongoose.connection.name).toBe('fleetdash_test');

    expect(await connectDB()).toBeUndefined(); // already connected: nothing to do

    await closeDB();
    expect(mongoose.connection.readyState).toBe(0);
  });

  test('closing when already closed is safe', async () => {
    await closeDB();
    await closeDB();

    expect(mongoose.connection.readyState).toBe(0);
  });

  test('returns null instead of crashing when MongoDB cannot be reached', async () => {
    const savedUri = process.env.MONGODB_URI;
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/fleetdash_unreachable'; // nothing listens on port 1

    let result;
    try {
      await jest.isolateModulesAsync(async () => {
        const { connectDB: connectToNowhere } = require('../../src/config/db');
        result = await connectToNowhere();
      });
    } finally {
      process.env.MONGODB_URI = savedUri;
    }

    expect(result).toBeNull();
  }, 15000);
});