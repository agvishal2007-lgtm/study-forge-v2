import { getDb, notifyChanged } from './db';
import { hashFile, storeMaterial } from './store';
import type { Material, RecordingSession } from './types';

/**
 * A recording is saved as small pieces while it happens, so a crash loses only the last
 * few seconds. Pieces are removed only after the finished file has been stored safely.
 */
const piecesOf = (id: string) => IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);

export async function createSession(session: RecordingSession): Promise<void> {
  await (await getDb()).put('recordings', session);
}

export async function appendPiece(id: string, sequence: number, piece: Blob, elapsedMs: number): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(['recordings', 'recordingChunks'], 'readwrite');
  await tx.objectStore('recordingChunks').put(piece, [id, sequence]);
  const session = await tx.objectStore('recordings').get(id);
  if (!session) throw new Error('This recording no longer exists.');
  const bytes = session.bytes + piece.size;
  await tx.objectStore('recordings').put({ ...session, bytes, elapsedMs });
  await tx.done;
  return bytes;
}

const lockName = (id: string) => `study-forge-recording-${id}`;

/** Holds a lock while recording, so other tabs don't mistake this recording for an abandoned one. */
export function holdRecordingLock(id: string): () => void {
  if (!navigator.locks) return () => undefined;
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  void navigator.locks.request(lockName(id), () => held);
  return release;
}

/** Recordings that stopped without being finished and aren't being recorded in any tab. */
export async function listUnfinished(): Promise<RecordingSession[]> {
  const sessions = await (await getDb()).getAll('recordings');
  if (!navigator.locks || sessions.length === 0) return sessions;
  const { held = [] } = await navigator.locks.query();
  const active = new Set(held.map((lock) => lock.name));
  return sessions.filter((session) => !active.has(lockName(session.id)));
}

const EXTENSIONS: [string, string][] = [['video/mp4', 'mp4'], ['webm', 'webm'], ['mp4', 'm4a'], ['aac', 'm4a'], ['ogg', 'ogg']];

/** Turns the saved pieces into one file in the library, and only then removes the pieces. */
export async function finishSession(id: string): Promise<Material | null> {
  const db = await getDb();
  const session = await db.get('recordings', id);
  if (!session) throw new Error('This recording no longer exists.');
  const pieces = await db.getAll('recordingChunks', piecesOf(id));
  if (pieces.length === 0) {
    await discardSession(id);
    return null;
  }
  const extension = EXTENSIONS.find(([type]) => session.mimeType.includes(type))?.[1] ?? 'webm';
  const type = session.mimeType.split(';')[0];
  const file = new File(pieces, `${session.name}.${extension}`, { type });
  const { signal } = new AbortController();
  const hash = await hashFile(file, signal, () => undefined);
  const material = await storeMaterial(file, hash, { courseId: session.courseId, topicId: session.topicId }, signal, () => undefined);
  await removeSession(id);
  return material;
}

async function removeSession(id: string): Promise<void> {
  const tx = (await getDb()).transaction(['recordings', 'recordingChunks'], 'readwrite');
  await tx.objectStore('recordingChunks').delete(piecesOf(id));
  await tx.objectStore('recordings').delete(id);
  await tx.done;
  notifyChanged();
}

export const discardSession = removeSession;
