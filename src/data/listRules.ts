import type { Course, PlannerItem } from './types';
import { comparePlanner, isDone, sectionsOf } from './plannerRules.ts';

/*
 * To-do lists. A list isn't a new kind of thing to keep in step with everything else: it is a
 * view of the one set of tasks. Every class gets a list of the work belonging to it, there is a
 * Personal list for everything with no class, and any section a student names becomes a list too.
 *
 * Doing it this way means a task can never be in two places at once, nothing has to be moved when
 * a class is renamed, and there is no second store to go out of date.
 *
 * This file only calculates, so it can be tested directly.
 */
export interface TodoList {
  /** Stable enough to remember which list was open: a course id, a section name, or 'personal'. */
  id: string;
  name: string;
  kind: 'course' | 'section' | 'personal';
  items: PlannerItem[];
  /** How many are still to do. Used for the panel's own heading, never shown as a fraction. */
  left: number;
}

/**
 * Every list a student has, in the order they'd expect: their classes first, in the order the
 * classes are in, then their own sections, then Personal. A list with nothing in it is left out,
 * so the panel doesn't fill with empty classes — except Personal, which stays as somewhere to put
 * a new task that belongs to nothing.
 */
export function listsFor(all: PlannerItem[], courses: Course[]): TodoList[] {
  // Anything the student took off their list stays out of every list, without being deleted.
  const items = all.filter((item) => !item.hiddenFromList);
  const lists: TodoList[] = [];
  const used = new Set<string>();

  for (const course of courses) {
    const mine = items.filter((item) => item.courseId === course.id).sort(comparePlanner);
    mine.forEach((item) => used.add(item.id));
    if (mine.length > 0) lists.push(make(course.id, course.name, 'course', mine));
  }

  // A section the student named, taking whatever is in it that no class has already claimed.
  for (const section of sectionsOf(items)) {
    const mine = items
      .filter((item) => (item.section ?? '').trim() === section && !used.has(item.id))
      .sort(comparePlanner);
    mine.forEach((item) => used.add(item.id));
    if (mine.length > 0) lists.push(make(`section:${section}`, section, 'section', mine));
  }

  const personal = items.filter((item) => !used.has(item.id)).sort(comparePlanner);
  lists.push(make('personal', 'Personal', 'personal', personal));
  return lists;
}

const make = (id: string, name: string, kind: TodoList['kind'], items: PlannerItem[]): TodoList => ({
  id,
  name,
  kind,
  items,
  left: items.filter((item) => !isDone(item)).length,
});

/** The list to show, keeping the one the student had open when it still exists. */
export function chooseList(lists: TodoList[], wanted: string | null): TodoList | null {
  if (lists.length === 0) return null;
  const asked = lists.find((list) => list.id === wanted);
  if (asked) return asked;
  // Nothing chosen yet, so open somewhere predictable. Personal is the one list that is always
  // there and isn't about a particular class, and opening on a class list instead means a task
  // just added to Personal is nowhere to be seen — which reads as the panel having lost it.
  return lists.find((list) => list.kind === 'personal') ?? lists[0];
}

/** Which list comes next when flipping through them, wrapping round at the end. */
export function flip(lists: TodoList[], current: string, by: 1 | -1): string {
  if (lists.length === 0) return current;
  const at = lists.findIndex((list) => list.id === current);
  const next = (at < 0 ? 0 : at + by + lists.length) % lists.length;
  return lists[next].id;
}

/** What a new task typed into a list should belong to, so it lands in the list it was typed in. */
export function belongsTo(list: TodoList): { courseId: string | null; section: string } {
  if (list.kind === 'course') return { courseId: list.id, section: '' };
  if (list.kind === 'section') return { courseId: null, section: list.name };
  return { courseId: null, section: '' };
}
