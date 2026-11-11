import { useCallback, useEffect, useState } from 'react';
import { acknowledgeAlert, getAlertSummary, getAlerts } from '../services/api';
import type { AlertRecord, AlertSummary, LiveAlert } from '../types/api';
import { EVENTS, socket } from '../services/socketClient';

function isLiveAlert(value: unknown): value is LiveAlert {
  if (!value || typeof value !== 'object') return false;
  const alert = value as Partial<LiveAlert>;
  return (
    typeof alert.id === 'string' &&
    (alert.type === 'enter' || alert.type === 'exit') &&
    typeof alert.vehicleId === 'string' &&
    typeof alert.geofenceId === 'string' &&
    typeof alert.geofenceName === 'string' &&
    typeof alert.lon === 'number' &&
    typeof alert.lat === 'number' &&
    typeof alert.occurredAt === 'number'
  );
}

function toAlertRecord(alert: LiveAlert): AlertRecord {
  const timestamp = new Date(alert.occurredAt).toISOString();
  return {
    _id: alert.id,
    type: alert.type,
    vehicleId: alert.vehicleId,
    geofenceId: alert.geofenceId,
    geofenceName: alert.geofenceName,
    location: { type: 'Point', coordinates: [alert.lon, alert.lat] },
    occurredAt: timestamp,
    acknowledged: false,
    createdAt: timestamp,
  };
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [alertsResponse, alertSummary] = await Promise.all([getAlerts(), getAlertSummary()]);
    setAlerts(alertsResponse.alerts);
    setSummary(alertSummary);
    setError(null);
  }, []);

  useEffect(() => {
    let active = true;
    const handleLiveAlert = (payload: unknown) => {
      if (!isLiveAlert(payload)) {
        console.error('Received an invalid geofence alert from the live socket');
        return;
      }

      const alert = toAlertRecord(payload);
      setAlerts((current) => [alert, ...current.filter((item) => item._id !== alert._id)].slice(0, 50));
      setSummary((current) => current
        ? {
            ...current,
            total: current.total + 1,
            unacknowledged: current.unacknowledged + 1,
            exits: current.exits + (alert.type === 'exit' ? 1 : 0),
            enters: current.enters + (alert.type === 'enter' ? 1 : 0),
          }
        : current);
    };

    socket.on(EVENTS.GEOFENCE_ALERT, handleLiveAlert);

    refresh()
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load alerts');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      socket.off(EVENTS.GEOFENCE_ALERT, handleLiveAlert);
    };
  }, [refresh]);

  const acknowledge = useCallback(async (id: string) => {
    setError(null);
    try {
      await acknowledgeAlert(id);
      setAlerts((current) => current.map((alert) => (
        alert._id === id ? { ...alert, acknowledged: true } : alert
      )));
      setSummary((current) => current
        ? { ...current, unacknowledged: Math.max(0, current.unacknowledged - 1) }
        : current);
    } catch (acknowledgeError: unknown) {
      setError(acknowledgeError instanceof Error ? acknowledgeError.message : 'Unable to acknowledge alert');
    }
  }, []);

  return { alerts, summary, loading, error, acknowledge, refresh };
}
