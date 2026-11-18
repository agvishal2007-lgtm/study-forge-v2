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
  /**
   * What the school calls its days, in cycle order. Schools don't all say "A day": some count
   * Day 1 to Day 6, some use colours like Maroon and Gold. Missing or blank falls back to letters,
   * so a student who never touches this still gets something sensible.
   */
  names?: string[];
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

/** The three ways schools name their days, offered so nobody has to type six names by hand. */
export type DayStyle = 'letters' | 'numbers' | 'custom';

/** Day names for a style: letters A, B, C…, numbers Day 1, Day 2…, or whatever was typed. */
export function dayNames(style: DayStyle, length: number, typed: string[] = []): string[] {
  const count = Math.max(2, Math.min(length, ROTATION_MAX));
  return Array.from({ length: count }, (_, day) =>
    style === 'numbers' ? `Day ${day + 1}` : style === 'custom' ? (typed[day] ?? '') : rotationLabel(day),
  );
}

/**
 * What to call a cycle day on screen. The school's own word wins; a blank one falls back to the
 * letter rather than showing an empty space, because half-finished setup shouldn't look broken.
 */
export const dayLabel = (rotation: Rotation | null | undefined, day: number): string =>
  rotation?.names?.[day]?.trim() || rotationLabel(day);

/**
 * Whether a class meets on a cycle day. A class with no days chosen meets every day, which is
 * both the honest reading of "not set up yet" and what a class in a plain schedule does.
 * This is also what covers rotate-and-drop schedules, where a class skips one day of the cycle:
 * the student leaves that one day unticked and nothing else has to understand "dropping".
 */
export function meetsOnDay(meetsOn: number[] | undefined | null, day: number | null): boolean {
  if (day === null) return false;
  if (!meetsOn || meetsOn.length === 0) return true;
  return meetsOn.includes(day);
}

/** The classes that meet on a cycle day, in the order they were given. */
export function classesOnDay<T extends { meetsOn?: number[] }>(courses: T[], day: number | null): T[] {
  if (day === null) return [];
  return courses.filter((course) => meetsOnDay(course.meetsOn, day));
}

/** Tidies chosen days: real cycle days only, no repeats, in order. Every day chosen means "all". */
export function tidyMeetsOn(days: number[] | undefined, length: number): number[] {
  const kept = [...new Set((days ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day < length))].sort((a, b) => a - b);
  return kept.length === length ? [] : kept;
}

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
export function rotationDayOn(rotation: Rotation, date: string, skipDates: string[] = []): number | null {
  if (!usableRotation(rotation)) return null;
  const week = schoolWeek(rotation.weekdays);
  if (!week.includes(weekdayOf(date))) return null;
  const anchor = schoolDayOnOrAfter(rotation.anchor, week);
  let moved = schoolDaysBetween(anchor, date, week);
  // Days the student said didn't move the cycle along — a field trip, an assembly schedule, a
  // closure — are taken back out of the count, so the letter after one of them is the letter the
  // school actually used instead of one that has quietly slipped by a day.
  if (skipDates.length > 0) {
    const low = anchor <= date ? anchor : date;
    const high = anchor <= date ? date : anchor;
    const skipped = new Set(
      skipDates.filter((day) => day >= low && day < high && week.includes(weekdayOf(day))),
    ).size;
    moved += moved >= 0 ? -skipped : skipped;
  }
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
