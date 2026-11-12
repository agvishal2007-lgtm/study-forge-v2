import { getDb, notifyChanged } from './db';

/**
 * Study in progress: a practice session part-way through, a flashcard review, questions saved for
 * later. Each is one small record that syncs, so a session started on a laptop can be finished on
 * a phone. Removing one is a deletion that syncs too.
 */
export type StudyStateId = 'practiceSession' | 'reviewSession' | 'practiceSaved' | `reading-${string}`;

export async function readStudyState<T>(id: StudyStateId): Promise<T | undefined> {
  const record = await (await getDb()).get('studyState', id);
  return record?.value as T | undefined;
}

export async function writeStudyState<T>(id: StudyStateId, value: T): Promise<void> {
  const db = await getDb();
  const before = await db.get('studyState', id);
  await db.put('studyState', { id, value, updatedAt: Math.max(Date.now(), (before?.updatedAt ?? 0) + 1) });
  notifyChanged();
}

export async function clearStudyState(id: StudyStateId): Promise<void> {
  await (await getDb()).delete('studyState', id);
  notifyChanged();
}
