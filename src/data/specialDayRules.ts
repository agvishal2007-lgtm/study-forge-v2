/*
 * Days that don't run like the others: an assembly, a field trip, a spirit day, a half day, a
 * delayed opening, an exam morning, or anything else a school invents and names itself.
 *
 * There is no list of kinds here on purpose. A student types what the day is called, in their
 * school's words, and says what it does to their classes — nothing, cancels them, or runs only
 * some of them. The one thing that genuinely has to be asked is whether a rotating cycle still
 * moves along on that day, because schools differ on it and getting it wrong puts every day after
 * it on the wrong letter.
 */

/** What a special day does to the classes that would otherwise happen. */
export type Effect = 'as-usual' | 'no-classes' | 'some-classes';

export interface SpecialDay {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  /** What the school calls it, in the student's own words. */
  name: string;
  effect: Effect;
  /** For 'some-classes', which blocks still happen. Empty means none do. */
  blocks: number[];
  /** Whether a rotating cycle still advances on this day. */
  cycleMoves: boolean;
  /** Anything else worth remembering about it. */
  note: string;
  createdAt: number;
  updatedAt: number;
}

export const EFFECTS: Effect[] = ['as-usual', 'some-classes', 'no-classes'];

export const EFFECT_LABEL: Record<Effect, string> = {
  'as-usual': 'Classes run as usual',
  'some-classes': 'Only some blocks happen',
  'no-classes': 'No classes at all',
};

export const DEFAULT_SPECIAL: Omit<SpecialDay, 'id' | 'date' | 'createdAt' | 'updatedAt'> = {
  name: '',
  effect: 'as-usual',
  blocks: [],
  // A day with no classes usually doesn't move a cycle along, and a day that runs its classes
  // usually does — but this is only the starting position on the form, never a decision.
  cycleMoves: true,
  note: '',
};

/** Special days soonest first, which is the order they matter in. */
export const inDateOrder = (days: SpecialDay[]): SpecialDay[] =>
  [...days].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

/** The special day on a date, if there is one. The most recently saved one wins a clash. */
export function specialOn(days: SpecialDay[], date: string): SpecialDay | null {
  const matches = days.filter((day) => day.date === date);
  if (matches.length === 0) return null;
  return matches.reduce((latest, day) => (day.updatedAt > latest.updatedAt ? day : latest), matches[0]);
}

/** The dates that don't move a rotating cycle along, for the rotation to leave out of its count. */
export const datesThatDontMoveTheCycle = (days: SpecialDay[]): string[] =>
  days.filter((day) => !day.cycleMoves).map((day) => day.date);

/** Whether classes happen in a block on a special day. */
export function blockHappens(special: SpecialDay | null, period: number): boolean {
  if (!special || special.effect === 'as-usual') return true;
  if (special.effect === 'no-classes') return false;
  return special.blocks.includes(period);
}

/** The slots of a day after a special day has had its say. */
export function slotsAfterSpecial<T extends { period: number }>(slots: T[], special: SpecialDay | null): T[] {
  if (!special || special.effect === 'as-usual') return slots;
  return slots.filter((slot) => blockHappens(special, slot.period));
}

/** What a special day amounts to, in a sentence, in the student's own words where they gave them. */
export function describeSpecial(special: SpecialDay | null, blockNames: string[] = []): string {
  if (!special) return '';
  const name = special.name.trim() || 'Special day';
  if (special.effect === 'no-classes') return `${name} — no classes.`;
  if (special.effect === 'as-usual') return `${name} — classes run as usual.`;
  if (special.blocks.length === 0) return `${name} — no blocks marked as happening yet.`;
  const named = special.blocks
    .slice()
    .sort((a, b) => a - b)
    .map((period) => blockNames[period]?.trim() || `Period ${period + 1}`);
  return `${name} — only ${named.join(', ')}.`;
}

/** A special day is worth saving once it has a date; everything else about it can wait. */
export const usableSpecial = (fields: { date: string }): boolean => /^\d{4}-\d{2}-\d{2}$/.test(fields.date.trim());
