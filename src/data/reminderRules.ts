/*
 * Reminders, and the quiet hours that hold them back.
 *
 * An honest limit first, because it shapes everything here: a website cannot be relied on to
 * deliver a notification while it is closed. Study Forge checks what is due whenever it is open,
 * and shows anything that came due while it wasn't. So a reminder is a reliable prompt when the
 * student next opens Study Forge, and nothing stronger. The app says exactly that rather than
 * implying an alarm clock.
 *
 * This file only calculates, so it can be tested directly.
 */
export type Repeat = 'once' | 'daily' | 'weekdays' | 'weekly' | 'hourly';
export const REPEATS: Repeat[] = ['once', 'daily', 'weekdays', 'weekly', 'hourly'];

export const REPEAT_LABEL: Record<Repeat, string> = {
  once: 'Once',
  daily: 'Every day',
  weekdays: 'Every weekday',
  weekly: 'Every week',
  hourly: 'Every hour, within a window',
};

export interface Reminder {
  id: string;
  /** What it says when it appears. */
  text: string;
  repeat: Repeat;
  /** When it is due, as YYYY-MM-DDTHH:MM in the student's own time. */
  at: string;
  /** For the hourly kind, the window it may appear in, as HH:MM. Ignored otherwise. */
  fromTime: string;
  toTime: string;
  /** Paused reminders keep their place and simply don't come due. */
  paused: boolean;
  /** When it last came due and was shown, so the same one isn't shown twice. */
  lastShown: string;
  createdAt: number;
  updatedAt: number;
}

export interface QuietHours {
  on: boolean;
  /** HH:MM. A start later than the end means it runs through midnight, which is the usual case. */
  start: string;
  end: string;
  /** Days of the week it applies to. 0 is Sunday. */
  days: number[];
}

export const DEFAULT_QUIET: QuietHours = { on: false, start: '22:00', end: '08:00', days: [0, 1, 2, 3, 4, 5, 6] };

const minutes = (time: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
};

/**
 * True when a moment falls inside quiet hours. A window that starts later than it ends runs
 * through midnight, and the day it belongs to is the day it started — so 10pm to 8am chosen for
 * Monday covers Monday night into Tuesday morning, which is what a student means by it.
 */
export function inQuietHours(quiet: QuietHours, when: Date): boolean {
  if (!quiet.on) return false;
  const start = minutes(quiet.start);
  const end = minutes(quiet.end);
  if (start === null || end === null || start === end) return false;
  const now = when.getHours() * 60 + when.getMinutes();
  const today = when.getDay();
  const yesterday = (today + 6) % 7;
  if (start < end) return quiet.days.includes(today) && now >= start && now < end;
  // Through midnight: the evening part belongs to today, the morning part to the day before.
  if (now >= start) return quiet.days.includes(today);
  if (now < end) return quiet.days.includes(yesterday);
  return false;
}

const pad = (value: number) => String(value).padStart(2, '0');
export const stamp = (when: Date): string =>
  `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`;

/** Reads a YYYY-MM-DDTHH:MM written in the student's own time. Null when it makes no sense. */
export function readStamp(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number) as unknown as number[];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const made = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(made.getTime()) ? null : made;
}

/**
 * When a reminder is next due, at or after a moment. Null when it never will be again, which is
 * only true of a one-off that has passed and been shown.
 *
 * Everything is worked out from local wall-clock time, so a clock change for daylight saving
 * moves a daily reminder with it rather than dragging it an hour out.
 */
