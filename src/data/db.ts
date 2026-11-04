import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { CURRENT_DB } from './account';
import { OLD_YELLOW, SPINE_COLORS, type Checkpoint, type PlannerItem, type ExamResult, type PracticeAttempt, type PracticeQuestion, type PracticeSet, type CardProgress, type Deck, type Flashcard, CheckpointProgress, Course, Lesson, Material, Note, RecordingSession, Topic } from './types';

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
  lessons: { key: string; value: Lesson };
  checkpoints: { key: string; value: Checkpoint; indexes: { lessonId: string } };
  checkpointProgress: { key: string; value: CheckpointProgress };
  syncMeta: { key: string; value: { hash: string | null; rev: number } };
  plannerItems: { key: string; value: PlannerItem };
  decks: { key: string; value: Deck };
  cards: { key: string; value: Flashcard; indexes: { deckId: string } };
  cardProgress: { key: string; value: CardProgress };
  practiceSets: { key: string; value: PracticeSet };
  practiceQuestions: { key: string; value: PracticeQuestion; indexes: { setId: string } };
  practiceAttempts: { key: string; value: PracticeAttempt; indexes: { setId: string; questionId: string } };
  examResults: { key: string; value: ExamResult };
}

let dbPromise: Promise<IDBPDatabase<StudyForgeDB>> | null = null;

export function getDb() {
  dbPromise ??= openDB<StudyForgeDB>(CURRENT_DB, 10, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
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
      if (oldVersion < 4) {
        db.createObjectStore('lessons', { keyPath: 'id' });
        db.createObjectStore('checkpoints', { keyPath: 'id' }).createIndex('lessonId', 'lessonId');
        db.createObjectStore('checkpointProgress', { keyPath: 'checkpointId' });
      }
      if (oldVersion < 5) {
        db.createObjectStore('syncMeta');
      }
      if (oldVersion < 7) {
        db.createObjectStore('plannerItems', { keyPath: 'id' });
      }
      if (oldVersion < 8) {
        db.createObjectStore('decks', { keyPath: 'id' });
        db.createObjectStore('cards', { keyPath: 'id' }).createIndex('deckId', 'deckId');
        db.createObjectStore('cardProgress', { keyPath: 'cardId' });
      }
      if (oldVersion < 9) {
        db.createObjectStore('practiceSets', { keyPath: 'id' });
        db.createObjectStore('practiceQuestions', { keyPath: 'id' }).createIndex('setId', 'setId');
        const attempts = db.createObjectStore('practiceAttempts', { keyPath: 'id' });
        attempts.createIndex('setId', 'setId');
        attempts.createIndex('questionId', 'questionId');
      }
      if (oldVersion < 10) {
        db.createObjectStore('examResults', { keyPath: 'id' });
      }
      if (oldVersion >= 1 && oldVersion < 6) {
        for (let cursor = await transaction.objectStore('courses').openCursor(); cursor; cursor = await cursor.continue()) {
          if (cursor.value.color === OLD_YELLOW) await cursor.update({ ...cursor.value, color: SPINE_COLORS[0] });
        }
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

export async function closeDb(): Promise<void> {
  const open = dbPromise;
  dbPromise = null;
  (await open)?.close();
}

// Tells every open screen and browser tab that saved data changed.
const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CURRENT_DB) : null;
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
