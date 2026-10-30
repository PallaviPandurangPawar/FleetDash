// Frontend/src/components/vehicles/VehicleList.tsx
// Week 1: list of vehicles with status

import { DisplayVehicle } from '../../types/telemetry';
import { VehicleCard } from './VehicleCard';

const MAX_VISIBLE = 200;

interface Props {
  vehicles: DisplayVehicle[];
}

export default function VehicleList({ vehicles }: Props) {
    if(vehicles.length === 0) {
        return <p>No vehicles available.</p>;
    }
    const visible = vehicles.slice(0, MAX_VISIBLE);

    return (
        <>
       
        <div className="vehicle-list">
            {visible.map((v) => 
            
                <VehicleCard key={v.vehicleId} vehicle={v} />
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