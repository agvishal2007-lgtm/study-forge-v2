import { useSyncExternalStore } from 'react';

/** The look is remembered per browser. index.html applies it before the page shows, so it never flashes. */
export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'study-forge-theme';
const listeners = new Set<() => void>();
const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

export function getThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'dark' || saved === 'system' ? saved : 'light';
  } catch {
    return 'light';
  }
}

const resolved = (choice: ThemeChoice) => (choice === 'system' ? (prefersDark() ? 'dark' : 'light') : choice);

function apply(choice: ThemeChoice) {
  const theme = resolved(choice);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#15181d' : '#f5f6f8');
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Private browsing can refuse this. The look still changes until the page closes.
  }
  current = choice;
  apply(choice);
  listeners.forEach((listener) => listener());
}

let current = typeof window === 'undefined' ? 'light' as ThemeChoice : getThemeChoice();

/** Follows the device when the student chose that. */
export function watchDeviceTheme() {
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (current === 'system') {
      apply('system');
      listeners.forEach((listener) => listener());
    }
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const useThemeChoice = () => useSyncExternalStore(subscribe, () => current);
export const useIsDark = () => useSyncExternalStore(subscribe, () => resolved(current) === 'dark');
