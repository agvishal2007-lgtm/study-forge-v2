import { applyGoogleItems, choiceFor, courseForCode, getGoogleConnection, saveGoogleConnection, type CalendarChoice, type GoogleReport } from './calendar';
import { courseTokenIn, guessDestination } from './calendarRules';
import { getDb, notifyChanged } from './db';
import { askGoogle, googleWindow, listGoogleCalendars, readGoogleItems, type GoogleCalendarInfo } from './googleCalendar';
import { localNow } from './plannerRules';
import { listCourses } from './store';

const SKIPPED_KEY = 'googleCalendarOfferSkipped';

export const wasOfferSkipped = async () => Boolean(await (await getDb()).get('meta', SKIPPED_KEY));
export async function skipOffer(): Promise<void> {
  await (await getDb()).put('meta', true, SKIPPED_KEY);
  notifyChanged();
}

/** The main calendar and anything that looks like school. Holidays, birthdays, and other people's calendars stay out. */
export const startingCalendars = (calendars: GoogleCalendarInfo[]) => calendars.filter((calendar) => calendar.primary || /canvas|instructure|\.edu|school|class|course|tutor/i.test(`${calendar.name} ${calendar.id}`));

export function reportWords(report: GoogleReport): string {
  const parts = [
    report.added > 0 && `${report.added} added to your calendar`,
    report.updated > 0 && `${report.updated} updated`,
    report.removed > 0 && `${report.removed} removed because they're gone from Google or were left out`,
    report.deadlinesAdded > 0 && `${report.deadlinesAdded} ${report.deadlinesAdded === 1 ? 'deadline' : 'deadlines'} added to your Planner`,
    report.deadlinesUpdated > 0 && `${report.deadlinesUpdated} ${report.deadlinesUpdated === 1 ? 'deadline' : 'deadlines'} updated`,
  ].filter(Boolean);
  return parts.length > 0 ? `Done: ${parts.join(', ')}.` : 'Everything is already up to date.';
}

/**
 * The one-tap connection after signing in: the same account's calendar comes in using first guesses,
 * which the student can change later. Must be called directly from a tap.
 */
export async function connectWithGuesses(email?: string): Promise<GoogleReport> {
  await askGoogle(email);
  const today = localNow().date;
  const calendars = startingCalendars(await listGoogleCalendars()).map(({ id, name }) => ({ id, name }));
  const items = await readGoogleItems(calendars, today);
  const courses = await listCourses();
  const choices: Record<string, CalendarChoice> = {};
  for (const item of items) {
    if (item.cancelled || !item.date || choices[item.seriesKey]) continue;
    const choice = choiceFor(item, {}, courses);
    const destination = guessDestination(item);
    // Old one-off work isn't brought in, so it shouldn't add a course either.
    const current = item.date >= today || item.repeats;
    const token = courseTokenIn(item.title);
    const courseId = choice.courseId ?? (token && current && destination !== 'Event' ? (await courseForCode(token, token)).id : null);
    if (token && courseId && !courses.some((course) => course.id === courseId)) courses.push(...(await listCourses()).filter((course) => course.id === courseId));
    choices[item.seriesKey] = { destination, courseId };
  }
  const report = await applyGoogleItems(items, choices, googleWindow(today), today, calendars.map((calendar) => calendar.id));
  await saveGoogleConnection({ calendars, lastSync: Date.now(), choices });
  return report;
}

/** Must be called directly from a tap, unless Google's permission from earlier is still good. */
export async function getLatestFromGoogle(email?: string): Promise<GoogleReport | null> {
  const connection = await getGoogleConnection();
  if (!connection) return null;
  await askGoogle(email);
  const today = localNow().date;
  const items = await readGoogleItems(connection.calendars, today);
  const report = await applyGoogleItems(items, connection.choices, googleWindow(today), today, connection.calendars.map((calendar) => calendar.id));
  await saveGoogleConnection({ ...connection, lastSync: Date.now() });
  return report;
}
