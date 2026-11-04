import { createSHA256 } from 'hash-wasm';
import { deleteBlob, removeLeftovers, saveBlob, whileSaving } from './blobs';
import { getDb, notifyChanged } from './db';
import { SPINE_COLORS, type Course, type Material, type Topic } from './types';

export async function listCourses(): Promise<Course[]> {
  const courses = await (await getDb()).getAll('courses');
  return courses.sort((a, b) => a.createdAt - b.createdAt);
}

export async function createCourse(name: string, code: string): Promise<Course> {
  const db = await getDb();
  const count = await db.count('courses');
  const course: Course = {
    id: crypto.randomUUID(),
    name: name.trim(),
    code: code.trim(),
    color: SPINE_COLORS[count % SPINE_COLORS.length],
    createdAt: Date.now(),
  };
  await db.put('courses', course);
  notifyChanged();
  return course;
}

export const getCourse = async (id: string) => (await getDb()).get('courses', id);

/** Removes the course but keeps every file: its files stay in the Library. */
export async function deleteCourse(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['courses', 'topics', 'materials', 'notes', 'lessons', 'plannerItems', 'decks', 'practiceSets'], 'readwrite');
  for (const topicId of await tx.objectStore('topics').index('courseId').getAllKeys(id)) {
    await tx.objectStore('topics').delete(topicId);
  }
  for (const material of await tx.objectStore('materials').getAll()) {
    if (material.courseId === id) {
      await tx.objectStore('materials').put({ ...material, courseId: null, topicId: null });
    }
  }
  for (const note of await tx.objectStore('notes').getAll()) {
    if (note.courseId === id) await tx.objectStore('notes').put({ ...note, courseId: null, topicId: null });
  }
  for (const item of await tx.objectStore('plannerItems').getAll()) {
    if (item.courseId === id) await tx.objectStore('plannerItems').put({ ...item, courseId: null });
  }
  for (const deck of await tx.objectStore('decks').getAll()) {
    if (deck.courseId === id) await tx.objectStore('decks').put({ ...deck, courseId: null, topicId: null, updatedAt: Math.max(Date.now(), deck.updatedAt + 1) });
  }
  for (const set of await tx.objectStore('practiceSets').getAll()) {
    if (set.courseId === id) await tx.objectStore('practiceSets').put({ ...set, courseId: null, topicId: null, updatedAt: Math.max(Date.now(), set.updatedAt + 1) });
  }
  for (const lesson of await tx.objectStore('lessons').getAll()) {
    if (lesson.courseId === id) await tx.objectStore('lessons').put({ ...lesson, courseId: null });
  }
  await tx.objectStore('courses').delete(id);
  await tx.done;
  notifyChanged();
}

export async function listTopics(courseId: string): Promise<Topic[]> {
  const topics = await (await getDb()).getAllFromIndex('topics', 'courseId', courseId);
  return topics.sort((a, b) => a.createdAt - b.createdAt);
}

export async function createTopic(courseId: string, name: string): Promise<void> {
  const topic: Topic = { id: crypto.randomUUID(), courseId, name: name.trim(), createdAt: Date.now() };
  await (await getDb()).put('topics', topic);
  notifyChanged();
}

/** Removes the topic but keeps its files in the course. */
export async function deleteTopic(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['topics', 'materials', 'notes', 'decks', 'practiceSets'], 'readwrite');
  for (const material of await tx.objectStore('materials').getAll()) {
    if (material.topicId === id) await tx.objectStore('materials').put({ ...material, topicId: null });
  }
  for (const note of await tx.objectStore('notes').getAll()) {
    if (note.topicId === id) await tx.objectStore('notes').put({ ...note, topicId: null });
  }
  for (const deck of await tx.objectStore('decks').getAll()) {
    if (deck.topicId === id) await tx.objectStore('decks').put({ ...deck, topicId: null, updatedAt: Math.max(Date.now(), deck.updatedAt + 1) });
  }
  for (const set of await tx.objectStore('practiceSets').getAll()) {
    if (set.topicId === id) await tx.objectStore('practiceSets').put({ ...set, topicId: null, updatedAt: Math.max(Date.now(), set.updatedAt + 1) });
  }
  await tx.objectStore('topics').delete(id);
  await tx.done;
  notifyChanged();
}

export async function listMaterials(): Promise<Material[]> {
  const materials = await (await getDb()).getAll('materials');
  return materials.sort((a, b) => b.createdAt - a.createdAt);
}

export const getMaterial = async (id: string) => (await getDb()).get('materials', id);

export async function fileMaterial(id: string, courseId: string | null, topicId: string | null) {
  const db = await getDb();
  const material = await db.get('materials', id);
  if (!material) throw new Error('This file record no longer exists.');
  await db.put('materials', { ...material, courseId, topicId });
  notifyChanged();
}

/** Only ever called after the student confirms. The file goes first, then its record. */
export async function deleteMaterial(id: string): Promise<void> {
  await deleteBlob(id);
  const tx = (await getDb()).transaction(['materials', 'notes', 'checkpoints'], 'readwrite');
  for (const checkpoint of await tx.objectStore('checkpoints').getAll()) {
    if (checkpoint.materialId === id) await tx.objectStore('checkpoints').put({ ...checkpoint, materialId: null });
  }
  for (const note of await tx.objectStore('notes').getAll()) {
    if (note.materialId === id) await tx.objectStore('notes').put({ ...note, materialId: null });
  }
  await tx.objectStore('materials').delete(id);
  await tx.done;
  notifyChanged();
}

export async function hashFile(
  file: Blob,
  signal: AbortSignal,
  onProgress: (bytesRead: number) => void,
): Promise<string> {
  const hasher = await createSHA256();
  const reader = file.stream().getReader();
  let read = 0;
  for (;;) {
    if (signal.aborted) {
      await reader.cancel();
      throw new DOMException('Cancelled', 'AbortError');
    }
    const { done, value } = await reader.read();
    if (done) break;
    hasher.update(value);
    read += value.byteLength;
    onProgress(read);
  }
  return hasher.digest('hex');
}

export async function findByHash(hash: string): Promise<Material | undefined> {
  return (await getDb()).getFromIndex('materials', 'hash', hash);
}

/** Saves the original first. The record is written only after that fully succeeds. */
export async function storeMaterial(
  file: File,
  hash: string,
  target: { courseId: string | null; topicId: string | null },
  signal: AbortSignal,
  onProgress: (bytesSaved: number) => void,
  restored?: { id: string; createdAt: number },
): Promise<Material> {
  const material: Material = {
    id: restored?.id ?? crypto.randomUUID(),
    name: file.name,
    mimeType: file.type,
    size: file.size,
    hash,
    courseId: target.courseId,
    topicId: target.topicId,
    createdAt: restored?.createdAt ?? Date.now(),
  };
  // The file and its record count as one save, so cleanup can't run between them.
  await whileSaving(async () => {
    await saveBlob(material.id, file, signal, onProgress);
    try {
      await (await getDb()).put('materials', material);
    } catch (error) {
      await deleteBlob(material.id).catch(() => undefined);
      throw error;
    }
  });
  notifyChanged();
  return material;
}

export async function cleanUpInterruptedSaves(): Promise<void> {
  const db = await getDb();
  await removeLeftovers(async (id) => (await db.getKey('materials', id)) !== undefined);
}

export interface StorageStatus {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  const persisted = await navigator.storage?.persisted?.().catch(() => null);
  return { usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, persisted: persisted ?? null };
}

export async function requestKeepFiles(): Promise<boolean> {
  return (await navigator.storage?.persist?.().catch(() => false)) ?? false;
}
