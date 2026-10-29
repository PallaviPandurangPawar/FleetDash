// Week 1: temporary App used to test components one by one.
import { useSocket } from './hooks/useSocket';
import { useVehicleStream } from './hooks/useVehicleStream';
import {DashboardLayout} from './components/layout/DashboardLayout';
import Header from './components/layout/Header';
import {VehicleCard} from './components/vehicles/VehicleCard';

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
      sidebar={
        <div style={{ padding: 12, background: '#1e293b' }}>
          <VehicleCard
            vehicle={{
              vehicleId: 'SIM-001',
              plateNumber: 'WB-SIM-001',
              driverName: 'Test Driver',
              status: 'in_transit',
              speed: 47.3,
              fuelLevel: 82.6,
              live: true,
            }}
          />
        </div>
      }
    >
      <div style={{ background: '#0b1220', padding: 16 }}>MAP AREA</div>
    </DashboardLayout>
  );
}