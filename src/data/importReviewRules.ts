/*
 * Courses that Study Forge created from a calendar, waiting to be looked over.
 *
 * A calendar from a school system names a class the way the school's software names it: BIO-101-02,
 * ACCT201 LEC, 24FA-MATH-1120-05. Those become course names, and a student who never saw them
 * arrive has no idea why their Courses page is full of codes — or that renaming one is allowed and
 * will survive the next refresh. So an import says what it did, once, and then offers the names for
 * review straight away. Nothing is renamed for them: a code may be exactly what they call it.
 */

export interface ImportReview {
  /** The courses an import created, newest import last. */
  courseIds: string[];
  /** When the most recent import added to this list. */
  at: number;
  /** Whether the student has been told, once, what an import does to course names. */
  explained: boolean;
}

export const EMPTY_REVIEW: ImportReview = { courseIds: [], at: 0, explained: false };

/** Adds newly created courses to the list, without repeats and without losing the earlier ones. */
export function withNewCourses(review: ImportReview, ids: string[], at: number): ImportReview {
  const added = ids.filter((id) => id && !review.courseIds.includes(id));
  if (added.length === 0) return review;
  return { ...review, courseIds: [...review.courseIds, ...added], at };
}

/**
 * The courses actually worth reviewing: ones that still exist and are still in use. A course the
 * student has since binned or archived is not brought back to their attention.
 */
export function reviewable<T extends { id: string; status: string }>(review: ImportReview, courses: T[]): T[] {
  const wanted = new Set(review.courseIds);
  return courses.filter((course) => wanted.has(course.id) && course.status === 'active');
}

/**
 * Whether a name looks like it came from a school's software rather than from a person. Used only
 * to decide what to suggest looking at first — never to rename anything automatically, because
 * plenty of students call a class by its code and are right to.
 */
export function looksLikeACode(name: string): boolean {
  const tidy = name.trim();
  if (tidy.length === 0) return false;
  // A digit next to letters, or a run of capitals with no lower case, or the separators timetables
  // use. "Biology 101" has a space before the number and reads as a name, so it is left alone.
  if (/^[A-Z]{2,}[\s-]?\d/.test(tidy)) return true;
  if (/\d{3,}/.test(tidy) && !/[a-z]{4,}/.test(tidy)) return true;
  if (/^[A-Z0-9]+(-[A-Z0-9]+){2,}$/.test(tidy)) return true;
  return false;
}

/** What to say about an import, in plain words and without overstating it. */
export function describeImport(count: number): string {
  if (count <= 0) return '';
  const classes = count === 1 ? '1 class' : `${count} classes`;
  return `${classes} came from your calendar.`;
}

/** The order to review in: the ones that look like codes first, then the rest as they came. */
export function reviewOrder<T extends { id: string; name: string }>(courses: T[]): T[] {
  return [...courses].sort((a, b) => Number(looksLikeACode(b.name)) - Number(looksLikeACode(a.name)));
}
