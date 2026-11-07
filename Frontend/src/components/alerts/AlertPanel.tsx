// Frontend/src/components/alerts/AlertsPanel.tsx
// The alerts list: new (unacknowledged) or all, with acknowledge buttons.
import { useState } from 'react';
import type { AlertRecord } from '../../types/api';

interface Props {
  alerts: AlertRecord[];
  unacknowledged: number;
  error: string | null;
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: () => void;
  onClose: () => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AlertsPanel({
  alerts,
  unacknowledged,
  error,
  onAcknowledge,
  onAcknowledgeAll,
  onClose,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? alerts : alerts.filter((a) => !a.acknowledged);

  return (
    <div className="alerts-panel">
      <div className="alerts-head">
        <div className="panel-title">Geofence alerts</div>
        <div className="card-confirm">
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={onAcknowledgeAll}
            disabled={unacknowledged === 0}
          >
            Acknowledge all
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className="alerts-tabs">
        <button
          type="button"
          className={showAll ? 'btn btn-ghost btn-small' : 'btn btn-small'}
          onClick={() => setShowAll(false)}
        >
          New ({unacknowledged})
        </button>
        <button
          type="button"
          className={showAll ? 'btn btn-small' : 'btn btn-ghost btn-small'}
          onClick={() => setShowAll(true)}
        >
          All
        </button>
      </div>

      <div className="alerts-body">
        {error && <div className="panel-error">{error}</div>}
        {visible.length === 0 && (
          <div className="panel-hint">{showAll ? 'No alerts yet.' : 'No new alerts.'}</div>
        )}

        {visible.map((alert) => {
          const [lon, lat] = alert.location.coordinates;
          return (
            <div key={alert._id} className={alert.acknowledged ? 'alert-row alert-done' : 'alert-row'}>
              <div className="alert-top">
                <span className={alert.type === 'exit' ? 'alert-chip alert-exit' : 'alert-chip alert-enter'}>
                  {alert.type === 'exit' ? 'LEFT' : 'ENTERED'}
                </span>
                <span className="alert-vehicle">{alert.vehicleId}</span>
                <span className="alert-time">{formatTime(alert.occurredAt)}</span>
              </div>
              <div className="alert-zone">{alert.geofenceName || 'Unknown zone'}</div>
              <div className="alert-bottom">
                <span className="alert-time">
                  {lat.toFixed(4)}, {lon.toFixed(4)}
                </span>
                {alert.acknowledged ? (
                  <span className="alert-time">Acknowledged</span>
                ) : (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => onAcknowledge(alert._id)}>
                    Acknowledge
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}