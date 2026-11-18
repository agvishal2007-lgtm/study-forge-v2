/*
 * A student's actual daily schedule, as a grid they fill in themselves.
 *
 * There is deliberately no template here. Schools differ wildly: six blocks with lunch in the
 * middle, four then two, a class that sits in first block on one day and second block on the next
 * and drops on the third, an advisory period, a plain schedule that never changes. Rather than
 * guess at any of those, this holds an empty grid — the periods a student says their day has,
 * crossed with the days of their cycle — and lets them put whatever they like in each slot.
 *
 * An empty slot is a real answer: a free period, a lunch, or the day a class rotates off.
 * Everything else the app shows about a day is worked out from this grid, so nothing has to be
 * kept in step by hand.
 */

/** When a block runs. Both sides are free text from a time field, and either may be blank. */
export interface BlockTime {
  start: string;
  end: string;
}

export interface Timetable {
  /** What the student calls each period, in the order they happen. Any length. */
  periodNames: string[];
  /**
   * What is in each slot: days[day][period] is a course id, or '' for nothing. Each row is as
   * long as periodNames, and there is one row per day of the cycle.
   */
  days: string[][];
  /**
   * When each block runs: times[day][period]. Nothing about length is assumed — a block may be
   * thirty minutes, an hour, two hours, or left blank entirely — and a day may run on different
   * times from the rest, which is what a late start or an assembly schedule does.
   */
  times?: BlockTime[][];
  /**
   * Whether every day runs the same times. True is the common case and is what the screen offers
   * first, but it is a statement the student makes rather than something taken for granted.
   */
  sameTimes?: boolean;
}

/** A period and what is in it on a particular day. */
export interface Slot {
  /** Which period of the day, counting from 0. */
  period: number;
  name: string;
  /** When it runs, when the student has said. */
  time: BlockTime | null;
  /** The course in it, or '' for a free period, lunch, or a class that has rotated off. */
  courseId: string;
}

export const MAX_PERIODS = 12;

/** An empty grid: the student's own periods, nothing filled in. */
export const blankTime = (): BlockTime => ({ start: '', end: '' });

export const blankTimetable = (periodNames: string[], cycleLength: number): Timetable => ({
  periodNames: [...periodNames],
  days: Array.from({ length: Math.max(1, cycleLength) }, () => periodNames.map(() => '')),
  times: Array.from({ length: Math.max(1, cycleLength) }, () => periodNames.map(blankTime)),
  sameTimes: true,
});

/** True when the student has actually put something in the grid. */
export const timetableUsed = (table: Timetable | null | undefined): boolean =>
  Boolean(table && table.days.some((day) => day.some((slot) => slot !== '')));

/**
 * Reshapes a grid for a different number of periods or days without losing what was filled in.
 * Changing the cycle length or adding a block should never wipe a schedule someone typed out.
 */
export function resizeTimetable(table: Timetable, periods: number, cycleLength: number): Timetable {
  const count = Math.max(1, Math.min(periods, MAX_PERIODS));
  const periodNames = Array.from({ length: count }, (_, index) => table.periodNames[index] ?? '');
  const days = Array.from({ length: Math.max(1, cycleLength) }, (_, day) =>
    Array.from({ length: count }, (_, period) => table.days[day]?.[period] ?? ''),
  );
  const times = Array.from({ length: Math.max(1, cycleLength) }, (_, day) =>
    Array.from({ length: count }, (_, period) => table.times?.[day]?.[period] ?? blankTime()),
  );
  return { ...table, periodNames, days, times };
}

/** What a period is called. A name the student left blank reads as its number, never as blank. */
export const periodName = (table: Timetable, period: number): string =>
  table.periodNames[period]?.trim() || `Period ${period + 1}`;

/** When a block runs on a day, or null when nothing has been said about it. */
export function blockTime(table: Timetable, day: number, period: number): BlockTime | null {
  const row = table.sameTimes ? table.times?.[0] : table.times?.[day];
  const found = row?.[period];
  if (!found || (!found.start.trim() && !found.end.trim())) return null;
  return found;
}

/**
 * Sets a block's time. With one set of times for every day it is written to every day at once, so
 * the student never has to type the same bell schedule out five times.
 */
