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

export type MaterialKind = 'pdf' | 'image' | 'audio' | 'video' | 'text' | 'other';

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
