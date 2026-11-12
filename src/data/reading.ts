import { getDb, notifyChanged } from './db';
import { readStudyState, writeStudyState } from './studyState';
import type { Note, PlannerItem } from './types';
import { cleanReading, type Reading } from './readingRules.ts';

/*
 * Textbook navigation for one file: where the student stopped reading, and their page bookmarks.
 * Kept as synced study state, so a book opened on a phone picks up where the laptop left off.
 */
export async function getReading(materialId: string): Promise<Reading> {
  return cleanReading(await readStudyState(`reading-${materialId}`));
}

export async function saveReading(materialId: string, change: (now: Reading) => Reading): Promise<Reading> {
  const next = cleanReading(change(await getReading(materialId)));
  await writeStudyState(`reading-${materialId}`, next);
  return next;
}

/** A note tied to one page of a file. It opens beside the file and jumps to that page. */
export async function addPageNote(where: { materialId: string; courseId: string | null; topicId: string | null }, page: number): Promise<Note> {
  const now = Date.now();
  const note: Note = { id: crypto.randomUUID(), title: `Page ${page}`, body: '', courseId: where.courseId, topicId: where.topicId, materialId: where.materialId, createdAt: now, updatedAt: now, page };
  await (await getDb()).put('notes', note);
  notifyChanged();
  return note;
}

/** Links or unlinks a file and an assignment. The assignment's dates and status are never touched. */
export async function setAssignmentLink(itemId: string, materialId: string, linked: boolean): Promise<void> {
  const db = await getDb();
  const item = await db.get('plannerItems', itemId) as PlannerItem | undefined;
  if (!item) return;
  const now = new Set(item.materialIds ?? []);
  if (linked) now.add(materialId); else now.delete(materialId);
  await db.put('plannerItems', { ...item, materialIds: [...now], updatedAt: Math.max(Date.now(), item.updatedAt + 1) });
  notifyChanged();
}
