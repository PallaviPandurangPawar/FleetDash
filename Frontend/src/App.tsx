// Week 1: renders DashboardPage. Will be filled step by step.
import { useSocket } from './hooks/useSocket';
import { useVehicleStream } from './hooks/useVehicleStream';

export default function App() {
  const connected = useSocket();
  const vehicles = useVehicleStream();
  return (
    <div className="App">
      <h1>Vehicle Dashboard</h1>
      <p>Socket connected: {connected ? 'Yes' : 'No'}</p>
      <p>Vehicles received: {vehicles.length}</p>
    </div>
  );
}


