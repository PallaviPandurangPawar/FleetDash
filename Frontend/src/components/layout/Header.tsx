interface Props {
  connected: boolean;
  vehicleCount: number;
  liveCount: number;
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16L21 21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 17h5l-1.4-1.4A2.1 2.1 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h11Zm-3 4a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 21Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6M12 7.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Header({ connected, vehicleCount, liveCount }: Props) {
  const now = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());

  return (
    <header className="topbar">
      <div className="brand-wrap">
        <div className="brand-mark">F</div>
        <div>
          <div className="brand-name">FleetDash</div>
          <div className="brand-subtitle">Operations command</div>
        </div>
      </div>

      <label className="global-search" aria-label="Global search">
        <IconSearch />
        <input type="search" placeholder="Search vehicles, geofence, alerts" />
      </label>

      <div className="topbar-actions">
        <div className="timestamp-pill">{now}</div>
        <div className="status-pill online">
          <span className="status-dot" />
          {connected ? 'Live' : 'Offline'}
        </div>
        <div className="metric-inline">
          <span>{vehicleCount}</span>
          <small>Vehicles</small>
        </div>
        <div className="metric-inline">
          <span>{liveCount}</span>
          <small>Moving</small>
        </div>
        <button className="icon-button" aria-label="Notifications">
          <IconBell />
          <span className="notification-bubble">3</span>
        </button>
        <button className="icon-button" aria-label="Settings shortcut">
          <IconSettings />
        </button>
        <div className="user-menu">
          <div className="avatar">AR</div>
          <div>
            <strong>Ava Ross</strong>
            <small>Fleet Director</small>
          </div>
        </div>
      </div>
    </header>
  );
}
