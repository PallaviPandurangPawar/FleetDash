// Frontend/src/utils/binaryDecoder.ts
// Week 2: decode ArrayBuffer payloads into the vehicle buffer

import type { VehicleUpdate } from '../types/telemetry';

const VERSION = 1;
const HEADER_BYTES = 8; // version (2) + reserved (2) + vehicle count (4)
const RECORD_BYTES = 56; // one vehicle
const ID_BYTES = 16;

export function decodeBatch(data: ArrayBuffer): VehicleUpdate[] {
    const view = new DataView(data);
    const version = view.getUint16(0, true);

    if (version !== VERSION) {
        throw new Error(`Unsupported version: ${version}`);
    }

    const count = view.getUint32(4, true);
    if(data.byteLength !== HEADER_BYTES + count * RECORD_BYTES) {
        throw new Error(`Invalid data length: ${data.byteLength} for ${count} records`);
    }

    const bytes = new Uint8Array(data);
    const updates: VehicleUpdate[] = [];

    for (let i = 0; i < count; i++) {
        const offset = HEADER_BYTES + i * RECORD_BYTES;
    

        let vehicleId = '';

        for (let j = 0; j < ID_BYTES; j++) 
        {
            const code = bytes[offset + j] ?? 0;
            if (code === 0) break;
            vehicleId += String.fromCharCode(code);
        }
    

    updates.push({
        vehicleId,
        lon: view.getFloat64(offset + 16, true),
        lat: view.getFloat64(offset + 24, true),
        timestamp: view.getFloat64(offset + 32, true),
         speed: view.getFloat32(offset + 40, true),
        heading: view.getFloat32(offset + 44, true),
        fuellevel: view.getFloat32(offset + 48, true),
      ignition: view.getUint32(offset + 52, true) === 1,
    });

    }

    return updates;
}
