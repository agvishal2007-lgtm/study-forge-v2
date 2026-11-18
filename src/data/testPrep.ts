import { getDb, notifyChanged } from './db';
import type { Attempt, ScoreEntry, TestId } from './testPrepRules';

export * from './testPrepRules';
export * from './testPrepQuestions';

/*
 * Where SAT and PSAT work is kept: the same synced place the rest of this uses, so it follows a
 * student between devices with no new collection and no change to what governs access.
 */
const SETUP_ID = 'prep-setup';
const SCORE_PREFIX = 'prep-score-';
const ATTEMPT_PREFIX = 'prep-attempt-';

export interface PrepSetup {
  test: TestId;
  /** YYYY-MM-DD, or empty when they haven't got a date yet. */
  testDate: string;
  /** A total they're aiming for, or null. Never guessed for them. */
  goalTotal: number | null;
}

export const DEFAULT_SETUP: PrepSetup = { test: 'sat', testDate: '', goalTotal: null };

export async function getPrepSetup(): Promise<PrepSetup> {
  const record = (await (await getDb()).get('studyState', SETUP_ID)) as { value?: Partial<PrepSetup> } | undefined;
  const saved = record?.value;
  if (!saved || typeof saved !== 'object') return DEFAULT_SETUP;
  return {
    test: typeof saved.test === 'string' ? (saved.test as TestId) : DEFAULT_SETUP.test,
    testDate: typeof saved.testDate === 'string' ? saved.testDate : '',
    goalTotal: typeof saved.goalTotal === 'number' ? saved.goalTotal : null,
  };
}

export async function savePrepSetup(setup: PrepSetup): Promise<void> {
  const db = await getDb();
  await db.put('studyState', { id: SETUP_ID, value: setup, updatedAt: Date.now() });
  notifyChanged();
}

const readAll = async <T>(prefix: string, keep: (value: T) => boolean): Promise<T[]> => {
  const all = (await (await getDb()).getAll('studyState')) as { id: string; value: unknown }[];
  return all
    .filter((record) => record.id.startsWith(prefix) && record.value && typeof record.value === 'object')
    .map((record) => record.value as T)
    .filter(keep);
};

export const listScores = () => readAll<ScoreEntry>(SCORE_PREFIX, (score) => typeof score.date === 'string');

export async function saveScore(score: ScoreEntry): Promise<void> {
  const db = await getDb();
  const current = (await db.get('studyState', score.id)) as { updatedAt?: number } | undefined;
  const updatedAt = Math.max(Date.now(), (current?.updatedAt ?? 0) + 1);
  await db.put('studyState', { id: score.id, value: { ...score, updatedAt }, updatedAt });
  notifyChanged();
}

export async function addScore(fields: Omit<ScoreEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<ScoreEntry> {
  const now = Date.now();
  const score: ScoreEntry = { ...fields, id: `${SCORE_PREFIX}${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, createdAt: now, updatedAt: now };
  await saveScore(score);
  return score;
}

export async function deleteScore(id: string): Promise<void> {
  await (await getDb()).delete('studyState', id);
  notifyChanged();
}

export const listAttempts = () => readAll<Attempt>(ATTEMPT_PREFIX, (attempt) => typeof attempt.questionId === 'string');

/** One answered question, kept so weak areas come from the student's own work and nothing else. */
export async function addAttempt(questionId: string, domain: string, correct: boolean): Promise<void> {
  const now = Date.now();
  const attempt: Attempt = {
    id: `${ATTEMPT_PREFIX}${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    questionId,
    domain,
    correct,
    at: now,
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.put('studyState', { id: attempt.id, value: attempt, updatedAt: now });
  notifyChanged();
}
