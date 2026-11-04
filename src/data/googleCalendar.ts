import { addDays, fromGoogleEvent, type GoogleItem } from './calendarRules';
import { GOOGLE_DRIVE_CLIENT_ID } from './cloudSetup';

/* eslint-disable @typescript-eslint/no-explicit-any */
const page = window as any;
const SCOPES = 'https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const API = 'https://www.googleapis.com/calendar/v3';

export class CalendarError extends Error {
  cancelled: boolean;

  constructor(message: string, cancelled = false) {
    super(message);
    this.cancelled = cancelled;
  }
}

let ready: Promise<void> | null = null;

/** Loads Google's code ahead of the tap, because a window that opens late gets blocked. */
export function prepareGoogle(): Promise<void> {
  ready ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      ready = null;
      reject(new CalendarError("Google couldn't be reached. Check your internet connection and try again."));
    };
    document.head.append(script);
  });
  return ready;
}

// Kept only in memory, so it's gone when the page closes. Google's permission lasts about an hour.
let access: { token: string; expiresAt: number } | null = null;

export const hasGoogleAccess = () => Boolean(access && access.expiresAt > Date.now() + 60_000);

/** Must be called directly from a tap, after prepareGoogle has finished. */
export function askGoogle(hint?: string): Promise<void> {
  if (hasGoogleAccess()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const client = page.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      scope: SCOPES,
      hint,
      callback: (answer: any) => {
        if (answer.error || !answer.access_token) {
          reject(new CalendarError(answer.error === 'access_denied'
            ? "Google Calendar wasn't connected. If your school manages this account, it may block apps Google hasn't verified yet. You can try a personal account, or add your classes with Add class schedule."
            : "Google Calendar didn't give access. Try again."));
          return;
        }
        access = { token: answer.access_token, expiresAt: Date.now() + (Number(answer.expires_in) || 3600) * 1000 };
        resolve();
      },
      error_callback: (problem: any) => reject(problem?.type === 'popup_closed'
        ? new CalendarError('', true)
        : new CalendarError(problem?.type === 'popup_failed_to_open' ? 'Your browser blocked the window. Allow pop-ups for this site, then try again.' : "Google Calendar didn't give access. Try again.")),
    });
    client.requestAccessToken();
  });
}

export function forgetGoogle(): void {
  if (access) page.google?.accounts?.oauth2?.revoke?.(access.token, () => undefined);
  access = null;
}

async function call(path: string): Promise<any> {
  if (!hasGoogleAccess()) throw new CalendarError('Connect to Google Calendar again to continue.');
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${access?.token}` } });
  } catch {
    throw new CalendarError("Google Calendar couldn't be reached. Check your internet connection and try again.");
  }
  if (response.status === 401) {
    access = null;
    throw new CalendarError('Connect to Google Calendar again to continue.');
  }
  if (response.status === 403) throw new CalendarError("Google didn't allow this. When Google asks, leave both calendar boxes checked. If that doesn't help, this account may not allow it.");
  if (!response.ok) throw new CalendarError(`Google Calendar had a problem (${response.status}). Try again in a moment.`);
  return response.json();
}

export interface GoogleCalendarInfo {
  id: string;
  name: string;
  primary: boolean;
}

export async function listGoogleCalendars(): Promise<GoogleCalendarInfo[]> {
  const found: GoogleCalendarInfo[] = [];
  let next = '';
  do {
    const answer = await call(`/users/me/calendarList?maxResults=250${next ? `&pageToken=${encodeURIComponent(next)}` : ''}`);
    for (const item of answer.items ?? []) found.push({ id: item.id, name: item.summaryOverride || item.summary || item.id, primary: Boolean(item.primary) });
    next = answer.nextPageToken ?? '';
  } while (next);
  return found.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

/** The dates each update covers. Anything outside them is left alone. */
export const googleWindow = (today: string) => ({ from: addDays(today, -30), to: addDays(today, 240) });

export async function readGoogleItems(calendars: { id: string; name: string }[], today: string): Promise<GoogleItem[]> {
  const { from, to } = googleWindow(today);
  const start = new Date(`${from}T00:00:00`).toISOString();
  const end = new Date(`${to}T23:59:59`).toISOString();
  const items: GoogleItem[] = [];
  for (const calendar of calendars) {
    let next = '';
    let pages = 0;
    do {
      const query = new URLSearchParams({ singleEvents: 'true', showDeleted: 'true', orderBy: 'startTime', maxResults: '2500', timeMin: start, timeMax: end });
      if (next) query.set('pageToken', next);
      const answer = await call(`/calendars/${encodeURIComponent(calendar.id)}/events?${query}`);
      for (const raw of answer.items ?? []) items.push(...fromGoogleEvent(raw, calendar.id, calendar.name));
      next = answer.nextPageToken ?? '';
      pages += 1;
    } while (next && pages < 20);
    if (next) throw new CalendarError(`${calendar.name} has too many events to read at once. Choose fewer calendars.`);
  }
  return items;
}
