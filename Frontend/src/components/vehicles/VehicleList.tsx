// Frontend/src/components/vehicles/VehicleList.tsx
// Week 1: list of vehicles with status

import { DisplayVehicle } from '../../types/telemetry';
import { VehicleCard } from './VehicleCard';

const MAX_VISIBLE = 200;

interface Props {
  vehicles: DisplayVehicle[];
  onVehicleDeleted: (vehicleId: string) => void;
  onVehicleChanged: () => void;
}

export default function VehicleList({ vehicles, onVehicleDeleted, onVehicleChanged }: Props) {
    if(vehicles.length === 0) {
        return <p className="empty">No vehicles available.</p>;
    }
    const visible = vehicles.slice(0, MAX_VISIBLE);

    return (
        <>

        <div className="vehicle-list">
            {visible.map((v) =>

                <VehicleCard key={v.vehicleId} vehicle={v} onDeleted={onVehicleDeleted} onChanged={onVehicleChanged} />
            )}
        </div>
            {vehicles.length > MAX_VISIBLE && (
                <div className = "list-note">
                    Showing {MAX_VISIBLE} of {vehicles.length}. Use search to narrow down.
                </div>
            )}

        </>
    );
}