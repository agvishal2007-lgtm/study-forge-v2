import { getDb, notifyChanged } from './db';
import type { ExamItem, ExamResult, PracticeAttempt, PracticeResult } from './types';

const IN_PROGRESS = 'examInProgress';

export interface ExamAnswer {
  selected: number | null;
  text: string;
}

/** A running exam stays on this device until it's finished. */
export interface ExamInProgress {
  id: string;
  name: string;
  courseId: string | null;
  durationMinutes: number | null;
  startedAt: number;
  /** A fixed end time, so closing the page doesn't pause the clock. */
  endsAt: number | null;
  questionIds: string[];
  answers: Record<string, ExamAnswer>;
  position: number;
}

export const loadExamInProgress = async () => (await (await getDb()).get('meta', IN_PROGRESS)) as ExamInProgress | undefined;
export async function saveExamInProgress(exam: ExamInProgress) {
  await (await getDb()).put('meta', exam, IN_PROGRESS);
}
export async function clearExamInProgress() {
  await (await getDb()).delete('meta', IN_PROGRESS);
  notifyChanged();
}

export const listExamResults = async (): Promise<ExamResult[]> => {
  const results = await (await getDb()).getAll('examResults');
  return results.sort((a, b) => b.finishedAt - a.finishedAt);
};
export const getExamResult = async (id: string) => (await getDb()).get('examResults', id);

const attemptFor = (result: ExamResult, item: ExamItem, at: number): PracticeAttempt => ({
  id: `${result.id}:${item.questionId}`,
  questionId: item.questionId,
  setId: item.setId,
  sessionId: result.id,
  answer: item.answer,
  result: item.result as PracticeResult,
  selfChecked: false,
  confidence: null,
  at,
  updatedAt: at,
});

/** Saves the result and clears the running exam together, so a finished exam can't be taken twice. */
export async function finishExam(result: ExamResult): Promise<void> {
  const tx = (await getDb()).transaction(['examResults', 'practiceAttempts', 'practiceQuestions', 'meta'], 'readwrite');
  if (!(await tx.objectStore('examResults').getKey(result.id))) {
    await tx.objectStore('examResults').put(result);
    for (const item of result.items) {
      if (item.result !== null && (await tx.objectStore('practiceQuestions').getKey(item.questionId))) {
        await tx.objectStore('practiceAttempts').put(attemptFor(result, item, result.finishedAt));
      }
    }
  }
  await tx.objectStore('meta').delete(IN_PROGRESS);
  await tx.done;
  notifyChanged();
}

/** Records the student's own check of a written answer. */
export async function checkExamAnswer(resultId: string, questionId: string, verdict: PracticeResult): Promise<void> {
  const tx = (await getDb()).transaction(['examResults', 'practiceAttempts', 'practiceQuestions'], 'readwrite');
  const result = await tx.objectStore('examResults').get(resultId);
  if (!result) throw new Error('This exam no longer exists.');
  const now = Math.max(Date.now(), result.updatedAt + 1);
  const items = result.items.map((item) => (item.questionId === questionId ? { ...item, result: verdict } : item));
  const updated = { ...result, items, updatedAt: now };
  await tx.objectStore('examResults').put(updated);
  const item = items.find((entry) => entry.questionId === questionId);
  if (item && (await tx.objectStore('practiceQuestions').getKey(questionId))) {
    await tx.objectStore('practiceAttempts').put({ ...attemptFor(updated, item, result.finishedAt), selfChecked: true, updatedAt: now });
  }
  await tx.done;
  notifyChanged();
}

export async function deleteExamResult(id: string): Promise<void> {
  await (await getDb()).delete('examResults', id);
  notifyChanged();
}
