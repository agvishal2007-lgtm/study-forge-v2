import { createSHA256 } from 'hash-wasm';
import { deleteBlob, removeLeftovers, saveBlob, whileSaving } from './blobs';
import { getDb, notifyChanged } from './db';
import { recordUndo, snapshotOf, type UndoStore } from './undo';
import { byPlace, reordered } from './courseRules';
import { categorize, nameFromUrl, tidyUrl, type LinkCategory } from './linkRules';
import { SPINE_COLORS, type Course, type Lifecycle, type Material, type ResourceLink, type Topic } from './types';

/** Courses in use. Archived and binned courses are kept, but asked for separately. */
export async function listCourses(status: Lifecycle = 'active'): Promise<Course[]> {
  const courses = await (await getDb()).getAll('courses');
  return courses.filter((course) => course.status === status).sort(byPlace);
}

/** Every course whatever its status, for the places that need the whole picture (backup, search, the bin). */
export const listAllCourses = async (): Promise<Course[]> => (await (await getDb()).getAll('courses')).sort(byPlace);


export async function createCourse(name: string, code: string): Promise<Course> {
  const db = await getDb();
  const count = await db.count('courses');
  const now = Date.now();
  const course: Course = {
    id: crypto.randomUUID(),
    name: name.trim(),
    code: code.trim(),
    color: SPINE_COLORS[count % SPINE_COLORS.length],
    term: '',
    position: count,
    status: 'active',
    statusAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('courses', course);
  notifyChanged();
  return course;
}

export const getCourse = async (id: string) => (await getDb()).get('courses', id);

/** Removes the course but keeps every file: its files stay in the Library. */
export async function deleteCourse(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['courses', 'topics', 'materials', 'notes', 'lessons', 'plannerItems', 'decks', 'practiceSets', 'examResults', 'calendarEvents'], 'readwrite');
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
  for (const result of await tx.objectStore('examResults').getAll()) {
    if (result.courseId === id) await tx.objectStore('examResults').put({ ...result, courseId: null, updatedAt: Math.max(Date.now(), result.updatedAt + 1) });
  }
  for (const event of await tx.objectStore('calendarEvents').getAll()) {
    if (event.courseId === id) await tx.objectStore('calendarEvents').put({ ...event, courseId: null, updatedAt: Math.max(Date.now(), event.updatedAt + 1) });
  }
  for (const lesson of await tx.objectStore('lessons').getAll()) {
    if (lesson.courseId === id) await tx.objectStore('lessons').put({ ...lesson, courseId: null });
  }
  await tx.objectStore('courses').delete(id);
  await tx.done;
  notifyChanged();
}

export async function listTopics(courseId: string, status: Lifecycle = 'active'): Promise<Topic[]> {
  const topics = await (await getDb()).getAllFromIndex('topics', 'courseId', courseId);
  return topics.filter((topic) => topic.status === status).sort(byPlace);
}

/** Every topic of a course whatever its status. */
export const listTopicsAnyStatus = async (courseId: string): Promise<Topic[]> =>
  (await (await getDb()).getAllFromIndex('topics', 'courseId', courseId)).sort(byPlace);

export async function createTopic(courseId: string, name: string, heading = ''): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const count = (await db.getAllFromIndex('topics', 'courseId', courseId)).length;
  const topic: Topic = { id: crypto.randomUUID(), courseId, name: name.trim(), heading: heading.trim(), position: count, status: 'active', statusAt: now, createdAt: now, updatedAt: now };
  await db.put('topics', topic);
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

/** Files in use. Archived and binned files are kept, but asked for separately. */
export async function listMaterials(status: Lifecycle = 'active'): Promise<Material[]> {
  const materials = await (await getDb()).getAll('materials');
  return materials.filter((material) => material.status === status).sort((a, b) => b.createdAt - a.createdAt);
}

/** Every file whatever its status, for backup and the bin. */
export const listAllMaterials = async (): Promise<Material[]> =>
  (await (await getDb()).getAll('materials')).sort((a, b) => b.createdAt - a.createdAt);

export const getMaterial = async (id: string) => (await getDb()).get('materials', id);

export async function fileMaterial(id: string, courseId: string | null, topicId: string | null) {
  const db = await getDb();
  const material = await db.get('materials', id);
  if (!material) throw new Error('This file record no longer exists.');
  await undoable(`Moved ${material.name}`, 'materials', [id], async () => {
    await db.put('materials', { ...material, courseId, topicId, updatedAt: Date.now() });
    notifyChanged();
  });
}

