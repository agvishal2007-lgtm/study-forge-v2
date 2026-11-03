import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Course, Material, Topic } from './types';

/**
 * IndexedDB is the single source of truth for courses, topics, and file records.
 * The rebuild deliberately has no second copy of this data anywhere else.
 */
interface StudyForgeDB extends DBSchema {
  courses: { key: string; value: Course };
  topics: { key: string; value: Topic; indexes: { courseId: string } };
  materials: { key: string; value: Material; indexes: { hash: string; createdAt: number } };
  blobs: { key: string; value: Blob };
}

let dbPromise: Promise<IDBPDatabase<StudyForgeDB>> | null = null;

export function getDb() {
  dbPromise ??= openDB<StudyForgeDB>('study-forge', 1, {
    upgrade(db) {
      db.createObjectStore('courses', { keyPath: 'id' });
      db.createObjectStore('topics', { keyPath: 'id' }).createIndex('courseId', 'courseId');
      const materials = db.createObjectStore('materials', { keyPath: 'id' });
      materials.createIndex('hash', 'hash');
      materials.createIndex('createdAt', 'createdAt');
      db.createObjectStore('blobs');
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
