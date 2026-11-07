// Frontend/src/components/layout/Header.tsx
// Week 1: title, connection status, vehicle count


import AdminLock from '../admin/AdminLock';
interface Props {
  connected: boolean;
  vehicleCount: number;
  liveCount: number;
  alertCount: number;
  onToggleAlerts: () => void;
}

export default function Header({ connected, vehicleCount, liveCount, alertCount, onToggleAlerts }: Props) {
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
        <button type="button" className="btn" onClick={onToggleAlerts}>
          Alerts
          {alertCount > 0 && <span className="alert-badge">{alertCount > 99 ? '99+' : alertCount}</span>}
        </button>
        <AdminLock />
      </div>
    </header>
  );
}