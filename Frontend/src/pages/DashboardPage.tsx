import MapCanvas from '../components/map/MapCanvas';
import FleetTools from '../components/admin/FleetTools';
import type { AlertRecord, AlertSummary, Geofence } from '../types/api';
import type { DisplayVehicle, Vehicle, VehicleStatus } from '../types/telemetry';

interface Props {
  vehicles: DisplayVehicle[];
  geofences: Geofence[];
  alerts: AlertRecord[];
  alertSummary: AlertSummary | null;
  loading: boolean;
  connected: boolean;
  errors: string[];
  onAcknowledge: (id: string) => Promise<void>;
  registeredVehicles: Vehicle[];
  onRefresh: () => Promise<void>;
}

const statusNames: Record<VehicleStatus, string> = {
  active: 'Active',
  in_transit: 'In transit',
  idle: 'Idle',
  offline: 'Offline',
  maintenance: 'Maintenance',
};

const statusColors: Record<VehicleStatus, string> = {
  active: 'var(--emerald)',
  in_transit: 'var(--primary)',
  idle: 'var(--amber)',
  offline: 'var(--red)',
  maintenance: 'var(--slate)',
};

function formatRelativeTime(value: string | number | null): string {
  if (value === null) return 'No telemetry';
  const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown';

  const minutes = Math.round((timestamp - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}

function formatLocation(location: [number, number] | null): string {
  if (!location) return 'Location unavailable';
  return `${location[1].toFixed(4)}, ${location[0].toFixed(4)}`;
}

export function DashboardPage({
  vehicles,
  geofences,
  alerts,
  alertSummary,
  loading,
  connected,
  errors,
  onAcknowledge,
  registeredVehicles,
  onRefresh,
}: Props) {
  const total = vehicles.length;
  const countByStatus = (status: VehicleStatus) => vehicles.filter((vehicle) => vehicle.status === status).length;
  const inTransit = countByStatus('in_transit');
  const idle = countByStatus('idle');
  const offline = countByStatus('offline');
  const maintenance = countByStatus('maintenance');
  const active = total - offline - maintenance;
  const movingVehicles = vehicles.filter((vehicle) => vehicle.speed > 0);
  const averageSpeed = movingVehicles.length
    ? Math.round(movingVehicles.reduce((sum, vehicle) => sum + vehicle.speed, 0) / movingVehicles.length)
    : 0;
  const availability = total ? Math.round((active / total) * 100) : 0;

  const metrics = [
    { label: 'Total vehicles', value: total.toLocaleString(), tone: 'cyan' },
    { label: 'Operational', value: active.toLocaleString(), tone: 'green' },
    { label: 'In transit', value: inTransit.toLocaleString(), tone: 'blue' },
    { label: 'Idle', value: idle.toLocaleString(), tone: 'amber' },
    { label: 'Offline', value: offline.toLocaleString(), tone: 'slate' },
    { label: 'Unacknowledged alerts', value: (alertSummary?.unacknowledged ?? 0).toLocaleString(), tone: 'red' },
    { label: 'Active geofences', value: geofences.length.toLocaleString(), tone: 'violet' },
    { label: 'Fleet availability', value: `${availability}%`, tone: 'emerald' },
  ];

  const statusBreakdown: VehicleStatus[] = ['in_transit', 'active', 'idle', 'maintenance', 'offline'];
  const recentAlerts = alerts.slice(0, 5);
  const speedVehicles = vehicles.filter((vehicle) => vehicle.speed > 0).slice(0, 12);
  const maxSpeed = Math.max(1, ...speedVehicles.map((vehicle) => vehicle.speed));
  const recentVehicles = vehicles.slice(0, 6);

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Operations overview</p>
          <h1>Fleet command center</h1>
        </div>
        <div className="header-actions">
          <span className={`connection-label ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? 'Live telemetry connected' : 'Waiting for live connection'}
          </span>
        </div>
      </div>

      {errors.map((error) => (
        <div className="data-error" role="alert" key={error}>
          Could not load backend data: {error}
        </div>
      ))}

      {loading && <div className="loading-note" role="status">Loading fleet data…</div>}

      <section className="stats-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`stat-card ${metric.tone}`}>
            <div className="stat-label">{metric.label}</div>
            <div className="stat-row">
              <div className="stat-value">{metric.value}</div>
            </div>
          </article>
        ))}
      </section>

      <section className="workspace-grid">
        <article className="panel map-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Live tracking</p>
              <h2>Fleet activity overview</h2>
            </div>
            <div className="panel-status">
              <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
              {connected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
          <MapCanvas vehicles={vehicles} geofences={geofences} />
        </article>

        <aside className="panel status-panel">
          <div className="panel-header compact">
            <span>Vehicle status</span>
            <span className="tiny-number">{total} total</span>
          </div>

          <div className="distribution-list">
            {statusBreakdown.map((status) => {
              const count = countByStatus(status);
              const percentage = total ? Math.round((count / total) * 100) : 0;
              return (
                <div key={status} className="distribution-item">
                  <div className="distribution-label-row">
                    <span>{statusNames[status]}</span>
                    <strong>{count} <small>({percentage}%)</small></strong>
                  </div>
                  <div className="bar-track">
                    <span
                      className="bar-fill"
                      style={{ width: `${percentage}%`, background: statusColors[status] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mini-metrics">
            <div>
              <span>Average reported speed</span>
              <strong>{averageSpeed} km/h</strong>
            </div>
            <div>
              <span>Maintenance</span>
              <strong>{maintenance}</strong>
            </div>
          </div>
        </aside>
      </section>

      <section className="detail-grid">
        <article className="panel">
          <div className="panel-header compact">
            <span>Recent geofence alerts</span>
            <span className="tiny-number">{alertSummary?.unacknowledged ?? 0} unacknowledged</span>
          </div>
          {recentAlerts.length ? (
            <ul className="alert-list">
              {recentAlerts.map((alert) => (
                <li key={alert._id}>
                  <div className={`alert-bullet ${alert.type}`} />
                  <div className="alert-copy">
                    <div className="alert-title-row">
                      <strong>Geofence {alert.type}</strong>
                      <span className={`severity ${alert.type === 'exit' ? 'high' : 'low'}`}>
                        {alert.type === 'exit' ? 'Exit' : 'Entry'}
                      </span>
                    </div>
                    <span>{alert.vehicleId} · {alert.geofenceName}</span>
                  </div>
                  <div className="alert-time-action">
                    <time>{formatRelativeTime(alert.occurredAt)}</time>
                    {!alert.acknowledged && (
                      <button
                        type="button"
                        className="ack-alert"
                        onClick={() => void onAcknowledge(alert._id)}
                        aria-label={`Acknowledge alert for ${alert.vehicleId}`}
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">{loading ? 'Loading alerts…' : 'No geofence alerts found.'}</p>
          )}
        </article>

        <article className="panel">
          <div className="panel-header compact">
            <span>Live vehicle speeds</span>
            <span className="tiny-number">Latest telemetry</span>
          </div>
          {speedVehicles.length ? (
            <div className="speed-chart">
              {speedVehicles.map((vehicle) => (
                <div className="speed-chart-row" key={vehicle.vehicleId}>
                  <span>{vehicle.vehicleId}</span>
                  <div className="bar-track">
                    <span
                      className="bar-fill chart-bar"
                      style={{ width: `${Math.max(4, (vehicle.speed / maxSpeed) * 100)}%` }}
                    />
                  </div>
                  <strong>{Math.round(vehicle.speed)} <small>km/h</small></strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">{loading ? 'Loading vehicles…' : 'No speed telemetry available.'}</p>
          )}
        </article>
      </section>

      <section className="panel table-panel">
        <div className="panel-header compact">
          <span>Recent vehicle activity</span>
          <span className="tiny-number">Showing {recentVehicles.length} of {total}</span>
        </div>

        {recentVehicles.length ? (
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Registration</th>
                <th>Status</th>
                <th>Speed</th>
                <th>Location (lat, lon)</th>
                <th>Last telemetry</th>
              </tr>
            </thead>
            <tbody>
              {recentVehicles.map((vehicle) => (
                <tr key={vehicle.vehicleId}>
                  <td>{vehicle.vehicleId}</td>
                  <td>{vehicle.plateNumber}</td>
                  <td><span className={`table-status ${vehicle.status}`}>{statusNames[vehicle.status]}</span></td>
                  <td>{Math.round(vehicle.speed)} km/h</td>
                  <td>{formatLocation(vehicle.location)}</td>
                  <td>{formatRelativeTime(vehicle.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">{loading ? 'Loading vehicles…' : 'No vehicles found in the backend.'}</p>
        )}
      </section>

      <FleetTools vehicles={registeredVehicles} onRefresh={onRefresh} />
    </main>
  );
}
