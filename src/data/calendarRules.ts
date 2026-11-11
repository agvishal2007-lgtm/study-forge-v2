import { readEventDetails, type EventDetails } from './eventDetails.ts';
import type { CalendarEvent, CalendarKind, PlannerType } from './types';

/** The calendar's date rules and sorting. This file only calculates, so it can be tested directly. */
const pad = (value: number) => String(value).padStart(2, '0');
const parts = (date: string) => date.split('-').map(Number);
export const dayNumber = (date: string) => {
  const [year, month, day] = parts(date);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
};
export const fromDayNumber = (value: number) => {
  const date = new Date(value * 86_400_000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};
export const addDays = (date: string, days: number) => fromDayNumber(dayNumber(date) + days);
/** 0 is Sunday. */
export const weekdayOf = (date: string) => ((dayNumber(date) % 7) + 11) % 7;

export const monthOf = (date: string) => date.slice(0, 7);
export function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split('-').map(Number);
  const value = new Date(Date.UTC(year, number - 1 + by, 1));
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}`;
}

/** Whole weeks, Sunday first, that cover the month. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const start = addDays(first, -weekdayOf(first));
  const nextMonth = `${shiftMonth(month, 1)}-01`;
  const weeks: string[][] = [];
  for (let at = start; at < nextMonth; at = addDays(at, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(at, index)));
  }
  return weeks;
}

export const formatTime = (time: string) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${pad(minutes)} ${hours >= 12 ? 'PM' : 'AM'}`;
};

export function describeTime(event: Pick<CalendarEvent, 'startTime' | 'endTime'>): string {
  if (!event.startTime) return 'All day';
  return event.endTime ? `${formatTime(event.startTime)} to ${formatTime(event.endTime)}` : formatTime(event.startTime);
}

/** How long it takes, or null when that isn't known. */
export function minutesOf(event: Pick<CalendarEvent, 'startTime' | 'endTime'>): number | null {
  if (!event.startTime || !event.endTime) return null;
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const length = toMinutes(event.endTime) - toMinutes(event.startTime);
  return length > 0 ? length : null;
}

/** All-day items first, then by time, then by name. */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
  return a.title.localeCompare(b.title);
}

export const visibleEvents = (events: CalendarEvent[]) => events.filter((event) => !event.hidden);

/** Today's unfinished items in order. An item that has ended stays until the student marks it, since it may not have happened. */
export const todaysPlan = (events: CalendarEvent[], today: string) => visibleEvents(events)
  .filter((event) => event.date === today && !event.completed && event.kind !== 'No classes')
  .sort(compareEvents);

export const noClassesOn = (events: CalendarEvent[], date: string) => visibleEvents(events).filter((event) => event.date === date && event.kind === 'No classes');

/** Every date a weekly class meets, from the first date through the last. */
export function weeklyDates(start: string, end: string, days: number[], limit = 400): string[] {
  const found: string[] = [];
  if (days.length === 0 || start > end) return found;
  for (let at = start; at <= end && found.length < limit; at = addDays(at, 1)) {
    if (days.includes(weekdayOf(at))) found.push(at);
  }
  return found;
}

