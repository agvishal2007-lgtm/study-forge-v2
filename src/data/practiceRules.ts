import type { Confidence, PracticeAttempt, PracticeKind, PracticeQuestion, PracticeResult } from './types';

/**
 * Practice's rules. This file only calculates, so it can be tested directly.
 * Accuracy uses the latest answer to each question, so fixing a mistake raises it.
 * A partly right answer counts as half. Under 70% counts as weak, which is a starting value.
 */
export const WEAK_BELOW_PERCENT = 70;

export function latestAnswers(attempts: PracticeAttempt[]): Map<string, PracticeAttempt> {
  const latest = new Map<string, PracticeAttempt>();
  for (const attempt of attempts) {
    const current = latest.get(attempt.questionId);
    if (!current || attempt.at > current.at || (attempt.at === current.at && attempt.id > current.id)) latest.set(attempt.questionId, attempt);
  }
  return latest;
}

const score = (result: PracticeResult) => (result === 'correct' ? 1 : result === 'partial' ? 0.5 : 0);

export function accuracyOf(answers: Pick<PracticeAttempt, 'result'>[]): number | null {
  if (answers.length === 0) return null;
  return Math.round((answers.reduce((sum, answer) => sum + score(answer.result), 0) / answers.length) * 100);
}

/** Questions whose latest answer wasn't fully right, with the oldest answers first. */
export function mistakesIn(questions: PracticeQuestion[], attempts: PracticeAttempt[]): PracticeQuestion[] {
  const latest = latestAnswers(attempts);
  return questions
    .filter((question) => {
      const answer = latest.get(question.id);
      return answer && answer.result !== 'correct';
    })
    .sort((a, b) => (latest.get(a.id)?.at ?? 0) - (latest.get(b.id)?.at ?? 0));
}

export interface WeakTopic {
  label: string;
  answered: number;
  percent: number;
  questionIds: string[];
}

export function weakTopics(questions: PracticeQuestion[], attempts: PracticeAttempt[], labelOf: (question: PracticeQuestion) => string): WeakTopic[] {
  const latest = latestAnswers(attempts);
  const groups = new Map<string, PracticeQuestion[]>();
  for (const question of questions) {
    if (!latest.has(question.id)) continue;
    const label = labelOf(question);
    groups.set(label, [...(groups.get(label) ?? []), question]);
  }
  return [...groups.entries()]
    .map(([label, group]) => ({
      label,
      answered: group.length,
      percent: accuracyOf(group.map((question) => latest.get(question.id) as PracticeAttempt)) as number,
      questionIds: group.map((question) => question.id),
    }))
    .filter((topic) => topic.percent < WEAK_BELOW_PERCENT)
    .sort((a, b) => a.percent - b.percent || a.label.localeCompare(b.label));
}

/** Feedback says what kind of result this is, and being sure and wrong is called out as a likely misunderstanding. */
export function feedbackFor(result: PracticeResult, confidence: Confidence | null): { title: string; detail: string } {
  if (result === 'correct') {
    return confidence === 'Guessing'
      ? { title: 'Correct', detail: 'You got it, though you said you were guessing. It may be worth another look.' }
      : { title: 'Correct', detail: 'You understood this one.' };
  }
  if (result === 'partial') return { title: 'Partly right', detail: "Compare your answer with the one below to see what's missing." };
  return confidence === 'Sure'
    ? { title: 'Likely misunderstanding', detail: 'You were sure, but this was wrong. This is the kind of mistake that matters most to fix.' }
    : { title: 'Not quite', detail: 'Read the answer below, and this question will come back in your mistakes.' };
}

export const splitLines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);

export function questionProblems(form: { kind: PracticeKind; prompt: string; optionsText: string; correct: string; acceptedText: string; modelAnswer: string }): string[] {
  const problems: string[] = [];
  if (!form.prompt.trim()) problems.push('Enter the question.');
  if (form.kind === 'multiple') {
    const options = splitLines(form.optionsText);
    if (options.length < 2) problems.push('Enter at least two answer choices, one per line.');
    if (new Set(options).size !== options.length) problems.push('Each answer choice must be different.');
    const correct = Number(form.correct);
    if (form.correct === '' || !Number.isInteger(correct) || correct < 0 || correct >= options.length) problems.push('Choose which answer is correct.');
  } else if (!form.modelAnswer.trim() && splitLines(form.acceptedText).length === 0) {
    problems.push('Enter a model answer or at least one accepted answer, so you have something to check against.');
  }
  return problems;
}
