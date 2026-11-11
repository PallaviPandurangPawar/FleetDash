// Frontend/src/services/api.ts
// Week 1: REST client (vehicles, telemetry, geofences, alerts)

import type {
  AlertsResponse,
  AlertSummary,
  GenerateVehiclesResponse,
  Geofence,
  GeofencesResponse,
  ResetResponse,
  SimulatorResponse,
  VehicleChanges,
  VehicleInput,
  VehicleResponse,
  VehiclesResponse,
} from '../types/api';
import { clearAdminKey, getAdminKey } from './adminAuth';

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

function getErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object' || !('error' in body)) return fallback;
  const { error } = body;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new Error(`API ${getErrorMessage(body, `${res.status}: ${res.statusText}`)} (${path})`);
  }
  return (await res.json()) as T;
}

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function send<T>(path: string, init: RequestInit = {}, adminKey?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (adminKey) headers.set('x-admin-key', adminKey);

  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, getErrorMessage(body, `${response.status}: ${response.statusText}`));
  }
  return body as T;
}

async function sendAsAdmin<T>(path: string, init: RequestInit = {}, key = getAdminKey()): Promise<T> {
  if (!key) throw new ApiError(401, 'Admin mode is locked. Enter the admin key first.');
  try {
    return await send<T>(path, init, key);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && key === getAdminKey()) clearAdminKey();
    throw error;
  }
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

export const pingAdmin = (key: string) =>
  send<{ success: boolean; admin: boolean }>('/admin/ping', {}, key);

export const createVehicle = (input: VehicleInput) =>
  send<VehicleResponse>('/vehicles', { method: 'POST', body: JSON.stringify(input) });

export const updateVehicle = (vehicleId: string, changes: VehicleChanges) =>
  send<VehicleResponse>(`/vehicles/${encodeURIComponent(vehicleId)}`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  });

export const deleteVehicle = (vehicleId: string, deleteHistory: boolean) =>
  sendAsAdmin<{ success: boolean; deleted: string }>(
    `/vehicles/${encodeURIComponent(vehicleId)}${deleteHistory ? '?deleteHistory=true' : ''}`,
    { method: 'DELETE' }
  );

export const generateVehicles = (count: number, trim: boolean) =>
  sendAsAdmin<GenerateVehiclesResponse>('/admin/vehicles/generate', {
    method: 'POST',
    body: JSON.stringify({ count, trim }),
  });

export const resetSampleData = (restore: boolean) =>
  sendAsAdmin<ResetResponse>('/admin/reset', {
    method: 'POST',
    body: JSON.stringify({ confirm: true, restore }),
  });

export const getSimulatorStatus = () =>
  sendAsAdmin<SimulatorResponse>('/admin/simulator/status');

export const startSimulator = (options: { count: number; intervalMs: number; timeScale: number }) =>
  sendAsAdmin<SimulatorResponse>('/admin/simulator/start', {
    method: 'POST',
    body: JSON.stringify(options),
  });

export const stopSimulator = () =>
  sendAsAdmin<SimulatorResponse>('/admin/simulator/stop', { method: 'POST' });

export const getAllGeofences = () => request<GeofencesResponse>('/geofences');

export const updateGeofence = (id: string, changes: Partial<Pick<Geofence, 'active'>>) =>
  request<{ success: boolean; geofence: Geofence }>(`/geofences/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  });

export const createGeofence = (input: {
  name: string;
  description?: string;
  coordinates: [number, number][][];
}) =>
  request<{ success: boolean; geofence: Geofence }>('/geofences', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const deleteGeofence = (id: string) =>
  request<{ success: boolean; deleted: string }>(`/geofences/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });