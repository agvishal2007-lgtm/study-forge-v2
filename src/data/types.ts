export interface Course {
  id: string;
  name: string;
  code: string;
  color: string;
  createdAt: number;
}

export interface Topic {
  id: string;
  courseId: string;
  name: string;
  createdAt: number;
}

/** A saved file. A record exists only after the original was stored completely. */
export interface Material {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  hash: string;
  courseId: string | null;
  topicId: string | null;
  createdAt: number;
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

export type MaterialKind = 'pdf' | 'image' | 'audio' | 'video' | 'text' | 'word' | 'sheet' | 'slides' | 'other';

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

/** The words read from a file so it can be searched. Kept on this device only, and can be rebuilt. */
export interface FileText {
  materialId: string;
  status: 'ok' | 'no-text' | 'unsupported' | 'too-large' | 'failed';
  /** One entry for each page or slide. */
  pages: string[];
}
