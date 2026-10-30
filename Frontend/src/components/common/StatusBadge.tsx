// Frontend/src/components/common/StatusBadge.tsx
// Shared status badge

import type { VehicleStatus } from '../../types/telemetry';

// One colour per vehicle status
const COLORS: Record<VehicleStatus, string> = {
  online: '#22c55e',
  active: '#22c55e',
  idle: '#eab308',
  in_transit: '#38bdf8',
  maintenance: '#f97316',
  offline: '#94a3b8',
};

interface Props {
  status: VehicleStatus;
}

export default function StatusBadge({ status }: Props) {
  return (
    <span className="badge" style={{ background: COLORS[status] }}>
      {status.replace('_', ' ')}
    </span>
  );
}