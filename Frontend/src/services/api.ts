// Frontend/src/services/api.ts
// Week 1: REST client (vehicles, telemetry, geofences, alerts)

import type {
  AlertsResponse,
  AlertSummary,
  DeleteVehicleResult,
  GenerateVehiclesResult,
  Geofence,
  GeofencesResponse,
  ResetResult,
  SimulatorOptions,
  SimulatorResponse,
  VehicleChanges,
  VehicleInput,
  VehicleResponse,
  VehiclesResponse,
} from '../types/api';
import { clearAdminKey, getAdminKey } from './adminAuth';

const BASE_URL = import.meta.env.VITE_API_URL;

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

export const getVehicles = (limit = 500) =>
  request<VehiclesResponse>(`/vehicles?limit=${limit}`);


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



// ---------------------------------------------------------------------------
// Vehicle management and admin calls
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    Object.setPrototypeOf(this, ApiError.prototype);
    this.name = 'ApiError';
    this.status = status;
  }
}

// The backend answers errors as { error: "text" } or as { success: false, error: { message } }
function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error: unknown }).error;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message: unknown }).message;
      if (typeof message === 'string') return message;
    }
  }
  return fallback;
}

// Like request(), but failures carry the server's own message
async function send<T>(path: string, init: RequestInit = {}, adminKey?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminKey) headers['x-admin-key'] = adminKey;

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // the answer had no JSON body
  }

  if (!res.ok) {
    throw new ApiError(res.status, errorMessage(body, `${res.status} ${res.statusText}`));
  }
  return body as T;
}

// Sends the admin key. If the server rejects the saved key, admin mode locks itself again.
async function sendAsAdmin<T>(
  path: string,
  init: RequestInit = {},
  key: string | null = getAdminKey()
): Promise<T> {
  if (!key) throw new ApiError(401, 'Admin mode is locked: enter the admin key first');

  try {
    return await send<T>(path, init, key);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && key === getAdminKey()) clearAdminKey();
    throw err;
  }
}

/** Checks a key with the server. Succeeds only for a correct key. */
export const pingAdmin = (key: string) =>
  sendAsAdmin<{ success: boolean; admin: boolean }>('/admin/ping', {}, key);

export const createVehicle = (input: VehicleInput) =>
  send<VehicleResponse>('/vehicles', { method: 'POST', body: JSON.stringify(input) });

export const updateVehicle = (vehicleId: string, changes: VehicleChanges) =>
  send<VehicleResponse>(`/vehicles/${encodeURIComponent(vehicleId)}`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  });

export const deleteVehicle = (vehicleId: string, deleteHistory = false) =>
  sendAsAdmin<DeleteVehicleResult>(
    `/vehicles/${encodeURIComponent(vehicleId)}${deleteHistory ? '?deleteHistory=true' : ''}`,
    { method: 'DELETE' }
  );

export const generateVehicles = (count: number, trim = false) =>
  sendAsAdmin<GenerateVehiclesResult>('/admin/vehicles/generate', {
    method: 'POST',
    body: JSON.stringify({ count, trim }),
  });

export const resetSampleData = (restore = false) =>
  sendAsAdmin<ResetResult>('/admin/reset', {
    method: 'POST',
    body: JSON.stringify({ confirm: true, restore }),
  });

export const getSimulatorStatus = () => sendAsAdmin<SimulatorResponse>('/admin/simulator/status');

export const startSimulator = (options: SimulatorOptions = {}) =>
  sendAsAdmin<SimulatorResponse>('/admin/simulator/start', {
    method: 'POST',
    body: JSON.stringify(options),
  });

export const stopSimulator = () =>
  sendAsAdmin<SimulatorResponse>('/admin/simulator/stop', { method: 'POST' });


// ---- Geofence management ----

// All geofences, including the ones that are switched off (getGeofences returns only the active ones)
export const getAllGeofences = () => send<GeofencesResponse>('/geofences');

export const setGeofenceActive = (id: string, active: boolean) =>
  send<{ success: boolean; geofence: Geofence }>(`/geofences/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ active }),
  });

export const deleteGeofence = (id: string) =>
  send<{ success: boolean; deleted: string }>(`/geofences/${id}`, { method: 'DELETE' });


export const createGeofence = (input: {
  name: string;
  description?: string;
  coordinates: [number, number][][];
  vehicleIds: string[];
}) =>
  send<{ success: boolean; geofence: Geofence }>('/geofences', {
    method: 'POST',
    body: JSON.stringify(input),
  });