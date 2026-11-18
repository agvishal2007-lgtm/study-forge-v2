/*
 * Block schedules. Plenty of schools don't run the same classes every day: they rotate through a
 * cycle of named days — A day, B day, sometimes all the way to F — and a class meets on some of
 * them. The cycle only moves on days school is in session, so a long weekend doesn't push it on.
 *
 * This file only calculates, so it can be tested directly. A rotation is three plain facts: how
 * many days the cycle runs through, one date the school counted as day A, and which weekdays
 * school is in session. Everything else is worked out from those, which means nothing has to be
 * kept in step by hand and a missed day off is fixed by saying what today really is.
 */
export interface Rotation {
  /** How many days the cycle runs through: 2 is a plain A/B block, up to 8. */
  length: number;
  /** A date (YYYY-MM-DD) the school counted as day A. */
  anchor: string;
  /** Which weekdays school is in session. 0 is Sunday. */
  weekdays: number[];
}

export const ROTATION_LETTERS = 'ABCDEFGH';
export const ROTATION_MAX = ROTATION_LETTERS.length;
/** School days, Monday to Friday — what nearly every school runs. */
export const SCHOOL_WEEK = [1, 2, 3, 4, 5];

const DAY = 86400000;
const at = (date: string) => Date.parse(`${date}T00:00:00Z`);
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const weekdayOf = (date: string) => new Date(at(date)).getUTCDay();

/** Tidies what was stored or typed: real weekdays, no repeats, in order. */
export const schoolWeek = (weekdays: number[]): number[] =>
  [...new Set(weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);

/** The letter for a cycle day: 0 is A. */
export const rotationLabel = (day: number): string => ROTATION_LETTERS[day] ?? '?';

/** True when this rotation makes sense to use at all. */
export function usableRotation(rotation: Rotation | null): rotation is Rotation {
  if (!rotation) return false;
  const week = schoolWeek(rotation.weekdays);
  return week.length > 0 && rotation.length >= 2 && rotation.length <= ROTATION_MAX && !Number.isNaN(at(rotation.anchor));
}

/** The first day school is in session on or after a date. */
export function schoolDayOnOrAfter(date: string, weekdays: number[]): string {
  const week = schoolWeek(weekdays);
  if (!week.length) return date;
  let time = at(date);
  for (let step = 0; step < 7; step++) {
    if (week.includes(new Date(time).getUTCDay())) return iso(time);
    time += DAY;
  }
  return date;
}

/** Steps a whole number of school days from a date, forwards or backwards. */
export function shiftSchoolDays(date: string, days: number, weekdays: number[]): string {
  const week = schoolWeek(weekdays);
  if (!week.length) return date;
  let time = at(schoolDayOnOrAfter(date, week));
  const step = days < 0 ? -DAY : DAY;
  for (let moved = 0; moved < Math.abs(days); ) {
    time += step;
    if (week.includes(new Date(time).getUTCDay())) moved += 1;
  }
  return iso(time);
}

/** How many school days fall from one date up to (but not counting) another. Negative when it's earlier. */
function schoolDaysBetween(from: string, to: string, weekdays: number[]): number {
  const a = at(from);
  const b = at(to);
  if (a === b) return 0;
  const back = b < a;
  const low = back ? b : a;
  const total = Math.round((back ? a - b : b - a) / DAY);
  const weeks = Math.floor(total / 7);
  let count = weeks * weekdays.length;
  const first = new Date(low).getUTCDay();
  for (let step = weeks * 7; step < total; step++) if (weekdays.includes((first + step) % 7)) count += 1;
  return back ? -count : count;
}

/** Which day of the cycle a date is, or null when school isn't in session that day. */
export function rotationDayOn(rotation: Rotation, date: string): number | null {
  if (!usableRotation(rotation)) return null;
  const week = schoolWeek(rotation.weekdays);
  if (!week.includes(weekdayOf(date))) return null;
  const anchor = schoolDayOnOrAfter(rotation.anchor, week);
  const moved = schoolDaysBetween(anchor, date, week);
  return ((moved % rotation.length) + rotation.length) % rotation.length;
}

/**
 * Puts the cycle right from what the student says today actually is. A day off that nobody
 * recorded pushes the whole cycle along, and this is the one-tap fix for it.
 */
export function reanchor(rotation: Rotation, date: string, day: number): Rotation {
  const week = schoolWeek(rotation.weekdays);
  const start = schoolDayOnOrAfter(date, week);
  return { ...rotation, anchor: shiftSchoolDays(start, -day, week) };
}

/** Every date in a range on which a class meeting on these cycle days would happen. */
export function rotationDates(rotation: Rotation, start: string, end: string, days: number[], limit = 400): string[] {
  if (!usableRotation(rotation) || !days.length) return [];
  const wanted = new Set(days);
  const dates: string[] = [];
  const last = at(end);
  for (let time = at(start); time <= last && dates.length < limit; time += DAY) {
    const date = iso(time);
    const day = rotationDayOn(rotation, date);
    if (day !== null && wanted.has(day)) dates.push(date);
  }
  return dates;
}
