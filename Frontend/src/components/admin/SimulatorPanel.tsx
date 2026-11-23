// Frontend/src/components/admin/SimulatorPanel.tsx
// Start, restart and stop the backend vehicle simulator, and show what it is doing.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSimulatorStatus, startSimulator, stopSimulator } from '../../services/api';
import type { SimulatorResponse, SimulatorState } from '../../types/api';

const REFRESH_MS = 2000;

export default function SimulatorPanel() {
  const [status, setStatus] = useState<SimulatorState | null>(null);
  const [count, setCount] = useState('10');
  const [busy, setBusy] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const countReady = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const { simulator } = await getSimulatorStatus();
      setStatus(simulator);
      setPollError(null);
      // The first time, show the count the simulator is already using
      if (!countReady.current) {
        countReady.current = true;
        if (simulator.requested > 0) setCount(String(simulator.requested));
      }
    } catch (err) {
      setPollError(err instanceof Error ? err.message : 'Could not read the simulator status');
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const number = Number(count);
  const validCount = count.trim() !== '' && Number.isInteger(number) && number >= 1 && number <= 500;

  const run = async (action: () => Promise<SimulatorResponse>) => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await action();
      setStatus(res.simulator);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const running = status?.running ?? false;

  return (
    <div className="tool-group">
      <span className="tool-label">Vehicle simulator</span>

      <div className="sim-status">
        <span className={running ? 'sim-badge sim-on' : 'sim-badge'}>
          {status === null ? 'Checking...' : running ? 'Running' : 'Stopped'}
        </span>
        {status && status.requested > 0 && (
          <span>
            Driving {status.vehicles} vehicle(s)
            {status.vehicles < status.requested ? ` (you asked for ${status.requested}, only ${status.vehicles} exist)` : ''}
          </span>
        )}
        {status && status.requested > 0 && (
          <span>
            Readings sent: {status.sent} / failed: {status.failed}
          </span>
        )}
        {status && status.failed > 0 && status.lastError && <span>Last error: {status.lastError}</span>}
      </div>

      <span className="tool-label">Vehicles to drive</span>
      <div className="panel-row">
        <input
          value={count}
          onChange={(e) => setCount(e.target.value)}
          inputMode="numeric"
          disabled={busy}
          aria-label="Number of vehicles to simulate"
        />
        <button
          type="button"
          className="btn tool-apply"
          onClick={() => run(() => startSimulator({ count: number }))}
          disabled={busy || !validCount}
        >
          {running ? 'Restart' : 'Start'}
        </button>
        {running && (
          <button
            type="button"
            className="btn btn-ghost tool-apply"
            onClick={() => run(stopSimulator)}
            disabled={busy}
          >
            Stop
          </button>
        )}
      </div>

      {!validCount && <div className="panel-error">Enter a whole number from 1 to 500</div>}
      {running && <span className="tool-label">Added or removed vehicles? Press Restart to include the change.</span>}
      {pollError && <div className="panel-error">{pollError}</div>}
      {actionError && <div className="panel-error">{actionError}</div>}
    </div>
  );
}