/** Only ever called after the student confirms. The file goes first, then its record. */
export async function deleteMaterial(id: string): Promise<void> {
  // Its extra associations go too; they point at nothing once the resource is gone.
  for (const link of await listResourceLinks(id)) await (await getDb()).delete('resourceLinks', link.id);
  // A saved link has no bytes on the device; removing it never touches the page it points at.
  const existing = await (await getDb()).get('materials', id);
  if (existing?.kind !== 'link') await deleteBlob(id);
  const tx = (await getDb()).transaction(['materials', 'notes', 'checkpoints', 'fileText', 'transcripts'], 'readwrite');
  await tx.objectStore('fileText').delete(id);
  await tx.objectStore('transcripts').delete(id);
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
    kind: 'upload',
    url: '',
    category: 'other',
    status: 'active',
    statusAt: Date.now(),
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

/* ---- Lifecycle: Active, Archived, Trashed. Removing for good stays a separate, explicit step. ---- */

/**
 * Moves a course between in use, put away, and the bin. Nothing inside it is touched: its topics,
 * files, notes and history stay exactly as they are, so restoring brings the whole course back.
 */
export async function setCourseStatus(id: string, status: Lifecycle): Promise<void> {
  const db = await getDb();
  const course = await db.get('courses', id);
  if (!course) return;
  const now = Date.now();
  await undoable(statusLabel(status, course.name), 'courses', [id], async () => {
    await db.put('courses', { ...course, status, statusAt: now, updatedAt: Math.max(now, course.updatedAt + 1) });
    notifyChanged();
  });
}

/** Moves a topic between in use, put away, and the bin. Its files and notes stay where they are. */
export async function setTopicStatus(id: string, status: Lifecycle): Promise<void> {
  const db = await getDb();
  const topic = await db.get('topics', id);
  if (!topic) return;
  const now = Date.now();
  await undoable(statusLabel(status, topic.name), 'topics', [id], async () => {
    await db.put('topics', { ...topic, status, statusAt: now, updatedAt: Math.max(now, topic.updatedAt + 1) });
    notifyChanged();
  });
}

/** Moves a file between in use, put away, and the bin. The file itself is kept until it is removed for good. */
export async function setMaterialStatus(id: string, status: Lifecycle): Promise<void> {
  const db = await getDb();
  const material = await db.get('materials', id);
  if (!material) return;
  await undoable(statusLabel(status, material.name), 'materials', [id], async () => {
    await db.put('materials', { ...material, status, statusAt: Date.now(), updatedAt: Date.now() });
    notifyChanged();
  });
}

/**
 * Pins or unpins a file or link. It is a mark on the one record, so nothing is copied, and a
 * pinned resource still lives in every course and topic it already belonged to.
 */
export async function setPinned(id: string, pinned: boolean): Promise<void> {
  const db = await getDb();
  const material = await db.get('materials', id);
  if (!material || Boolean(material.pinnedAt) === pinned) return;
  await undoable(`${pinned ? 'Pinned' : 'Unpinned'} ${material.name}`, 'materials', [id], async () => {
    await db.put('materials', { ...material, pinnedAt: pinned ? Date.now() : null, updatedAt: Date.now() });
    notifyChanged();
  });
}

/** Everything sitting in the bin, newest first, so it can be restored or removed for good. */
export async function listTrash(): Promise<{ courses: Course[]; topics: Topic[]; materials: Material[] }> {
  const db = await getDb();
  const [courses, topics, materials] = await Promise.all([db.getAll('courses'), db.getAll('topics'), db.getAll('materials')]);
  const binned = <T extends { status: Lifecycle; statusAt: number }>(list: T[]) =>
    list.filter((item) => item.status === 'trashed').sort((a, b) => b.statusAt - a.statusAt);
  return { courses: binned(courses), topics: binned(topics), materials: binned(materials) };
}

/**
 * Runs a change and remembers exactly how to put it back. Every undoable action goes through here,
 * so Undo never has to guess an opposite: it restores the versions these snapshots captured.
 */
async function undoable(label: string, store: UndoStore, ids: string[], change: () => Promise<void>): Promise<void> {
  const before = await Promise.all(ids.map((id) => snapshotOf(store, id)));
  await change();
  const after = await Promise.all(ids.map((id) => snapshotOf(store, id)));
  recordUndo(label, ids.map((id, at) => ({ store, id, before: before[at], after: after[at] }))
    // A record the change did not actually touch has nothing to undo.
    .filter((snapshot) => JSON.stringify(snapshot.before) !== JSON.stringify(snapshot.after)));
}

/** What a student would call putting something in the bin, archiving it, or taking it back out. */
function statusLabel(status: Lifecycle, name: string): string {
  if (status === 'trashed') return `Moved ${name} to the bin`;
  if (status === 'archived') return `Archived ${name}`;
  return `Restored ${name}`;
}

/* ---- Editing and ordering, so a student can organize courses however they need. ---- */

/** Renames a course, or changes its code or term. Empty term means no semester: an independent study. */
export async function updateCourse(id: string, changes: { name?: string; code?: string; term?: string }): Promise<void> {
  const db = await getDb();
  const course = await db.get('courses', id);
  if (!course) return;
  const now = Date.now();
  const name = changes.name === undefined ? course.name : changes.name.trim();
  if (!name) return;
  const label = name === course.name ? `Edited ${course.name}` : `Renamed ${course.name} to ${name}`;
  await undoable(label, 'courses', [id], async () => {
    await db.put('courses', {
      ...course,
      name,
      code: changes.code === undefined ? course.code : changes.code.trim(),
      term: changes.term === undefined ? course.term : changes.term.trim(),
      updatedAt: Math.max(now, course.updatedAt + 1),
    });
    notifyChanged();
  });
}

/** Renames a topic, or moves it under a different heading. Empty heading means ungrouped. */
export async function updateTopic(id: string, changes: { name?: string; heading?: string }): Promise<void> {
  const db = await getDb();
  const topic = await db.get('topics', id);
  if (!topic) return;
  const now = Date.now();
  const name = changes.name === undefined ? topic.name : changes.name.trim();
  if (!name) return;
  const label = name === topic.name ? `Edited ${topic.name}` : `Renamed ${topic.name} to ${name}`;
  await undoable(label, 'topics', [id], async () => {
    await db.put('topics', {
      ...topic,
      name,
      heading: changes.heading === undefined ? topic.heading : changes.heading.trim(),
      updatedAt: Math.max(now, topic.updatedAt + 1),
    });
    notifyChanged();
  });
}

/** Writes a new order to the database after the pure rules work it out. */
async function applyOrder<T extends { id: string; position: number; createdAt: number; updatedAt: number }>(
  write: (item: T) => Promise<void>,
  siblings: T[],
  id: string,
  direction: 'up' | 'down',
): Promise<void> {
  const ordered = reordered(siblings, id, direction);
  if (!ordered) return;
  const now = Date.now();
  for (const [place, item] of ordered.entries()) {
    if (item.position === place) continue;
    await write({ ...item, position: place, updatedAt: Math.max(now, item.updatedAt + 1) });
  }
  notifyChanged();
}

/** Moves a course one place earlier or later among the courses in the same term. */
export async function moveCourse(id: string, direction: 'up' | 'down'): Promise<void> {
  const db = await getDb();
  const course = await db.get('courses', id);
  if (!course) return;
  const siblings = (await db.getAll('courses')).filter((other) => other.status === 'active' && other.term === course.term);
  await undoable(`Moved ${course.name} ${direction}`, 'courses', siblings.map((other) => other.id), async () => {
    await applyOrder(async (next) => { await db.put('courses', next); }, siblings, id, direction);
  });
}

/** Moves a topic one place earlier or later within its heading's group. */
export async function moveTopic(id: string, direction: 'up' | 'down'): Promise<void> {
  const db = await getDb();
  const topic = await db.get('topics', id);
  if (!topic) return;
  const siblings = (await db.getAllFromIndex('topics', 'courseId', topic.courseId))
    .filter((other) => other.status === 'active' && other.heading === topic.heading);
  await undoable(`Moved ${topic.name} ${direction}`, 'topics', siblings.map((other) => other.id), async () => {
    await applyOrder(async (next) => { await db.put('topics', next); }, siblings, id, direction);
  });
}


/* ---- Saved links. A link is an address, not a copy of whatever sits behind it. ---- */

/**
 * Saves a web address as a resource of its own, alongside uploaded files. Study Forge stores only
 * the address: it does not download, import or copy the page, and opening it may still need the
 * student's own login to that site.
 */
export async function saveLink(input: {
  url: string;
  name?: string;
  category?: LinkCategory;
  courseId?: string | null;
  topicId?: string | null;
}): Promise<Material> {
  const url = tidyUrl(input.url);
  if (!url) throw new Error('That is not a web address Study Forge can save. It needs to start with http:// or https://.');
  const now = Date.now();
  const link: Material = {
    id: crypto.randomUUID(),
    name: (input.name ?? '').trim() || nameFromUrl(url),
    mimeType: 'text/uri-list',
    size: 0,
    hash: '',
    courseId: input.courseId ?? null,
    topicId: input.topicId ?? null,
    kind: 'link',
    url,
    category: input.category ?? categorize(url),
    status: 'active',
    statusAt: now,
    createdAt: now,
  };
  await (await getDb()).put('materials', link);
  notifyChanged();
  return link;
}

/** Changes a saved link's name, address or category. */
export async function updateLink(id: string, changes: { name?: string; url?: string; category?: LinkCategory }): Promise<void> {
  const db = await getDb();
  const link = await db.get('materials', id);
  if (!link || link.kind !== 'link') return;
  const url = changes.url === undefined ? link.url : tidyUrl(changes.url);
  if (!url) throw new Error('That is not a web address Study Forge can save.');
  const name = (changes.name === undefined ? link.name : changes.name).trim();
  const finalName = name || nameFromUrl(url);
  await undoable(finalName === link.name ? `Edited ${link.name}` : `Renamed ${link.name} to ${finalName}`, 'materials', [id], async () => {
    await db.put('materials', { ...link, name: finalName, url, category: changes.category ?? link.category, updatedAt: Date.now() });
    notifyChanged();
  });
}

/* ---- Extra places a resource appears. One record, one copy of the bytes, many associations. ---- */

/** Every extra association for a resource. */
export const listResourceLinks = async (resourceId: string): Promise<ResourceLink[]> =>
  (await (await getDb()).getAllFromIndex('resourceLinks', 'resourceId', resourceId));

export const listAllResourceLinks = async (): Promise<ResourceLink[]> => (await getDb()).getAll('resourceLinks');

/**
 * Also puts a resource in another course, or another topic, without copying it. Doing this twice
 * for the same place changes nothing, and the resource keeps the place it was first filed under.
 */
export async function addResourceLink(resourceId: string, courseId: string, topicId: string | null = null): Promise<void> {
  const db = await getDb();
  const resource = await db.get('materials', resourceId);
  if (!resource) return;
  // Where it is already filed is not an "extra" place.
  if (resource.courseId === courseId && resource.topicId === topicId) return;
  const existing = await db.getAllFromIndex('resourceLinks', 'resourceId', resourceId);
  if (existing.some((link) => link.courseId === courseId && link.topicId === topicId)) return;
  const now = Date.now();
  const linkId = crypto.randomUUID();
  const course = await db.get('courses', courseId);
  await undoable(`Added ${resource.name} to ${course?.name ?? 'another course'}`, 'resourceLinks', [linkId], async () => {
    await db.put('resourceLinks', { id: linkId, resourceId, courseId, topicId, createdAt: now, updatedAt: now });
    notifyChanged();
  });
}

/** Takes a resource out of one extra place. The resource itself, and every other place, are untouched. */
export async function removeResourceLink(id: string): Promise<void> {
  const db = await getDb();
  const link = await db.get('resourceLinks', id);
  const resource = link ? await db.get('materials', link.resourceId) : undefined;
  const course = link ? await db.get('courses', link.courseId) : undefined;
  // Removing one association never touches the resource itself, which may be in other courses too.
  await undoable(`Removed ${resource?.name ?? 'a resource'} from ${course?.name ?? 'a course'}`, 'resourceLinks', [id], async () => {
    await db.delete('resourceLinks', id);
    notifyChanged();
  });
}

/**
 * Everything that belongs to a course: the resources filed under it, plus any that were also put
 * there. One resource never appears twice.
 */
export async function materialsForCourse(courseId: string): Promise<Material[]> {
  const db = await getDb();
  const [all, links] = await Promise.all([db.getAll('materials'), db.getAllFromIndex('resourceLinks', 'courseId', courseId)]);
  const wanted = new Set(links.map((link) => link.resourceId));
  return all.filter((material) => material.status === 'active' && (material.courseId === courseId || wanted.has(material.id)));
}

/** The topic a resource sits in for a given course: its own filing, or an extra association. */
export function topicWithin(material: Material, links: ResourceLink[], courseId: string): string | null {
  if (material.courseId === courseId) return material.topicId;
  return links.find((link) => link.resourceId === material.id && link.courseId === courseId)?.topicId ?? null;
}
