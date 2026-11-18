import { useSyncExternalStore } from 'react';

/**
 * How Study Forge reads for this student: text size, motion and spacing. Remembered in this
 * browser and applied before the page shows (index.html does the first pass), so nobody is asked
 * twice and nothing jumps on load.
 */
export type TextSize = 'standard' | 'large' | 'larger';
export type Motion = 'device' | 'reduce';
export type Density = 'comfortable' | 'compact';
/**
 * How a task that's been ticked off looks. Three choices and no more: it stays readable (the
 * default), it stays but is crossed out, or it leaves the active list. Whichever is chosen, the
 * task itself is untouched and still sits in Done, so nothing is ever lost by a display choice.
 */
export type CompletedLook = 'visible' | 'struck' | 'hidden';

export interface DisplayPrefs {
  text: TextSize;
  motion: Motion;
  density: Density;
  completed: CompletedLook;
}

const KEYS = { text: 'study-forge-text', motion: 'study-forge-motion', density: 'study-forge-density', completed: 'study-forge-completed' } as const;
const DEFAULTS: DisplayPrefs = { text: 'standard', motion: 'device', density: 'comfortable', completed: 'visible' };
const ALLOWED = {
  text: ['standard', 'large', 'larger'],
  motion: ['device', 'reduce'],
  density: ['comfortable', 'compact'],
  completed: ['visible', 'struck', 'hidden'],
} as const;

const listeners = new Set<() => void>();

function read(): DisplayPrefs {
  const pick = <K extends keyof DisplayPrefs>(key: K): DisplayPrefs[K] => {
    try {
      const saved = localStorage.getItem(KEYS[key]);
      return (ALLOWED[key] as readonly string[]).includes(saved ?? '') ? saved as DisplayPrefs[K] : DEFAULTS[key];
    } catch {
      return DEFAULTS[key];
    }
  };
  return { text: pick('text'), motion: pick('motion'), density: pick('density'), completed: pick('completed') };
}

let current: DisplayPrefs = typeof window === 'undefined' ? DEFAULTS : read();

export function applyDisplayPrefs(prefs: DisplayPrefs = current) {
  const root = document.documentElement.dataset;
  root.text = prefs.text;
  root.motion = prefs.motion;
  root.density = prefs.density;
  root.completed = prefs.completed;
}

export function setDisplayPref<K extends keyof DisplayPrefs>(key: K, value: DisplayPrefs[K]) {
  try {
    localStorage.setItem(KEYS[key], value);
  } catch {
    // A private window keeps the change until the page closes.
  }
  current = { ...current, [key]: value };
  applyDisplayPrefs();
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new CustomEvent('study-forge-setting-changed', { detail: 'appearance' }));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const useDisplayPrefs = () => useSyncExternalStore(subscribe, () => current);

export const getDisplayPrefs = (): DisplayPrefs => current;
