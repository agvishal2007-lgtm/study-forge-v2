/*
 * Smart study suggestions: a few more things worth doing today, beside the single Start studying
 * button. They come from plain rules over the student's own records, never from AI, and each one says
 * why it is there in terms of what was actually recorded (cards due, a test date, answers given). A
 * suggestion never claims the student knows or doesn't know something; it only reports what happened.
 */

export interface Suggestion {
  /** Stable for the same reason, so hiding it for today keeps it hidden until the reason changes. */
  id: string;
  to: string;
  label: string;
  reason: string;
}

export interface SuggestionInputs {
  today: string;
  /** Where Start studying already points, so nothing is suggested twice. */
  primaryTo: string;
  pausedPractice?: { url: string; position: number; total: number } | null;
  pausedReview?: { url: string; left: number } | null;
  cardsDue: number;
  /** Open exams and quizzes with a date. */
  tests: { id: string; title: string; dueDate: string }[];
  hasPracticeQuestions: boolean;
  savedQuestions: number;
  mistakes: number;
  weakTopic?: { label: string; answered: number; percent: number } | null;
  lessonsToReview: number;
  nextCheckpoint?: { id: string; title: string } | null;
  /** The next unfinished step of open planner items, with the student's own target date. */
  steps: { itemId: string; itemTitle: string; stepId: string; stepTitle: string; targetDate: string }[];
  dismissed: Set<string>;
}

export const MAX_SUGGESTIONS = 4;
const TEST_WINDOW_DAYS = 7;

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const whenWords = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);

/** Every suggestion that applies, most time-sensitive first, before anything is hidden or cut. */
export function allSuggestions(input: SuggestionInputs): Suggestion[] {
  const list: Suggestion[] = [];
  if (input.pausedPractice && input.pausedPractice.position < input.pausedPractice.total) {
    list.push({ id: 'paused-practice', to: input.pausedPractice.url, label: 'Finish your practice session', reason: `You stopped at question ${input.pausedPractice.position + 1} of ${input.pausedPractice.total}.` });
  }
  if (input.pausedReview && input.pausedReview.left > 0) {
    list.push({ id: 'paused-review', to: input.pausedReview.url, label: 'Finish your flashcard review', reason: `${plural(input.pausedReview.left, 'card')} left in the review you started.` });
  }
  for (const step of input.steps) {
    if (!step.targetDate || step.targetDate > input.today) continue;
    const late = step.targetDate < input.today;
    list.push({
      id: `step-${step.stepId}-${step.targetDate}`,
      to: `/planner/${step.itemId}`,
      label: `${step.stepTitle} for ${step.itemTitle}`,
      reason: late ? 'Its target date, which you set, has passed. The due date is unchanged.' : 'You set today as the target for this step.',
    });
  }
  const tests = input.tests
    .map((test) => ({ ...test, days: daysBetween(input.today, test.dueDate) }))
    .filter((test) => test.days >= 0 && test.days <= TEST_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);
  for (const test of tests) {
    list.push(input.hasPracticeQuestions
      ? { id: `test-${test.id}-${test.dueDate}`, to: '/practice', label: `Practise for ${test.title}`, reason: `It is ${whenWords(test.days)}, by your Planner.` }
      : { id: `test-${test.id}-${test.dueDate}`, to: `/planner/${test.id}`, label: `Prepare for ${test.title}`, reason: `It is ${whenWords(test.days)}, by your Planner.` });
  }
  if (input.cardsDue > 0) {
    list.push({ id: `cards-${input.cardsDue}`, to: '/cards/review', label: `Review ${plural(input.cardsDue, 'flashcard')}`, reason: 'They are due today on their review schedule.' });
  }
  if (input.savedQuestions > 0) {
    list.push({ id: `saved-${input.savedQuestions}`, to: '/practice/session?mode=saved', label: `Try your ${plural(input.savedQuestions, 'saved question')} again`, reason: 'You saved them for later.' });
  }
  if (input.weakTopic) {
    list.push({
      id: `topic-${input.weakTopic.label}-${input.weakTopic.answered}-${input.weakTopic.percent}`,
      to: `/practice/session?mode=topic&topic=${encodeURIComponent(input.weakTopic.label)}`,
      label: `Practise ${input.weakTopic.label}`,
      reason: `Your latest answers to its ${plural(input.weakTopic.answered, 'question')} scored ${input.weakTopic.percent}%.`,
    });
  }
  if (input.mistakes > 0) {
    list.push({ id: `mistakes-${input.mistakes}`, to: '/practice/session?mode=mistakes', label: `Go over ${plural(input.mistakes, 'missed question')}`, reason: 'Your latest answer to each was not fully right.' });
  }
  if (input.lessonsToReview > 0) {
    list.push({ id: `lessons-${input.lessonsToReview}`, to: '/study', label: `Revisit ${plural(input.lessonsToReview, 'lesson step')}`, reason: 'You marked them as needing review.' });
  }
  if (input.nextCheckpoint) {
    list.push({ id: `lesson-${input.nextCheckpoint.id}`, to: `/study/checkpoints/${input.nextCheckpoint.id}`, label: `Continue with ${input.nextCheckpoint.title}`, reason: 'It is the next unfinished step in your lessons.' });
  }
  return list;
}

/** What Today shows: a few suggestions, never the one Start studying already offers, minus any hidden today. */
export function pickSuggestions(input: SuggestionInputs): { shown: Suggestion[]; hidden: number } {
  const all = allSuggestions(input).filter((item) => item.to !== input.primaryTo);
  const seen = new Set<string>();
  const unique = all.filter((item) => (seen.has(item.to + item.label) ? false : (seen.add(item.to + item.label), true)));
  const visible = unique.filter((item) => !input.dismissed.has(item.id));
  return { shown: visible.slice(0, MAX_SUGGESTIONS), hidden: unique.length - visible.length };
}
