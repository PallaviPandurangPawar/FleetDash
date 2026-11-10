// Frontend/src/components/common/StatusBadge.tsx
// Shared status chip. The colours are in index.css (.badge-in_transit, .badge-idle, ...)
import type { VehicleStatus } from '../../types/telemetry';

interface Props {
  status: VehicleStatus;
}

export default function StatusBadge({ status }: Props) {
  return <span className={`badge badge-${status}`}>{status.replace('_', ' ')}</span>;
}