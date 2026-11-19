/*
 * Google Classroom, read only.
 *
 * Why this is worth having alongside the calendar: a school calendar gives an event with a title
 * like BIO-101-02, while Classroom gives the course's real name, the assignment's title and
 * description, its due date, and a link back to the work itself. So the same import produces
 * something a student recognises instead of a page full of codes.
 *
 * What this file does not do: decide who may connect. That is settled by the school level, because
 * elementary and middle school keep everything on the device and never sign in to Google at all.
 * Nor does it fetch anything — the shapes below are what Google returns, kept apart from the
 * fetching so they can be tested without a network or an account.
 */

/** A course as Classroom reports it. Only the fields Study Forge uses. */
export interface ClassroomCourse {
  id: string;
  name: string;
  /** The teacher's section label, such as "Period 3" or "B". Often how a student tells two apart. */
  section?: string;
  room?: string;
  /** ACTIVE, ARCHIVED, PROVISIONED, DECLINED or SUSPENDED. */
  courseState?: string;
}

/** A piece of coursework as Classroom reports it. */
export interface ClassroomWork {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  /** Google sends the parts separately, and all three are optional. */
  dueDate?: { year?: number; month?: number; day?: number };
  dueTime?: { hours?: number; minutes?: number };
  workType?: string;
  /** Where the work lives in Classroom, so a student can open the real thing. */
  alternateLink?: string;
  state?: string;
  maxPoints?: number;
}

/** Only courses a student is actually taking are offered. */
export const usableCourse = (course: ClassroomCourse): boolean =>
  Boolean(course.id) && Boolean(course.name?.trim()) && (course.courseState ?? 'ACTIVE') === 'ACTIVE';

/** Published work only: a draft or deleted assignment is not something to put in a planner. */
export const usableWork = (work: ClassroomWork): boolean =>
  Boolean(work.id) && Boolean(work.title?.trim()) && (work.state ?? 'PUBLISHED') === 'PUBLISHED';

/**
 * A course's full name, including the section when the teacher set one.
 *
 * The section is only left off when the name already contains it as a word of its own. Checking for
 * it as a substring was wrong and the tests caught it: sections are very often a single letter, and
 * "Algebra 2" contains a "b", so section B vanished and two classes became indistinguishable.
 */
export function courseTitle(course: ClassroomCourse): string {
  const name = course.name.trim();
  const section = course.section?.trim();
  if (!section) return name;
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alreadyThere = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu').test(name);
  return alreadyThere ? name : `${name} (${section})`;
}

/**
 * The due date as a plain date, or null. Classroom sends the three parts separately and any of them
 * can be missing, so a half-given date is treated as no date rather than guessed at.
 */
