// Frontend/src/components/layout/Header.tsx
// Brand, live counters, connection status, alerts button and the admin lock
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
      <div className="brand">
        <div className="brand-icon">
          <i className="fa-solid fa-satellite" />
        </div>
        <span className="brand-name">
          Fleet<span>Dash</span>
        </span>
        <span className="brand-ping" />
      </div>

      <div className="header-stats">
        <div className="stat">
          <span className="stat-label">Vehicles:</span>
          <span className="stat-value">{vehicleCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Live:</span>
          <span className="stat-value stat-live">{liveCount}</span>
        </div>
        <span className={connected ? 'conn' : 'conn conn-off'}>
          <span className="dot" style={{ background: connected ? 'var(--ok)' : 'var(--bad)' }} />
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        <button type="button" className="alerts-btn" onClick={onToggleAlerts}>
          <i className="fa-solid fa-triangle-exclamation" />
          Alerts
          {alertCount > 0 && <span className="alert-badge">{alertCount > 99 ? '99+' : alertCount}</span>}
        </button>
        <AdminLock />
      </div>
    </header>
  );
}