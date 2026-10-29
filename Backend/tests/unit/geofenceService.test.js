const turf = require('@turf/turf');
const geofenceService = require('../../src/services/geofenceService');

// A rectangle around central Kolkata: longitude 88.30 to 88.40, latitude 22.50 to 22.65
function makeFence({ id = 'f1', name = 'Zone', vehicleIds = null, ring } = {}) {
  const polygon = turf.polygon([
    ring || [[88.3, 22.5], [88.4, 22.5], [88.4, 22.65], [88.3, 22.65], [88.3, 22.5]],
  ]);
  return { id, name, vehicleIds, polygon, bbox: turf.bbox(polygon) };
}

const INSIDE = [88.35, 22.57];
const OUTSIDE = [88.6, 22.57];
const at = (vehicleId, [lon, lat]) => ({ vehicleId, lon, lat, timestamp: 1790000000000 });
const atTime = (vehicleId, [lon, lat], timestamp) => ({ vehicleId, lon, lat, timestamp });

beforeEach(() => {
  // Use fences created here instead of loading them from the database
  geofenceService.started = true;
  geofenceService.fences = [makeFence()];
  geofenceService.state = new Map();
  geofenceService.lastSeen = new Map();
});

describe('geofenceService.check', () => {
  test('reports nothing when there are no geofences', () => {
    geofenceService.fences = [];
    expect(geofenceService.check(at('T1', INSIDE))).toEqual([]);
  });

  test('stays silent the first time it sees a vehicle, inside or outside', () => {
    expect(geofenceService.check(at('T1', INSIDE))).toEqual([]);
    expect(geofenceService.check(at('T2', OUTSIDE))).toEqual([]);
  });

  test('reports an exit when a vehicle goes from inside to outside', () => {
    geofenceService.check(at('T1', INSIDE));
    const events = geofenceService.check(at('T1', OUTSIDE));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'exit', vehicleId: 'T1', geofenceId: 'f1', geofenceName: 'Zone' });
  });

  test('reports an enter when a vehicle goes from outside to inside', () => {
    geofenceService.check(at('T1', OUTSIDE));
    const events = geofenceService.check(at('T1', INSIDE));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'enter', vehicleId: 'T1' });
  });

  test('reports nothing while the vehicle stays on the same side', () => {
    geofenceService.check(at('T1', INSIDE));
    expect(geofenceService.check(at('T1', [88.36, 22.58]))).toEqual([]);
    geofenceService.check(at('T1', OUTSIDE));
    expect(geofenceService.check(at('T1', [88.7, 22.6]))).toEqual([]);
  });

  test('ignores vehicles that are not on the geofence list', () => {
    geofenceService.fences = [makeFence({ vehicleIds: new Set(['ONLY-ME']) })];
    geofenceService.check(at('OTHER', INSIDE));
    expect(geofenceService.check(at('OTHER', OUTSIDE))).toEqual([]);

    geofenceService.check(at('ONLY-ME', INSIDE));
    expect(geofenceService.check(at('ONLY-ME', OUTSIDE))).toHaveLength(1);
  });

  test('tracks each vehicle separately', () => {
    geofenceService.check(at('A', INSIDE));
    geofenceService.check(at('B', OUTSIDE));
    expect(geofenceService.check(at('A', OUTSIDE))).toHaveLength(1); // A exits
    expect(geofenceService.check(at('B', INSIDE))).toHaveLength(1); // B enters
  });

  test('only reports the geofence that was actually crossed', () => {
    const small = makeFence({
      id: 'f2',
      name: 'Small zone',
      ring: [[88.34, 22.55], [88.39, 22.55], [88.39, 22.6], [88.34, 22.6], [88.34, 22.55]],
    });
    geofenceService.fences = [makeFence(), small];

    geofenceService.check(at('T1', [88.36, 22.57])); // inside both
    const events = geofenceService.check(at('T1', [88.31, 22.52])); // inside big zone, outside small zone
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'exit', geofenceId: 'f2' });
  });
});

describe('geofenceService.check with timestamps', () => {
  test('reports a quick exit and re-entry when every reading is checked in time order', () => {
    expect(geofenceService.check(atTime('T1', INSIDE, 1000))).toEqual([]);

    const events = [
      ...geofenceService.check(atTime('T1', OUTSIDE, 2000)),
      ...geofenceService.check(atTime('T1', INSIDE, 3000)),
    ];

    expect(events.map((e) => e.type)).toEqual(['exit', 'enter']);
  });

  test('skips a reading that is older than one already checked, so the state is not turned back', () => {
    geofenceService.check(atTime('T1', INSIDE, 2000));
    expect(geofenceService.check(atTime('T1', OUTSIDE, 3000))).toHaveLength(1); // exit

    // A late reading from before the exit: ignored
    expect(geofenceService.check(atTime('T1', INSIDE, 1000))).toEqual([]);

    // The vehicle is still outside, so this is not a change
    expect(geofenceService.check(atTime('T1', OUTSIDE, 4000))).toEqual([]);
  });

  test('works for updates without a timestamp', () => {
    geofenceService.check({ vehicleId: 'T1', lon: INSIDE[0], lat: INSIDE[1] });
    const events = geofenceService.check({ vehicleId: 'T1', lon: OUTSIDE[0], lat: OUTSIDE[1] });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('exit');
  });
});