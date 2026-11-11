import { useEffect, useState, type FormEvent } from 'react';
import type { Geofence, SimulatorState } from '../../types/api';
import type { Vehicle, VehicleStatus } from '../../types/telemetry';
import {
  createGeofence,
  createVehicle,
  deleteGeofence,
  deleteVehicle,
  generateVehicles,
  getAllGeofences,
  getSimulatorStatus,
  pingAdmin,
  resetSampleData,
  startSimulator,
  stopSimulator,
  updateGeofence,
  updateVehicle,
} from '../../services/api';
import { clearAdminKey, getAdminKey, setAdminKey, subscribeAdminKey } from '../../services/adminAuth';

const vehicleStatuses: VehicleStatus[] = ['active', 'idle', 'in_transit', 'maintenance', 'offline'];
const defaultCoordinates = '[[[88.34,22.55],[88.38,22.55],[88.38,22.59],[88.34,22.59],[88.34,22.55]]]';

function isPolygonCoordinates(value: unknown): value is [number, number][][] {
  return Array.isArray(value) && value.length > 0 && value.every((ring) =>
    Array.isArray(ring) && ring.length >= 4 && ring.every((point) =>
      Array.isArray(point) && point.length === 2 &&
      typeof point[0] === 'number' && Number.isFinite(point[0]) &&
      typeof point[1] === 'number' && Number.isFinite(point[1])
    )
  );
}

interface Props {
  vehicles: Vehicle[];
  onRefresh: () => Promise<void>;
}

