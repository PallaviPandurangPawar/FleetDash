// Backend/tests/unit/redisService.test.js
// Needs Redis running.
const { createClient } = require('../../src/config/redis');
const { CHANNEL, ALERT_CHANNEL, publishVehicleUpdate, publishAlert, getStatus, close } = require('../../src/services/redisService');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, timeoutMs = 5000) {
  const start = Date.now();
  for (;;) {
    if (await check()) return true;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await sleep(50);
  }
}

let subscriber;
const received = [];

beforeAll(async () => {
  subscriber = createClient('test-sub', { enableOfflineQueue: true });
  subscriber.on('message', (channel, message) => received.push({ channel, data: JSON.parse(message) }));
  await subscriber.subscribe(CHANNEL, ALERT_CHANNEL);
  await waitFor(() => getStatus() === 'ready'); // if this hangs, start Redis
});

afterAll(async () => {
  subscriber.disconnect();
  await close();
});

describe('redisService', () => {
  test('reports the connection as ready', () => {
    expect(getStatus()).toBe('ready');
  });

  test('publishes a vehicle update as JSON on its channel', async () => {
    const update = { vehicleId: 'TEST-RS-1', lon: 88.36, lat: 22.57, speed: 40 };
    await publishVehicleUpdate(update);

    await waitFor(() => received.some((m) => m.data.vehicleId === 'TEST-RS-1'));
    const message = received.find((m) => m.data.vehicleId === 'TEST-RS-1');
    expect(message.channel).toBe(CHANNEL);
    expect(message.data).toEqual(update);
  });

  test('publishes an alert as JSON on the alert channel', async () => {
    const alert = { id: 'a1', type: 'exit', vehicleId: 'TEST-RS-2', geofenceName: 'Zone' };
    await publishAlert(alert);

    await waitFor(() => received.some((m) => m.data.vehicleId === 'TEST-RS-2'));
    const message = received.find((m) => m.data.vehicleId === 'TEST-RS-2');
    expect(message.channel).toBe(ALERT_CHANNEL);
    expect(message.data).toEqual(alert);
  });

  test('after the connection is closed, publishing does not throw and closing again is safe', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await close();
    await waitFor(() => getStatus() === 'end');

    await expect(publishVehicleUpdate({ vehicleId: 'TEST-RS-3' })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('publish to fleet:updates failed'));

    await expect(close()).resolves.toBeUndefined();
    errorSpy.mockRestore();
  });
});