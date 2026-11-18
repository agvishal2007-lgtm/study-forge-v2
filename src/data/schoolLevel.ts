import { useSyncExternalStore } from 'react';
import { getActiveAccount } from './account';
import {
  DEFAULT_TERM_KIND, SCHOOL_LEVELS, TERM_KINDS, allowsAccounts, wordsFor,
  type SchoolLevel, type SchoolWords, type TermKind,
} from './schoolLevelRules';

/*
 * Where the student's choice of school is kept. The rules themselves — the words, the suggested
 * term names, the starting classes and how grades read — live in schoolLevelRules.ts, and are
 * passed straight through from here so the rest of the app has one place to import from.
 */
export * from './schoolLevelRules';

/* ---- Remembering the choice ---- */

export const SCHOOL_CHANGED = 'study-forge-school-changed';
const ACCOUNT_UPDATED = 'study-forge-account-updated';
// Kept per account, so one device shared by two students doesn't mix their choices up.
const storageKey = () => `study-forge-school:${getActiveAccount()?.uid ?? 'guest'}`;

export interface SchoolChoice {
  level: SchoolLevel;
  termKind: TermKind;
  /** True once the student finished or skipped the first-time setup. */
  setupDone: boolean;
  /** True when the student chose a level, rather than getting the College default. */
  chosen: boolean;
  /** True when the student picked the term kind themselves, so changing level leaves it alone. */
  termKindChosen: boolean;
}

const DEFAULTS: SchoolChoice = { level: 'college', termKind: 'semester', setupDone: false, chosen: false, termKindChosen: false };

function read(): SchoolChoice {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()) ?? 'null');
    if (!saved || typeof saved !== 'object') return DEFAULTS;
    const level = (SCHOOL_LEVELS as string[]).includes(saved.level) ? saved.level as SchoolLevel : 'college';
    const termKind = (TERM_KINDS as string[]).includes(saved.termKind) ? saved.termKind as TermKind : DEFAULT_TERM_KIND[level];
    return {
      level,
      termKind,
      setupDone: saved.setupDone === true,
      chosen: (SCHOOL_LEVELS as string[]).includes(saved.level),
      termKindChosen: saved.termKindChosen === true,
    };
  } catch {
    return DEFAULTS;
  }
}

let current: SchoolChoice = typeof window === 'undefined' ? DEFAULTS : read();
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  // Another student signing in on this device gets their own choice, not the last one's.
  window.addEventListener(ACCOUNT_UPDATED, () => { current = read(); tell(); });
}

export function setSchool(choice: Partial<Pick<SchoolChoice, 'level' | 'termKind' | 'setupDone'>>, sync = true) {
  const level = choice.level ?? current.level;
  const levelChanged = Boolean(choice.level && choice.level !== current.level);
  const next: SchoolChoice = {
    level,
    // Changing level moves the term kind to that level's usual one, unless the student picked one.
    termKind: choice.termKind ?? (levelChanged && !current.termKindChosen ? DEFAULT_TERM_KIND[level] : current.termKind),
    setupDone: choice.setupDone ?? current.setupDone,
    chosen: current.chosen || Boolean(choice.level),
    termKindChosen: current.termKindChosen || Boolean(choice.termKind),
  };
  current = next;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(next));
  } catch {
    // A private window keeps the choice until the page closes.
  }
  tell();
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SCHOOL_CHANGED));
  // Only levels that can have an account sync this; the settings sync listens for the event.
  if (sync && allowsAccounts(next.level)) window.dispatchEvent(new CustomEvent('study-forge-setting-changed', { detail: 'school' }));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const getSchool = (): SchoolChoice => current;
export const getLevel = (): SchoolLevel => current.level;
/** True while Study Forge is on this device only because of the chosen school level. */
export const isDeviceOnly = (): boolean => !allowsAccounts(current.level);
export const useSchool = (): SchoolChoice => useSyncExternalStore(subscribe, () => current, () => DEFAULTS);
export function useSchoolWords(): SchoolWords {
  const school = useSchool();
  return wordsFor(school.level, school.termKind);
}
