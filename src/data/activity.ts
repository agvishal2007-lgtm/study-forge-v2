import { useSyncExternalStore } from 'react';
import { CURRENT_DB } from './account';

/**
 * Recent activity: the changes a student made and anything they put back, newest first. It is
 * built from the same records Undo keeps, not tracked separately, and it is kept per account on
 * this device, so on a shared computer one student never sees another's.
 */
export interface Activity {
  at: number;
  /** In the student's words: "Moved 4 items to the bin", "Undone: renamed Biology to Bio 101". */
  text: string;
  /** Putting something back is called out, so a recovery is easy to spot. */
  recovery: boolean;
}

const KEY = `${CURRENT_DB}-activity`;
const LIMIT = 40;
const listeners = new Set<() => void>();

function read(): Activity[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Activity[];
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry?.text === 'string' && typeof entry?.at === 'number') : [];
  } catch {
    return [];
  }
}

let current: Activity[] = typeof window === 'undefined' ? [] : read();

export function logActivity(text: string, recovery = false) {
  current = [{ at: Date.now(), text, recovery }, ...current].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Kept for this visit even if the browser won't store it.
  }
  listeners.forEach((listener) => listener());
}

export function clearActivity() {
  current = [];
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const useActivity = () => useSyncExternalStore(subscribe, () => current);