/** A short, steady id for something that came from outside, so bringing it in again updates it instead of copying it. */
export function stableId(prefix: string, ...pieces: string[]): string {
  const text = pieces.join('\u0000');
  let first = 0x811c9dc5;
  let second = 0x1b873593;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x5bd1e995);
  }
  return `${prefix}-${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

/* Google Calendar */
export interface GoogleItem {
  /** One meeting or item. */
  key: string;
  /** Shared by every meeting of a repeating event. */
  seriesKey: string;
  calendarId: string;
  calendarName: string;
  title: string;
  description: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
  repeats: boolean;
  cancelled: boolean;
  /** Meeting links, other links, notes, attachments and the rest, from every place Google keeps them. */
  details: EventDetails;
}

const localParts = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
};

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Turns one event from Google into our shape. An all-day event over several days becomes one item for each day. */
export function fromGoogleEvent(raw: any, calendarId: string, calendarName: string): GoogleItem[] {
  if (!raw || typeof raw.id !== 'string') return [];
  const base = {
    seriesKey: `${calendarId}|${raw.recurringEventId || raw.id}`,
    calendarId,
    calendarName,
    title: String(raw.summary ?? '').trim() || '(No title)',
    description: String(raw.description ?? ''),
    location: String(raw.location ?? ''),
    repeats: Boolean(raw.recurringEventId),
    cancelled: raw.status === 'cancelled',
    // Read per occurrence: a changed occurrence of a repeating event can have its own link.
    details: readEventDetails(raw),
  };
  const key = `${calendarId}|${raw.id}`;
  if (raw.start?.date) {
    const end = raw.end?.date && raw.end.date > raw.start.date ? raw.end.date : addDays(raw.start.date, 1);
    const days = Math.min(dayNumber(end) - dayNumber(raw.start.date), 31);
    return Array.from({ length: days }, (_, index) => ({
      ...base,
      key: index === 0 ? key : `${key}|${index}`,
      date: addDays(raw.start.date, index),
      startTime: '',
      endTime: '',
    }));
  }
  const start = raw.start?.dateTime ? localParts(raw.start.dateTime) : null;
  if (!start) {
    // Google leaves the time off a cancelled meeting, and the key is all that's needed to remove it.
    return base.cancelled ? [{ ...base, key, date: '', startTime: '', endTime: '' }] : [];
  }
  const end = raw.end?.dateTime ? localParts(raw.end.dateTime) : null;
  return [{ ...base, key, date: start.date, startTime: start.time, endTime: end && end.date === start.date && end.time > start.time ? end.time : '' }];
}

export type Destination = CalendarKind | 'Deadline' | 'Skip';

const looksLikeWork = /\b(due|quiz(zes)?|exams?|tests?|midterms?|finals?|homework|hw|assignments?|papers?|essays?|projects?|presentations?|discussions?|submissions?|readings?|reports?)\b/i;
const looksLikeClass = /\b(class|lecture|lab|recitation|seminar)\b/i;
const looksLikeAppointment = /\b(tutoring|tutor|advising|advisor|adviser|office hours?|appointment|interview|doctor|dentist)\b/i;
const looksLikeNoClass = /\b(no class(es)?|breaks?|recess|holiday|reading days?|campus closed)\b/i;
const COURSE_TOKEN = /\b([A-Z]{2,5})[\s-]?(\d{3}[A-Z]?)\b/;
const BRACKET_TAG = /\s*\[[^\]]*\]\s*$/;

/** Canvas ends its titles with a tag such as [1268-ECO231-03]. */
const hasCanvasTag = (title: string) => BRACKET_TAG.test(title) && COURSE_TOKEN.test(title.match(BRACKET_TAG)?.[0] ?? '');
export const fromCanvas = (item: Pick<GoogleItem, 'title' | 'calendarName'>) => hasCanvasTag(item.title) || /canvas/i.test(item.calendarName);
export const cleanTitle = (title: string) => (hasCanvasTag(title) ? title.replace(BRACKET_TAG, '').trim() || title : title);

/** The course a title names, such as ECO 231, if it names one. */
export function courseTokenIn(title: string): string {
  const tag = title.match(BRACKET_TAG)?.[0] ?? '';
  const found = tag.match(COURSE_TOKEN) ?? title.match(COURSE_TOKEN);
  return found ? `${found[1]} ${found[2]}` : '';
}

/** A first guess at where something belongs. The student checks this before anything is saved. */
export function guessDestination(item: Pick<GoogleItem, 'title' | 'calendarName' | 'startTime' | 'repeats'>): Destination {
  if (!item.startTime && looksLikeNoClass.test(item.title)) return 'No classes';
  if (fromCanvas(item) || looksLikeWork.test(item.title)) return 'Deadline';
  if (looksLikeAppointment.test(item.title)) return 'Appointment';
  if (looksLikeClass.test(item.title) || (item.repeats && courseTokenIn(item.title))) return 'Class';
  return 'Event';
}

export function guessPlannerType(title: string): PlannerType {
  if (/\bquiz/i.test(title)) return 'Quiz';
  if (/\b(exam|test|midterm|final)/i.test(title)) return 'Exam';
  if (/\bproject/i.test(title)) return 'Project';
  if (/\bpresentation/i.test(title)) return 'Presentation';
  if (/\breading/i.test(title)) return 'Reading';
  return 'Assignment';
}

const squeeze = (text: string) => text.replace(/[\s-]/g, '').toLowerCase();

/** Finds the course a token belongs to, going by its code or its name. */
export function matchCourse<T extends { id: string; name: string; code: string }>(token: string, courses: T[]): T | undefined {
  if (!token) return undefined;
  const wanted = squeeze(token);
  return courses.find((course) => squeeze(course.code) === wanted) ?? courses.find((course) => squeeze(course.name).includes(wanted));
}
