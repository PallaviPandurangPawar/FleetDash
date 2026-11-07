// Frontend/src/components/alerts/AlertToasts.tsx
// Short pop-ups in the top right corner when a vehicle crosses a geofence edge.
import type { Toast } from '../../hooks/useAlerts';

interface Props {
  toasts: Toast[];
  onDismiss: (key: number) => void;
}

export default function AlertToasts({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map(({ key, alert }) => (
        <div key={key} className={alert.type === 'exit' ? 'toast toast-exit' : 'toast toast-enter'}>
          <div>
            <strong>{alert.vehicleId}</strong> {alert.type === 'exit' ? 'left' : 'entered'}{' '}
            {alert.geofenceName || 'a zone'}
          </div>
          <button type="button" className="toast-close" onClick={() => onDismiss(key)} aria-label="Dismiss">
            x
          </button>
        </div>
      ))}
    </div>
  );
}