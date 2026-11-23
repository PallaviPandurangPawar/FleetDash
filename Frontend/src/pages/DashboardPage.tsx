import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useVehicleStream } from '../hooks/useVehicleStream';
import type { DisplayVehicle, Vehicle } from '../types/telemetry';
import { getGeofences, getVehicles } from '../services/api';
import type { Geofence } from '../types/api';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';
import MapCanvas from '../components/map/MapCanvas';
import { vehicleBuffer } from '../canvas/vehicleBuffer';
import { useAlerts } from '../hooks/useAlerts';
import AlertsPanel from '../components/alerts/AlertPanel';
import AlertToasts from '../components/alerts/AlertToast';

export default function DashboardPage() {
  const connected = useSocket();
  const live = useVehicleStream();
  const alerts = useAlerts();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [registered, setRegistered] = useState<Vehicle[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [geofences, setGeofences] = useState<Geofence[]>([]);

  // The vehicle picked in the list or on the map; picking it again in the list clears the pick
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const toggleSelected = useCallback(
    (id: string) => setSelectedId((prev) => (prev === id ? null : id)),
    []
  );


  // Drawing a new geofence: the map collects the clicked corners
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const startDrawing = useCallback(() => {
    setDraft([]);
    setDrawing(true);
  }, []);
  const stopDrawing = useCallback(() => {
    setDrawing(false);
    setDraft([]);
  }, []);
  const addCorner = useCallback(
    (lon: number, lat: number) => setDraft((prev) => [...prev, [lon, lat]]),
    []
  );
  const undoCorner = useCallback(() => setDraft((prev) => prev.slice(0, -1)), []);
  const clearCorners = useCallback(() => setDraft([]), []);

  // Loads the registered vehicles again (also used after one is added, edited or deleted)
  const loadVehicles = useCallback(() => {
    getVehicles()
      .then((res) => setRegistered(res.vehicles))
      .catch((err: Error) => console.error('Could not load vehicles:', err));
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  // Loads the active geofences for the map (also used after the sample data is reset)
  const loadGeofences = useCallback(() => {
    getGeofences()
      .then((res) => setGeofences(res.geofences))
      .catch((err: Error) => console.error('Could not load geofences:', err));
  }, []);

  useEffect(() => {
    loadGeofences();
  }, [loadGeofences]);

  // Called after vehicles were removed: forget their last live updates and reload the list
  const handleRemoved = useCallback(
    (vehicleIds: string[]) => {
      vehicleIds.forEach((id) => vehicleBuffer.delete(id));
      setRemovedIds((prev) => {
        const next = new Set(prev);
        vehicleIds.forEach((id) => next.add(id));
        return next;
      });
      loadVehicles();
      loadGeofences();
      setSelectedId((prev) => (prev !== null && vehicleIds.includes(prev) ? null : prev));
    },
    [loadVehicles, loadGeofences]
  );

  const handleDeleted = useCallback(
    (vehicleId: string) => handleRemoved([vehicleId]),
    [handleRemoved]
  );

  const rows = useMemo<DisplayVehicle[]>(() => {
    const byId = new Map<string, DisplayVehicle>();

    for (const v of registered) {
      byId.set(v.vehicleId, {
        vehicleId: v.vehicleId,
        plateNumber: v.plateNumber,
        driverName: v.driverName,
        status: v.status,
        speed: v.lastTelemetry?.speed ?? 0,
        fuelLevel: v.lastTelemetry?.fuelLevel ?? 0,
        live: false,
        registered: true,
        make: v.make,
        model: v.model,
        year: v.year,
        lon: v.lastKnownLocation?.coordinates[0],
        lat: v.lastKnownLocation?.coordinates[1],
      });
    }

    for (const u of live) {
      const base = byId.get(u.vehicleId);
      // A vehicle that was just deleted can still have a last live update: ignore it
      if (!base && removedIds.has(u.vehicleId)) continue;
      byId.set(u.vehicleId, {
        vehicleId: u.vehicleId,
        plateNumber: base?.plateNumber ?? '',
        driverName: base?.driverName ?? 'Unassigned',
        status: u.speed > 5 ? 'in_transit' : 'idle',
        speed: u.speed,
        fuelLevel: u.fuelLevel,
        live: true,
        registered: base !== undefined,
        make: base?.make,
        model: base?.model,
        year: base?.year,
        lon: u.lon,
        lat: u.lat,
        heading: u.heading,
      });
    }

    return Array.from(byId.values());
  }, [registered, live, removedIds]);

  return (
    <DashboardLayout
      header={<Header connected={connected} vehicleCount={rows.length} liveCount={rows.filter((row) => row.live).length}
      alertCount={alerts.unacknowledged}
      onToggleAlerts={() => setAlertsOpen((open) => !open)} />}
      sidebar={
        <Sidebar
          vehicles={rows}
          onVehiclesChanged={loadVehicles}
          connected={connected}
          selectedId={selectedId}
          onSelect={toggleSelected}
          onVehicleDeleted={handleDeleted}
          onVehiclesRemoved={handleRemoved}
          onGeofencesChanged={loadGeofences}
          draw={{
            corners: draft,
            onStart: startDrawing,
            onUndo: undoCorner,
            onClear: clearCorners,
            onStop: stopDrawing,
          }}
        />
      }
    >
      <>
        <MapCanvas
          vehicles={rows}
          geofences={geofences}
          drawing={drawing}
          draft={draft}
          onMapClick={addCorner}
          selectedId={selectedId}
          onSelectVehicle={setSelectedId}
        />
        {!alertsOpen && <AlertToasts toasts={alerts.toasts} onDismiss={alerts.dismissToast} />}
        {alertsOpen && (
          <AlertsPanel
            alerts={alerts.alerts}
            unacknowledged={alerts.unacknowledged}
            error={alerts.error}
            onAcknowledge={alerts.acknowledge}
            onAcknowledgeAll={alerts.acknowledgeAll}
            onClose={() => setAlertsOpen(false)}
          />
        )}
      </>
    </DashboardLayout>
  );
}