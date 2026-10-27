// Frontend/src/types/api.ts
// Week 1: API response types
import type { Vehicle } from "./telemetry";

export interface Geofence {
    _id : string;
    name : string;
    description : string;
    polygon : {
        type : 'Polygon';
        coordinates : [number , number][][];
    }
    vehicleIds : string[];
    active : boolean;
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

export interface AlertsResponse  {
    success: boolean;
    total: number;
    page : number;
    totatPages : number;
    alert : AlertRecord[]; 
}

export interface GeofencesResponse {
    success : boolean;
    count : number;
    geofences : Geofence[];
}

export interface AlertSummary {
  success: boolean;
  total: number;
  unacknowledged: number;
  exits: number;
  enters: number;
}