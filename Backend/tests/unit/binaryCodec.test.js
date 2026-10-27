const { encodeBatch, decodeBatch, HEADER_BYTES, RECORD_BYTES } = require('../../src/utils/binaryCodec');

const sample = {
  vehicleId: 'SIM-001',
  lon: 88.3038893530884,
  lat: 22.535060848550682,
  speed: 58,
  heading: 3,
  fuelLevel: 64.2,
  ignition: true,
  timestamp: 1792961029078,
};

describe('binaryCodec', () => {
  test('uses 8 header bytes plus 56 bytes per vehicle', () => {
    expect(encodeBatch([sample, sample, sample]).length).toBe(HEADER_BYTES + 3 * RECORD_BYTES);
    expect(RECORD_BYTES).toBe(56);
  });

  test('decoding gives back what was encoded', () => {
    const [out] = decodeBatch(encodeBatch([sample]));
    expect(out.vehicleId).toBe('SIM-001');
    expect(out.lon).toBe(sample.lon);
    expect(out.lat).toBe(sample.lat);
    expect(out.timestamp).toBe(sample.timestamp);
    expect(out.speed).toBe(58);
    expect(out.heading).toBe(3);
    expect(out.fuelLevel).toBeCloseTo(64.2, 1); // stored as a 32-bit float
    expect(out.ignition).toBe(true);
  });

  test('keeps the order of several vehicles and ignition off', () => {
    const out = decodeBatch(
      encodeBatch([
        { ...sample, vehicleId: 'A', ignition: false },
        { ...sample, vehicleId: 'B' },
      ])
    );
    expect(out.map((v) => v.vehicleId)).toEqual(['A', 'B']);
    expect(out[0].ignition).toBe(false);
    expect(out[1].ignition).toBe(true);
  });

  test('cuts vehicle ids longer than 16 characters', () => {
    const [out] = decodeBatch(encodeBatch([{ ...sample, vehicleId: 'TRK-ABCDEFGHIJKLMNOP' }]));
    expect(out.vehicleId).toBe('TRK-ABCDEFGHIJKL');
  });

  test('handles an empty batch', () => {
    const buf = encodeBatch([]);
    expect(buf.length).toBe(HEADER_BYTES);
    expect(decodeBatch(buf)).toEqual([]);
  });

  test('refuses a message with an unknown format version', () => {
    const buf = encodeBatch([sample]);
    buf.writeUInt16LE(99, 0);
    expect(() => decodeBatch(buf)).toThrow(/Unsupported/);
  });

  test('accepts a plain ArrayBuffer, like a browser receives', () => {
    const buf = encodeBatch([sample]);
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    expect(decodeBatch(arrayBuffer)[0].vehicleId).toBe('SIM-001');
  });
});