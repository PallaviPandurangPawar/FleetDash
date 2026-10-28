// Frontend/src/canvas/vehicleBuffer.ts
// Week 3: typed-array store for vehicle positions (id, lon, lat, heading, status)

import type { VehicleUpdate } from '../types/telemetry';

export const vehicleBuffer = new Map<string, VehicleUpdate>();

