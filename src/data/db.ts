import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { CURRENT_DB } from './account';
import { OLD_YELLOW, SPINE_COLORS, type GradeCategory, type ResourceLink, type Checkpoint, type PlannerItem, type CalendarEvent, type StudyDay, type StudyTime, type Transcript, type FileText, type ExamResult, type PracticeAttempt, type PracticeQuestion, type PracticeSet, type CardProgress, type Deck, type Flashcard, CheckpointProgress, Course, Lesson, Material, Note, RecordingSession, Topic } from './types';

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
  fileText: { key: string; value: FileText };
  calendarEvents: { key: string; value: CalendarEvent };
  studyDays: { key: string; value: StudyDay };
  transcripts: { key: string; value: Transcript };
  studyTime: { key: string; value: StudyTime };
  resourceLinks: { key: string; value: ResourceLink; indexes: { resourceId: string; courseId: string } };
  gradeCategories: { key: string; value: GradeCategory; indexes: { courseId: string } };
}

let dbPromise: Promise<IDBPDatabase<StudyForgeDB>> | null = null;

export function getDb() {
  dbPromise ??= openDB<StudyForgeDB>(CURRENT_DB, 19, {
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
      if (oldVersion < 11) {
        db.createObjectStore('fileText', { keyPath: 'materialId' });
      }
      if (oldVersion < 12) {
        db.createObjectStore('calendarEvents', { keyPath: 'id' });
        db.createObjectStore('studyDays', { keyPath: 'id' });
      }
      if (oldVersion < 13) {
        db.createObjectStore('transcripts', { keyPath: 'materialId' });
      }
      if (oldVersion < 14) {
        db.createObjectStore('studyTime', { keyPath: 'id' });
      }
      if (oldVersion < 19) {
        const categories = db.createObjectStore('gradeCategories', { keyPath: 'id' });
        categories.createIndex('courseId', 'courseId');
        // Nothing has a grade or a category yet, and a blank is not a zero.
        const planner = transaction.objectStore('plannerItems');
        for (const item of await planner.getAll()) {
          await planner.put({ ...item, earnedPoints: item.earnedPoints ?? null, categoryId: item.categoryId ?? null });
        }
      }
      if (oldVersion < 18) {
        // Nobody has entered points yet, and a blank is not a zero.
        const planner = transaction.objectStore('plannerItems');
        for (const item of await planner.getAll()) {
          if (item.points === undefined) await planner.put({ ...item, points: null });
        }
      }
      if (oldVersion < 17) {
        const links = db.createObjectStore('resourceLinks', { keyPath: 'id' });
        links.createIndex('resourceId', 'resourceId');
        links.createIndex('courseId', 'courseId');
      }
      if (oldVersion < 16) {
        // Everything saved before now is an uploaded file with real bytes, not a saved link.
        const resources = transaction.objectStore('materials');
        for (const resource of await resources.getAll()) {
          await resources.put({ ...resource, kind: resource.kind ?? 'upload', url: resource.url ?? '', category: resource.category ?? 'other' });
        }
      }
      if (oldVersion < 15) {
        // Everything saved before now is in use, so it all starts Active with its place kept.
        const now = Date.now();
        const courses = transaction.objectStore('courses');
        let rank = 0;
        for (const course of await courses.getAll()) {
          await courses.put({ ...course, term: course.term ?? '', position: course.position ?? rank++, status: course.status ?? 'active', statusAt: course.statusAt ?? course.createdAt ?? now, updatedAt: course.updatedAt ?? course.createdAt ?? now });
        }
        const topics = transaction.objectStore('topics');
        const ranks = new Map<string, number>();
        for (const topic of await topics.getAll()) {
          const next = ranks.get(topic.courseId) ?? 0;
          ranks.set(topic.courseId, next + 1);
          await topics.put({ ...topic, heading: topic.heading ?? '', position: topic.position ?? next, status: topic.status ?? 'active', statusAt: topic.statusAt ?? topic.createdAt ?? now, updatedAt: topic.updatedAt ?? topic.createdAt ?? now });
        }
        const materials = transaction.objectStore('materials');
        for (const material of await materials.getAll()) {
          await materials.put({ ...material, status: material.status ?? 'active', statusAt: material.statusAt ?? material.createdAt ?? now });
        }
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
