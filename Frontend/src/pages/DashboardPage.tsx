import MapCanvas from '../components/map/MapCanvas';

interface Props {
  vehicleCount: number;
  connected: boolean;
}

const metrics = [
  { label: 'Total Vehicles', value: '248', delta: '+8.2%', tone: 'cyan' },
  { label: 'Active Vehicles', value: '186', delta: '+5.1%', tone: 'green' },
  { label: 'Idle Vehicles', value: '31', delta: '-2.4%', tone: 'amber' },
  { label: 'Offline Vehicles', value: '14', delta: '-1.1%', tone: 'slate' },
  { label: 'Vehicles in Motion', value: '137', delta: '+12.3%', tone: 'blue' },
  { label: 'Total Distance', value: '18.2k km', delta: '+9.8%', tone: 'violet' },
  { label: 'Active Alerts', value: '09', delta: '+3', tone: 'red' },
  { label: 'Fleet Health', value: '94.8%', delta: '+1.7%', tone: 'emerald' },
];

const statusBreakdown = [
  { label: 'In motion', value: 67, color: 'var(--primary-strong)' },
  { label: 'Idle', value: 21, color: 'var(--amber)' },
  { label: 'Maintenance', value: 8, color: 'var(--slate)' },
  { label: 'Offline', value: 4, color: 'var(--red)' },
];

const recentAlerts = [
  { title: 'Geofence breach', vehicle: 'SIM-014', time: '2 min ago', severity: 'High' },
  { title: 'Overspeeding', vehicle: 'SIM-207', time: '12 min ago', severity: 'Medium' },
  { title: 'Vehicle offline', vehicle: 'SIM-042', time: '31 min ago', severity: 'Low' },
  { title: 'Unexpected movement', vehicle: 'SIM-118', time: '1 hr ago', severity: 'High' },
];

const utilization = [72, 63, 85, 81, 66, 75, 89, 69, 78, 92, 76, 84];

const activityRows = [
  { vehicle: 'SIM-102', route: 'North Hub → Depot 3', status: 'In transit', speed: '64 km/h', distance: '184 km', time: '06:48' },
  { vehicle: 'SIM-211', route: 'Harbor Zone', status: 'Idle', speed: '0 km/h', distance: '48 km', time: '06:42' },
  { vehicle: 'SIM-407', route: 'Urban Loop', status: 'Maintenance', speed: '0 km/h', distance: '31 km', time: '06:35' },
  { vehicle: 'SIM-018', route: 'Retail Corridor', status: 'In transit', speed: '58 km/h', distance: '226 km', time: '06:25' },
  { vehicle: 'SIM-076', route: 'Cold Chain', status: 'Active', speed: '41 km/h', distance: '172 km', time: '06:12' },
];

export function DashboardPage({ vehicleCount, connected }: Props) {
  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Operations overview</p>
          <h1>Fleet command center</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-btn">Filters</button>
          <button type="button" className="primary-btn">Export report</button>
        </div>
      </div>

      <section className="stats-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`stat-card ${metric.tone}`}>
            <div className="stat-label">{metric.label}</div>
            <div className="stat-row">
              <div className="stat-value">{metric.value}</div>
              <span className="stat-delta">{metric.delta}</span>
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
          <MapCanvas vehicleCount={vehicleCount} />
        </article>

        <aside className="panel status-panel">
          <div className="panel-header compact">
            <span>Vehicle status distribution</span>
            <span className="tiny-number">{vehicleCount} total</span>
          </div>

          <div className="distribution-list">
            {statusBreakdown.map((status) => (
              <div key={status.label} className="distribution-item">
                <div className="distribution-label-row">
                  <span>{status.label}</span>
                  <strong>{status.value}%</strong>
                </div>
                <div className="bar-track">
                  <span className="bar-fill" style={{ width: `${status.value}%`, background: status.color }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mini-metrics">
            <div>
              <span>Avg speed</span>
              <strong>46 km/h</strong>
            </div>
            <div>
              <span>Utilization</span>
              <strong>82%</strong>
            </div>
          </div>
        </aside>
      </section>

      <section className="detail-grid">
        <article className="panel">
          <div className="panel-header compact">
            <span>Recent alerts</span>
            <button type="button" className="link-btn">Manage</button>
          </div>
          <ul className="alert-list">
            {recentAlerts.map((alert) => (
              <li key={`${alert.vehicle}-${alert.title}`}>
                <div className="alert-bullet" />
                <div className="alert-copy">
                  <div className="alert-title-row">
                    <strong>{alert.title}</strong>
                    <span className={`severity ${alert.severity.toLowerCase()}`}>{alert.severity}</span>
                  </div>
                  <span>{alert.vehicle}</span>
                </div>
                <time>{alert.time}</time>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-header compact">
            <span>Vehicle utilization</span>
            <span className="tiny-number">Monthly</span>
          </div>
          <div className="bar-chart" aria-label="Vehicle utilization chart">
            {utilization.map((value, index) => (
              <div key={`${value}-${index}`} className="chart-bar-wrap">
                <span className="chart-bar" style={{ height: `${value}%` }} />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel table-panel">
        <div className="panel-header compact">
          <span>Recent vehicle activity</span>
          <button type="button" className="link-btn">View all</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Route</th>
              <th>Status</th>
              <th>Speed</th>
              <th>Distance</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {activityRows.map((row) => (
              <tr key={row.vehicle}>
                <td>{row.vehicle}</td>
                <td>{row.route}</td>
                <td><span className="table-status">{row.status}</span></td>
                <td>{row.speed}</td>
                <td>{row.distance}</td>
                <td>{row.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

