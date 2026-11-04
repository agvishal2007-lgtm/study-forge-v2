import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Course, Material, Note, RecordingSession, Topic } from './types';

/**
 * IndexedDB is the single source of truth for courses, topics, and file records.
 * The rebuild deliberately has no second copy of this data anywhere else.
 */
interface StudyForgeDB extends DBSchema {
  courses: { key: string; value: Course };
  topics: { key: string; value: Topic; indexes: { courseId: string } };
  materials: { key: string; value: Material; indexes: { hash: string; createdAt: number } };
  blobs: { key: string; value: Blob };
  recordings: { key: string; value: RecordingSession };
  recordingChunks: { key: [string, number]; value: Blob };
  notes: { key: string; value: Note };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<StudyForgeDB>> | null = null;

export function getDb() {
  dbPromise ??= openDB<StudyForgeDB>('study-forge', 3, {
    upgrade(db, oldVersion) {
      // Each step only adds to what's there, so existing students keep their data.
      if (oldVersion < 1) {
        db.createObjectStore('courses', { keyPath: 'id' });
        db.createObjectStore('topics', { keyPath: 'id' }).createIndex('courseId', 'courseId');
        const materials = db.createObjectStore('materials', { keyPath: 'id' });
        materials.createIndex('hash', 'hash');
        materials.createIndex('createdAt', 'createdAt');
        db.createObjectStore('blobs');
      }
      if (oldVersion < 2) {
        db.createObjectStore('recordings', { keyPath: 'id' });
        db.createObjectStore('recordingChunks');
      }
      if (oldVersion < 3) {
        db.createObjectStore('notes', { keyPath: 'id' });
        db.createObjectStore('meta');
      }
    },
    // An older open tab is holding the database, so the update has to wait for it.
    blocked() {
      window.dispatchEvent(new Event('study-forge-update-blocked'));
    },
    // A newer version of the site needs the database, so step aside for it.
    blocking(_current, _blocked, event) {
      (event.target as IDBDatabase).close();
      dbPromise = null;
    },
    terminated() {
      dbPromise = null;
    },
  });
  return dbPromise;
}

// Tells every open screen and browser tab that saved data changed.
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('study-forge') : null;
const listeners = new Set<() => void>();
channel?.addEventListener('message', () => listeners.forEach((listener) => listener()));

export function notifyChanged() {
  listeners.forEach((listener) => listener());
  channel?.postMessage('changed');
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
