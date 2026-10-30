// Week 1: temporary App used to test components one by one.
import { useSocket } from './hooks/useSocket';
import { useVehicleStream } from './hooks/useVehicleStream';
import {DashboardLayout} from './components/layout/DashboardLayout';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import {VehicleCard} from './components/vehicles/VehicleCard';
import  VehicleList  from './components/vehicles/VehicleList';
import { DisplayVehicle } from './types/telemetry';

const FAKE: DisplayVehicle[] = [
  { vehicleId: 'SIM-001', plateNumber: 'WB-SIM-001', driverName: 'Ravi', status: 'in_transit', speed: 47.3, fuelLevel: 82.6, live: true },
  { vehicleId: 'SIM-002', plateNumber: 'WB-SIM-002', driverName: 'Anita', status: 'idle', speed: 0, fuelLevel: 55.1, live: true },
  { vehicleId: 'SIM-003', plateNumber: 'WB-SIM-003', driverName: 'Sameer', status: 'maintenance', speed: 0, fuelLevel: 20.4, live: false },
];

export default function App() {
  const connected = useSocket();
  const vehicles = useVehicleStream();

  return (
    <DashboardLayout
      header={
        <Header
          connected={connected}
          vehicleCount={vehicles.length}
          liveCount={vehicles.length}
        />
      }
      sidebar = {<Sidebar vehicles={FAKE} />}
      
    >
      <div style={{ background: '#0b1220', padding: 16 }}>MAP AREA</div>
    </DashboardLayout>
  );
}