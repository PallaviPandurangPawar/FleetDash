// Frontend/src/components/admin/AdminLock.tsx
// Header control: unlock admin mode with the admin key, or lock it again.
import { FormEvent, useState } from 'react';
import { useAdminKey } from '../../hooks/useAdminKey';

export default function AdminLock() {
  const { unlocked, unlock, lock } = useAdminKey();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setValue('');
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unlock(value);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check the key');
    } finally {
      setBusy(false);
    }
  };

  if (unlocked) {
    return (
      <span className="admin">
        <span className="admin-on">Admin on</span>
        <button type="button" className="btn btn-ghost" onClick={lock}>
          Lock
        </button>
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Unlock admin
      </button>
    );
  }

  return (
    <form className="admin" onSubmit={submit}>
      <input
        type="password"
        className="admin-input"
        placeholder="Admin key"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        autoComplete="off"
      />
      <button type="submit" className="btn" disabled={busy || value.trim() === ''}>
        {busy ? 'Checking...' : 'Unlock'}
      </button>
      <button type="button" className="btn btn-ghost" onClick={close}>
        Cancel
      </button>
      {error && <span className="admin-error">{error}</span>}
    </form>
  );
}