export default function FleetTools({ vehicles, onRefresh }: Props) {
  const [adminKey, setAdminKeyState] = useState<string | null>(getAdminKey());
  const [keyInput, setKeyInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [busy, setBusy] = useState(false);
  const [simulator, setSimulator] = useState<SimulatorState | null>(null);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [newVehicleId, setNewVehicleId] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [driverName, setDriverName] = useState('');
  const [status, setStatus] = useState<VehicleStatus>('idle');
  const [deleteHistory, setDeleteHistory] = useState(false);
  const [generateCount, setGenerateCount] = useState('10');
  const [trimVehicles, setTrimVehicles] = useState(false);
  const [restoreSample, setRestoreSample] = useState(true);
  const [simulatorCount, setSimulatorCount] = useState('10');
  const [intervalMs, setIntervalMs] = useState('1000');
  const [timeScale, setTimeScale] = useState('10');
  const [geofenceName, setGeofenceName] = useState('');
  const [geofenceDescription, setGeofenceDescription] = useState('');
  const [coordinates, setCoordinates] = useState(defaultCoordinates);

  const simulatorOptionsValid =
    Number.isInteger(Number(simulatorCount)) && Number(simulatorCount) >= 1 && Number(simulatorCount) <= 500 &&
    Number.isInteger(Number(intervalMs)) && Number(intervalMs) >= 250 && Number(intervalMs) <= 10000 &&
    Number.isInteger(Number(timeScale)) && Number(timeScale) >= 1 && Number(timeScale) <= 100;

  useEffect(() => subscribeAdminKey(() => setAdminKeyState(getAdminKey())), []);

  useEffect(() => {
    if (!adminKey) {
      setSimulator(null);
      return;
    }

    let active = true;
    const refreshStatus = async () => {
      try {
        const statusResponse = await getSimulatorStatus();
        if (!active) return;
        setSimulator(statusResponse.simulator);
        setStatusError('');
      } catch (loadError) {
        if (active) setStatusError(loadError instanceof Error ? loadError.message : 'Unable to load simulator status');
      }
    };

    void getAllGeofences()
      .then((response) => {
        if (active) setGeofences(response.geofences);
      })
      .catch((loadError: unknown) => {
        if (active) setStatusError(loadError instanceof Error ? loadError.message : 'Unable to load geofences');
      });
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [adminKey]);

  useEffect(() => {
    const selected = vehicles.find((vehicle) => vehicle.vehicleId === vehicleId);
    if (!selected) return;
    setPlateNumber(selected.plateNumber);
    setMake(selected.make);
    setModel(selected.model);
    setYear(String(selected.year));
    setDriverName(selected.driverName);
    setStatus(selected.status);
  }, [vehicleId, vehicles]);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The action could not be completed');
    } finally {
      setBusy(false);
    }
  };

  const refreshDashboardData = async () => {
    await onRefresh();
    const response = await getAllGeofences();
    setGeofences(response.geofences);
  };

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setAuthError('');
    try {
      const candidate = keyInput.trim();
      await pingAdmin(candidate);
      setAdminKey(candidate);
      setKeyInput('');
    } catch (authFailure) {
      setAuthError(authFailure instanceof Error ? authFailure.message : 'Could not verify admin key');
    } finally {
      setBusy(false);
    }
  };

  const saveVehicle = (event: FormEvent) => {
    event.preventDefault();
    const numericYear = Number(year);
    if (!Number.isInteger(numericYear) || numericYear < 1900 || numericYear > 2100) {
      setError('Enter a valid vehicle year.');
      return;
    }
    void runAction(async () => {
      if (vehicleId) {
        await updateVehicle(vehicleId, { plateNumber, make, model, year: numericYear, driverName, status });
        setMessage(`Vehicle ${vehicleId} updated.`);
      } else {
        const id = newVehicleId.trim();
        if (!id || !plateNumber.trim()) throw new Error('Vehicle ID and registration are required.');
        await createVehicle({ vehicleId: id, plateNumber, make, model, year: numericYear, driverName });
        setVehicleId(id);
        setNewVehicleId('');
        setMessage(`Vehicle ${id} added.`);
      }
      await refreshDashboardData();
    });
  };

  const submitGenerate = (event: FormEvent) => {
    event.preventDefault();
    const count = Number(generateCount);
    if (!Number.isInteger(count) || count < 1 || count > 500) {
      setError('Vehicle count must be between 1 and 500.');
      return;
    }
    if (trimVehicles && !window.confirm(`Remove sample vehicles above FLEET-${String(count).padStart(3, '0')}?`)) return;
    void runAction(async () => {
      const result = await generateVehicles(count, trimVehicles);
      setMessage(`Fleet updated: ${result.created} created, ${result.alreadyThere} already existed, ${result.removed} removed.`);
      await refreshDashboardData();
    });
  };

  const submitReset = () => {
    if (!window.confirm('Reset the sample fleet data? This removes seeded vehicles, their history, alerts, and sample geofences.')) return;
    void runAction(async () => {
      const result = await resetSampleData(restoreSample);
      setMessage(`Sample data reset. ${result.removed.vehicles} vehicles and ${result.removed.geofences} geofences removed.`);
      await refreshDashboardData();
    });
  };

  const submitGeofence = (event: FormEvent) => {
    event.preventDefault();
    void runAction(async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(coordinates);
      } catch {
        throw new Error('Coordinates must be valid JSON polygon coordinates.');
      }
      if (!isPolygonCoordinates(parsed)) {
        throw new Error('Coordinates must be a GeoJSON polygon with at least four [longitude, latitude] points per ring.');
      }
      const result = await createGeofence({
        name: geofenceName.trim(),
        description: geofenceDescription.trim(),
        coordinates: parsed,
      });
      setGeofences((current) => [result.geofence, ...current]);
      setGeofenceName('');
      setGeofenceDescription('');
      setMessage(`Geofence "${result.geofence.name}" created.`);
      await refreshDashboardData();
    });
  };

  const selectedVehicle = vehicles.find((vehicle) => vehicle.vehicleId === vehicleId);

  return (
    <details className="panel fleet-tools-panel">
      <summary className="panel-header compact fleet-tools-summary">
        <div>
          <p className="eyebrow">Backend controls</p>
          <h2>Fleet tools</h2>
        </div>
        <span className="tiny-number">{adminKey ? 'Admin unlocked' : 'Admin locked'}</span>
      </summary>

      {!adminKey ? (
        <form className="fleet-tool-form fleet-admin-unlock" onSubmit={(event) => void unlock(event)}>
          <label>
            Admin API key
            <input
              type="password"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              autoComplete="current-password"
              placeholder="Enter ADMIN_API_KEY"
            />
          </label>
          <button className="tool-button primary" type="submit" disabled={busy || !keyInput.trim()}>
            {busy ? 'Checking…' : 'Unlock tools'}
          </button>
          <p className="tool-hint">The key is kept only for this browser tab.</p>
          {authError && <p className="tool-error" role="alert">{authError}</p>}
        </form>
      ) : (
        <>
          <div className="fleet-tools-heading">
            <span>Admin API access is active for this tab.</span>
            <button type="button" className="tool-button subtle" onClick={clearAdminKey}>Lock tools</button>
          </div>
          {message && <p className="tool-success" role="status">{message}</p>}
          {error && <p className="tool-error" role="alert">{error}</p>}
          {statusError && <p className="tool-error" role="alert">{statusError}</p>}

          <div className="fleet-tools-grid">
            <form className="tool-group fleet-tool-form" onSubmit={submitGenerate}>
              <h3>Sample fleet</h3>
              <label>
                Number of vehicles
                <input type="number" min="1" max="500" value={generateCount} onChange={(event) => setGenerateCount(event.target.value)} />
              </label>
              <label className="tool-check">
                <input type="checkbox" checked={trimVehicles} onChange={(event) => setTrimVehicles(event.target.checked)} />
                Remove extra sample vehicles
              </label>
              <button className="tool-button primary" type="submit" disabled={busy || Number(generateCount) < 1 || Number(generateCount) > 500 || !Number.isInteger(Number(generateCount))}>Generate fleet</button>
              <label className="tool-check">
                <input type="checkbox" checked={restoreSample} onChange={(event) => setRestoreSample(event.target.checked)} />
                Restore default sample data after reset
              </label>
              <button className="tool-button danger" type="button" disabled={busy} onClick={submitReset}>Reset sample data</button>
            </form>

            <div className="tool-group">
              <h3>Vehicle simulator</h3>
              <p className="tool-hint" aria-live="polite">
                {simulator === null ? 'Checking simulator…' : simulator.running
                  ? `Running · ${simulator.vehicles} vehicle(s) · ${simulator.sent} readings sent · ${simulator.failed} failed`
                  : `Stopped · ${simulator?.sent ?? 0} readings sent`}
              </p>
              {simulator?.lastError && <p className="tool-error">{simulator.lastError}</p>}
              <div className="tool-number-grid">
                <label>Vehicles<input type="number" min="1" max="500" value={simulatorCount} onChange={(event) => setSimulatorCount(event.target.value)} /></label>
                <label>Interval (ms)<input type="number" min="250" max="10000" value={intervalMs} onChange={(event) => setIntervalMs(event.target.value)} /></label>
                <label>Time scale<input type="number" min="1" max="100" value={timeScale} onChange={(event) => setTimeScale(event.target.value)} /></label>
              </div>
              <div className="tool-actions">
                <button
                  className="tool-button primary"
                  type="button"
                  disabled={busy || !simulatorOptionsValid}
                  onClick={() => void runAction(async () => {
                    const result = await startSimulator({
                      count: Number(simulatorCount),
                      intervalMs: Number(intervalMs),
                      timeScale: Number(timeScale),
                    });
                    setSimulator(result.simulator);
                    setMessage(result.simulator.running ? 'Simulator started.' : 'Simulator stopped.');
                  })}
                >
                  {simulator?.running ? 'Restart simulator' : 'Start simulator'}
                </button>
                {simulator?.running && (
                  <button className="tool-button subtle" type="button" disabled={busy} onClick={() => void runAction(async () => {
                    const result = await stopSimulator();
                    setSimulator(result.simulator);
                    setMessage('Simulator stopped.');
                  })}>Stop</button>
                )}
              </div>
            </div>

            <form className="tool-group fleet-tool-form" onSubmit={saveVehicle}>
              <h3>Vehicle details</h3>
              <label>
                Edit existing vehicle
                <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
                  <option value="">Add a new vehicle</option>
                  {vehicles.map((vehicle) => <option key={vehicle.vehicleId} value={vehicle.vehicleId}>{vehicle.vehicleId}</option>)}
                </select>
              </label>
              {!vehicleId && (
                <label>
                  Vehicle ID
                  <input value={newVehicleId} onChange={(event) => setNewVehicleId(event.target.value)} placeholder="e.g. FLEET-011" required />
                </label>
              )}
              <div className="tool-number-grid">
                <label>Registration<input value={plateNumber} onChange={(event) => setPlateNumber(event.target.value)} required /></label>
                <label>Year<input type="number" min="1900" max="2100" value={year} onChange={(event) => setYear(event.target.value)} /></label>
                <label>Make<input value={make} onChange={(event) => setMake(event.target.value)} /></label>
                <label>Model<input value={model} onChange={(event) => setModel(event.target.value)} /></label>
                <label>Driver<input value={driverName} onChange={(event) => setDriverName(event.target.value)} /></label>
                {selectedVehicle && (
                  <label>Status
                    <select value={status} onChange={(event) => setStatus(event.target.value as VehicleStatus)}>
                      {vehicleStatuses.map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <div className="tool-actions">
                <button className="tool-button primary" type="submit" disabled={busy}>{vehicleId ? 'Save vehicle' : 'Add vehicle'}</button>
                {selectedVehicle && (
                  <button className="tool-button danger" type="button" disabled={busy} onClick={() => {
                    if (!window.confirm(`Delete ${vehicleId}?`)) return;
                    void runAction(async () => {
                      await deleteVehicle(vehicleId, deleteHistory);
                      setMessage(`Vehicle ${vehicleId} deleted.`);
                      setVehicleId('');
                      setDeleteHistory(false);
                      await refreshDashboardData();
                    });
                  }}>Delete</button>
                )}
              </div>
              {selectedVehicle && (
                <label className="tool-check">
                  <input type="checkbox" checked={deleteHistory} onChange={(event) => setDeleteHistory(event.target.checked)} />
                  Also delete telemetry history and alerts
                </label>
              )}
            </form>

            <form className="tool-group fleet-tool-form" onSubmit={submitGeofence}>
              <h3>Geofences</h3>
              <label>Name<input value={geofenceName} onChange={(event) => setGeofenceName(event.target.value)} required /></label>
              <label>Description<input value={geofenceDescription} onChange={(event) => setGeofenceDescription(event.target.value)} /></label>
              <label>
                Polygon coordinates (GeoJSON)
                <textarea rows={3} value={coordinates} onChange={(event) => setCoordinates(event.target.value)} required />
              </label>
              <button className="tool-button primary" type="submit" disabled={busy}>Add geofence</button>
              <div className="tool-geofence-list">
                {geofences.map((fence) => (
                  <div className="tool-geofence-row" key={fence._id}>
                    <span>{fence.name}<small>{fence.active ? 'Active' : 'Inactive'}</small></span>
                    <button className="tool-button subtle" type="button" disabled={busy} onClick={() => void runAction(async () => {
                      const result = await updateGeofence(fence._id, { active: !fence.active });
                      setGeofences((current) => current.map((item) => item._id === fence._id ? result.geofence : item));
                      await refreshDashboardData();
                    })}>{fence.active ? 'Disable' : 'Enable'}</button>
                    <button className="tool-button danger" type="button" disabled={busy} onClick={() => {
                      if (!window.confirm(`Delete geofence "${fence.name}"?`)) return;
                      void runAction(async () => {
                        await deleteGeofence(fence._id);
                        setGeofences((current) => current.filter((item) => item._id !== fence._id));
                        await refreshDashboardData();
                      });
                    }}>Delete</button>
                  </div>
                ))}
                {!geofences.length && <p className="tool-hint">No geofences yet.</p>}
              </div>
            </form>
          </div>
        </>
      )}
    </details>
  );
}
