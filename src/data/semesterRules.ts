/*
 * The semester transition assistant: a review of the term that's ending, and a plan for the next
 * one. It only works out what would happen; nothing changes until the student reviews the whole
 * plan and confirms it. It never deletes anything, and it never moves an official deadline.
 */
import { isDone } from './plannerRules.ts';
import type { CalendarEvent, Course, PlannerItem } from './types';

export interface CourseReview {
  course: Course;
  unfinished: PlannerItem[];
  futureEvents: CalendarEvent[];
  files: number;
  notes: number;
}

/** What each active course still has going on, so the student can decide with the facts in front of them. */
export function reviewCourses(
  courses: Course[],
  planner: PlannerItem[],
  events: CalendarEvent[],
  counts: { files: Map<string, number>; notes: Map<string, number> },
  today: string,
): CourseReview[] {
  return courses
    .filter((course) => course.status === 'active')
    .map((course) => ({
      course,
      unfinished: planner.filter((item) => item.courseId === course.id && !isDone(item))
        .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')),
      futureEvents: events.filter((event) => event.courseId === course.id && !event.hidden && event.date >= today && event.kind !== 'No classes')
        .sort((a, b) => a.date.localeCompare(b.date)),
      files: counts.files.get(course.id) ?? 0,
      notes: counts.notes.get(course.id) ?? 0,
    }));
}

export interface NewCourse {
  name: string;
  code: string;
  /** A template id, `copy:<courseId>` to reuse an old course's topics and categories, or '' for blank. */
  start: string;
}

export interface SemesterChoices {
  archive: Set<string>;
  /** Unfinished planner items to mark Completed. Everything else stays exactly as it is. */
  complete: Set<string>;
  /** Courses whose future calendar events should be hidden from the calendar. */
  hideEvents: Set<string>;
  term: string;
  newCourses: NewCourse[];
}

export interface PlannedChange {
  kind: 'archive' | 'complete' | 'hide' | 'create';
  text: string;
}

/** Every change the plan would make, in plain words, for the review screen. Empty means nothing happens. */
export function planChanges(reviews: CourseReview[], choices: SemesterChoices, startLabel: (start: string) => string): PlannedChange[] {
  const changes: PlannedChange[] = [];
  for (const review of reviews) {
    if (!choices.archive.has(review.course.id)) continue;
    changes.push({ kind: 'archive', text: `Archive ${review.course.name}. Its files, notes, grades and history stay, and it stays searchable.` });
    const completing = review.unfinished.filter((item) => choices.complete.has(item.id));
    for (const item of completing) changes.push({ kind: 'complete', text: `Mark “${item.title}” (${review.course.name}) as Completed.` });
    const kept = review.unfinished.length - completing.length;
    if (kept > 0) changes.push({ kind: 'complete', text: `Keep ${kept} unfinished ${kept === 1 ? 'item' : 'items'} from ${review.course.name} in your Planner as they are.` });
    if (choices.hideEvents.has(review.course.id) && review.futureEvents.length > 0) {
      changes.push({ kind: 'hide', text: `Hide ${review.futureEvents.length} upcoming calendar ${review.futureEvents.length === 1 ? 'event' : 'events'} for ${review.course.name}. They can be shown again.` });
    }
  }
  const term = choices.term.trim();
  for (const course of choices.newCourses.filter((item) => item.name.trim())) {
    const from = course.start ? `, starting from ${startLabel(course.start)}` : '';
    changes.push({ kind: 'create', text: `Create ${course.name.trim()}${course.code.trim() ? ` (${course.code.trim()})` : ''}${term ? ` in ${term}` : ''}${from}.` });
  }
  return changes.filter((change) => !change.text.startsWith('Keep ') || changes.some((other) => other.kind === 'archive'));
}

/** True when the plan would change something, so Confirm is only offered when there is something to confirm. */
export const hasChanges = (changes: PlannedChange[]) => changes.some((change) => !change.text.startsWith('Keep '));
