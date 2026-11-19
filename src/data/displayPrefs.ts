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
/** Whether the checklist gathers tasks by when they're due or by the student's own sections. */
export type Grouping = 'due' | 'section';
/** Whether work found in a connected calendar becomes a task by itself. */
export type AutoWork = 'on' | 'off';

/*
 * Per-feature choices for the study tools. Each one of these changes what actually happens — the
 * order cards come in, when an explanation appears, which way a note opens. A setting that only
 * looked like a setting would be worse than not offering it.
 */
/** Whether cards and questions come in the order they were made, or shuffled. */
export type ItemOrder = 'created' | 'shuffled';
/** Which side of a flashcard is shown first. */
export type CardSide = 'front' | 'back';
/** Whether a practice explanation appears as you go, or all at the end. */
export type Explanations = 'each' | 'end';
/** Whether a note opens ready to write, or showing how it will read. */
export type NoteOpen = 'write' | 'preview';
/** Whether a transcript is made as soon as a recording is stopped. */
export type AutoTranscript = 'on' | 'off';
/*
 * There is deliberately no study-session length here. The spec asked for one, but Study Forge has
 * no timed study session to apply it to — Study is guided lessons, and Cram Mode only estimates
 * from how much there is to do. A setting with nothing behind it is worse than an absent one, so
 * this waits until there is a timed session to set the length of.
 */

export interface DisplayPrefs {
  text: TextSize;
  motion: Motion;
  density: Density;
  completed: CompletedLook;
  grouping: Grouping;
  autoWork: AutoWork;
  cardOrder: ItemOrder;
  cardSide: CardSide;
  practiceOrder: ItemOrder;
  explanations: Explanations;
  noteStart: NoteOpen;
  autoTranscript: AutoTranscript;
}

const KEYS = {
  text: 'study-forge-text', motion: 'study-forge-motion', density: 'study-forge-density',
  completed: 'study-forge-completed', grouping: 'study-forge-grouping', autoWork: 'study-forge-auto-work',
  cardOrder: 'study-forge-card-order', cardSide: 'study-forge-card-side',
  practiceOrder: 'study-forge-practice-order', explanations: 'study-forge-explanations',
  noteStart: 'study-forge-note-start', autoTranscript: 'study-forge-auto-transcript',
} as const;
const DEFAULTS: DisplayPrefs = {
  text: 'standard', motion: 'device', density: 'comfortable', completed: 'visible', grouping: 'due',
  autoWork: 'on',
  // Defaults chosen to be what the app already did, so nobody's habits change by an upgrade.
  cardOrder: 'created', cardSide: 'front', practiceOrder: 'created', explanations: 'each',
  noteStart: 'write',
  // Off, because making a transcript is slow on a phone and runs the speech model on the device.
  autoTranscript: 'off',
};
const ALLOWED = {
  text: ['standard', 'large', 'larger'],
  motion: ['device', 'reduce'],
  density: ['comfortable', 'compact'],
  completed: ['visible', 'struck', 'hidden'],
  grouping: ['due', 'section'],
  autoWork: ['on', 'off'],
  cardOrder: ['created', 'shuffled'],
  cardSide: ['front', 'back'],
  practiceOrder: ['created', 'shuffled'],
  explanations: ['each', 'end'],
  noteStart: ['write', 'preview'],
  autoTranscript: ['on', 'off'],
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
  return {
    text: pick('text'), motion: pick('motion'), density: pick('density'), completed: pick('completed'),
    grouping: pick('grouping'), autoWork: pick('autoWork'), cardOrder: pick('cardOrder'),
    cardSide: pick('cardSide'), practiceOrder: pick('practiceOrder'), explanations: pick('explanations'),
    noteStart: pick('noteStart'), autoTranscript: pick('autoTranscript'),
  };
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
