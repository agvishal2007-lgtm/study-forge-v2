import { getDb, notifyChanged } from './db';
import { getClockStyle, getDateOrder, setDateFormat, type ClockStyle, type DateOrder } from './dateFormat';
import { getThemeChoice, getThemeOverride, getThemePlace, restoreTheme, type Look, type Place, type ThemeChoice } from './theme';
import { getDisplayPrefs, setDisplayPref, type DisplayPrefs } from './displayPrefs';
import { saveMode, savePinned, saveWeights, savedMode, savedPinned, savedWeights } from './priorityChoice';
import { SCHOOL_LEVELS, TERM_KINDS, allowsAccounts, getSchool, setSchool, type SchoolLevel, type TermKind } from './schoolLevel';
import { FOCUS_CHANGED, restoreSavedLayers, savedMix, type SavedMix } from './focusSounds';
import { getRetention, retentionChosen, setRetention } from './trashPolicy';
import { isRetention, type Retention } from './trashRules';

/**
 * Settings that follow a student between devices: appearance (theme, text size, motion, spacing)
 * and how work is ranked. Each setting announces a change with an event; this records it as one
 * small record that syncs, and puts back what another device chose. Device-only things (which
 * account is signed in, whether the welcome page was seen) deliberately stay on each device.
 */
export const SETTING_CHANGED = 'study-forge-setting-changed';

interface Appearance extends DisplayPrefs { dateOrder: DateOrder; clock: ClockStyle; theme: ThemeChoice; themeOverride: Look | null; themePlace: Place | null }
interface Priorities { mode: string; weights: unknown; pinned: string[] }
interface School { level: SchoolLevel; termKind: TermKind; termKindChosen: boolean }
/*
 * The chosen sounds, without the master volume.
 *
 * Which sounds help a student concentrate is a preference and follows them. How loud this device
 * plays is the device's own: a volume that suits headphones on a laptop is not the volume that
 * suits a phone in a quiet room, and syncing it would have one device keep overriding the other.
 */
interface Sounds { layers: SavedMix['layers'] }
/** How long Trash keeps things. An account-level choice, so it follows the student. */
interface Trash { retention: Retention }

// The city only matters, and only syncs, once Sunrise/Sunset is chosen.
const appearanceNow = (): Appearance => ({ dateOrder: getDateOrder(), clock: getClockStyle(), theme: getThemeChoice(), themeOverride: getThemeOverride(), themePlace: getThemeChoice() === 'sun' ? getThemePlace() : null, ...getDisplayPrefs() });
const prioritiesNow = (): Priorities => ({ mode: savedMode(), weights: savedWeights(), pinned: savedPinned() });
const soundsNow = (): Sounds => ({ layers: savedMix().layers });
const trashNow = (): Trash => ({ retention: getRetention() });
// Only a level that can have an account ever reaches here, so a synced record never switches
// another device into this-device-only mode.
const schoolNow = (): School => { const school = getSchool(); return { level: school.level, termKind: school.termKind, termKindChosen: school.termKindChosen }; };

/** Saves a setting only when it really changed, so two devices never bounce the same value back and forth. */
async function record(id: 'appearance' | 'priorities' | 'school' | 'sounds' | 'trash', value: unknown) {
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
    else if (which === 'trash') void record('trash', trashNow()).catch(() => undefined);
    else if (which === 'school') void record('school', schoolNow()).catch(() => undefined);
    else void record('appearance', appearanceNow()).catch(() => undefined);
  };
  /*
   * Sounds come in a stream: dragging a volume fires this on every pixel. Waiting a moment before
   * recording turns a whole drag into one save, which is why this one is held back and the others
   * are not.
   */
  let soon: ReturnType<typeof setTimeout> | null = null;
  const onSound = () => {
    if (applying) return;
    if (soon) clearTimeout(soon);
    soon = setTimeout(() => { soon = null; void record('sounds', soundsNow()).catch(() => undefined); }, 600);
  };
  window.addEventListener(SETTING_CHANGED, onChange);
  window.addEventListener(FOCUS_CHANGED, onSound);
  return () => {
    if (soon) clearTimeout(soon);
    window.removeEventListener(SETTING_CHANGED, onChange);
    window.removeEventListener(FOCUS_CHANGED, onSound);
  };
}

