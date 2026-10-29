// Frontend/src/components/vehicles/VehicleCard.tsx
// Week 1: single vehicle summary
import { DisplayVehicle } from '../../types/telemetry';

interface Props {
    vehicle: DisplayVehicle;
}

export function VehicleCard({ vehicle }: Props) {
    return(
        <div className="card">
            <div className="card-top">
                <span className = "card_id">{vehicle.vehicleId}</span>
            </div>

            <div className = "card-meta">
                <span>{vehicle.plateNumber}</span>
                <span>{vehicle.driverName}</span>
            </div>
            <div className = "card-meta">
                <span> Speed : {vehicle.speed.toFixed(0)} km/h</span>
                <span> Fuel : {vehicle.fuelLevel.toFixed(0)} % </span>
            </div>
        </div>
    );
}