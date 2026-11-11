import { deleteDB, openDB } from 'idb';
import { dbNameFor, folderNameFor, getActiveAccount } from './account';
import { type BackupManifest, type OpenedBackup } from './backup';
import type { ZipEntry } from './zipReader';

/** Work done on this device before signing in, which the student can copy into their account. */
export interface GuestSummary {
  courses: number;
  files: number;
  notes: number;
  lessons: number;
}

async function databaseExists(name: string): Promise<boolean> {
  if (!indexedDB.databases) return true;
  return (await indexedDB.databases()).some((database) => database.name === name);
}

const readGuest = async <T>(work: (db: Awaited<ReturnType<typeof openDB>>) => Promise<T>): Promise<T | null> => {
  const name = dbNameFor(null);
  if (!(await databaseExists(name))) return null;
  const db = await openDB(name);
  try {
    return await work(db);
  } finally {
    db.close();
  }
};

const has = (db: Awaited<ReturnType<typeof openDB>>, store: string) => db.objectStoreNames.contains(store);
const all = async (db: Awaited<ReturnType<typeof openDB>>, store: string) => (has(db, store) ? db.getAll(store) : []);

export async function getGuestSummary(): Promise<GuestSummary | null> {
  return readGuest(async (db) => {
    const [courses, files, notes, lessons] = await Promise.all(['courses', 'materials', 'notes', 'lessons'].map((store) => all(db, store)));
    const summary = { courses: courses.length, files: files.length, notes: notes.length, lessons: lessons.length };
    return summary.courses + summary.files + summary.notes + summary.lessons > 0 ? summary : null;
  });
}

/** Presents the no-account work in the same shape as a backup, so copying it follows the same safe rules. */
export async function openGuestAsBackup(): Promise<OpenedBackup | null> {
  return readGuest(async (db) => {
    const [courses, topics, notes, materials, lessons, checkpoints, progress, plannerItems, decks, cards, cardProgress, practiceSets, practiceQuestions, practiceAttempts, examResults, calendarEvents, studyDays, studyTime, resourceLinks, transcripts] = await Promise.all(
      ['courses', 'topics', 'notes', 'materials', 'lessons', 'checkpoints', 'checkpointProgress', 'plannerItems', 'decks', 'cards', 'cardProgress', 'practiceSets', 'practiceQuestions', 'practiceAttempts', 'examResults', 'calendarEvents', 'studyDays', 'studyTime', 'resourceLinks', 'transcripts'].map((store) => all(db, store)),
    );
    const entries = new Map<string, ZipEntry>();
    const blobs = has(db, 'blobs') ? new Map((await db.getAllKeys('blobs')).map((key) => [String(key), key])) : new Map();
    const guestDbBlob = async (id: string): Promise<Blob | null> => {
      if (!blobs.has(id)) return null;
      const again = await openDB(dbNameFor(null));
      try {
        return (await again.get('blobs', id)) ?? null;
      } finally {
        again.close();
      }
    };
    for (const material of materials) {
      entries.set(material.id, {
        name: material.id,
        method: 0,
        async blob() {
          const stored = await guestDbBlob(material.id);
          if (stored) return stored;
          const root = await navigator.storage.getDirectory();
          const folder = await root.getDirectoryHandle(folderNameFor(null));
          return (await folder.getFileHandle(material.id)).getFile();
        },
      });
    }
    const manifest: BackupManifest = {
      format: 'study-forge-backup',
      version: 10,
      createdAt: Date.now(),
      courses,
      topics,
      notes,
      lessons,
      checkpoints,
      progress,
      plannerItems,
      decks,
      cards,
      cardProgress,
      practiceSets,
      practiceQuestions,
      practiceAttempts,
      examResults,
      calendarEvents,
      studyDays,
      studyTime,
      resourceLinks,
      transcripts,
      materials: materials.map((material) => ({ ...material, path: material.id })),
    };
    return { manifest, entries, neededBytes: 0, newFiles: materials.length, freeBytes: null };
  });
}

async function removeFolder(name: string): Promise<void> {
  if (typeof navigator.storage?.getDirectory !== 'function') return;
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(name, { recursive: true }).catch((error: DOMException) => {
    if (error.name !== 'NotFoundError') throw error;
  });
}

export async function removeGuestData(): Promise<void> {
  await deleteDB(dbNameFor(null));
  await removeFolder(folderNameFor(null));
}

/** Clears one account's data from this device, for shared computers. Only called after the student confirms. */
export async function removeAccountFromDevice(): Promise<void> {
  const account = getActiveAccount();
  if (!account) return;
  const { closeDb } = await import('./db');
  await closeDb();
  await deleteDB(dbNameFor(account.uid));
  await removeFolder(folderNameFor(account.uid));
}
