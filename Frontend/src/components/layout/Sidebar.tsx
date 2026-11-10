// Frontend/src/components/layout/Sidebar.tsx
// Admin tools (in admin mode), search and filter, the vehicle list and a status footer
import { useMemo, useState } from 'react';
import { useAdminKey } from '../../hooks/useAdminKey';
import type { DisplayVehicle, VehicleStatus } from '../../types/telemetry';
import AddVehicleForm from '../admin/AddVehicleForm';
import FleetTools from '../admin/FleetTools';
import GeofencePanel from '../admin/GeofencePanel';
import type { DrawControls } from '../admin/GeofencePanel';
import VehicleList from '../vehicles/VehicleList';

type StatusFilter = VehicleStatus | 'all';

interface Props {
  vehicles: DisplayVehicle[];
  connected: boolean;
  selectedId: string | null;
  onSelect: (vehicleId: string) => void;
  onVehiclesChanged: () => void;
  onVehicleDeleted: (vehicleId: string) => void;
  onVehiclesRemoved: (vehicleIds: string[]) => void;
  onGeofencesChanged: () => void;
  draw: DrawControls;
}

export default function Sidebar({
  vehicles,
  connected,
  selectedId,
  onSelect,
  onVehiclesChanged,
  onVehicleDeleted,
  onVehiclesRemoved,
  onGeofencesChanged,
  draw,
}: Props) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const { unlocked } = useAdminKey();
  const [adding, setAdding] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [fencesOpen, setFencesOpen] = useState(false);

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
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                <i className="fa-solid fa-plus" /> Add vehicle
              </button>
              <button type="button" className="btn" onClick={() => setToolsOpen((open) => !open)}>
                <i className="fa-solid fa-sliders" /> {toolsOpen ? 'Hide fleet tools' : 'Fleet tools'}
              </button>
              <button type="button" className="btn" onClick={() => setFencesOpen((open) => !open)}>
                <i className="fa-solid fa-draw-polygon" /> {fencesOpen ? 'Hide geofences' : 'Geofences'}
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
          {!adding && fencesOpen && <GeofencePanel onChanged={onGeofencesChanged} draw={draw} />}
        </div>
      )}

      <div className="filters">
        <div className="search">
          <i className="fa-solid fa-magnifying-glass" />
          <input
            type="search"
            placeholder="Search id, plate, driver"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="select-wrap">
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
          <i className="fa-solid fa-chevron-down" />
        </div>
      </div>

      <VehicleList
        vehicles={filteredVehicles}
        onVehicleDeleted={onVehicleDeleted}
        onVehicleChanged={onVehiclesChanged}
        selectedId={selectedId}
        onSelect={onSelect}
      />

      <div className="sidebar-foot">
        <span>
          Fleet sync: <strong className={connected ? '' : 'foot-bad'}>{connected ? 'Connected' : 'Offline'}</strong>
        </span>
        <span>
          Showing {filteredVehicles.length} of {vehicles.length}
        </span>
      </div>
    </aside>
  );
}