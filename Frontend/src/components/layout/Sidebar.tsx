// Frontend/src/components/layout/Sidebar.tsx
// Week 1: vehicle list + filters

import { useMemo, useState } from 'react';
import type { DisplayVehicle, VehicleStatus } from '../../types/telemetry';
import VehicleList from '../vehicles/VehicleList';

type StatusFilter = VehicleStatus | 'all';

interface Props {
  vehicles: DisplayVehicle[];
}

export default function Sidebar({ vehicles }: Props) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filteredVehicles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (statusFilter !== 'all' && v.status !== statusFilter) {
        return false;
      }

      if (!q) return true;

      return (
        v.vehicleId.toLowerCase().includes(q) ||
        v.plateNumber.toLowerCase().includes(q) ||
        v.driverName.toLowerCase().includes(q)
      );
    });
  }, [vehicles, query, statusFilter]);

  return (
    <aside className="sidebar">
      <div className="filters">
        <input
          type="search"
          placeholder="Search id, plate, driver"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="idle">Idle</option>
          <option value="in_transit">In transit</option>
          <option value="maintenance">Maintenance</option>
          <option value="offline">Offline</option>
        </select>
      </div>
      <VehicleList vehicles={filteredVehicles} />
    </aside>
  );
}