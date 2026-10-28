// Frontend/src/services/api.ts
// Week 1: REST client (vehicles, telemetry, geofences, alerts)

import type {
  AlertsResponse,
  AlertSummary,
  GeofencesResponse,
  VehiclesResponse,
} from '../types/api';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText} (${path})`);
  }
  return (await res.json()) as T;
}

export const getVehicles = (limit = 500) => {
  request<VehiclesResponse>(`/Vehicles?limit=${limit}`);
}

export const getGeofencs = () =>{
  request<GeofencesResponse>('/geofence?active=true');
}

export const getAlerts = (limit = 50) =>{
  request<AlertsResponse>(`/alert?limit=${limit}`);
}

export const getAlertSummary = () => request<AlertSummary>('/alerts/summary');

export const acknowledgeAlert = (id: string) =>
  request<{ success: boolean }>(`/alerts/${id}/acknowledge`, { method: 'PATCH' });


export const acknowledgeAllAlerts = () =>
  request<{ success: boolean; acknowledged: number }>('/alerts/acknowledge-all', {
    method: 'POST',
    body: JSON.stringify({}),
  });