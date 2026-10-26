// Binary format for live vehicle updates (little-endian).
//
// Header, 8 bytes:   version (uint16) | reserved (uint16) | vehicle count (uint32)
// Record, 56 bytes:  vehicleId (16 ASCII bytes, zero padded) | lon (float64) | lat (float64)
//                    | timestamp ms (float64) | speed (float32) | heading (float32)
//                    | fuelLevel (float32) | ignition (uint32, 0 or 1)
const VERSION = 1;
const HEADER_BYTES = 8;
const RECORD_BYTES = 56;
const ID_BYTES = 16;

function encodeBatch(updates) {
  const buf = Buffer.alloc(HEADER_BYTES + updates.length * RECORD_BYTES);
  buf.writeUInt16LE(VERSION, 0);
  buf.writeUInt16LE(0, 2);
  buf.writeUInt32LE(updates.length, 4);

  updates.forEach((u, i) => {
    const o = HEADER_BYTES + i * RECORD_BYTES;
    buf.write(String(u.vehicleId).slice(0, ID_BYTES), o, ID_BYTES, 'ascii');
    buf.writeDoubleLE(u.lon, o + 16);
    buf.writeDoubleLE(u.lat, o + 24);
    buf.writeDoubleLE(u.timestamp, o + 32);
    buf.writeFloatLE(u.speed, o + 40);
    buf.writeFloatLE(u.heading, o + 44);
    buf.writeFloatLE(u.fuelLevel, o + 48);
    buf.writeUInt32LE(u.ignition ? 1 : 0, o + 52);
  });

  return buf;
}

function decodeBatch(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const version = buf.readUInt16LE(0);
  if (version !== VERSION) throw new Error(`Unsupported binary format version ${version}`);

  const count = buf.readUInt32LE(4);
  const updates = [];
  for (let i = 0; i < count; i++) {
    const o = HEADER_BYTES + i * RECORD_BYTES;
    updates.push({
      vehicleId: buf.toString('ascii', o, o + ID_BYTES).replace(/\0+$/, ''),
      lon: buf.readDoubleLE(o + 16),
      lat: buf.readDoubleLE(o + 24),
      timestamp: buf.readDoubleLE(o + 32),
      speed: buf.readFloatLE(o + 40),
      heading: buf.readFloatLE(o + 44),
      fuelLevel: buf.readFloatLE(o + 48),
      ignition: buf.readUInt32LE(o + 52) === 1,
    });
  }
  return updates;
}

module.exports = { encodeBatch, decodeBatch, VERSION, HEADER_BYTES, RECORD_BYTES, ID_BYTES };