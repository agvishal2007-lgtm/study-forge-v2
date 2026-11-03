import { getDb } from './db';

/**
 * Stores original files. It prefers the browser's private file system, which writes
 * large files in pieces. createWritable also commits atomically, so an interrupted
 * save leaves no half-written file behind. Browsers without it fall back to IndexedDB.
 */
export class SaveCancelled extends Error {}

const SAVE_LOCK = 'study-forge-saving';

const supportsStreaming = () =>
  typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype;

async function folder() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('materials', { create: true });
}

export async function saveBlob(
  id: string,
  file: File,
  signal: AbortSignal,
  onProgress: (bytesSaved: number) => void,
): Promise<void> {
  if (!supportsStreaming()) {
    if (signal.aborted) throw new SaveCancelled();
    await (await getDb()).put('blobs', file, id);
    onProgress(file.size);
    return;
  }

  const dir = await folder();
  const handle = await dir.getFileHandle(id, { create: true });
  const writable = await handle.createWritable();
  const reader = file.stream().getReader();
  let saved = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new SaveCancelled();
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      saved += value.byteLength;
      onProgress(saved);
    }
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    await dir.removeEntry(id).catch(() => undefined);
    throw error;
  }
}

/** Returns the original file, or null when the browser no longer has it. */
export async function readBlob(id: string): Promise<Blob | null> {
  const stored = await (await getDb()).get('blobs', id);
  if (stored) return stored;
  if (!supportsStreaming()) return null;
  try {
    const handle = await (await folder()).getFileHandle(id);
    return await handle.getFile();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    throw error;
  }
}

/**
 * A save cut off by a reload or crash can leave an empty entry with no file record.
 * Files with a record are never touched, and this skips its turn while any save is running.
 */
export async function removeLeftovers(hasRecord: (id: string) => Promise<boolean>): Promise<void> {
  if (!supportsStreaming() || !navigator.locks) return;
  await navigator.locks.request(SAVE_LOCK, { ifAvailable: true }, async (lock) => {
    if (!lock) return;
    const dir = await folder();
    for await (const name of dir.keys()) {
      if (!(await hasRecord(name))) await dir.removeEntry(name).catch(() => undefined);
    }
  });
}

/** Runs one save while marking it in progress, for removeLeftovers. Tabs can save at the same time. */
export function whileSaving<T>(work: () => Promise<T>): Promise<T> {
  if (!navigator.locks) return work();
  return navigator.locks.request(SAVE_LOCK, { mode: 'shared' }, work) as Promise<T>;
}

export async function deleteBlob(id: string): Promise<void> {
  await (await getDb()).delete('blobs', id);
  if (!supportsStreaming()) return;
  try {
    await (await folder()).removeEntry(id);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
  }
}