export function nextDue(reminder: Reminder, from: Date): Date | null {
  const at = readStamp(reminder.at);
  if (!at || reminder.paused) return null;
  if (reminder.repeat === 'once') return at >= from ? at : null;

  if (reminder.repeat === 'hourly') {
    const start = minutes(reminder.fromTime);
    const end = minutes(reminder.toTime);
    if (start === null || end === null || end <= start) return null;
    const minute = at.getMinutes();
    for (let day = 0; day <= 1; day++) {
      const base = new Date(from.getFullYear(), from.getMonth(), from.getDate() + day, 0, minute, 0, 0);
      for (let hour = Math.floor(start / 60); hour * 60 <= end; hour++) {
        const candidate = new Date(base);
        candidate.setHours(hour);
        if (candidate.getHours() * 60 + minute >= start && candidate.getHours() * 60 + minute <= end && candidate >= from) return candidate;
      }
    }
    return null;
  }

  const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate(), at.getHours(), at.getMinutes(), 0, 0);
  const step = (date: Date) => {
    if (reminder.repeat === 'weekly') date.setDate(date.getDate() + 7);
    else date.setDate(date.getDate() + 1);
  };
  if (reminder.repeat === 'weekly') {
    // Keep the weekday the student chose.
    while (candidate.getDay() !== at.getDay()) candidate.setDate(candidate.getDate() + 1);
  }
  // Up to a fortnight ahead is plenty to find the next one of any of these patterns.
  for (let tries = 0; tries < 16; tries++) {
    const skipped = reminder.repeat === 'weekdays' && (candidate.getDay() === 0 || candidate.getDay() === 6);
    if (!skipped && candidate >= from && candidate >= at) return new Date(candidate);
    step(candidate);
  }
  return null;
}

/**
 * The reminders to show now: due at or before this moment, not already shown for that moment, and
 * not inside quiet hours. A reminder held back by quiet hours is not lost — it simply stays due,
 * and appears once the quiet is over, which is the behaviour the spec asked to be explicit about.
 */
export function dueNow(reminders: Reminder[], quiet: QuietHours, now: Date): Reminder[] {
  if (inQuietHours(quiet, now)) return [];
  return reminders.filter((reminder) => {
    if (reminder.paused) return false;
    // Something is due if its own moment has arrived, or a repeat of it has.
    const own = readStamp(reminder.at);
    if (!own) return false;
    if (own > now) return false;
    const last = reminder.lastShown ? readStamp(reminder.lastShown) : null;
    if (reminder.repeat === 'once') return !last;
    // For a repeat, work out the most recent occurrence at or before now.
    const previous = lastOccurrence(reminder, now);
    if (!previous) return false;
    return !last || last < previous;
  });
}

/** The most recent time this reminder came due, at or before a moment. */
export function lastOccurrence(reminder: Reminder, now: Date): Date | null {
  const at = readStamp(reminder.at);
  if (!at || at > now) return null;
  if (reminder.repeat === 'once') return at;
  // Step back a day at a time from now, which covers every pattern here within a fortnight.
  for (let back = 0; back < 16; back++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    if (reminder.repeat === 'hourly') {
      const start = minutes(reminder.fromTime);
      const end = minutes(reminder.toTime);
      if (start === null || end === null) return null;
      for (let hour = Math.floor(end / 60); hour >= Math.floor(start / 60); hour--) {
        const candidate = new Date(day);
        candidate.setHours(hour, at.getMinutes(), 0, 0);
        const spot = candidate.getHours() * 60 + candidate.getMinutes();
        if (spot >= start && spot <= end && candidate <= now && candidate >= at) return candidate;
      }
      continue;
    }
    const candidate = new Date(day);
    candidate.setHours(at.getHours(), at.getMinutes(), 0, 0);
    if (candidate > now || candidate < at) continue;
    if (reminder.repeat === 'weekdays' && (candidate.getDay() === 0 || candidate.getDay() === 6)) continue;
    if (reminder.repeat === 'weekly' && candidate.getDay() !== at.getDay()) continue;
    return candidate;
  }
  return null;
}

/** Plain words for when a reminder next comes, or why it doesn't. */
export function describeNext(reminder: Reminder, now: Date): string {
  if (reminder.paused) return 'Paused';
  const next = nextDue(reminder, now);
  if (!next) return reminder.repeat === 'once' ? 'Already passed' : 'Not set up properly';
  const sameDay = next.toDateString() === now.toDateString();
  const time = `${next.getHours() % 12 || 12}:${pad(next.getMinutes())} ${next.getHours() < 12 ? 'am' : 'pm'}`;
  if (sameDay) return `Next at ${time} today`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (next.toDateString() === tomorrow.toDateString()) return `Next at ${time} tomorrow`;
  return `Next on ${next.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`;
}
