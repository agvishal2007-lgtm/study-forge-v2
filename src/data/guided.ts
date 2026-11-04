import { getDb, notifyChanged } from './db';
import { applyStudyAction, newProgress, type StudyAction } from './mastery';
import type { Checkpoint, CheckpointProgress, Lesson, Teaching } from './types';

export const emptyTeaching = (): Teaching => ({ intro: '', meaning: '', why: '', parts: [], example: '', walkthrough: [], keyIdea: '' });

export async function listLessons(): Promise<Lesson[]> {
  const lessons = await (await getDb()).getAll('lessons');
  return lessons.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export const getLesson = async (id: string) => (await getDb()).get('lessons', id);

export async function createLesson(title: string, label: string, courseId: string | null): Promise<Lesson> {
  const db = await getDb();
  const now = Date.now();
  const lesson: Lesson = { id: crypto.randomUUID(), title: title.trim(), label: label.trim() || 'Lesson', courseId, order: now, createdAt: now };
  await db.put('lessons', lesson);
  notifyChanged();
  return lesson;
}

export async function saveLesson(lesson: Lesson): Promise<void> {
  await (await getDb()).put('lessons', lesson);
  notifyChanged();
}

/** Removes the lesson, its checkpoints, and their progress. Only called after the student confirms. */
export async function deleteLesson(id: string): Promise<void> {
  const tx = (await getDb()).transaction(['lessons', 'checkpoints', 'checkpointProgress'], 'readwrite');
  for (const checkpointId of await tx.objectStore('checkpoints').index('lessonId').getAllKeys(id)) {
    await tx.objectStore('checkpoints').delete(checkpointId);
    await tx.objectStore('checkpointProgress').delete(checkpointId);
  }
  await tx.objectStore('lessons').delete(id);
  await tx.done;
  notifyChanged();
}

export async function listCheckpoints(): Promise<Checkpoint[]> {
  const checkpoints = await (await getDb()).getAll('checkpoints');
  return checkpoints.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export const getCheckpoint = async (id: string) => (await getDb()).get('checkpoints', id);

export async function saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
  await (await getDb()).put('checkpoints', checkpoint);
  notifyChanged();
}

export async function deleteCheckpoint(id: string): Promise<void> {
  const tx = (await getDb()).transaction(['checkpoints', 'checkpointProgress'], 'readwrite');
  await tx.objectStore('checkpoints').delete(id);
  await tx.objectStore('checkpointProgress').delete(id);
  await tx.done;
  notifyChanged();
}

export async function listProgress(): Promise<Map<string, CheckpointProgress>> {
  const records = await (await getDb()).getAll('checkpointProgress');
  return new Map(records.map((record) => [record.checkpointId, record]));
}

export const getProgress = async (id: string) => (await getDb()).get('checkpointProgress', id);

/** Saves one action in a single transaction, so a double-click or reload can't count anything twice. */
export async function recordStudyAction(checkpoint: Checkpoint, action: StudyAction): Promise<CheckpointProgress> {
  const tx = (await getDb()).transaction('checkpointProgress', 'readwrite');
  const now = Date.now();
  const current = (await tx.store.get(checkpoint.id)) ?? newProgress(checkpoint.id, now);
  const next = applyStudyAction(checkpoint, current, action, now);
  await tx.store.put(next);
  await tx.done;
  if (action.type !== 'draft') notifyChanged();
  return next;
}

/** Clears progress for one checkpoint. The lesson, its questions, and everything else stay. */
export async function resetProgress(checkpointId: string): Promise<void> {
  await (await getDb()).delete('checkpointProgress', checkpointId);
  notifyChanged();
}
