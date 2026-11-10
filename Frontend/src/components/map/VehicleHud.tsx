// Frontend/src/components/map/VehicleHud.tsx
// The card for the selected vehicle (top right of the map)
import type { DisplayVehicle } from '../../types/telemetry';
import StatusBadge from '../common/StatusBadge';

interface Props {
  vehicle: DisplayVehicle;
  onClose: () => void;
}

export default function VehicleHud({ vehicle, onClose }: Props) {
  const model = [vehicle.make, vehicle.model].filter(Boolean).join(' ');

  return (
    <div className="vehicle-hud">
      <div className="vehicle-hud-head">
        <div className="vehicle-hud-id">
          <i className="fa-solid fa-circle" />
          {vehicle.vehicleId}
        </div>
        <StatusBadge status={vehicle.status} />
        <button type="button" className="vehicle-hud-close" onClick={onClose} aria-label="Close">
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      <dl className="vehicle-hud-grid">
        <div>
          <dt>Driver</dt>
          <dd>{vehicle.driverName}</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd className="hud-accent">{vehicle.speed.toFixed(0)} km/h</dd>
        </div>
        <div>
          <dt>Fuel level</dt>
          <dd>{vehicle.fuelLevel.toFixed(0)}%</dd>
        </div>
        <div>
          <dt>Vehicle</dt>
          <dd>
            {model || vehicle.plateNumber}
            {vehicle.year ? ` (${vehicle.year})` : ''}
          </dd>
        </div>
      </dl>
    </div>
  );
}