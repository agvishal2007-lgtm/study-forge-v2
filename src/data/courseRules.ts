import type { Course, Topic } from './types';

/** The pure rules for ordering and grouping courses and topics, kept apart from the database so they can be tested. */

/** Where the student put it, falling back to when it was made. */
export const byPlace = (a: { position: number; createdAt: number }, b: { position: number; createdAt: number }): number =>
  a.position - b.position || a.createdAt - b.createdAt;

/**
 * Works out the new order when something moves one place earlier or later among its neighbours.
 * Returns the full list in its new order, or null when it cannot move (already at the end).
 */
export function reordered<T extends { id: string; position: number; createdAt: number }>(
  siblings: T[],
  id: string,
  direction: 'up' | 'down',
): T[] | null {
  const ordered = [...siblings].sort(byPlace);
  const from = ordered.findIndex((item) => item.id === id);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ordered.length) return null;
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  return ordered;
}

/** Topics grouped under the headings the student wrote, in order, with ungrouped ones first. */
export function groupTopics(topics: Topic[]): { heading: string; topics: Topic[] }[] {
  const groups: { heading: string; topics: Topic[] }[] = [];
  for (const topic of [...topics].sort(byPlace)) {
    const group = groups.find((candidate) => candidate.heading === topic.heading);
    if (group) group.topics.push(topic);
    else groups.push({ heading: topic.heading, topics: [topic] });
  }
  return groups.sort((a, b) => Number(Boolean(a.heading)) - Number(Boolean(b.heading)));
}

/** Courses grouped by term, with independent study (no term) last. */
export function groupCourses(courses: Course[]): { term: string; courses: Course[] }[] {
  const groups: { term: string; courses: Course[] }[] = [];
  for (const course of [...courses].sort(byPlace)) {
    const group = groups.find((candidate) => candidate.term === course.term);
    if (group) group.courses.push(course);
    else groups.push({ term: course.term, courses: [course] });
  }
  return groups.sort((a, b) => Number(!a.term) - Number(!b.term) || a.term.localeCompare(b.term));
}
