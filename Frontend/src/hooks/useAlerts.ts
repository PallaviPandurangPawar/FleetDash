// Frontend/src/hooks/useAlerts.ts
// Geofence alerts: the saved list, the live events from the socket, the unacknowledged count and the pop-ups.
import { useCallback, useEffect, useRef, useState } from 'react';
import { acknowledgeAlert, acknowledgeAllAlerts, getAlertSummary, getAlerts } from '../services/api';
import { EVENTS, socket } from '../services/socketClient';
import type { AlertRecord, GeofenceAlertEvent } from '../types/api';

const MAX_ALERTS = 100;
const MAX_TOASTS = 3;
const TOAST_MS = 6000;

export interface Toast {
  key: number;
  alert: AlertRecord;
}

// The socket event has a slightly different shape than a saved alert
function fromEvent(event: GeofenceAlertEvent): AlertRecord {
  const date = new Date(event.occurredAt);
  const when = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  return {
    _id: event.id,
    type: event.type,
    vehicleId: event.vehicleId,
    geofenceId: event.geofenceId,
    geofenceName: event.geofenceName,
    location: { type: 'Point', coordinates: [event.lon, event.lat] },
    occurredAt: when,
    acknowledged: false,
    createdAt: when,
  };
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [unacknowledged, setUnacknowledged] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [error, setError] = useState<string | null>(null);
  const known = useRef(new Set<string>()); // ids already counted, so nothing is counted twice
  const toastKey = useRef(0);

  const load = useCallback(async () => {
    try {
      const [list, summary] = await Promise.all([getAlerts(MAX_ALERTS), getAlertSummary()]);
      known.current = new Set(list.alerts.map((a) => a._id));
      setAlerts(list.alerts);
      setUnacknowledged(summary.unacknowledged);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the alerts');
    }
  }, []);

  const dismissToast = useCallback((key: number) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  useEffect(() => {
    load();

    const onAlert = (event: GeofenceAlertEvent) => {
      const alert = fromEvent(event);
      if (known.current.has(alert._id)) return;
      known.current.add(alert._id);

      setAlerts((prev) => [alert, ...prev].slice(0, MAX_ALERTS));
      setUnacknowledged((n) => n + 1);

      toastKey.current += 1;
      const key = toastKey.current;
      setToasts((prev) => [...prev, { key, alert }].slice(-MAX_TOASTS));
      window.setTimeout(() => dismissToast(key), TOAST_MS);
    };

    socket.on(EVENTS.GEOFENCE_ALERT, onAlert);
    socket.on('connect', load); // after a reconnect, fetch what was missed

    return () => {
      socket.off(EVENTS.GEOFENCE_ALERT, onAlert);
      socket.off('connect', load);
    };
  }, [load, dismissToast]);

  const acknowledge = useCallback(async (id: string) => {
    try {
      await acknowledgeAlert(id);
      setAlerts((prev) => prev.map((a) => (a._id === id ? { ...a, acknowledged: true } : a)));
      const summary = await getAlertSummary();
      setUnacknowledged(summary.unacknowledged);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not acknowledge the alert');
    }
  }, []);

  const acknowledgeAll = useCallback(async () => {
    try {
      await acknowledgeAllAlerts();
      setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
      setUnacknowledged(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not acknowledge the alerts');
    }
  }, []);

  return { alerts, unacknowledged, toasts, error, acknowledge, acknowledgeAll, dismissToast };
}