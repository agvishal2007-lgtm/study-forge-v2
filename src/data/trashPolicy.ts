import { useSyncExternalStore } from 'react';
import { isRetention, startingPolicy, type Retention } from './trashRules';

/**
 * How long this student's Trash keeps things.
 *
 * Kept in this browser so the Trash page and the settings screen can read it without waiting, and
 * recorded into the synced settings so the choice follows the student to their other devices.
 *
 * The default when nothing has been chosen is 'never'. That is deliberate and it is the cautious
 * way round: Study Forge has always told students that nothing in Trash goes until they say so, and
 * an update is not permission to start deleting their work. A genuinely new student is moved onto
 * the recommendation by `chooseStartingRetention`, which only ever runs when there is nothing to lose.
 */
const KEY = 'study-forge-trash-retention';

let current: Retention = read();

function read(): Retention {
  try {
    const saved = localStorage.getItem(KEY);
    const value = saved === 'never' ? 'never' : Number(saved);
    return isRetention(value) ? value : 'never';
  } catch {
    return 'never';
  }
}

export const getRetention = (): Retention => current;
/** Whether the student has ever chosen, which is what tells a new account from an old one. */
export const retentionChosen = (): boolean => {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
};

const listeners = new Set<() => void>();

export function setRetention(value: Retention, announce = true): void {
  if (!isRetention(value)) return;
  current = value;
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    // A private window keeps the choice until the page closes.
  }
  listeners.forEach((listener) => listener());
  if (announce && typeof window !== 'undefined') {
    // The event name is written out rather than imported, the same way displayPrefs does it: the
    // settings sync imports this module, and importing it back would make a circle.
    window.dispatchEvent(new CustomEvent('study-forge-setting-changed', { detail: 'trash' }));
  }
}

/**
 * Sets the starting policy for a student who has never chosen one.
 *
 * `hasExistingWork` decides it, and nothing else: a new account starts on the recommended 30 days,
 * and anyone with work already here keeps deleting things themselves. Called once at startup, and
 * it never touches a choice the student has made or one that arrived from another device.
 */
export function chooseStartingRetention(hasExistingWork: boolean): void {
  if (retentionChosen()) return;
  /*
   * A student who already has work has nothing written down at all, rather than 'never' written
   * down. The effect is the same — `getRetention` reads 'never' when nothing has been chosen — but
   * recording a choice they never made would then be synced to their account and could overwrite
   * the real choice they made on another device.
   */
  if (hasExistingWork) return;
  setRetention(startingPolicy(false));
}

export const subscribeRetention = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const useRetention = (): Retention => useSyncExternalStore(subscribeRetention, getRetention, getRetention);
