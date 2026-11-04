import { getDb, notifyChanged } from './db';
import { cleanTitle, courseTokenIn, fromCanvas, guessDestination, guessPlannerType, matchCourse, stableId, type Destination, type GoogleItem } from './calendarRules';
import { createCourse, listCourses } from './store';
import type { CalendarEvent, CalendarKind, Course, PlannerItem } from './types';

export const listCalendarEvents = async (): Promise<CalendarEvent[]> => (await getDb()).getAll('calendarEvents');
export const getCalendarEvent = async (id: string) => (await getDb()).get('calendarEvents', id);

const later = (previous?: number) => Math.max(Date.now(), (previous ?? 0) + 1);

export async function saveCalendarEvents(events: (Omit<CalendarEvent, 'createdAt' | 'updatedAt'> & { createdAt?: number })[]): Promise<void> {
  const tx = (await getDb()).transaction('calendarEvents', 'readwrite');
  for (const event of events) {
    const current = await tx.store.get(event.id);
    const updatedAt = later(current?.updatedAt);
    await tx.store.put({ ...event, createdAt: current?.createdAt ?? event.createdAt ?? updatedAt, updatedAt });
  }
  await tx.done;
  notifyChanged();
}

export async function setEventCompleted(id: string, completed: boolean): Promise<void> {
  const tx = (await getDb()).transaction('calendarEvents', 'readwrite');
  const event = await tx.store.get(id);
  if (!event) throw new Error('This item no longer exists.');
  await tx.store.put({ ...event, completed, updatedAt: later(event.updatedAt) });
  await tx.done;
  notifyChanged();
}

/** Something from Google is hidden rather than deleted, or getting the latest would bring it right back. */
export async function removeCalendarEvents(ids: string[]): Promise<void> {
  const tx = (await getDb()).transaction('calendarEvents', 'readwrite');
  for (const id of ids) {
    const event = await tx.store.get(id);
    if (!event) continue;
    if (event.source === 'google') await tx.store.put({ ...event, hidden: true, updatedAt: later(event.updatedAt) });
    else await tx.store.delete(id);
  }
  await tx.done;
  notifyChanged();
}

/** Finds a course by its code, or adds it. */
export async function courseForCode(code: string, name: string): Promise<Course> {
  const found = matchCourse(code, await listCourses());
  return found ?? createCourse(name || code, code);
}

/* The class schedule */
export interface NewClass {
  title: string;
  courseId: string | null;
  days: number[];
  startTime: string;
  endTime: string;
  location: string;
  dates: string[];
}

/** Saving the same class again updates it. A meeting Google already brought in isn't added twice. */
export async function saveClasses(classes: NewClass[]): Promise<{ added: number; updated: number; alreadyThere: number }> {
  const tx = (await getDb()).transaction('calendarEvents', 'readwrite');
  const report = { added: 0, updated: 0, alreadyThere: 0 };
  const all = await tx.store.getAll();
  for (const item of classes) {
    const seriesId = stableId('class', item.title, item.days.join(), item.startTime);
    for (const date of item.dates) {
      if (item.courseId && all.some((event) => event.source === 'google' && !event.hidden && event.kind === 'Class' && event.date === date && event.startTime === item.startTime && event.courseId === item.courseId)) {
        report.alreadyThere += 1;
        continue;
      }
      const id = stableId('class', item.title, date, item.startTime);
      const current = await tx.store.get(id);
      await tx.store.put({
        id,
        title: item.title,
        courseId: item.courseId,
        kind: 'Class',
        date,
        startTime: item.startTime,
        endTime: item.endTime,
        location: item.location,
        whatToDo: current?.whatToDo ?? '',
        priority: current?.priority ?? 'Normal',
        completed: current?.completed ?? false,
        seriesId,
        plannerItemId: null,
        source: 'schedule',
        sourceCalendar: '',
        hidden: false,
        createdAt: current?.createdAt ?? Date.now(),
        updatedAt: later(current?.updatedAt),
      });
      if (current) report.updated += 1;
      else report.added += 1;
    }
  }
  await tx.done;
  notifyChanged();
  return report;
}

/* Google Calendar */
export interface CalendarChoice {
  destination: Destination;
  courseId: string | null;
}

export interface GoogleConnection {
  calendars: { id: string; name: string }[];
  lastSync: number | null;
  /** What the student decided for each repeating event. */
  choices: Record<string, CalendarChoice>;
}

const CONNECTION_KEY = 'googleCalendar';

export const getGoogleConnection = async () => ((await getDb()).get('meta', CONNECTION_KEY) as Promise<GoogleConnection | undefined>);
export async function saveGoogleConnection(connection: GoogleConnection): Promise<void> {
  await (await getDb()).put('meta', connection, CONNECTION_KEY);
  notifyChanged();
}
export async function clearGoogleConnection(removeEvents: boolean): Promise<number> {
  const db = await getDb();
  await db.delete('meta', CONNECTION_KEY);
  let removed = 0;
  if (removeEvents) {
    const tx = db.transaction('calendarEvents', 'readwrite');
    for (const event of await tx.store.getAll()) {
      if (event.source === 'google') {
        await tx.store.delete(event.id);
        if (!event.hidden) removed += 1;
      }
    }
    await tx.done;
  }
  notifyChanged();
  return removed;
}

