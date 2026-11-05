// Frontend/src/hooks/useAdminKey.ts
// Admin mode state shared by every component: unlocked or not, plus unlock() and lock().
import { useCallback, useEffect, useState } from 'react';
import { clearAdminKey, getAdminKey, setAdminKey, subscribeAdminKey } from '../services/adminAuth';
import { pingAdmin } from '../services/api';

export function useAdminKey() {
  const [key, setKey] = useState<string | null>(getAdminKey());

  useEffect(() => {
    setKey(getAdminKey());
    return subscribeAdminKey(() => setKey(getAdminKey()));
  }, []);

  /** Checks the key with the server first. Throws (with the server's message) when it is wrong. */
  const unlock = useCallback(async (candidate: string): Promise<void> => {
    const trimmed = candidate.trim();
    await pingAdmin(trimmed);
    setAdminKey(trimmed);
  }, []);

  const lock = useCallback((): void => {
    clearAdminKey();
  }, []);

  return { unlocked: key !== null, unlock, lock };
}