import type { ExamItem, ExamResult, PracticeQuestion, PracticeResult } from './types';

/** Exam Hall's rules. This file only calculates, so it can be tested directly. */

/** Picks questions without repeats, in a shuffled order. */
export function pickQuestions<T>(questions: T[], count: number | null, random: () => number = Math.random): T[] {
  const shuffled = [...questions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return count === null ? shuffled : shuffled.slice(0, count);
}

export const pendingChecks = (items: Pick<ExamItem, 'result'>[]) => items.filter((item) => item.result === null).length;

/** Null until every written answer is checked, so a score is never shown on partial evidence. */
export function examScore(items: Pick<ExamItem, 'result'>[]): number | null {
  if (items.length === 0 || pendingChecks(items) > 0) return null;
  const points = items.reduce((sum, item) => sum + (item.result === 'correct' ? 1 : item.result === 'partial' ? 0.5 : 0), 0);
  return Math.round((points / items.length) * 100);
}

/** Compares the first and latest scored exams, oldest first. Needs two to say anything. */
export function improvement(results: Pick<ExamResult, 'finishedAt' | 'items'>[]): { first: number; latest: number; count: number } | null {
  const scored = results
    .map((result) => ({ at: result.finishedAt, score: examScore(result.items) }))
    .filter((entry): entry is { at: number; score: number } => entry.score !== null)
    .sort((a, b) => a.at - b.at);
  return scored.length < 2 ? null : { first: scored[0].score, latest: scored[scored.length - 1].score, count: scored.length };
}

export function formatClock(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

export interface Evidence {
  total: number;
  answered: number;
  correct: number;
  mistakes: number;
  weakTopics: number;
  cardsDue: number;
  mockExams: number;
}

export interface CheckItem {
  label: string;
  done: boolean;
  detail: string;
}

const count = (value: number, word: string) => `${value} ${word}${value === 1 ? '' : 's'}`;

/** Every line is checked against saved work. Nothing here is a prediction of a grade. */
export function revisionChecklist(evidence: Evidence): CheckItem[] {
  return [
    { label: 'Answer every practice question', done: evidence.total > 0 && evidence.answered === evidence.total, detail: `${evidence.answered} of ${count(evidence.total, 'question')} answered` },
    { label: 'Fix your mistakes', done: evidence.answered > 0 && evidence.mistakes === 0, detail: evidence.answered === 0 ? 'Nothing answered yet' : `${count(evidence.mistakes, 'mistake')} left` },
    { label: 'Work on your weak topics', done: evidence.answered > 0 && evidence.weakTopics === 0, detail: evidence.answered === 0 ? 'Nothing answered yet' : `${count(evidence.weakTopics, 'weak topic')} left` },
    { label: 'Review your flashcards', done: evidence.cardsDue === 0, detail: evidence.cardsDue === 0 ? 'None due' : `${count(evidence.cardsDue, 'card')} due` },
    { label: 'Take a mock exam', done: evidence.mockExams > 0, detail: `${count(evidence.mockExams, 'mock exam')} taken` },
  ];
}

export const CRAM_MODES = {
  tomorrow: { label: 'Exam Tomorrow', minutes: 180, summary: 'A full plan for your last evening.' },
  hour: { label: 'Last Hour', minutes: 60, summary: 'What matters most, in about an hour.' },
  quick: { label: 'Quick Review', minutes: 20, summary: 'Definitions, formulas, and cards in about 20 minutes.' },
  weak: { label: 'Weak Topics Only', minutes: 90, summary: 'Only what you keep missing.' },
} as const;
export type CramMode = keyof typeof CRAM_MODES;

export interface CramInput {
  course: string;
  mistakes: number;
  weakTopics: { label: string; questions: number }[];
  definitions: number;
  formulas: number;
  cardsDue: number;
  notes: number;
  total: number;
}

export interface CramStep {
  title: string;
  detail: string;
  minutes: number;
  to: string;
}

const MINUTES_PER_QUESTION = 2;
const MINUTES_PER_CARD = 0.5;
const scope = (course: string) => (course ? `&course=${course}` : '');

/** The most useful steps for a mode, in order, stopping when the time runs out. Times are rough estimates. */
export function cramPlan(mode: CramMode, input: CramInput): { steps: CramStep[]; leftOut: number; minutes: number } {
  const practice = (query: string) => `/practice/session?${query}${scope(input.course)}`;
  const mistakes: CramStep = { title: 'Fix your mistakes', detail: count(input.mistakes, 'question'), minutes: input.mistakes * MINUTES_PER_QUESTION, to: practice('mode=mistakes') };
  const weak: CramStep[] = input.weakTopics.map((topic) => ({
    title: `Weak topic: ${topic.label}`,
    detail: count(topic.questions, 'question'),
    minutes: topic.questions * MINUTES_PER_QUESTION,
    to: practice(`mode=topic&topic=${encodeURIComponent(topic.label)}`),
  }));
  const definitions: CramStep = { title: 'Key definitions', detail: count(input.definitions, 'question'), minutes: input.definitions * MINUTES_PER_QUESTION, to: practice('mode=all&kind=definition') };
  const formulas: CramStep = { title: 'Important formulas', detail: count(input.formulas, 'question'), minutes: input.formulas * MINUTES_PER_QUESTION, to: practice('mode=all&kind=formula') };
  const cards: CramStep = { title: 'Flashcards due', detail: count(input.cardsDue, 'card'), minutes: Math.ceil(input.cardsDue * MINUTES_PER_CARD), to: `/cards/review${input.course ? `?course=${input.course}` : ''}` };
  const notes: CramStep = { title: 'Skim your notes', detail: count(input.notes, 'note'), minutes: Math.min(15, input.notes * 2), to: '/notes' };
  const mock: CramStep = { title: 'Take a timed mock exam', detail: 'Up to 20 questions in 30 minutes', minutes: 30, to: `/exams/start?count=20&minutes=30${scope(input.course)}` };

  const order: Record<CramMode, CramStep[]> = {
    tomorrow: [mistakes, ...weak, definitions, formulas, cards, notes, ...(input.total > 0 ? [mock] : [])],
    hour: [mistakes, ...weak, formulas, definitions, cards],
    quick: [definitions, formulas, cards],
    weak: [...weak, mistakes],
  };
  const useful = order[mode].filter((step) => step.minutes > 0);
  const budget = CRAM_MODES[mode].minutes;
  const steps: CramStep[] = [];
  let minutes = 0;
  for (const step of useful) {
    if (minutes + step.minutes > budget && steps.length > 0) continue;
    steps.push(step);
    minutes += step.minutes;
  }
  return { steps, leftOut: useful.length - steps.length, minutes };
}

export const correctTextOf = (question: Pick<PracticeQuestion, 'options' | 'correctOption' | 'modelAnswer' | 'accepted'>) => (
  question.options.length > 0 ? question.options[question.correctOption as number] : question.modelAnswer || question.accepted.join(', ')
);

export const needsSelfCheck = (result: PracticeResult | null) => result === null;
