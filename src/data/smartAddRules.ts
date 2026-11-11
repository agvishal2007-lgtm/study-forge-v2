// Smart Add is one way to start anything. It suggests where the new thing belongs by reading the
// screen the student is on, and it never decides for them: every suggestion can be corrected.
import type { Course, Topic } from './types.ts';

export type AddKind = 'link' | 'file' | 'note' | 'deck' | 'questions' | 'recording' | 'course' | 'topic';

export interface AddChoice {
  kind: AddKind;
  label: string;
  /** What the student gets, in their own words. */
  hint: string;
  /** Some things have nowhere to live until there is a course to put them in. */
  needsCourse: boolean;
}

/** The order a student is most likely to want, not the order the code was written in. */
export const ADD_CHOICES: AddChoice[] = [
  { kind: 'file', label: 'File', hint: 'Upload from this device. It stays on this device.', needsCourse: false },
  { kind: 'link', label: 'Link', hint: 'Save a web page, a reading, or a Google or Canvas document.', needsCourse: false },
  { kind: 'note', label: 'Note', hint: 'Write something now.', needsCourse: false },
  { kind: 'deck', label: 'Flashcards', hint: 'Start a deck.', needsCourse: false },
  { kind: 'questions', label: 'Question set', hint: 'Start a set to practise with.', needsCourse: false },
  { kind: 'recording', label: 'Recording', hint: 'Record a lecture or a thought.', needsCourse: false },
  { kind: 'topic', label: 'Topic', hint: 'Add a chapter, week or unit to a course.', needsCourse: true },
  { kind: 'course', label: 'Course', hint: 'Start a new course.', needsCourse: false },
];

export const ADD_LABEL: Record<AddKind, string> = Object.fromEntries(
  ADD_CHOICES.map((choice) => [choice.kind, choice.label]),
) as Record<AddKind, string>;

/** The course the address itself names. Anything else is a guess and is treated as one. */
export function courseFromPath(pathname: string): string | null {
  const match = /^\/courses\/([^/?#]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export interface Place {
  courseId: string | null;
  topicId: string | null;
}

/**
 * Where to suggest filing the new thing. The screen the student is looking at wins; otherwise the
 * place they last filed something. A suggestion is only offered if it still exists and is still in
 * use, so a binned or archived course is never proposed, and a topic must belong to the course.
 */
export function suggestPlace(
  { pathname, remembered, courses, topics }:
  { pathname: string; remembered?: Place | null; courses: Course[]; topics: Topic[] },
): Place {
  const usable = (id: string | null) => Boolean(id) && courses.some((course) => course.id === id && course.status === 'active');
  const fromPath = courseFromPath(pathname);
  const courseId = usable(fromPath) ? fromPath : usable(remembered?.courseId ?? null) ? remembered!.courseId : null;
  // A topic is only carried over when it is still part of the course being suggested.
  const topic = topics.find((entry) => entry.id === (remembered?.topicId ?? null) && entry.courseId === courseId && entry.status === 'active');
  return { courseId, topicId: topic ? topic.id : null };
}

/**
 * The address that makes this kind of thing, carrying the place with it so the student doesn't
 * have to say twice where it belongs. Files, links and notes are made in the dialog itself.
 */
export function destination(kind: AddKind, place: Place): string | null {
  const course = place.courseId ? `course=${encodeURIComponent(place.courseId)}` : '';
  const topic = place.topicId ? `topic=${encodeURIComponent(place.topicId)}` : '';
  const query = [course, topic].filter(Boolean).join('&');
  const withQuery = (path: string, keep = query) => (keep ? `${path}?${keep}` : path);
  switch (kind) {
    case 'deck': return withQuery('/cards', course);
    case 'questions': return withQuery('/practice', course);
    case 'recording': return withQuery('/record');
    case 'course': return '/courses';
    case 'topic': return place.courseId ? `/courses/${encodeURIComponent(place.courseId)}` : null;
    default: return null;
  }
}
