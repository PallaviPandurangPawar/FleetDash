// Frontend/src/components/admin/AddVehicleForm.tsx
// Small form that registers a new vehicle.
import { ChangeEvent, FormEvent, useState } from 'react';
import { createVehicle } from '../../services/api';
import type { VehicleInput } from '../../types/api';

interface Props {
  onCreated: () => void; // called after the vehicle is saved (the page reloads its list)
  onClose: () => void;
}

const EMPTY = { vehicleId: '', plateNumber: '', driverName: '', make: '', model: '', year: '' };

export default function AddVehicleForm({ onCreated, onClose }: Props) {
  const [fields, setFields] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bind = (name: keyof typeof EMPTY) => ({
    value: fields[name],
    onChange: (e: ChangeEvent<HTMLInputElement>) =>
      setFields((prev) => ({ ...prev, [name]: e.target.value })),
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const vehicleId = fields.vehicleId.trim();
    const plateNumber = fields.plateNumber.trim();
    if (!vehicleId || !plateNumber) {
      setError('Vehicle ID and plate number are required');
      return;
    }

    const input: VehicleInput = { vehicleId, plateNumber };
    const driverName = fields.driverName.trim();
    const make = fields.make.trim();
    const model = fields.model.trim();
    if (driverName) input.driverName = driverName;
    if (make) input.make = make;
    if (model) input.model = model;

    if (fields.year.trim()) {
      const year = Number(fields.year);
      if (!Number.isInteger(year) || year < 1980 || year > new Date().getFullYear() + 1) {
        setError('Year must be a whole number between 1980 and next year');
        return;
      }
      input.year = year;
    }

    setBusy(true);
    setError(null);
    try {
      await createVehicle(input);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the vehicle');
      setBusy(false);
    }
  };

  return (
    <form className="panel-form" onSubmit={submit}>
      <div className="panel-title">Add vehicle</div>

      <label>
        Vehicle ID *
        <input {...bind('vehicleId')} placeholder="e.g. FLEET-011" autoFocus autoComplete="off" />
      </label>
      <label>
        Plate number *
        <input {...bind('plateNumber')} placeholder="e.g. WB 02 AB 1011" autoComplete="off" />
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
        <input {...bind('year')} placeholder="e.g. 2024" inputMode="numeric" autoComplete="off" />
      </label>

      {error && <div className="panel-error">{error}</div>}

      <div className="panel-actions">
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Adding...' : 'Add vehicle'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}