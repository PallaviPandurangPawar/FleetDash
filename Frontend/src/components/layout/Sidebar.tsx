// Frontend/src/components/layout/Sidebar.tsx
// Week 1: vehicle list + filters

import { useMemo, useState } from 'react';
import type { DisplayVehicle, VehicleStatus } from '../../types/telemetry';
import VehicleList from '../vehicles/VehicleList';
import AddVehicleForm from '../admin/AddVehicleForm';
import FleetTools from '../admin/FleetTools';
import { useAdminKey } from '../../hooks/useAdminKey';

type StatusFilter = VehicleStatus | 'all';

interface Props {
  vehicles: DisplayVehicle[];
  onVehiclesChanged: () => void;
  onVehicleDeleted: (vehicleId: string) => void;
  onVehiclesRemoved: (vehicleIds: string[]) => void;
}

export default function Sidebar({
  vehicles,
  onVehiclesChanged,
  onVehicleDeleted,
  onVehiclesRemoved,
}: Props) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const { unlocked } = useAdminKey();
  const [adding, setAdding] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

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
            {unlocked && (
        <div className="sidebar-tools">
          {adding ? (
            <AddVehicleForm onCreated={onVehiclesChanged} onClose={() => setAdding(false)} />
          ) : (
            <div className="tools-row">
              <button type="button" className="btn" onClick={() => setAdding(true)}>
                + Add vehicle
              </button>
              <button type="button" className="btn" onClick={() => setToolsOpen((open) => !open)}>
                {toolsOpen ? 'Hide fleet tools' : 'Fleet tools'}
              </button>
            </div>
          )}
          {!adding && toolsOpen && (
            <FleetTools
              vehicles={vehicles}
              onChanged={onVehiclesChanged}
              onRemoved={onVehiclesRemoved}
            />
          )}
        </div>
      )}
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
      <VehicleList
        vehicles={filteredVehicles}
        onVehicleDeleted={onVehicleDeleted}
        onVehicleChanged={onVehiclesChanged}
      />
    </aside>
  );
}