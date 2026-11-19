import { isDeviceOnly } from './schoolLevel';
import { GOOGLE_DRIVE_CLIENT_ID } from './cloudSetup';
import { prepareGoogle } from './googleCalendar';
import type { ClassroomCourse, ClassroomWork } from './classroomRules';

/* eslint-disable @typescript-eslint/no-explicit-any */
const page = window as any;

/*
 * Reading a student's own Google Classroom.
 *
 * Two scopes and no more. Google's own advice is to ask for as little as possible and to ask later
 * for anything else, and these two are enough for the classes a student is in and the work set in
 * them. Nothing here can write, mark, post, or see anybody else's work.
 *
 * Its permission is kept apart from the calendar's on purpose: a student who connects Classroom is
 * not thereby handing over their calendar, and one can be connected without the other.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
].join(' ');
const API = 'https://classroom.googleapis.com/v1';

export class ClassroomError extends Error {
  cancelled: boolean;

  /** True when a school's administrator has to allow Study Forge before this can work. */
  needsSchoolApproval: boolean;

  constructor(message: string, options: { cancelled?: boolean; needsSchoolApproval?: boolean } = {}) {
    super(message);
    this.cancelled = options.cancelled ?? false;
    this.needsSchoolApproval = options.needsSchoolApproval ?? false;
  }
}

/** Loads Google's code ahead of the tap, because a window that opens late gets blocked. */
export const prepareClassroom = (): Promise<void> => prepareGoogle();

// In memory only, so it is gone when the page closes. Google's permission lasts about an hour.
let access: { token: string; expiresAt: number } | null = null;

export const hasClassroomAccess = () => Boolean(access && access.expiresAt > Date.now() + 60_000);

export function forgetClassroom(): void {
  if (access) page.google?.accounts?.oauth2?.revoke?.(access.token, () => undefined);
  access = null;
}

/**
 * Must be called straight from a tap, with nothing awaited first.
 *
 * That last part is not a style note: awaiting anything before this loses the tap, and that was the
 * exact cause of the Get Latest pop-up never appearing on an iPhone home-screen app.
 */
export function askClassroom(hint?: string): Promise<void> {
  if (isDeviceOnly()) {
    return Promise.reject(new ClassroomError('Study Forge is set to this device only, so Google Classroom is switched off.'));
  }
  if (hasClassroomAccess()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const client = page.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      scope: SCOPES,
      hint,
      callback: (answer: any) => {
        if (answer.error || !answer.access_token) {
          reject(answer.error === 'access_denied'
            ? new ClassroomError("Google Classroom wasn't connected. If your school manages this account, your school has to allow Study Forge before this can work — Google blocks apps a school hasn't reviewed. A personal Google account works without that.", { needsSchoolApproval: true })
            : new ClassroomError("Google Classroom didn't give access. Try again."));
          return;
        }
        access = { token: answer.access_token, expiresAt: Date.now() + (Number(answer.expires_in) || 3600) * 1000 };
        resolve();
      },
      error_callback: (problem: any) => reject(problem?.type === 'popup_closed'
        ? new ClassroomError('', { cancelled: true })
        : new ClassroomError(problem?.type === 'popup_failed_to_open'
          ? 'Your browser blocked the window. Allow pop-ups for this site, then try again.'
          : "Google Classroom didn't give access. Try again.")),
    });
    client.requestAccessToken();
  });
}

async function call(path: string): Promise<any> {
  if (!hasClassroomAccess()) throw new ClassroomError('Connect to Google Classroom again to continue.');
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${access?.token}` } });
  } catch {
    throw new ClassroomError("Google Classroom couldn't be reached. Check your internet connection and try again.");
  }
  if (response.status === 401) {
    access = null;
    throw new ClassroomError('Connect to Google Classroom again to continue.');
  }
  if (response.status === 403) {
    // Google answers an unapproved app this way, and it is worth saying what it actually means
    // rather than showing a number: nothing the student can do in Study Forge will change it.
    throw new ClassroomError("Google wouldn't allow this. If your school manages this account, your school's administrator has to allow Study Forge first. That isn't something you can turn on yourself.", { needsSchoolApproval: true });
  }
  if (response.status === 404) throw new ClassroomError("Google Classroom couldn't find that class any more. Getting the latest again should sort it out.");
  if (!response.ok) throw new ClassroomError(`Google Classroom had a problem (${response.status}). Try again in a moment.`);
  return response.json();
}

/** Every page of a listing, following Google's page tokens. Capped so a loop can't run away. */
async function everyPage<T>(path: string, field: string, limit = 20): Promise<T[]> {
  const found: T[] = [];
  let next = '';
  for (let pageNumber = 0; pageNumber < limit; pageNumber += 1) {
    const joiner = path.includes('?') ? '&' : '?';
    const answer = await call(`${path}${next ? `${joiner}pageToken=${encodeURIComponent(next)}` : ''}`);
    found.push(...((answer?.[field] ?? []) as T[]));
    next = answer?.nextPageToken ?? '';
    if (!next) break;
  }
  return found;
}

/** The classes the student is a student in. Archived ones are not asked for. */
export const listClassroomCourses = (): Promise<ClassroomCourse[]> =>
  everyPage<ClassroomCourse>('/courses?studentId=me&courseStates=ACTIVE&pageSize=100', 'courses');

/**
 * The work set in one class.
 *
 * A class that refuses is skipped rather than stopping the whole import: a teacher can turn off
 * what students may see, and one such class should not cost the student every other class.
 */
export async function listClassroomWork(courseId: string): Promise<{ work: ClassroomWork[]; refused: boolean }> {
  try {
    const work = await everyPage<ClassroomWork>(`/courses/${encodeURIComponent(courseId)}/courseWork?pageSize=100`, 'courseWork');
    return { work: work.map((piece) => ({ ...piece, courseId })), refused: false };
  } catch (error) {
    if (error instanceof ClassroomError && (error.needsSchoolApproval || error.message.includes("couldn't find"))) {
      return { work: [], refused: true };
    }
    throw error;
  }
}

/** Everything needed for an import, in one go, with the classes that refused reported. */
export async function fetchClassroom(): Promise<{ courses: ClassroomCourse[]; work: ClassroomWork[]; refused: string[] }> {
  const courses = await listClassroomCourses();
  const work: ClassroomWork[] = [];
  const refused: string[] = [];
  for (const course of courses) {
    const answer = await listClassroomWork(course.id);
    if (answer.refused) refused.push(course.name);
    else work.push(...answer.work);
  }
  return { courses, work, refused };
}
