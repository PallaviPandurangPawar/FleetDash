// Frontend/src/components/admin/GeofencePanel.tsx
// Admin panel: lists the geofences, switches them on or off, deletes them and draws new ones on the map.
import { useCallback, useEffect, useState } from 'react';
import { hasSelfIntersection } from '../../canvas/geometry';
import {
  createGeofence,
  deleteGeofence,
  getAllGeofences,
  setGeofenceActive,
} from '../../services/api';
import type { Geofence } from '../../types/api';

/** What the panel needs from the dashboard to draw a geofence on the map. */
export interface DrawControls {
  corners: [number, number][];
  onStart: () => void;
  onUndo: () => void;
  onClear: () => void;
  onStop: () => void;
}

interface Props {
  onChanged: () => void; // the map reloads its geofences
  draw: DrawControls;
}

export default function GeofencePanel({ onChanged, draw }: Props) {
  const [fences, setFences] = useState<Geofence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // The new geofence form
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [ids, setIds] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getAllGeofences();
      setFences(res.geofences);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the geofences');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Leaving the panel (hide it, lock admin mode) ends the drawing
  const { onStop } = draw;
  useEffect(() => () => onStop(), [onStop]);

  const toggle = async (fence: Geofence) => {
    setBusyId(fence._id);
    setError(null);
    try {
      const res = await setGeofenceActive(fence._id, !fence.active);
      setFences((prev) => (prev ? prev.map((f) => (f._id === fence._id ? res.geofence : f)) : prev));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the geofence');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (fence: Geofence) => {
    setBusyId(fence._id);
    setError(null);
    try {
      await deleteGeofence(fence._id);
      setFences((prev) => (prev ? prev.filter((f) => f._id !== fence._id) : prev));
      setConfirmId(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the geofence');
    } finally {
      setBusyId(null);
    }
  };

  const startCreating = () => {
    setCreating(true);
    setFormError(null);
    draw.onStart();
  };

  const resetForm = () => {
    setCreating(false);
    setName('');
    setDescription('');
    setScope('all');
    setIds('');
    setFormError(null);
  };

  const cancel = () => {
    draw.onStop();
    resetForm();
  };

  const save = async () => {
    setFormError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Give the geofence a name');
      return;
    }

    const [first] = draw.corners;
    if (!first || draw.corners.length < 3) {
      setFormError('Click at least 3 corners on the map');
      return;
    }
    if (hasSelfIntersection(draw.corners)) {
      setFormError('The outline crosses itself. Undo and place the corners in order around the zone.');
      return;
    }

    const vehicleIds =
      scope === 'selected'
        ? ids
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id !== '')
        : [];
    if (scope === 'selected' && vehicleIds.length === 0) {
      setFormError('Type at least one vehicle ID, or choose All vehicles');
      return;
    }

    setSaving(true);
    try {
      await createGeofence({
        name: trimmed,
        ...(description.trim() ? { description: description.trim() } : {}),
        coordinates: [[...draw.corners, first]], // the outline is closed by repeating the first corner
        vehicleIds,
      });
      draw.onStop();
      resetForm();
      onChanged();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the geofence');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel-form">
      <div className="fence-head">
        <div className="panel-title">Geofences</div>
        <button type="button" className="btn btn-ghost btn-small" onClick={load}>
          Refresh
        </button>
      </div>

      {creating ? (
        <div className="fence-form">
          <div className="panel-title">New geofence</div>

          <label>
            Name *
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Warehouse area"
              autoComplete="off"
              disabled={saving}
            />
          </label>
          <label>
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoComplete="off"
              disabled={saving}
            />
          </label>

          <span className="tool-label">Applies to</span>
          <div className="fence-scope">
            <label className="fence-switch">
              <input type="radio" name="fence-scope" checked={scope === 'all'} onChange={() => setScope('all')} />
              All vehicles
            </label>
            <label className="fence-switch">
              <input
                type="radio"
                name="fence-scope"
                checked={scope === 'selected'}
                onChange={() => setScope('selected')}
              />
              Only these vehicles
            </label>
          </div>
          {scope === 'selected' && (
            <input
              value={ids}
              onChange={(e) => setIds(e.target.value)}
              placeholder="FLEET-001, FLEET-002"
              autoComplete="off"
              disabled={saving}
            />
          )}

          <div className="panel-hint">
            Click the map to place the corners in order around the zone. {draw.corners.length} placed (at least 3).
          </div>
          <div className="card-confirm">
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={draw.onUndo}
              disabled={draw.corners.length === 0 || saving}
            >
              Undo
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={draw.onClear}
              disabled={draw.corners.length === 0 || saving}
            >
              Clear
            </button>
          </div>

          {formError && <div className="panel-error">{formError}</div>}

          <div className="panel-actions">
            <button type="button" className="btn" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save geofence'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={cancel} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="btn" onClick={startCreating}>
            + New geofence
          </button>
        </div>
      )}

      {fences === null && !error && <div className="panel-hint">Loading...</div>}
      {fences !== null && fences.length === 0 && <div className="panel-hint">No geofences yet.</div>}

      <div className="fence-list">
        {fences?.map((fence) => {
          const busy = busyId === fence._id;
          return (
            <div key={fence._id} className={fence.active ? 'fence-row' : 'fence-row fence-off'}>
              <div className="fence-head">
                <span className="fence-name">{fence.name}</span>
                <label className="fence-switch">
                  <input
                    type="checkbox"
                    checked={fence.active}
                    onChange={() => toggle(fence)}
                    disabled={busy}
                  />
                  {fence.active ? 'On' : 'Off'}
                </label>
              </div>

              <div className="fence-meta">
                {fence.vehicleIds.length === 0
                  ? 'Applies to all vehicles'
                  : `Only: ${fence.vehicleIds.join(', ')}`}
              </div>

              {confirmId === fence._id ? (
                <div className="tool-warning">
                  Delete {fence.name}? Alerts it already created are kept.
                  <div className="card-confirm">
                    <button
                      type="button"
                      className="btn btn-danger btn-small"
                      onClick={() => remove(fence)}
                      disabled={busy}
                    >
                      {busy ? 'Deleting...' : 'Yes, delete'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => setConfirmId(null)}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => setConfirmId(fence._id)}
                    disabled={busy}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <div className="panel-error">{error}</div>}
      <div className="panel-hint">Changes reach the alert checker within about 5 seconds.</div>
    </div>
  );
}