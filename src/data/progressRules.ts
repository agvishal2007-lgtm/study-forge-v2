import type { StudyDay } from './types';

/** Streaks and study counts. This file only calculates, so it can be tested directly. */
const pad = (value: number) => String(value).padStart(2, '0');
export const dayOf = (at: number) => {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const dayNumber = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
};
const fromNumber = (value: number) => {
  const date = new Date(value * 86_400_000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

export interface Streaks {
  current: number;
  longest: number;
  studiedToday: boolean;
}

/** Today not being done yet doesn't break a streak, because the day isn't over. */
export function streaksFrom(days: Set<string>, today: string): Streaks {
  const numbers = [...days].map(dayNumber).sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  numbers.forEach((value, index) => {
    run = index > 0 && value === numbers[index - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  const studiedToday = days.has(today);
  let current = 0;
  const known = new Set(numbers);
  for (let at = dayNumber(today) - (studiedToday ? 0 : 1); known.has(at); at--) current++;
  return { current, longest, studiedToday };
}

/** The last weeks as columns, Sunday first, ending with the week holding today. Days after today are null. */
export function activityWeeks(today: string, weeks: number): (string | null)[][] {
  const end = dayNumber(today);
  const weekday = ((end % 7) + 11) % 7;
  const start = end - weekday - (weeks - 1) * 7;
  return Array.from({ length: weeks }, (_, week) => Array.from({ length: 7 }, (_, day) => {
    const value = start + week * 7 + day;
    return value <= end ? fromNumber(value) : null;
  }));
}

export const lastDays = (today: string, count: number) => Array.from({ length: count }, (_, index) => fromNumber(dayNumber(today) - index));

/** Adds up what every device saw, day by day. */
export function totalsByDay(days: StudyDay[]): Map<string, { cards: number; lessons: number }> {
  const totals = new Map<string, { cards: number; lessons: number }>();
  for (const day of days) {
    const total = totals.get(day.date) ?? { cards: 0, lessons: 0 };
    totals.set(day.date, { cards: total.cards + day.cards, lessons: total.lessons + day.lessons });
  }
  return totals;
}
