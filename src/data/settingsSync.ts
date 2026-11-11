import { getDb, notifyChanged } from './db';
import { getThemeChoice, setThemeChoice, type ThemeChoice } from './theme';
import { getDisplayPrefs, setDisplayPref, type DisplayPrefs } from './displayPrefs';
import { saveMode, savePinned, saveWeights, savedMode, savedPinned, savedWeights } from './priorityChoice';

/**
 * Settings that follow a student between devices: appearance (theme, text size, motion, spacing)
 * and how work is ranked. Each setting announces a change with an event; this records it as one
 * small record that syncs, and puts back what another device chose. Device-only things (which
 * account is signed in, whether the welcome page was seen) deliberately stay on each device.
 */
export const SETTING_CHANGED = 'study-forge-setting-changed';

interface Appearance extends DisplayPrefs { theme: ThemeChoice }
interface Priorities { mode: string; weights: unknown; pinned: string[] }

const appearanceNow = (): Appearance => ({ theme: getThemeChoice(), ...getDisplayPrefs() });
const prioritiesNow = (): Priorities => ({ mode: savedMode(), weights: savedWeights(), pinned: savedPinned() });

/** Saves a setting only when it really changed, so two devices never bounce the same value back and forth. */
async function record(id: 'appearance' | 'priorities', value: unknown) {
  const db = await getDb();
  const before = await db.get('settings', id);
  if (before && JSON.stringify(before.value) === JSON.stringify(value)) return;
  await db.put('settings', { id, value, updatedAt: Math.max(Date.now(), (before?.updatedAt ?? 0) + 1) });
  notifyChanged();
}

let applying = false;

export function watchSettings(): () => void {
  const onChange = (event: Event) => {
    if (applying) return;
    const which = (event as CustomEvent<string>).detail;
    if (which === 'priorities') void record('priorities', prioritiesNow()).catch(() => undefined);
    else void record('appearance', appearanceNow()).catch(() => undefined);
  };
  window.addEventListener(SETTING_CHANGED, onChange);
  return () => window.removeEventListener(SETTING_CHANGED, onChange);
}

/** Records today's settings once, so a device signing in shares what it already had. */
export async function recordCurrentSettings(): Promise<void> {
  const db = await getDb();
  if (!(await db.get('settings', 'appearance'))) await record('appearance', appearanceNow());
  if (!(await db.get('settings', 'priorities'))) await record('priorities', prioritiesNow());
}

/** Puts back settings that arrived from another device. */
export async function applySyncedSettings(): Promise<void> {
  const db = await getDb();
  const [appearance, priorities] = await Promise.all([db.get('settings', 'appearance'), db.get('settings', 'priorities')]);
  applying = true;
  try {
    if (appearance) {
      const value = appearance.value as Partial<Appearance>;
      if (value.theme && value.theme !== getThemeChoice()) setThemeChoice(value.theme);
      const now = getDisplayPrefs();
      for (const key of ['text', 'motion', 'density'] as const) {
        if (value[key] && value[key] !== now[key]) setDisplayPref(key, value[key] as never);
      }
    }
    if (priorities) {
      const value = priorities.value as Partial<Priorities>;
      if (typeof value.mode === 'string') saveMode(value.mode as never);
      if (value.weights) saveWeights(value.weights as never);
      if (Array.isArray(value.pinned)) savePinned(value.pinned);
    }
  } finally {
    applying = false;
  }
}
