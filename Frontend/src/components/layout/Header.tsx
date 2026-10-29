// Frontend/src/components/layout/Header.tsx
// Week 1: title, connection status, vehicle count

interface Props {
  connected: boolean;
  vehicleCount: number;
  liveCount: number;
}

export default function Header({ connected, vehicleCount, liveCount }: Props) {
  return (
    <header className="header">
      <h1>FleetDash</h1>
      <div className="header-stats">
        <span>Vehicles: {vehicleCount}</span>
        <span>Live: {liveCount}</span>
        <span className="conn">
          <span className="dot" style={{ background: connected ? 'var(--ok)' : 'var(--bad)' }} />
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
    </header>
  );
}