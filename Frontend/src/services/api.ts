// Frontend/src/services/api.ts
// Week 1: REST client (vehicles, telemetry, geofences, alerts)

import type {
  AlertsResponse,
  AlertSummary,
  GeofencesResponse,
  VehiclesResponse,
} from '../types/api';

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

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

export const getVehicles = (limit = 500, page = 1) =>
  request<VehiclesResponse>(`/vehicles?limit=${limit}&page=${page}`);

export async function getAllVehicles(limit = 500): Promise<VehiclesResponse> {
  const firstPage = await getVehicles(limit);
  const pageNumbers: number[] = [];

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    pageNumbers.push(page);
  }

  const remainingPages: VehiclesResponse[] = [];
  for (let offset = 0; offset < pageNumbers.length; offset += 4) {
    const batch = pageNumbers.slice(offset, offset + 4);
    remainingPages.push(...await Promise.all(batch.map((page) => getVehicles(limit, page))));
  }

  return {
    ...firstPage,
    vehicles: [firstPage, ...remainingPages].flatMap((page) => page.vehicles),
  };
}

export const getGeofences = () =>
  request<GeofencesResponse>('/geofences?active=true');

export const getAlerts = (limit = 50) =>
  request<AlertsResponse>(`/alerts?limit=${limit}`);

export const getAlertSummary = () => request<AlertSummary>('/alerts/summary');

export const acknowledgeAlert = (id: string) =>
  request<{ success: boolean }>(`/alerts/${id}/acknowledge`, { method: 'PATCH' });


export const acknowledgeAllAlerts = () =>
  request<{ success: boolean; acknowledged: number }>('/alerts/acknowledge-all', {
    method: 'POST',
    body: JSON.stringify({}),
  });