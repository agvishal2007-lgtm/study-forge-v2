import type { LinkCategory } from './linkRules';
import type { EventDetails } from './eventDetails';
export type { LinkCategory };

/**
 * Where a record is in its life. Active is in use, Archived is put away but kept whole,
 * and Trashed is in the bin, still restorable. Removing for good is a separate, explicit step.
 */
export type Lifecycle = 'active' | 'archived' | 'trashed';

export interface Course {
  id: string;
  name: string;
  code: string;
  color: string;
  /** The semester or term this course belongs to. Empty means no term — an independent study. */
  term: string;
  /** Where the student dragged it; lower comes first. */
  position: number;
  status: Lifecycle;
  /** When it last entered its current status, so the bin can show how long something has been there. */
  statusAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface Topic {
  id: string;
  courseId: string;
  name: string;
  /** A heading the student writes to group topics, such as "Chapter 1", "Week 3" or "Unit 2". Empty means ungrouped. */
  heading: string;
  /** Where the student dragged it within its course; lower comes first. */
  position: number;
  status: Lifecycle;
  statusAt: number;
  createdAt: number;
  updatedAt: number;
}

/** A saved file. A record exists only after the original was stored completely. */
/**
 * An extra place a resource appears, beyond the one course and topic it is filed under.
 * One file or link can belong to several courses and topics without a second copy being stored,
 * and removing one of these never touches the resource itself.
 */
export interface ResourceLink {
  id: string;
  resourceId: string;
  /** The course this extra association points at. A topic always carries its course too. */
  courseId: string;
  topicId: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * What a resource actually is. An upload has real bytes saved on the device. A link is only an
 * address: Study Forge has not downloaded, imported or copied whatever sits behind it.
 */
export type ResourceKind = 'upload' | 'link';

export interface Material {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** The checksum of the saved bytes. Empty for a link, which has no bytes. */
  hash: string;
  courseId: string | null;
  topicId: string | null;
  kind: ResourceKind;
  /** The web address, for a link. Empty for an upload. */
  url: string;
  /** What sort of thing a link points at, so it can be found later. 'other' for an upload. */
  category: LinkCategory;
  status: Lifecycle;
  statusAt: number;
  /** When the student pinned it, so pinned things lead their lists. Missing means not pinned. */
  pinnedAt?: number | null;
  /** A shelf in the student's personal library, such as "Research" or "Career", for things worth
   *  keeping beyond one course. Empty or missing means it's not on a shelf. It can still belong to a course. */
  shelf?: string;
  createdAt: number;
  /** When it was last renamed, moved, pinned or binned, so two devices' changes can be ordered. */
  updatedAt?: number;
  /** Where the verified copy is in the student's own Google Drive. Missing until Drive confirms it. */
  driveFileId?: string;
}

/** A student's own writing. Plain text, filed under a course or topic, and optionally about one file. */
export interface Note {
  id: string;
  title: string;
  body: string;
  courseId: string | null;
  topicId: string | null;
  materialId: string | null;
  createdAt: number;
  updatedAt: number;
  /** A note pinned to a moment in a recording: where it is, in milliseconds from the start. */
  atMs?: number | null;
  /** The words of the transcript the student chose, kept as written then, so the note never loses
   *  its context even if the transcript is made again. */
  quote?: string;
  /** The transcript passage it was attached to, when there was one. */
  segmentId?: string | null;
  /** While the lecture is still being recorded, the recording it belongs to. Replaced by
   *  materialId once the recording is saved. */
  recordingId?: string | null;
}

/** A recording in progress, or one a crash left unfinished. Its audio is saved in small pieces. */
export interface RecordingSession {
  id: string;
  name: string;
  courseId: string | null;
  topicId: string | null;
  mimeType: string;
  startedAt: number;
  elapsedMs: number;
  bytes: number;
}

export type MaterialKind = 'pdf' | 'image' | 'audio' | 'video' | 'text' | 'code' | 'word' | 'sheet' | 'slides' | 'opendoc' | 'ebook' | 'archive' | 'other';

export const SPINE_COLORS = ['#7DD3FC', '#6EE7C8', '#B4A7F5', '#F5A3C0', '#B5E48C', '#8FB3FF'];
/** The old yellow course color, swapped for the new look when older courses are opened or restored. */
export const OLD_YELLOW = '#E8B94F';

/* Guided Study: Course → Lesson or chapter → Checkpoint → Teaching → Practice → Mastery */
export type MasteryStatus = 'not-started' | 'learning' | 'practicing' | 'needs-review' | 'mastered';
export type QuestionKind = 'multiple' | 'short' | 'recall' | 'worked' | 'application';

export interface Lesson {
  id: string;
  courseId: string | null;
  /** The student's own word for this level, such as "Chapter" or "Lesson". */
  label: string;
  title: string;
  order: number;
  createdAt: number;
}

export interface GuidedQuestion {
  id: string;
  kind: QuestionKind;
  prompt: string;
  /** Answer choices. Empty means the student types an answer. */
  options: string[];
  correctOption: number | null;
  /** Typed answers that count as correct automatically. */
  accepted: string[];
  /** What a good answer looks like, shown after submitting. */
  modelAnswer: string;
  explanation: string;
  /** The part of the checkpoint this tests, so a miss gets a targeted reteach. */
  idea: string;
}

export interface Reteach {
  idea: string;
  explanation: string;
  example: string;
}

export interface Teaching {
  intro: string;
  meaning: string;
  why: string;
  parts: string[];
  example: string;
  walkthrough: string[];
  keyIdea: string;
}

export interface Checkpoint {
  id: string;
  lessonId: string;
  title: string;
  order: number;
  teaching: Teaching;
  questions: GuidedQuestion[];
  explainPrompt: string;
  keyPoints: string[];
  reteach: Reteach[];
  /** Where this content came from, in the student's words. */
  sourceNote: string;
  /** An original file this is based on. */
  materialId: string | null;
  createdAt: number;
}

export interface AnswerRecord {
  /** One presented question. A repeated submission of the same attempt never counts twice. */
  attemptId: string;
  questionId: string;
  answer: string;
  correct: boolean;
  method: 'automatic' | 'self-checked';
  at: number;
}

export type KeyPointRating = 'included' | 'partly' | 'missed';

export interface ExplanationRecord {
  text: string;
  ratings: KeyPointRating[];
  passed: boolean;
  method: 'self-checked';
  at: number;
}

export type StudyStage =
  | { kind: 'teach'; step: number }
  | { kind: 'question'; questionId: string; attemptId: string }
  | { kind: 'self-check'; questionId: string; attemptId: string; answer: string }
  | { kind: 'feedback'; attemptId: string }
  | { kind: 'reteach'; idea: string }
  | { kind: 'stuck'; idea: string }
  | { kind: 'explain' }
  | { kind: 'explain-check'; text: string }
  | { kind: 'explain-result' }
  | { kind: 'mastered' };

export interface CheckpointProgress {
  checkpointId: string;
  status: MasteryStatus;
  teachingFinished: boolean;
  teachingSkipped: boolean;
  stage: StudyStage;
  answers: AnswerRecord[];
  misses: Record<string, number>;
  reteachCount: number;
  explanations: ExplanationRecord[];
  /** A typed answer that hasn't been submitted. Never counts as an answer. */
  draft: string;
  lastStudiedAt: number;
  masteredAt: number | null;
}

/* Planner */
export const PLANNER_TYPES = ['Assignment', 'Exam', 'Quiz', 'Project', 'Presentation', 'Reading', 'Study session'] as const;
export type PlannerType = (typeof PLANNER_TYPES)[number];
export const PLANNER_STATUSES = ['Not Started', 'In Progress', 'Ready to Submit', 'Submitted', 'Waiting for Grade', 'Completed'] as const;
export type PlannerStatus = (typeof PLANNER_STATUSES)[number];
export const PLANNER_PRIORITIES = ['Low', 'Normal', 'High'] as const;
export type PlannerPriority = (typeof PLANNER_PRIORITIES)[number];

/**
 * A grading category in a course, with the share of the final grade it carries — "Exams, 40%".
 * The student enters these from their own syllabus; Study Forge never invents them.
 */
export interface GradeCategory {
  id: string;
  courseId: string;
  name: string;
  /** Share of the final grade, as a percentage. */
  weight: number;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface PlannerItem {
  id: string;
  title: string;
  courseId: string | null;
  type: PlannerType;
  /** The calendar date as written, YYYY-MM-DD, so it never shifts between time zones. Empty means no date. */
  dueDate: string;
  /** Optional local time, HH:MM. */
  dueTime: string;
  status: PlannerStatus;
  priority: PlannerPriority;
  /** Estimated hours of work. Null means not estimated. */
  estimateHours: number | null;
  /** What the work is worth, in the course's own points. Null means not entered, never assumed. */
  points: number | null;
  /** What was actually scored. Null means not graded yet, which is not the same as zero. */
  earnedPoints: number | null;
  /** Which grading category this counts towards. Null means not sorted into one. */
  categoryId: string | null;
  details: string;
  createdAt: number;
  updatedAt: number;
  /** Set when this came from a connected calendar, so getting the latest updates it instead of copying it. */
  sourceId?: string;
}

/* Calendar */
export const CALENDAR_KINDS = ['Class', 'Appointment', 'Study block', 'Event', 'No classes'] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];
export const PLAN_PRIORITIES = ['Critical', 'High', 'Normal', 'Flexible'] as const;
export type PlanPriority = (typeof PLAN_PRIORITIES)[number];
export type CalendarSource = 'manual' | 'schedule' | 'google';

/** One real meeting or block of time. A class that repeats has one of these for each meeting. */
export interface CalendarEvent {
  id: string;
  title: string;
  courseId: string | null;
  kind: CalendarKind;
  /** YYYY-MM-DD, so it never shifts between time zones. */
  date: string;
  /** HH:MM. Empty means it lasts all day. */
  startTime: string;
  endTime: string;
  location: string;
  whatToDo: string;
  priority: PlanPriority;
  completed: boolean;
  /** Shared by every meeting of a repeating class. Empty when it doesn't repeat. */
  seriesId: string;
  /** The planner item this time is reserved for. */
  plannerItemId: string | null;
  source: CalendarSource;
  /** Which Google calendar it came from. */
  sourceCalendar: string;
  /** Removed by the student, and remembered so getting the latest doesn't bring it back. */
  hidden: boolean;
  /** For events from Google Calendar: everything useful the event carried. Missing on older imports. */
  details?: EventDetails;
  createdAt: number;
  updatedAt: number;
}

/** What one device saw on one day. Each device keeps its own, so two devices never overwrite each other. */
export interface StudyDay {
  id: string;
  date: string;
  cards: number;
  lessons: number;
  updatedAt: number;
}

/**
 * Active study time one device gathered on one day, in seconds.
 * Keyed by date and device like StudyDay, so two devices add up instead of overwriting each other.
 * `byCourse` holds the seconds that could be tied to a course; the rest is still in `seconds`.
 */
export interface StudyTime {
  id: string;
  date: string;
  seconds: number;
  byCourse: Record<string, number>;
  updatedAt: number;
}

/* Flashcards */
export const CARD_RATINGS = ['Again', 'Hard', 'Good', 'Easy'] as const;
export type CardRating = (typeof CARD_RATINGS)[number];

export interface Deck {
  id: string;
  name: string;
  courseId: string | null;
  topicId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Flashcard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  createdAt: number;
  updatedAt: number;
}

export interface CardProgress {
  cardId: string;
  /** Which review interval the card has reached, from 0 to 3. -1 means it's starting over. */
  stage: number;
  /** The calendar date it's next due, YYYY-MM-DD. */
  dueDate: string;
  lastRating: CardRating;
  lastReviewedAt: number;
  reviews: number;
  /** How many times the student has pressed Again on this card. */
  lapses: number;
  updatedAt: number;
}

/* Practice */
export const PRACTICE_KINDS = ['multiple', 'short', 'blank', 'definition', 'formula', 'worked', 'explain'] as const;
export type PracticeKind = (typeof PRACTICE_KINDS)[number];
export const PRACTICE_KIND_LABEL: Record<PracticeKind, string> = {
  multiple: 'Multiple choice',
  short: 'Short answer',
  blank: 'Fill in the blank',
  definition: 'Definition',
  formula: 'Formula application',
  worked: 'Worked problem',
  explain: 'Concept explanation',
};
export type PracticeResult = 'correct' | 'partial' | 'wrong';
export const CONFIDENCE_LEVELS = ['Guessing', 'Somewhat sure', 'Sure'] as const;
/** How hard a question felt. The student's own sense of it, kept apart from whether the answer was right. */
export const DIFFICULTY_LEVELS = ['Easy', 'Medium', 'Hard'] as const;
export type Difficulty = typeof DIFFICULTY_LEVELS[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export interface PracticeSet {
  id: string;
  name: string;
  courseId: string | null;
  topicId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PracticeQuestion {
  id: string;
  setId: string;
  kind: PracticeKind;
  prompt: string;
  /** Answer choices. Empty means the student types an answer. */
  options: string[];
  correctOption: number | null;
  /** Typed answers that count as correct automatically. */
  accepted: string[];
  modelAnswer: string;
  explanation: string;
  /** The idea this tests, in the student's words. Weak topics are grouped by it. */
  topic: string;
  /** Where this came from, such as a chapter or page. */
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface PracticeAttempt {
  /** One presented question, so a repeated submission never counts twice. */
  id: string;
  questionId: string;
  setId: string;
  sessionId: string;
  answer: string;
  result: PracticeResult;
  /** The student judged a typed answer against the model answer. */
  selfChecked: boolean;
  confidence: Confidence | null;
  /** How hard it felt, chosen after answering. Never part of the score. */
  difficulty?: Difficulty | null;
  at: number;
  updatedAt: number;
}

/* Exam Hall */
export interface ExamItem {
  questionId: string;
  setId: string;
  kind: PracticeKind;
  prompt: string;
  answer: string;
  correctText: string;
  explanation: string;
  source: string;
  topic: string;
  /** Null means a written answer the student hasn't checked yet. */
  result: PracticeResult | null;
}

/** A finished mock exam. It keeps its own copy of the questions, so scores survive later edits. */
export interface ExamResult {
  id: string;
  name: string;
  courseId: string | null;
  durationMinutes: number | null;
  startedAt: number;
  finishedAt: number;
  timedOut: boolean;
  items: ExamItem[];
  updatedAt: number;
}

/** A recording turned into text on the device. Kept with its recording, which lives on this device. */
/** One passage of a transcript, with where it falls in the recording. */
export interface TranscriptSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface Transcript {
  materialId: string;
  text: string;
  /** The same words in timed passages. Older transcripts don't have these. */
  segments?: TranscriptSegment[];
  /** Which speech model made it. */
  model: string;
  createdAt: number;
  updatedAt: number;
}

/** The words read from a file so it can be searched. Kept on this device only, and can be rebuilt. */
export interface FileText {
  materialId: string;
  status: 'ok' | 'no-text' | 'unsupported' | 'too-large' | 'failed';
  /** One entry for each page or slide. */
  pages: string[];
}

/**
 * A small record that follows the student between devices: a setting (appearance, priorities) or
 * study in progress (a practice session, a flashcard review, questions saved for later).
 */
export interface SyncedValue<T = unknown> {
  id: string;
  value: T;
  updatedAt: number;
}
