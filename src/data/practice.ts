import { getDb, notifyChanged } from './db';
import type { PracticeAttempt, PracticeQuestion, PracticeSet, Topic } from './types';

const SESSION_KEY = 'practiceSession';

export const listPracticeSets = async (): Promise<PracticeSet[]> => {
  const sets = await (await getDb()).getAll('practiceSets');
  return sets.sort((a, b) => a.name.localeCompare(b.name));
};
export const getPracticeSet = async (id: string) => (await getDb()).get('practiceSets', id);
export const listPracticeQuestions = async (): Promise<PracticeQuestion[]> => {
  const questions = await (await getDb()).getAll('practiceQuestions');
  return questions.sort((a, b) => a.createdAt - b.createdAt);
};
export const listPracticeAttempts = async (): Promise<PracticeAttempt[]> => (await getDb()).getAll('practiceAttempts');
export const listAllTopics = async (): Promise<Topic[]> => (await getDb()).getAll('topics');

export async function createPracticeSet(name: string, courseId: string | null): Promise<PracticeSet> {
  const now = Date.now();
  const set: PracticeSet = { id: crypto.randomUUID(), name: name.trim(), courseId, topicId: null, createdAt: now, updatedAt: now };
  await (await getDb()).put('practiceSets', set);
  notifyChanged();
  return set;
}

export async function updatePracticeSet(id: string, changes: Pick<PracticeSet, 'name' | 'courseId' | 'topicId'>): Promise<void> {
  const tx = (await getDb()).transaction('practiceSets', 'readwrite');
  const set = await tx.store.get(id);
  if (!set) throw new Error('This set no longer exists.');
  await tx.store.put({ ...set, ...changes, name: changes.name.trim(), updatedAt: Math.max(Date.now(), set.updatedAt + 1) });
  await tx.done;
  notifyChanged();
}

export async function deletePracticeSet(id: string): Promise<void> {
  const tx = (await getDb()).transaction(['practiceSets', 'practiceQuestions', 'practiceAttempts'], 'readwrite');
  for (const question of await tx.objectStore('practiceQuestions').index('setId').getAll(id)) await tx.objectStore('practiceQuestions').delete(question.id);
  for (const attempt of await tx.objectStore('practiceAttempts').index('setId').getAll(id)) await tx.objectStore('practiceAttempts').delete(attempt.id);
  await tx.objectStore('practiceSets').delete(id);
  await tx.done;
  notifyChanged();
}

export async function savePracticeQuestion(question: Omit<PracticeQuestion, 'createdAt' | 'updatedAt'>): Promise<void> {
  const tx = (await getDb()).transaction('practiceQuestions', 'readwrite');
  const current = await tx.store.get(question.id);
  const now = Date.now();
  await tx.store.put({ ...question, createdAt: current?.createdAt ?? now, updatedAt: Math.max(now, (current?.updatedAt ?? 0) + 1) });
  await tx.done;
  notifyChanged();
}

export async function deletePracticeQuestion(id: string): Promise<void> {
  const tx = (await getDb()).transaction(['practiceQuestions', 'practiceAttempts'], 'readwrite');
  for (const attempt of await tx.objectStore('practiceAttempts').index('questionId').getAll(id)) await tx.objectStore('practiceAttempts').delete(attempt.id);
  await tx.objectStore('practiceQuestions').delete(id);
  await tx.done;
  notifyChanged();
}

/** Saves one answer. If this attempt was already saved, the first one stands, so nothing counts twice. */
export async function recordAttempt(attempt: PracticeAttempt): Promise<void> {
  const tx = (await getDb()).transaction('practiceAttempts', 'readwrite');
  if (!(await tx.store.getKey(attempt.id))) await tx.store.put(attempt);
  await tx.done;
  notifyChanged();
}

export interface PracticeSession {
  id: string;
  url: string;
  questionIds: string[];
  position: number;
  attemptId: string;
  draft: string;
  selected: number | null;
  confidence: PracticeAttempt['confidence'];
  /** The typed answer was submitted, and the student is checking it against the model answer. */
  checking: boolean;
  answer: string;
  /** Time actually spent with the session open and in view, so a session left overnight doesn't claim hours. */
  activeMs?: number;
  /** Questions that were removed after the session began, and were skipped rather than shown. */
  skipped?: number;
  /** Set when the student chose to stop early; what was answered still counts. */
  endedEarly?: boolean;
}

/** Records how hard a question felt. It changes nothing about whether the answer was right. */
export async function setAttemptDifficulty(id: string, difficulty: PracticeAttempt['difficulty']): Promise<void> {
  const db = await getDb();
  const attempt = await db.get('practiceAttempts', id);
  if (!attempt) return;
  await db.put('practiceAttempts', { ...attempt, difficulty, updatedAt: Math.max(Date.now(), attempt.updatedAt + 1) });
  notifyChanged();
}

/*
 * Questions saved for later. Only the question's own id is kept, so the original question, its set
 * and its history stay exactly where they are; a removed question simply drops off the list.
 */
const SAVED_KEY = 'practiceSaved';
export async function savedQuestionIds(): Promise<string[]> {
  const saved = await (await getDb()).get('meta', SAVED_KEY);
  return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
}
export async function toggleSavedQuestion(id: string): Promise<boolean> {
  const db = await getDb();
  const saved = await savedQuestionIds();
  const keep = !saved.includes(id);
  await db.put('meta', keep ? [...saved, id] : saved.filter((other) => other !== id), SAVED_KEY);
  notifyChanged();
  return keep;
}

export const loadPracticeSession = async () => (await (await getDb()).get('meta', SESSION_KEY)) as PracticeSession | undefined;
export async function savePracticeSession(session: PracticeSession): Promise<void> {
  await (await getDb()).put('meta', session, SESSION_KEY);
}
export async function clearPracticeSession(): Promise<void> {
  await (await getDb()).delete('meta', SESSION_KEY);
  notifyChanged();
}
