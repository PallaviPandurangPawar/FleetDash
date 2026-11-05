// Frontend/src/components/admin/FleetTools.tsx
// Admin panel: set the number of sample vehicles, reset the sample data.
import { useMemo, useState } from 'react';
import { generateVehicles, resetSampleData } from '../../services/api';
import type { DisplayVehicle } from '../../types/telemetry';

interface Props {
  vehicles: DisplayVehicle[];
  onChanged: () => void; // vehicles were added: reload the list
  onRemoved: (vehicleIds: string[]) => void; // vehicles were removed: forget their live data, reload the list
}

const SAMPLE_ID = /^FLEET-(\d+)$/;

type Pending = 'trim' | 'reset' | 'clear' | null;

export default function FleetTools({ vehicles, onChanged, onRemoved }: Props) {
  const [size, setSize] = useState('10');
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const sampleIds = useMemo(
    () => vehicles.filter((v) => v.registered && SAMPLE_ID.test(v.vehicleId)).map((v) => v.vehicleId),
    [vehicles]
  );

  const count = Number(size);
  const validSize = size.trim() !== '' && Number.isInteger(count) && count >= 1 && count <= 500;

  // Sample vehicles that would be removed by the chosen size
  const extraIds = useMemo(() => {
    if (!validSize) return [];
    return sampleIds.filter((id) => {
      const match = SAMPLE_ID.exec(id);
      return match !== null && Number(match[1]) > count;
    });
  }, [sampleIds, validSize, count]);

  const extraPreview =
    extraIds.length <= 4
      ? extraIds.join(', ')
      : `${extraIds.slice(0, 3).join(', ')} and ${extraIds.length - 3} more`;

  const fail = (err: unknown) =>
    setMessage({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong' });

  const applySize = async () => {
    if (!validSize) return;

    // Removing vehicles needs a second click
    if (extraIds.length > 0 && pending !== 'trim') {
      setPending('trim');
      setMessage(null);
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const result = await generateVehicles(count, true);
      if (extraIds.length > 0) onRemoved(extraIds);
      else onChanged();
      setPending(null);
      setMessage({
        ok: true,
        text: `Created ${result.created}, removed ${result.removed}. Total vehicles: ${result.totalVehicles}.`,
      });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const runReset = async (restore: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await resetSampleData(restore);
      onRemoved(sampleIds);
      setPending(null);
      setMessage({
        ok: true,
        text: restore
          ? `Reset done: ${result.restored?.vehicles.created ?? 0} vehicles and ${result.restored?.geofences.created ?? 0} geofences restored.`
          : `Removed ${result.removed.vehicles} vehicles and ${result.removed.geofences} geofences.`,
      });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-form">
      <div className="panel-title">Fleet tools</div>

      <div className="tool-group">
        <span className="tool-label">Sample fleet size (FLEET-001 to FLEET-N)</span>
        <div className="panel-row">
          <input
            value={size}
            onChange={(e) => {
              setSize(e.target.value);
              setPending(null);
            }}
            inputMode="numeric"
            disabled={busy}
          />
          <button type="button" className="btn tool-apply" onClick={applySize} disabled={busy || !validSize}>
            {pending === 'trim' ? 'Confirm' : 'Apply'}
          </button>
        </div>
        {!validSize && <div className="panel-error">Enter a whole number from 1 to 500</div>}
        {pending === 'trim' && (
          <div className="tool-warning">
            This removes {extraIds.length} sample vehicle(s): {extraPreview}. Their history is kept.
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="tool-group">
        <span className="tool-label">Sample data</span>
        <div className="card-confirm">
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setPending('reset')}
            disabled={busy}
          >
            Reset to defaults
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setPending('clear')}
            disabled={busy}
          >
            Remove sample data
          </button>
        </div>
        {(pending === 'reset' || pending === 'clear') && (
          <div className="tool-warning">
            {pending === 'reset'
              ? 'This removes the sample vehicles (FLEET-001, FLEET-002, ...) with their history and alerts and the sample geofences, then creates the default 10 vehicles and 3 geofences again.'
              : 'This removes the sample vehicles (FLEET-001, FLEET-002, ...) with their history and alerts and the sample geofences.'}{' '}
            Your own vehicles are not touched.
            <div className="card-confirm">
              <button
                type="button"
                className="btn btn-danger btn-small"
                onClick={() => runReset(pending === 'reset')}
                disabled={busy}
              >
                {busy ? 'Working...' : 'Yes, continue'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setPending(null)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {message && <div className={message.ok ? 'panel-ok' : 'panel-error'}>{message.text}</div>}
    </div>
  );
}