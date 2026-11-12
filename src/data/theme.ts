import { useSyncExternalStore } from 'react';
import { isDarkAt, nextChangeMs, resolveLook, suggestPlace, sunDay, type Look, type Place, type ThemeChoice } from './sunRules';

export type { ThemeChoice, Look, Place } from './sunRules';

/*
 * The look. Settings holds the preference: Light, Dark, Match Device, or Sunrise/Sunset. The
 * sun/moon button in the top bar only ever flips between light and dark; under an automatic
 * preference that flip is an override which stays until the student picks a preference again.
 * index.html applies the look before the page shows, so it never flashes.
 */
const KEY = 'study-forge-theme';
const OVERRIDE_KEY = 'study-forge-theme-override';
const PLACE_KEY = 'study-forge-theme-place';
/** Today's sunrise and sunset, kept so index.html can choose the look before any code loads. */
const SUN_KEY = 'study-forge-theme-sun';
const listeners = new Set<() => void>();
const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

const read = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private browsing can refuse this. The look still changes until the page closes.
  }
};

export function getThemeChoice(): ThemeChoice {
  const saved = read(KEY);
  return saved === 'dark' || saved === 'system' || saved === 'sun' ? saved : 'light';
}
export function getThemeOverride(): Look | null {
  const saved = read(OVERRIDE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : null;
}
export function getThemePlace(): Place {
  try {
    const saved = JSON.parse(read(PLACE_KEY) ?? 'null');
    if (saved && typeof saved.name === 'string' && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) return saved;
  } catch { /* fall through to the suggestion */ }
  // No permission is asked: the device's time zone is enough for a sensible starting city.
  return suggestPlace(Intl.DateTimeFormat().resolvedOptions().timeZone, -new Date().getTimezoneOffset());
}

interface ThemeState { choice: ThemeChoice; override: Look | null; place: Place; look: Look; sunrise: number | null; sunset: number | null }

let timer: ReturnType<typeof setTimeout> | undefined;

function compute(): ThemeState {
  const choice = getThemeChoice();
  const override = getThemeOverride();
  const place = getThemePlace();
  const now = Date.now();
  const sun = sunDay(new Date(now), place);
  const look = resolveLook(choice, override, prefersDark(), isDarkAt(now, sun));
  clearTimeout(timer);
  if (choice === 'sun') {
    write(SUN_KEY, JSON.stringify({ rise: sun.riseMs, set: sun.setMs, always: sun.always ?? null }));
    // Change at sunrise or sunset exactly, and work out tomorrow's times when the day turns.
    timer = setTimeout(refresh, Math.min(Math.max(nextChangeMs(now, sun) - now, 1000), 6 * 3600_000));
  }
  return { choice, override, place, look, sunrise: sun.always ? null : sun.riseMs, sunset: sun.always ? null : sun.setMs };
}

function apply(next: ThemeState) {
  document.documentElement.dataset.theme = next.look;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next.look === 'dark' ? '#15181d' : '#f5f6f8');
}

let current: ThemeState = typeof window === 'undefined'
  ? { choice: 'light', override: null, place: { name: '', lat: 0, lon: 0 }, look: 'light', sunrise: null, sunset: null }
  : compute();

function refresh() {
  current = compute();
  apply(current);
  listeners.forEach((listener) => listener());
}

/** Lets the student's other devices follow, when they're signed in. */
const announce = () => window.dispatchEvent(new CustomEvent('study-forge-setting-changed', { detail: 'appearance' }));

/** Choosing a preference in Settings. This also ends any override from the sun/moon button. */
export function setThemeChoice(choice: ThemeChoice) {
  write(KEY, choice);
  write(OVERRIDE_KEY, null);
  refresh();
  announce();
}

/** The sun/moon button: straight to the other look, whatever the preference is. */
export function toggleLook() {
  const next: Look = current.look === 'dark' ? 'light' : 'dark';
  if (current.choice === 'light' || current.choice === 'dark') write(KEY, next);
  else write(OVERRIDE_KEY, next);
  refresh();
  announce();
}

export function setThemePlace(place: Place) {
  write(PLACE_KEY, JSON.stringify({ name: place.name, lat: place.lat, lon: place.lon }));
  refresh();
  announce();
}

/** Puts back what another device chose, without announcing it again. */
export function restoreTheme(saved: { theme?: ThemeChoice; themeOverride?: Look | null; themePlace?: Place | null }) {
  if (saved.theme) write(KEY, saved.theme);
  if (saved.themeOverride !== undefined) write(OVERRIDE_KEY, saved.themeOverride);
  if (saved.themePlace) write(PLACE_KEY, JSON.stringify(saved.themePlace));
  refresh();
}

/** Follows the device when the student chose that, and re-checks the sun when the page is looked at again. */
export function watchDeviceTheme() {
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', refresh);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  // Another tab changed the look.
  window.addEventListener('storage', (event) => { if (event.key?.startsWith(KEY)) refresh(); });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const useTheme = () => useSyncExternalStore(subscribe, () => current);
export const useThemeChoice = () => useSyncExternalStore(subscribe, () => current.choice);
export const useIsDark = () => useSyncExternalStore(subscribe, () => current.look === 'dark');
