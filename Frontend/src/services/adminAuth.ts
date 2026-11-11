const STORAGE_KEY = 'fleetdash.adminKey';

function readStoredKey(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let currentKey: string | null = readStoredKey();
const listeners = new Set<() => void>();

export function getAdminKey(): string | null {
  return currentKey;
}

export function setAdminKey(key: string): void {
  currentKey = key;
  try {
    sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Keep the key in memory for this page when browser storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

export function clearAdminKey(): void {
  currentKey = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // The in-memory key is still cleared.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeAdminKey(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
