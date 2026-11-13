import { getDb, notifyChanged } from './db';
import type { Note } from './types';
import { plainNote } from './noteFormat';
import { moveToTrash } from './trash';

/** Thrown when another tab changed a note, so neither version is silently lost. */
export class NoteConflict extends Error {
  constructor(public current: Note) {
    super('This note changed in another tab.');
  }
}

export async function listNotes(): Promise<Note[]> {
  const notes = await (await getDb()).getAll('notes');
  return notes.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getNote = async (id: string) => (await getDb()).get('notes', id);

/**
 * Saves a note and returns its new version time. `expected` is the version this editor last
 * saw: null means a new note, and 'force' means the student chose to replace the other version.
 */
export async function saveNote(
  note: Omit<Note, 'createdAt' | 'updatedAt'> & { createdAt?: number },
  expected: number | null | 'force',
): Promise<number> {
  const tx = (await getDb()).transaction('notes', 'readwrite');
  const current = await tx.store.get(note.id);
  if (current && expected !== 'force' && current.updatedAt !== expected) {
    await tx.done;
    throw new NoteConflict(current);
  }
  const updatedAt = Math.max(Date.now(), (current?.updatedAt ?? 0) + 1);
  // Anything the editor doesn't show (a page or a moment it's tied to) is kept as it was.
  await tx.store.put({ ...current, ...note, createdAt: current?.createdAt ?? note.createdAt ?? updatedAt, updatedAt });
  await tx.done;
  notifyChanged();
  return updatedAt;
}

/** Moves the note to Trash, where it can be restored. */
export const deleteNote = (id: string): Promise<void> => moveToTrash('note', id);

/** The text a list shows when a note has no title yet. */
export function noteLabel(note: Pick<Note, 'title' | 'body'>): string {
  // The first line's words, without marks like "# ", "• " or $...$.
  const firstLine = plainNote(note.body).split('\n').find((line) => line.trim());
  return note.title.trim() || firstLine?.trim().slice(0, 80) || 'Untitled note';
}

/** A note pinned to a moment of a recording. */
export async function addMomentNote(where: { materialId?: string | null; recordingId?: string | null; courseId: string | null; topicId: string | null }, atMs: number, quote = '', segmentId: string | null = null): Promise<Note> {
  const now = Date.now();
  const note: Note = {
    id: crypto.randomUUID(),
    title: '',
    body: '',
    courseId: where.courseId,
    topicId: where.topicId,
    materialId: where.materialId ?? null,
    recordingId: where.recordingId ?? null,
    atMs: Math.max(0, Math.round(atMs)),
    quote,
    segmentId,
    createdAt: now,
    updatedAt: now,
  };
  await (await getDb()).put('notes', note);
  notifyChanged();
  return note;
}

/** When a recording is saved, its moment notes move over to it, keeping their times. */
export async function attachMomentNotes(recordingId: string, materialId: string): Promise<number> {
  const db = await getDb();
  const tx = db.transaction('notes', 'readwrite');
  let moved = 0;
  for (const note of await tx.store.getAll()) {
    if (note.recordingId !== recordingId) continue;
    await tx.store.put({ ...note, materialId, recordingId: null, updatedAt: Math.max(Date.now(), note.updatedAt + 1) });
    moved += 1;
  }
  await tx.done;
  if (moved) notifyChanged();
  return moved;
}