/** Records today's settings once, so a device signing in shares what it already had. */
export async function recordCurrentSettings(): Promise<void> {
  const db = await getDb();
  if (!(await db.get('settings', 'appearance'))) await record('appearance', appearanceNow());
  if (!(await db.get('settings', 'priorities'))) await record('priorities', prioritiesNow());
  if (!(await db.get('settings', 'school')) && allowsAccounts(getSchool().level)) await record('school', schoolNow());
  if (!(await db.get('settings', 'sounds')) && soundsNow().layers.length > 0) await record('sounds', soundsNow());
  if (!(await db.get('settings', 'trash')) && retentionChosen()) await record('trash', trashNow());
}

/** Puts back settings that arrived from another device. */
export async function applySyncedSettings(): Promise<void> {
  const db = await getDb();
  const [appearance, priorities, school, sounds, trash] = await Promise.all([db.get('settings', 'appearance'), db.get('settings', 'priorities'), db.get('settings', 'school'), db.get('settings', 'sounds'), db.get('settings', 'trash')]);
  applying = true;
  try {
    if (appearance) {
      const value = appearance.value as Partial<Appearance>;
      const before = appearanceNow();
      if (value.theme && (value.theme !== before.theme || (value.themeOverride ?? null) !== before.themeOverride || JSON.stringify(value.themePlace ?? null) !== JSON.stringify(before.themePlace))) {
        restoreTheme({ theme: value.theme, themeOverride: value.themeOverride ?? null, themePlace: value.themePlace ?? null });
      }
      if ((value.dateOrder && value.dateOrder !== getDateOrder()) || (value.clock && value.clock !== getClockStyle())) {
        setDateFormat({ order: value.dateOrder, clock: value.clock }, false);
      }
      /*
       * Every display preference, taken from the preferences themselves rather than from a list
       * written out here.
       *
       * This was a hand-written list of six names, and the six Study tools settings added later
       * were recorded and sent but never put back — so changing one on a laptop synced, and the
       * phone quietly ignored it. Reading the keys from the current preferences means a new one
       * cannot be forgotten again, and a test asserts every key survives the round trip.
       */
      const now = getDisplayPrefs();
      for (const key of Object.keys(now) as (keyof DisplayPrefs)[]) {
        if (value[key] !== undefined && value[key] !== now[key]) setDisplayPref(key, value[key] as never);
      }
    }
    if (school) {
      const value = school.value as Partial<School>;
      const level = (SCHOOL_LEVELS as string[]).includes(value.level ?? '') ? value.level as SchoolLevel : null;
      const termKind = (TERM_KINDS as string[]).includes(value.termKind ?? '') ? value.termKind as TermKind : null;
      const now = getSchool();
      // A device-only level is never accepted from another device: it would quietly switch syncing
      // off here, and a student can only choose that on the device in front of them.
      if (level && allowsAccounts(level) && (level !== now.level || (termKind && termKind !== now.termKind))) {
        setSchool({ level, ...(value.termKindChosen && termKind ? { termKind } : {}) }, false);
      }
    }
    if (priorities) {
      const value = priorities.value as Partial<Priorities>;
      if (typeof value.mode === 'string') saveMode(value.mode as never);
      if (value.weights) saveWeights(value.weights as never);
      if (Array.isArray(value.pinned)) savePinned(value.pinned);
    }
    if (sounds) {
      const value = sounds.value as Partial<Sounds>;
      if (Array.isArray(value.layers)) restoreSavedLayers(value.layers);
    }
    if (trash) {
      // Checked rather than trusted: a policy this version doesn't offer would decide when a
      // student's work is deleted, so anything unrecognised is ignored and the choice here stands.
      const value = (trash.value as Partial<Trash>).retention;
      if (isRetention(value) && value !== getRetention()) setRetention(value, false);
    }
  } finally {
    applying = false;
  }
}
