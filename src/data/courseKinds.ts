/**
 * What kind of thing a student is studying, from the owner's studying system.
 *
 * Six kinds, and every one of them optional. A course that never says which it is behaves exactly
 * as it always did — this follows the owner's rule about school schedules, which is that nothing
 * about how a person studies is standard and Study Forge must not decide for them. Nothing here is
 * ever guessed from a course's name, and choosing one changes a default, never a student's data.
 *
 * What it is actually for: a textbook has chapters, professional training has lessons and
 * checkpoints, an exam has sections. Saying so once stops a student correcting the same word every
 * time they add one.
 */
export type CourseKind = 'coursework' | 'software' | 'skill' | 'exam' | 'independent' | 'certification';

export interface CourseKindInfo {
  value: CourseKind;
  /** What the student calls it. */
  label: string;
  /** The word this kind usually gives the level below a course. */
  levelWord: string;
  /** A plain example, so the choice is obvious without a manual. */
  example: string;
}

export const COURSE_KINDS: CourseKindInfo[] = [
  { value: 'coursework', label: 'A class I am taking', levelWord: 'Chapter', example: 'ACC 211, with a syllabus and a grade' },
  { value: 'software', label: 'Software I am learning', levelWord: 'Lesson', example: 'QuickBooks Online, lesson by lesson' },
  { value: 'skill', label: 'A skill for work', levelWord: 'Module', example: 'Writing better email, interviewing' },
  { value: 'exam', label: 'An exam I am preparing for', levelWord: 'Section', example: 'SAT, PSAT, a final' },
  { value: 'independent', label: 'Something I am learning on my own', levelWord: 'Topic', example: 'Reading about economics for myself' },
  { value: 'certification', label: 'A certification', levelWord: 'Unit', example: 'A qualification with an exam at the end' },
];

export const isCourseKind = (value: unknown): value is CourseKind =>
  COURSE_KINDS.some((kind) => kind.value === value);

const byValue = new Map(COURSE_KINDS.map((kind) => [kind.value, kind]));

/**
 * The word to offer for the level below a course of this kind.
 *
 * 'Lesson' for a course that has not said, which is what Study Forge has always used — so nothing
 * changes for anyone who ignores this entirely.
 */
export const levelWordFor = (kind: CourseKind | undefined | null): string =>
  (kind && byValue.get(kind)?.levelWord) || 'Lesson';

export const kindLabel = (kind: CourseKind | undefined | null): string =>
  (kind && byValue.get(kind)?.label) || '';
