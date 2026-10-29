// Week 1: renders DashboardPage. Will be filled step by step.
import { useSocket } from './hooks/useSocket';
import { useVehicleStream } from './hooks/useVehicleStream';
import { DashboardLayout }  from './components/layout/DashboardLayout';

export default function App() {
  const connected = useSocket();
  const vehicles = useVehicleStream();
  return (
    /*<div className="App">
      <h1>Vehicle Dashboard</h1>
      <p>Socket connected: {connected ? 'Yes' : 'No'}</p>
      <p>Vehicles received: {vehicles.length}</p>
    </div>
    */
    <DashboardLayout
      header={<div style={{ background: '#1e293b', padding: 16 }}>HEADER</div>}
      sidebar={<div style={{ background: '#273449', padding: 16 }}>SIDEBAR</div>}
    >
      <div style={{ background: '#0b1220', padding: 16 }}>MAP AREA</div>
    </DashboardLayout>
  );
}


