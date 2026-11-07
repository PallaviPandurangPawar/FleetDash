// Frontend/src/types/api.ts
// API response types
import type { Vehicle, VehicleStatus } from './telemetry';

export interface Geofence {
  _id: string;
  name: string;
  description: string;
  polygon: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
  vehicleIds: string[];
  active: boolean;
}

export interface AlertRecord {
  _id: string;
  type: 'exit' | 'enter';
  vehicleId: string;
  geofenceId: string;
  geofenceName: string;
  location: { type: 'Point'; coordinates: [number, number] };
  occurredAt: string;
  acknowledged: boolean;
  createdAt: string;
}

export interface VehiclesResponse {
  success: boolean;
  total: number;
  page: number;
  totalPages: number;
  vehicles: Vehicle[];
}

export interface AlertsResponse {
  success: boolean;
  total: number;
  page: number;
  totalPages: number;
  alerts: AlertRecord[];
}

export interface GeofencesResponse {
  success: boolean;
  count: number;
  geofences: Geofence[];
}

export interface AlertSummary {
  success: boolean;
  total: number;
  unacknowledged: number;
  exits: number;
  enters: number;
}


// ---- Vehicle management and admin API ----

export interface VehicleInput {
  vehicleId: string;
  plateNumber: string;
  make?: string;
  model?: string;
  year?: number;
  driverName?: string;
}

// What can be changed on an existing vehicle (the vehicleId itself cannot)
export type VehicleChanges = Partial<Omit<VehicleInput, 'vehicleId'>> & {
  status?: VehicleStatus;
};

export interface VehicleResponse {
  success: boolean;
  vehicle: Vehicle;
}

export interface DeleteVehicleResult {
  success: boolean;
  deleted: string;
  historyDeleted: boolean;
  removed: { telemetryBuckets: number; alerts: number };
}

export interface GenerateVehiclesResult {
  success: boolean;
  requested: number;
  created: number;
  alreadyThere: number;
  removed: number;
  totalVehicles: number;
}

export interface ResetResult {
  success: boolean;
  removed: { vehicles: number; geofences: number; telemetryBuckets: number; alerts: number };
  restored: {
    vehicles: { created: number; existing: number };
    geofences: { created: number; existing: number };
  } | null;
}

export interface SimulatorState {
  running: boolean;
  vehicles: number;
  requested: number;
  intervalMs: number;
  timeScale: number;
  startedAt: string | null;
  sent: number;
  failed: number;
  lastError: string | null;
}

export interface SimulatorResponse {
  success: boolean;
  simulator: SimulatorState;
}

export interface SimulatorOptions {
  count?: number;
  intervalMs?: number;
  timeScale?: number;
}

// What the backend sends over the socket when a vehicle crosses a geofence edge
export interface GeofenceAlertEvent {
  id: string;
  type: 'exit' | 'enter';
  vehicleId: string;
  geofenceId: string;
  geofenceName: string;
  lon: number;
  lat: number;
  occurredAt: string | number;
}