export function dueOn(work: ClassroomWork): string | null {
  const { year, month, day } = work.dueDate ?? {};
  if (!year || !month || !day) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * The time of day the work is due, in 24-hour form, or null. Classroom gives this in UTC, so an
 * hour alone cannot be turned into a local time here; it is kept as given and only ever shown
 * beside the date, never used to decide what day something is due.
 */
export function dueAt(work: ClassroomWork): string | null {
  const { hours, minutes } = work.dueTime ?? {};
  if (hours === undefined && minutes === undefined) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours ?? 0)}:${pad(minutes ?? 0)}`;
}

/** What kind of planner item a piece of coursework becomes. */
export function plannerTypeFor(workType?: string): 'Assignment' | 'Quiz' | 'Reading' {
  if (workType === 'SHORT_ANSWER_QUESTION' || workType === 'MULTIPLE_CHOICE_QUESTION') return 'Quiz';
  if (workType === 'MATERIAL') return 'Reading';
  return 'Assignment';
}

/**
 * The id a piece of coursework always gets, so importing twice updates rather than duplicates —
 * the same rule the calendar import follows.
 */
export const workItemId = (courseId: string, workId: string): string => `classroom-${courseId}-${workId}`;

/** The id a course gets, so a course imported twice is the same course. */
export const courseKeyFor = (classroomId: string): string => `classroom:${classroomId}`;

/**
 * Finds the course a Classroom course already corresponds to.
 *
 * It matches on the Classroom id kept with the course, never on the name — so a student who renames
 * "MATH1120 (B)" to "Algebra 2" keeps that name through every later import. Falling back to a name
 * match would undo exactly the renaming the review step encourages.
 */
export function matchByClassroom<T extends { id: string; code?: string }>(classroomId: string, courses: T[]): T | undefined {
  const key = courseKeyFor(classroomId);
  return courses.find((course) => course.code === key);
}

export interface ImportPlan {
  /** Courses that would be created, with the name they would be given. */
  newCourses: { classroomId: string; name: string }[];
  /** Courses already here, which keep whatever name the student gave them. */
  existing: { classroomId: string; courseId: string }[];
  /** Work that would be added or updated, with the course it belongs to. */
  work: { id: string; classroomId: string; title: string; due: string | null; type: string; link?: string }[];
  /** Work left out, and why, so nothing disappears silently. */
  skipped: { title: string; because: string }[];
}

/**
 * Works out what an import would do, before it does any of it.
 *
 * Work with no due date is kept rather than dropped — plenty of real assignments have none — but it
 * is reported separately so a student can see why something has no deadline. Work whose due date
 * has already passed is left out by default, because importing a term's worth of finished homework
 * as outstanding tasks is worse than useless.
 */
export function planImport(
  courses: ClassroomCourse[],
  work: ClassroomWork[],
  known: { id: string; code?: string }[],
  today: string,
  options: { includePast?: boolean } = {},
): ImportPlan {
  const plan: ImportPlan = { newCourses: [], existing: [], work: [], skipped: [] };
  const usable = courses.filter(usableCourse);
  const byId = new Map(usable.map((course) => [course.id, course]));

  for (const course of usable) {
    const found = matchByClassroom(course.id, known);
    if (found) plan.existing.push({ classroomId: course.id, courseId: found.id });
    else plan.newCourses.push({ classroomId: course.id, name: courseTitle(course) });
  }

  for (const piece of work) {
    if (!usableWork(piece)) {
      if (piece.title?.trim()) plan.skipped.push({ title: piece.title.trim(), because: 'not published in Classroom' });
      continue;
    }
    if (!byId.has(piece.courseId)) {
      plan.skipped.push({ title: piece.title.trim(), because: 'its class is not one you are taking now' });
      continue;
    }
    const due = dueOn(piece);
    if (due && due < today && !options.includePast) {
      plan.skipped.push({ title: piece.title.trim(), because: 'it was due before today' });
      continue;
    }
    plan.work.push({
      id: workItemId(piece.courseId, piece.id),
      classroomId: piece.courseId,
      title: piece.title.trim(),
      due,
      type: plannerTypeFor(piece.workType),
      link: piece.alternateLink,
    });
  }

  return plan;
}

/** What the plan amounts to, in plain words, with nothing rounded up. */
export function describePlan(plan: ImportPlan): string {
  const parts: string[] = [];
  const count = (many: number, one: string, more: string) => `${many} ${many === 1 ? one : more}`;
  if (plan.newCourses.length > 0) parts.push(count(plan.newCourses.length, 'new class', 'new classes'));
  if (plan.existing.length > 0) parts.push(count(plan.existing.length, 'class already here', 'classes already here'));
  if (plan.work.length > 0) parts.push(count(plan.work.length, 'assignment', 'assignments'));
  if (parts.length === 0) return 'Nothing to bring in.';
  const withoutDates = plan.work.filter((one) => one.due === null).length;
  const tail = withoutDates > 0 ? ` ${count(withoutDates, 'assignment has', 'assignments have')} no due date in Classroom.` : '';
  return `${parts.join(', ')}.${tail}`;
}
