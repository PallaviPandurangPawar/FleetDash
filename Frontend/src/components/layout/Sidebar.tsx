import { useMemo, useState } from 'react';
import type { DisplayVehicle, VehicleStatus } from '../../types/telemetry';
import VehicleList from '../vehicles/VehicleList';

type StatusFilter = VehicleStatus | 'all';

const navItems: Array<{ label: string; icon: string; active?: boolean }> = [
  { label: 'Overview', icon: 'home', active: true },
  { label: 'Live Tracking', icon: 'map' },
  { label: 'Vehicles', icon: 'truck' },
  { label: 'Geofences', icon: 'shield' },
  { label: 'Alerts', icon: 'bell' },
  { label: 'Telemetry History', icon: 'chart' },
  { label: 'Analytics', icon: 'trend' },
  { label: 'Reports', icon: 'report' },
  { label: 'Settings', icon: 'gear' },
];

interface Props {
  vehicles: DisplayVehicle[];
}

function Icon({ name }: { name: string }) {
  const common = { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3 10.7 12 3l9 7.7" />
          <path d="M5 9.6V20h14V9.6" />
        </svg>
      );
    case 'map':
      return (
        <svg {...common}>
          <path d="M9 3.5 3.5 5.8v14.7l5.5-2.3 6 2.3 5.5-2.3V3.5L15 5.8l-6-2.3Z" />
          <path d="M9 3.5v14.7M15 5.8v14.7" />
        </svg>
      );
    case 'truck':
      return (
        <svg {...common}>
          <path d="M3 7.5h11v8H3zM14 10h3l3 3v3.5h-6z" />
          <circle cx="7.5" cy="17.5" r="1.8" />
          <circle cx="17.5" cy="17.5" r="1.8" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3.5 18.5 6v5.7c0 3.1-2 6.2-6.5 9.1C8 17.9 6 14.8 6 11.7V6l6-2.5Z" />
          <path d="M9.5 12.4 11.2 14l3.4-4" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M6.5 9a5.5 5.5 0 1 1 11 0v4.5l1.8 3H4.7l1.8-3V9Z" />
          <path d="M10 18.5a2 2 0 0 0 4 0" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...common}>
          <path d="M4 18.5V7.6M10 18.5V4.5M16 18.5v-9M22 18.5V10.5" />
        </svg>
      );
    case 'trend':
      return (
        <svg {...common}>
          <path d="M4 15.5 9 10.5l4 4 7-8" />
          <path d="M17 6.5h3v3" />
        </svg>
      );
    case 'report':
      return (
        <svg {...common}>
          <path d="M7 3.5h7l5 5v12h-12z" />
          <path d="M14 3.5v5h5" />
          <path d="M9 13h6M9 16h6" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...common}>
          <path d="M12 2.5v2.1M12 19.4v2.1M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2.5 12h2.1M19.4 12h2.1M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" />
          <circle cx="12" cy="12" r="3.8" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Sidebar({ vehicles }: Props) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [collapsed, setCollapsed] = useState(false);

  const filteredVehicles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles.filter((vehicle) => {
      if (statusFilter !== 'all' && vehicle.status !== statusFilter) {
        return false;
      }

      if (!q) {
        return true;
      }

      return (
        vehicle.vehicleId.toLowerCase().includes(q) ||
        vehicle.plateNumber.toLowerCase().includes(q) ||
        vehicle.driverName.toLowerCase().includes(q)
      );
    });
  }, [vehicles, query, statusFilter]);

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-title">Navigation</div>
        <button className="sidebar-toggle" type="button" onClick={() => setCollapsed((value) => !value)} aria-label="Toggle sidebar">
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <nav className="nav-groups" aria-label="Sidebar navigation">
        {navItems.map(({ label, icon, active }) => (
          <button key={label} className={`nav-item ${active ? 'active' : ''}`} type="button">
            <span className="nav-icon"><Icon name={icon} /></span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="fleet-panel">
        <div className="panel-header compact">
          <span>Fleet stream</span>
          <span className="live-indicator">Live</span>
        </div>

        <div className="filters">
          <input
            type="search"
            placeholder="Search fleet"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="idle">Idle</option>
            <option value="in_transit">In transit</option>
            <option value="maintenance">Maintenance</option>
            <option value="offline">Offline</option>
          </select>
        </div>

        <VehicleList vehicles={filteredVehicles} />
      </div>
    </aside>
  );
}