export function setBlockTime(table: Timetable, day: number, period: number, time: BlockTime): Timetable {
  const base = table.times ?? table.days.map((row) => row.map(blankTime));
  const times = base.map((row, dayIndex) =>
    row.map((current, periodIndex) =>
      periodIndex === period && (table.sameTimes || dayIndex === day) ? { ...time } : current,
    ),
  );
  return { ...table, times };
}

/**
 * How long a block runs, in plain words, worked out from the two times rather than assumed. A time
 * pair that doesn't make sense returns null instead of a negative length.
 */
export function blockLength(time: BlockTime | null): string | null {
  if (!time) return null;
  const parse = (value: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours > 23 || minutes > 59 ? null : hours * 60 + minutes;
  };
  const from = parse(time.start);
  const to = parse(time.end);
  if (from === null || to === null || to <= from) return null;
  const total = to - from;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

/**
 * A day as it actually happens: every period in order, with whatever is in it. Courses that no
 * longer exist are treated as empty rather than left as a dangling id, so deleting a class can
 * never put a ghost in someone's timetable.
 */
export function daySlots(table: Timetable, day: number | null, courseIds: string[] = []): Slot[] {
  if (day === null || !table.days[day]) return [];
  const known = new Set(courseIds);
  return table.days[day].map((courseId, period) => ({
    period,
    name: periodName(table, period),
    time: blockTime(table, day, period),
    courseId: courseId && (known.size === 0 || known.has(courseId)) ? courseId : '',
  }));
}

/** Just the periods that have a class in them, for a day's summary. */
export const classSlots = (table: Timetable, day: number | null, courseIds: string[] = []): Slot[] =>
  daySlots(table, day, courseIds).filter((slot) => slot.courseId !== '');

/**
 * Which days of the cycle a class appears on, worked out from the grid. This is what replaces
 * ticking days by hand once a grid exists: the schedule is the single source of it.
 */
export function daysForCourse(table: Timetable, courseId: string): number[] {
  if (!courseId) return [];
  return table.days.map((day, index) => (day.includes(courseId) ? index : -1)).filter((index) => index >= 0);
}

/**
 * Puts a class in a slot. Nothing stops the same class appearing twice in one day — team-taught
 * doubles and lab blocks are real — but this does report it so the screen can mention it rather
 * than quietly allowing what is usually a typo.
 */
export function setSlot(table: Timetable, day: number, period: number, courseId: string): { table: Timetable; repeated: boolean } {
  const days = table.days.map((row, index) =>
    index === day ? row.map((slot, place) => (place === period ? courseId : slot)) : row,
  );
  const repeated = courseId !== '' && (days[day]?.filter((slot) => slot === courseId).length ?? 0) > 1;
  return { table: { ...table, days }, repeated };
}

/** Renames a period, keeping everything in it. */
export const renamePeriod = (table: Timetable, period: number, name: string): Timetable => ({
  ...table,
  periodNames: table.periodNames.map((current, index) => (index === period ? name : current)),
});

/** Removes a period from every day. */
export function removePeriod(table: Timetable, period: number): Timetable {
  if (table.periodNames.length <= 1) return table;
  return {
    periodNames: table.periodNames.filter((_, index) => index !== period),
    days: table.days.map((day) => day.filter((_, index) => index !== period)),
  };
}

/** Adds an empty period at the end of every day. */
export function addPeriod(table: Timetable, name = ''): Timetable {
  if (table.periodNames.length >= MAX_PERIODS) return table;
  return { periodNames: [...table.periodNames, name], days: table.days.map((day) => [...day, '']) };
}

/**
 * Copies one day's whole arrangement onto another. A rotating schedule is often one day's order
 * shifted along, and typing six slots out five more times by hand is how people give up.
 */
export const copyDay = (table: Timetable, from: number, to: number): Timetable => ({
  ...table,
  days: table.days.map((day, index) => (index === to ? [...(table.days[from] ?? day)] : day)),
});

/**
 * Shifts a day's arrangement along by a number of places, wrapping round. This is the move a
 * rotate-and-drop schedule makes: first block becomes second, second becomes third, and what
 * falls off the end comes back at the start. It is offered, never applied on its own.
 */
export function rotateDay(table: Timetable, from: number, to: number, by = 1): Timetable {
  const source = table.days[from];
  if (!source || source.length === 0) return table;
  const size = source.length;
  const shift = ((by % size) + size) % size;
  const moved = source.map((_, index) => source[(index - shift + size) % size]);
  return { ...table, days: table.days.map((day, index) => (index === to ? moved : day)) };
}
