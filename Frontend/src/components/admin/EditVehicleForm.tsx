// Frontend/src/components/admin/EditVehicleForm.tsx
// Form inside a vehicle card to change plate, driver, make, model and year.
import { ChangeEvent, FormEvent, useState } from 'react';
import { updateVehicle } from '../../services/api';
import type { VehicleChanges } from '../../types/api';
import type { DisplayVehicle } from '../../types/telemetry';

interface Props {
  vehicle: DisplayVehicle;
  onSaved: () => void;
  onCancel: () => void;
}

type FieldName = 'plateNumber' | 'driverName' | 'make' | 'model' | 'year';

export default function EditVehicleForm({ vehicle, onSaved, onCancel }: Props) {
  const [fields, setFields] = useState<Record<FieldName, string>>({
    plateNumber: vehicle.plateNumber,
    driverName: vehicle.driverName,
    make: vehicle.make ?? '',
    model: vehicle.model ?? '',
    year: vehicle.year !== undefined ? String(vehicle.year) : '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bind = (name: FieldName) => ({
    value: fields[name],
    onChange: (e: ChangeEvent<HTMLInputElement>) =>
      setFields((prev) => ({ ...prev, [name]: e.target.value })),
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const plateNumber = fields.plateNumber.trim();
    if (!plateNumber) {
      setError('Plate number is required');
      return;
    }

    // Cleared text fields go back to the same defaults new vehicles get
    const changes: VehicleChanges = {
      plateNumber,
      driverName: fields.driverName.trim() || 'Unassigned',
      make: fields.make.trim() || 'Generic',
      model: fields.model.trim() || 'Truck',
    };

    // A blank year means "leave it as it is"
    if (fields.year.trim()) {
      const year = Number(fields.year);
      if (!Number.isInteger(year) || year < 1980 || year > new Date().getFullYear() + 1) {
        setError('Year must be a whole number between 1980 and next year');
        return;
      }
      changes.year = year;
    }

    setBusy(true);
    setError(null);
    try {
      await updateVehicle(vehicle.vehicleId, changes);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the changes');
      setBusy(false);
    }
  };

  return (
    <form className="panel-form" onSubmit={submit}>
      <div className="panel-title">Edit {vehicle.vehicleId}</div>

      <label>
        Plate number *
        <input {...bind('plateNumber')} autoFocus autoComplete="off" />
      </label>
      <label>
        Driver name
        <input {...bind('driverName')} placeholder="Unassigned" autoComplete="off" />
      </label>
      <div className="panel-row">
        <label>
          Make
          <input {...bind('make')} placeholder="Generic" autoComplete="off" />
        </label>
        <label>
          Model
          <input {...bind('model')} placeholder="Truck" autoComplete="off" />
        </label>
      </div>
      <label>
        Year
        <input {...bind('year')} inputMode="numeric" autoComplete="off" />
      </label>

      {error && <div className="panel-error">{error}</div>}

      <div className="panel-actions">
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}