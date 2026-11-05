// Frontend/src/services/adminAuth.ts
// Keeps the admin key for this browser tab only (sessionStorage: it is forgotten when the tab is closed).
const STORAGE_KEY = 'fleetdash.adminKey';

type Listener = () => void;
const listeners = new Set<Listener>();

function readStored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // the browser blocks storage: the key then lives in memory only
  }
}

let currentKey: string | null = readStored();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function getAdminKey(): string | null {
  return currentKey;
}

export function setAdminKey(key: string): void {
  currentKey = key;
  try {
    sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    // ignore: the key just is not remembered after a refresh
  }
  notify();
}

export function clearAdminKey(): void {
  currentKey = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  notify();
}

/** Calls the listener whenever the key is set or cleared. Returns a function that stops listening. */
export function subscribeAdminKey(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}