import { getDb, notifyChanged } from './db';

/*
 * Trash for everything that isn't a course, topic or file. (Those three already stay in place with a
 * "binned" status.) A note, deck, practice set, lesson or planner item moved to Trash is taken out of
 * its list, and an exact copy of it and everything that belongs to it (cards, questions, steps,
 * progress) is kept as one Trash entry. Restoring puts those same records back, with the same ids, so
 * nothing is duplicated and every reference still works.
 *
 * Each entry is one record in the synced "study in progress" collection, so Trash follows the
 * student to their other devices, and permanently deleting an entry removes the only copy; nothing
 * can come back from another device afterwards.
 */
export type TrashKind = 'note' | 'deck' | 'practiceSet' | 'lesson' | 'plannerItem';

type Store = 'notes' | 'decks' | 'cards' | 'cardProgress' | 'practiceSets' | 'practiceQuestions' | 'practiceAttempts' | 'lessons' | 'checkpoints' | 'checkpointProgress' | 'plannerItems';
const STORES: Store[] = ['notes', 'decks', 'cards', 'cardProgress', 'practiceSets', 'practiceQuestions', 'practiceAttempts', 'lessons', 'checkpoints', 'checkpointProgress', 'plannerItems'];

export interface TrashEntry {
  id: string;
  kind: TrashKind;
  name: string;
  courseId: string | null;
  deletedAt: number;
  /** Everything that was taken out, in the order to put it back. */
  records: { store: Store; value: Record<string, unknown> & { id: string } }[];
}

const PREFIX = 'trash-';
type Tx = ReturnType<Awaited<ReturnType<typeof getDb>>['transaction']>;

async function gather(tx: Tx, kind: TrashKind, id: string): Promise<TrashEntry['records']> {
  const one = async (store: Store, key: string) => {
    const value = await tx.objectStore(store as never).get(key as never);
    return value ? [{ store, value: value as TrashEntry['records'][number]['value'] }] : [];
  };
  const children = async (store: Store, index: string, parent: string) =>
    ((await tx.objectStore(store as never).index(index as never).getAll(parent as never)) as TrashEntry['records'][number]['value'][]).map((value) => ({ store, value }));
  if (kind === 'note') return one('notes', id);
  if (kind === 'plannerItem') return one('plannerItems', id);
  if (kind === 'deck') {
    const cards = await children('cards', 'deckId', id);
    const progress = (await Promise.all(cards.map((card) => one('cardProgress', card.value.id)))).flat();
    return [...(await one('decks', id)), ...cards, ...progress];
  }
  if (kind === 'practiceSet') {
    return [...(await one('practiceSets', id)), ...(await children('practiceQuestions', 'setId', id)), ...(await children('practiceAttempts', 'setId', id))];
  }
  const checkpoints = await children('checkpoints', 'lessonId', id);
  const progress = (await Promise.all(checkpoints.map((checkpoint) => one('checkpointProgress', checkpoint.value.id)))).flat();
  return [...(await one('lessons', id)), ...checkpoints, ...progress];
}

const nameOf = (kind: TrashKind, value: Record<string, unknown> | undefined) => {
  const text = (key: string) => (typeof value?.[key] === 'string' ? (value[key] as string).trim() : '');
  if (kind === 'note') return text('title') || text('body').split('\n').find((line) => line.trim())?.replace(/^[#•\-\d.\s]+/, '').slice(0, 80) || 'Untitled note';
  return text('title') || text('name') || 'Untitled';
};

/** Takes something and everything that belongs to it out of the lists, and keeps it in Trash. */
export async function moveToTrash(kind: TrashKind, id: string): Promise<void> {
  const tx = (await getDb()).transaction([...STORES, 'studyState'] as never, 'readwrite');
  const records = await gather(tx as never, kind, id);
  if (records.length === 0) { await tx.done; return; }
  const main = records[0].value;
  const entry: TrashEntry = {
    id: `${PREFIX}${crypto.randomUUID()}`,
    kind,
    name: nameOf(kind, main),
    courseId: typeof main.courseId === 'string' ? main.courseId : null,
    deletedAt: Date.now(),
    records,
  };
  await tx.objectStore('studyState' as never).put({ id: entry.id, value: entry, updatedAt: entry.deletedAt } as never);
  for (const { store, value } of [...records].reverse()) await tx.objectStore(store as never).delete(value.id as never);
  await tx.done;
  notifyChanged();
}

export async function listTrashEntries(): Promise<TrashEntry[]> {
  const all = (await (await getDb()).getAll('studyState')) as { id: string; value: unknown }[];
  return all
    .filter((record) => record.id.startsWith(PREFIX) && record.value && typeof record.value === 'object' && Array.isArray((record.value as TrashEntry).records))
    .map((record) => record.value as TrashEntry)
    .sort((a, b) => b.deletedAt - a.deletedAt);
}

/**
 * Puts everything back where it was. Anything that already exists again (restored on another
 * device, say) is left as it is, so nothing is duplicated. If its course has since been deleted for
 * good, it comes back without a course instead of pointing at nothing. Returns a note when that happened.
 */
export async function restoreFromTrash(entryId: string): Promise<string> {
  const db = await getDb();
  const tx = db.transaction([...STORES, 'studyState', 'courses', 'topics', 'calendarEvents'] as never, 'readwrite');
  const record = (await tx.objectStore('studyState' as never).get(entryId as never)) as { value: TrashEntry } | undefined;
  if (!record) { await tx.done; return 'It was already restored or deleted.'; }
  const entry = record.value;
  let courseGone = false;
  for (const { store, value } of entry.records) {
    if (await tx.objectStore(store as never).get(value.id as never)) continue;
    const next: Record<string, unknown> = { ...value, updatedAt: Math.max(Date.now(), Number(value.updatedAt ?? 0) + 1) };
    if (typeof next.courseId === 'string' && !(await tx.objectStore('courses' as never).get(next.courseId as never))) {
      next.courseId = null;
      if ('topicId' in next) next.topicId = null;
      courseGone = true;
    } else if (typeof next.topicId === 'string' && !(await tx.objectStore('topics' as never).get(next.topicId as never))) {
      next.topicId = null;
    }
    await tx.objectStore(store as never).put(next as never);
  }
  // A calendar item removed earlier is no longer kept away from the next calendar update.
  if (entry.kind === 'plannerItem') await tx.objectStore('calendarEvents' as never).delete(`removed-${entry.records[0].value.id}` as never);
  await tx.objectStore('studyState' as never).delete(entryId as never);
  await tx.done;
  notifyChanged();
  return courseGone ? 'Its course was deleted for good, so it came back without a course.' : '';
}

/** Deletes it for good. Only called after the student confirms. */
export async function deleteTrashEntry(entryId: string): Promise<void> {
  await (await getDb()).delete('studyState', entryId as never);
  notifyChanged();
}
