const { normalizeReading, parseBatch } = require('../../src/utils/validators');

describe('normalizeReading', () => {
  const good = { coordinates: [88.36, 22.57], speed: 45 };

  test('accepts a valid reading and fills in defaults', () => {
    const r = normalizeReading(good);
    expect(r).not.toBeNull();
    expect(r.location).toEqual({ type: 'Point', coordinates: [88.36, 22.57] });
    expect(r.speed).toBe(45);
    expect(r.fuelLevel).toBe(100);
    expect(r.ignition).toBe(true);
    expect(r.timestamp).toBeInstanceOf(Date);
  });

  test('converts numbers sent as text', () => {
    const r = normalizeReading({ coordinates: ['88.36', '22.57'], speed: '45' });
    expect(r.location.coordinates).toEqual([88.36, 22.57]);
    expect(r.speed).toBe(45);
  });

  test('keeps ignition off when it is false', () => {
    expect(normalizeReading({ ...good, ignition: false }).ignition).toBe(false);
  });

  test('accepts the extreme valid coordinates', () => {
    expect(normalizeReading({ coordinates: [180, 90], speed: 0 })).not.toBeNull();
    expect(normalizeReading({ coordinates: [-180, -90], speed: 0 })).not.toBeNull();
  });

  test.each([
    ['null input', null],
    ['missing coordinates', { speed: 10 }],
    ['only one coordinate', { coordinates: [88], speed: 10 }],
    ['longitude too large', { coordinates: [200, 22], speed: 10 }],
    ['latitude too large', { coordinates: [88, 95], speed: 10 }],
    ['coordinate is not a number', { coordinates: ['abc', 22], speed: 10 }],
    ['negative speed', { coordinates: [88, 22], speed: -5 }],
    ['invalid timestamp', { coordinates: [88, 22], speed: 10, timestamp: 'not-a-date' }],
  ])('rejects %s', (_name, input) => {
    expect(normalizeReading(input)).toBeNull();
  });
});

describe('parseBatch', () => {
  test('drops invalid readings, counts them and sorts the rest by time', () => {
    const { valid, rejectedCount } = parseBatch([
      { coordinates: [88.3, 22.5], speed: 10, timestamp: '2026-01-01T00:00:03Z' },
      { coordinates: [500, 22.5], speed: 10 },
      { coordinates: [88.3, 22.5], speed: 20, timestamp: '2026-01-01T00:00:01Z' },
    ]);
    expect(valid).toHaveLength(2);
    expect(rejectedCount).toBe(1);
    expect(valid[0].speed).toBe(20);
    expect(valid[1].speed).toBe(10);
  });

  test('handles an empty batch', () => {
    expect(parseBatch([])).toEqual({ valid: [], rejectedCount: 0 });
  });

  test('rejects everything when every reading is bad', () => {
    const { valid, rejectedCount } = parseBatch([{ speed: 1 }, null]);
    expect(valid).toHaveLength(0);
    expect(rejectedCount).toBe(2);
  });
});