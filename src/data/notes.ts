import { getDb, notifyChanged } from './db';
import type { Note } from './types';

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
  await tx.store.put({ ...note, createdAt: current?.createdAt ?? note.createdAt ?? updatedAt, updatedAt });
  await tx.done;
  notifyChanged();
  return updatedAt;
}

export async function deleteNote(id: string): Promise<void> {
  await (await getDb()).delete('notes', id);
  notifyChanged();
}

/** The text a list shows when a note has no title yet. */
export function noteLabel(note: Pick<Note, 'title' | 'body'>): string {
  const firstLine = note.body.split('\n').find((line) => line.trim());
  return note.title.trim() || firstLine?.trim().slice(0, 80) || 'Untitled note';
}
