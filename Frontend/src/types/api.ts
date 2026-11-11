// Frontend/src/types/api.ts
// Week 1: API response types
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

export interface LiveAlert {
  id: string;
  type: 'exit' | 'enter';
  vehicleId: string;
  geofenceId: string;
  geofenceName: string;
  lon: number;
  lat: number;
  occurredAt: number;
}

export interface VehiclesResponse {
  success: boolean;
  total: number;
  page: number;
  totalPages: number;
  vehicles: Vehicle[];
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

export interface AlertsResponse {
  success: boolean;
  total: number;
  page: number;
  totalPages: number;
  alerts: AlertRecord[];
}

export interface VehicleInput {
  vehicleId: string;
  plateNumber: string;
  make?: string;
  model?: string;
  year?: number;
  driverName?: string;
}

export type VehicleChanges = Partial<Omit<VehicleInput, 'vehicleId'>> & {
  status?: VehicleStatus;
};

export interface VehicleResponse {
  success: boolean;
  vehicle: Vehicle;
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

export interface GenerateVehiclesResponse {
  success: boolean;
  requested: number;
  created: number;
  alreadyThere: number;
  removed: number;
  totalVehicles: number;
}

export interface ResetResponse {
  success: boolean;
  removed: {
    vehicles: number;
    geofences: number;
    telemetryBuckets: number;
    alerts: number;
  };
  restored: {
    vehicles: { created: number; existing: number };
    geofences: { created: number; existing: number };
  } | null;
}