export interface GoogleReport {
  added: number;
  updated: number;
  removed: number;
  deadlinesAdded: number;
  deadlinesUpdated: number;
}

/** The first guess for one repeating event, or what the student chose before. */
export function choiceFor(item: GoogleItem, choices: Record<string, CalendarChoice>, courses: Course[]): CalendarChoice {
  return choices[item.seriesKey] ?? { destination: guessDestination(item), courseId: matchCourse(courseTokenIn(item.title), courses)?.id ?? null };
}

/**
 * Brings in the latest from the chosen calendars. Items keep what the student changed: course, type, notes, and whether they're done.
 * A deadline that disappears from Google stays in the Planner, because the student may have started it.
 */
export async function applyGoogleItems(items: GoogleItem[], choices: Record<string, CalendarChoice>, window: { from: string; to: string }, today: string, calendarIds: string[]): Promise<GoogleReport> {
  const courses = await listCourses();
  const db = await getDb();
  const tx = db.transaction(['calendarEvents', 'plannerItems'], 'readwrite');
  const events = tx.objectStore('calendarEvents');
  const planner = tx.objectStore('plannerItems');
  const report: GoogleReport = { added: 0, updated: 0, removed: 0, deadlinesAdded: 0, deadlinesUpdated: 0 };
  const existing = await events.getAll();
  const seen = new Set<string>();

  for (const item of items) {
    const id = stableId('g', item.key);
    const plannerId = stableId('gd', item.key);
    if (item.cancelled) {
      const current = await events.get(id);
      if (current) {
        await events.delete(id);
        if (!current.hidden) report.removed += 1;
      }
      continue;
    }
    const choice = choiceFor(item, choices, courses);
    if (choice.destination === 'Skip') {
      const current = await events.get(id);
      if (current) {
        await events.delete(id);
        if (!current.hidden) report.removed += 1;
      }
      continue;
    }
    const title = cleanTitle(item.title);
    if (choice.destination === 'Deadline') {
      const current = await planner.get(plannerId);
      const removedBefore = await events.getKey(`removed-${plannerId}`);
      if (current) {
        if (current.title !== title || current.dueDate !== item.date || current.dueTime !== item.startTime) {
          await planner.put({ ...current, title, dueDate: item.date, dueTime: item.startTime, updatedAt: later(current.updatedAt) });
          report.deadlinesUpdated += 1;
        }
      } else if (!removedBefore && item.date >= today) {
        // Older work isn't added, or the Planner would open with a wall of old overdue items.
        const now = Date.now();
        const added: PlannerItem = {
          id: plannerId,
          title,
          courseId: choice.courseId,
          type: guessPlannerType(title),
          dueDate: item.date,
          dueTime: item.startTime,
          status: 'Not Started',
          priority: 'Normal',
          estimateHours: null,
          details: item.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000),
          createdAt: now,
          updatedAt: now,
          sourceId: item.key,
        };
        await planner.put(added);
        report.deadlinesAdded += 1;
      }
      const current2 = await events.get(id);
      if (current2) await events.delete(id);
      continue;
    }
    const kind = choice.destination as CalendarKind;
    // A class already saved from the student's schedule isn't shown twice.
    const duplicate = choice.courseId && existing.some((event) => event.source === 'schedule' && event.kind === 'Class' && kind === 'Class' && event.date === item.date && event.startTime === item.startTime && event.courseId === choice.courseId);
    if (duplicate) continue;
    seen.add(id);
    const current = await events.get(id);
    const next: CalendarEvent = {
      id,
      title,
      courseId: current?.courseId ?? choice.courseId,
      kind: current?.kind ?? kind,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      location: item.location,
      whatToDo: current?.whatToDo ?? '',
      priority: current?.priority ?? (fromCanvas(item) ? 'High' : 'Normal'),
      completed: current?.completed ?? false,
      seriesId: item.repeats ? stableId('gs', item.seriesKey) : '',
      plannerItemId: current?.plannerItemId ?? null,
      source: 'google',
      sourceCalendar: item.calendarId,
      hidden: current?.hidden ?? false,
      createdAt: current?.createdAt ?? Date.now(),
      updatedAt: current?.updatedAt ?? Date.now(),
    };
    const same = current && ['title', 'date', 'startTime', 'endTime', 'location'].every((field) => current[field as keyof CalendarEvent] === next[field as keyof CalendarEvent]);
    if (!same) {
      await events.put({ ...next, updatedAt: later(current?.updatedAt) });
      if (current) report.updated += 1;
      else report.added += 1;
    }
  }

  // Gone from Google means it's no longer happening, so it goes here too.
  for (const event of existing) {
    if (event.source === 'google' && calendarIds.includes(event.sourceCalendar) && event.date >= window.from && event.date <= window.to && !seen.has(event.id) && (await events.getKey(event.id))) {
      await events.delete(event.id);
      if (!event.hidden) report.removed += 1;
    }
  }
  await tx.done;
  notifyChanged();
  return report;
}
