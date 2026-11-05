// Frontend/src/components/vehicles/VehicleCard.tsx
// Single vehicle summary card (with edit and delete in admin mode)
import { useState } from 'react';
import { useAdminKey } from '../../hooks/useAdminKey';
import { deleteVehicle } from '../../services/api';
import { DisplayVehicle } from '../../types/telemetry';
import EditVehicleForm from '../admin/EditVehicleForm';
import StatusBadge from '../common/StatusBadge';

interface Props {
  vehicle: DisplayVehicle;
  onDeleted: (vehicleId: string) => void;
  onChanged: () => void;
}

export function VehicleCard({ vehicle, onDeleted, onChanged }: Props) {
  const { unlocked } = useAdminKey();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [withHistory, setWithHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteVehicle(vehicle.vehicleId, withHistory);
      onDeleted(vehicle.vehicleId); // the card disappears when the list reloads
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the vehicle');
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="card">
        <EditVehicleForm
          vehicle={vehicle}
          onSaved={() => {
            onChanged();
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-top">
        <span className="card-id">{vehicle.vehicleId}</span>
        <StatusBadge status={vehicle.status} />
      </div>

      <div className="card-meta">
        <span>{vehicle.plateNumber}</span>
        <span>{vehicle.driverName}</span>
      </div>
      <div className="card-meta">
        <span>Speed: {vehicle.speed.toFixed(0)} km/h</span>
        <span>Fuel: {vehicle.fuelLevel.toFixed(0)} %</span>
      </div>

      {unlocked && vehicle.registered && (
        <div className="card-actions">
          {confirming ? (
            <>
              <label className="card-check">
                <input
                  type="checkbox"
                  checked={withHistory}
                  onChange={(e) => setWithHistory(e.target.checked)}
                  disabled={busy}
                />
                Also delete its history
              </label>
              <div className="card-confirm">
                <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
                  {busy ? 'Deleting...' : `Delete ${vehicle.vehicleId}`}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="card-confirm">
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirming(true)}>
                Delete
              </button>
            </div>
          )}
          {error && <div className="panel-error">{error}</div>}
        </div>
      )}
    </div>
  );
}