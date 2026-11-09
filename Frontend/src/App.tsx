import { useSocket } from './hooks/useSocket';
import { useVehicleStream } from './hooks/useVehicleStream';
import { DashboardLayout } from './components/layout/DashboardLayout';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import type { DisplayVehicle } from './types/telemetry';
import { DashboardPage } from './pages/DashboardPage';

const FAKE: DisplayVehicle[] = [
  { vehicleId: 'SIM-001', plateNumber: 'WB-SIM-001', driverName: 'Ravi', status: 'in_transit', speed: 47.3, fuelLevel: 82.6, live: true },
  { vehicleId: 'SIM-002', plateNumber: 'WB-SIM-002', driverName: 'Anita', status: 'idle', speed: 0, fuelLevel: 55.1, live: true },
  { vehicleId: 'SIM-003', plateNumber: 'WB-SIM-003', driverName: 'Sameer', status: 'maintenance', speed: 0, fuelLevel: 20.4, live: false },
  { vehicleId: 'SIM-004', plateNumber: 'WB-SIM-004', driverName: 'Leah', status: 'active', speed: 62.1, fuelLevel: 74.8, live: true },
  { vehicleId: 'SIM-005', plateNumber: 'WB-SIM-005', driverName: 'Noah', status: 'offline', speed: 0, fuelLevel: 18.7, live: false },
  { vehicleId: 'SIM-006', plateNumber: 'WB-SIM-006', driverName: 'Priya', status: 'online', speed: 31.5, fuelLevel: 86.3, live: true },
];

export default function App() {
  const connected = useSocket();
  const streamVehicles = useVehicleStream();
  const vehicleCount = streamVehicles.length || FAKE.length;
  const liveCount = streamVehicles.filter((vehicle) => vehicle.speed > 5).length || 3;

  return (
    <DashboardLayout
      header={<Header connected={connected} vehicleCount={vehicleCount} liveCount={liveCount} />}
      sidebar={<Sidebar vehicles={FAKE} />}
    >
      <DashboardPage vehicleCount={vehicleCount} connected={connected} />
    </DashboardLayout>
  );
}
