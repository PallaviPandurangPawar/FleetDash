import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSocket } from './hooks/useSocket';
import { useVehicleStream } from './hooks/useVehicleStream';
import { useAlerts } from './hooks/useAlerts';
import { DashboardLayout } from './components/layout/DashboardLayout';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import { getAllVehicles, getGeofences } from './services/api';
import type { Geofence } from './types/api';
import type { DisplayVehicle, Vehicle, VehicleStatus } from './types/telemetry';
import { DashboardPage } from './pages/DashboardPage';

function toDisplayVehicle(vehicle: Vehicle, liveUpdate?: ReturnType<typeof useVehicleStream>[number]): DisplayVehicle {
  const status: VehicleStatus = liveUpdate
    ? liveUpdate.speed > 3
      ? 'in_transit'
      : liveUpdate.ignition
        ? 'idle'
        : 'offline'
    : vehicle.status;

  return {
    vehicleId: vehicle.vehicleId,
    plateNumber: vehicle.plateNumber,
    driverName: vehicle.driverName,
    status,
    speed: liveUpdate?.speed ?? vehicle.lastTelemetry.speed,
    fuelLevel: liveUpdate?.fuelLevel ?? vehicle.lastTelemetry.fuelLevel,
    live: Boolean(liveUpdate),
    location: liveUpdate
      ? [liveUpdate.lon, liveUpdate.lat]
      : vehicle.lastKnownLocation?.coordinates ?? null,
    heading: liveUpdate?.heading ?? 0,
    timestamp: liveUpdate?.timestamp ?? (
      vehicle.lastTelemetry.timestamp ? new Date(vehicle.lastTelemetry.timestamp).getTime() : null
    ),
  };
}

export default function App() {
  const connected = useSocket();
  const streamVehicles = useVehicleStream();
  const { alerts, summary, loading: alertsLoading, error: alertsError, acknowledge, refresh: refreshAlerts } = useAlerts();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    const [vehiclesResult, geofencesResult] = await Promise.allSettled([getAllVehicles(), getGeofences()]);
    const errors: string[] = [];

    if (vehiclesResult.status === 'fulfilled') {
      setVehicles(vehiclesResult.value.vehicles);
    } else {
      errors.push(vehiclesResult.reason instanceof Error
        ? vehiclesResult.reason.message
        : 'Unable to load vehicles');
    }

    if (geofencesResult.status === 'fulfilled') {
      setGeofences(geofencesResult.value.geofences);
    } else {
      errors.push(geofencesResult.reason instanceof Error
        ? geofencesResult.reason.message
        : 'Unable to load geofences');
    }

    setLoadErrors(errors);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshDashboard = useCallback(async () => {
    await Promise.all([loadData(), refreshAlerts()]);
  }, [loadData, refreshAlerts]);

  const displayVehicles = useMemo(() => {
    const liveUpdates = new Map(streamVehicles.map((update) => [update.vehicleId, update]));
    return vehicles.map((vehicle) => toDisplayVehicle(vehicle, liveUpdates.get(vehicle.vehicleId)));
  }, [vehicles, streamVehicles]);

  const vehicleCount = vehicles.length;
  const liveCount = displayVehicles.filter((vehicle) => vehicle.live && vehicle.speed > 3).length;

  return (
    <DashboardLayout
      header={<Header connected={connected} vehicleCount={vehicleCount} liveCount={liveCount} alertCount={summary?.unacknowledged ?? 0} />}
      sidebar={<Sidebar vehicles={displayVehicles} />}
    >
      <DashboardPage
        vehicles={displayVehicles}
        geofences={geofences}
        alerts={alerts}
        alertSummary={summary}
        loading={loading || alertsLoading}
        connected={connected}
        errors={[...new Set([...loadErrors, ...(alertsError ? [alertsError] : [])])]}
        onAcknowledge={acknowledge}
        registeredVehicles={vehicles}
        onRefresh={refreshDashboard}
      />
    </DashboardLayout>
  );
}
