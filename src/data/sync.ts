import { BackendError, itemKey, type AccountBackend, type PushItem, type RemoteItem, type SyncCollection } from './accountBackend';
import { CURRENT_DB, getActiveAccount, switchAccount, updateAccountDetails } from './account';
import { getDb, notifyChanged, subscribe } from './db';
import type { Checkpoint, CheckpointProgress, Note } from './types';
import { applySyncedSettings, recordCurrentSettings, watchSettings } from './settingsSync';

/**
 * Keeps this device in step with the student's online copy: courses and topics, notes, lessons,
 * the planner and calendar, flashcards, practice, grades, the records of files and links (names,
 * places, pins, the bin), transcripts, settings, and study in progress. A file's contents travel
 * separately; this carries everything that describes it.
 *
 * When two devices changed the same thing, nothing written is thrown away: notes and checkpoints
 * keep both versions, and progress combines the answers from both.
 */
/**
 * A collection only belongs here once the published Firebase rules allow it. The rules reject
 * anything else, and one rejected write stops the whole sync, so a new kind of data must wait
 * until its rules are live. Publish firestore.rules first, then add the collection here.
 */
const COLLECTIONS: SyncCollection[] = ['courses', 'topics', 'lessons', 'checkpoints', 'notes', 'checkpointProgress', 'plannerItems', 'decks', 'cards', 'cardProgress', 'practiceSets', 'practiceQuestions', 'practiceAttempts', 'examResults', 'calendarEvents', 'studyDays', 'studyTime', 'resourceLinks', 'gradeCategories', 'materials', 'transcripts', 'settings', 'studyState'];
const CURSOR_KEY = 'syncCursor';
const MAX_ITEM_BYTES = 900_000;
const MAX_BATCH_BYTES = 4_000_000;
const MAX_BATCH_ITEMS = 200;
const AFTER_CHANGE_MS = 4000;
const FOCUS_CHECK_MS = 60_000;

export type SyncPhase = 'off' | 'syncing' | 'synced' | 'offline' | 'quota' | 'denied' | 'error';

export interface SyncState {
  phase: SyncPhase;
  lastSyncedAt: number | null;
  tooLarge: string[];
  message: string;
  /** Something changed on this device that hasn't reached the account yet. */
  pending: boolean;
}

let state: SyncState = { phase: 'off', lastSyncedAt: null, tooLarge: [], message: '', pending: false };
const listeners = new Set<() => void>();
const setState = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};
export const getSyncState = () => state;
export const subscribeSync = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** A short fingerprint, used only to notice that something changed. */
function fingerprint(text: string): string {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 2654435761);
    b = Math.imul(b ^ code, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return `${text.length}-${(b >>> 0).toString(36)}${(a >>> 0).toString(36)}`;
}

const idField = (collection: SyncCollection) => (collection === 'checkpointProgress' ? 'checkpointId' : collection === 'cardProgress' ? 'cardId' : collection === 'transcripts' ? 'materialId' : 'id');

/** A half-typed answer belongs to this device, so it isn't part of what's compared or sent. */
function serialize(collection: SyncCollection, record: unknown): string {
  if (collection === 'checkpointProgress') return JSON.stringify({ ...(record as CheckpointProgress), draft: '' });
  return JSON.stringify(record);
}

/** Answers and explanations from both devices are kept, so no evidence is ever lost. */
export function mergeProgress(local: CheckpointProgress, remote: CheckpointProgress): CheckpointProgress {
  const answers = new Map([...remote.answers, ...local.answers].map((answer) => [answer.attemptId, answer]));
  const explanations = new Map([...remote.explanations, ...local.explanations].map((item) => [`${item.at}-${item.text}`, item]));
  const newer = remote.lastStudiedAt > local.lastStudiedAt ? remote : local;
  const misses: Record<string, number> = { ...remote.misses };
  for (const [idea, count] of Object.entries(local.misses)) misses[idea] = Math.max(misses[idea] ?? 0, count);
  const mastered = local.status === 'mastered' || remote.status === 'mastered';
  return {
    ...newer,
    draft: local.draft,
    answers: [...answers.values()].sort((a, b) => a.at - b.at),
    explanations: [...explanations.values()].sort((a, b) => a.at - b.at),
    misses,
    reteachCount: Math.max(local.reteachCount, remote.reteachCount),
    teachingFinished: local.teachingFinished || remote.teachingFinished,
    teachingSkipped: local.teachingSkipped && remote.teachingSkipped,
    status: mastered ? 'mastered' : newer.status,
    stage: mastered ? { kind: 'mastered' } : newer.stage,
    masteredAt: local.masteredAt ?? remote.masteredAt,
  };
}

async function applyPulled(items: RemoteItem[]): Promise<number> {
  const db = await getDb();
  let changed = 0;
  for (const item of items) {
    const key = itemKey(item.collection, item.id);
    const tx = db.transaction([item.collection, 'syncMeta'], 'readwrite');
    const store = tx.objectStore(item.collection);
    const metaStore = tx.objectStore('syncMeta');
    const meta = await metaStore.get(key);
    if (meta?.rev === item.rev) {
      await tx.done;
      continue;
    }
    const local = await store.get(item.id as never);
    const localJson = local === undefined ? null : serialize(item.collection, local);
    const localPrint = localJson === null ? null : fingerprint(localJson);
    const changedHere = localPrint !== (meta?.hash ?? null);
    const remotePrint = item.deleted ? null : fingerprint(item.json);

    if (!changedHere || localPrint === remotePrint) {
      // Nothing changed here, so the other device's version simply comes in.
      if (item.deleted) await store.delete(item.id as never);
      else {
        const incoming = JSON.parse(item.json);
        if (item.collection === 'checkpointProgress') incoming.draft = (local as CheckpointProgress | undefined)?.draft ?? '';
        await store.put(incoming as never);
      }
      await metaStore.put({ hash: remotePrint, rev: item.rev }, key);
      changed += 1;
    } else if (item.deleted) {
      // Deleted elsewhere but edited here: the edit wins, so the work isn't lost.
      await metaStore.put({ hash: meta?.hash ?? null, rev: item.rev }, key);
    } else if (local === undefined) {
      // Deleted here but edited elsewhere: the edit wins for the same reason.
      await store.put(JSON.parse(item.json) as never);
      await metaStore.put({ hash: remotePrint, rev: item.rev }, key);
      changed += 1;
    } else if (item.collection === 'checkpointProgress') {
      await store.put(mergeProgress(local as CheckpointProgress, JSON.parse(item.json)) as never);
      await metaStore.put({ hash: meta?.hash ?? null, rev: item.rev }, key);
      changed += 1;
    } else if (item.collection === 'notes' || item.collection === 'checkpoints') {
      // Both devices edited this. Keep this device's version, and add the other as a marked copy.
      const incoming = JSON.parse(item.json);
      const copyId = `${item.id}-other-device-${item.rev}`;
      if (item.collection === 'notes') {
        const note = incoming as Note;
        await store.put({ ...note, id: copyId, title: `${note.title || 'Untitled note'} (from another device)` } as never);
      } else {
        const checkpoint = incoming as Checkpoint;
        await store.put({ ...checkpoint, id: copyId, title: `${checkpoint.title} (from another device)` } as never);
      }
      await metaStore.put({ hash: meta?.hash ?? null, rev: item.rev }, key);
      changed += 1;
    } else if (['courses', 'topics', 'plannerItems', 'decks', 'cards', 'cardProgress', 'practiceSets', 'practiceQuestions', 'practiceAttempts', 'examResults', 'calendarEvents', 'studyDays', 'studyTime', 'resourceLinks', 'gradeCategories', 'materials', 'transcripts', 'settings', 'studyState'].includes(item.collection)) {
      // Both devices changed this. The most recent change wins, so "done" isn't undone by an old edit.
      // Older file records have no change time, so their last status change or creation stands in.
      const when = (record: { updatedAt?: number; statusAt?: number; createdAt?: number }) => record.updatedAt ?? record.statusAt ?? record.createdAt ?? 0;
      const incoming = JSON.parse(item.json) as { updatedAt?: number; statusAt?: number; createdAt?: number };
      // Where a file's verified Drive copy is never gets lost to a rename made elsewhere.
      const driveFileId = item.collection === 'materials' ? (incoming as { driveFileId?: string }).driveFileId ?? (local as { driveFileId?: string }).driveFileId : undefined;
      if (when(incoming) > when(local as typeof incoming)) {
        await store.put((driveFileId ? { ...incoming, driveFileId } : incoming) as never);
        await metaStore.put({ hash: remotePrint, rev: item.rev }, key);
        changed += 1;
      } else if (driveFileId && !(local as { driveFileId?: string }).driveFileId) {
        await store.put({ ...(local as object), driveFileId } as never);
        await metaStore.put({ hash: meta?.hash ?? null, rev: item.rev }, key);
        changed += 1;
      } else {
        await metaStore.put({ hash: meta?.hash ?? null, rev: item.rev }, key);
      }
    } else {
      // A lesson renamed on two devices keeps this device's name.
      await metaStore.put({ hash: meta?.hash ?? null, rev: item.rev }, key);
    }
    await tx.done;
  }
  return changed;
}

async function collectChanges(): Promise<{ items: PushItem[]; tooLarge: string[] }> {
  const db = await getDb();
  const metaKeys = await db.getAllKeys('syncMeta');
  const metas = await db.getAll('syncMeta');
  const meta = new Map(metaKeys.map((key, index) => [String(key), metas[index]]));
  const items: PushItem[] = [];
  const tooLarge: string[] = [];
  const seen = new Set<string>();
  for (const collection of COLLECTIONS) {
    for (const record of await db.getAll(collection)) {
      const id = (record as unknown as Record<string, string>)[idField(collection)];
      const key = itemKey(collection, id);
      seen.add(key);
      const json = serialize(collection, record);
      const existing = meta.get(key);
      if (fingerprint(json) === existing?.hash) continue;
      if (json.length > MAX_ITEM_BYTES) {
        const label = (record as unknown as { title?: string; name?: string }).title || (record as unknown as { name?: string }).name || 'An item';
        tooLarge.push(label);
        continue;
      }
      const rev = existing?.rev ?? 0;
      items.push({ collection, id, json, deleted: false, rev: rev + 1, baseRev: rev });
    }
  }
  for (const [key, existing] of meta) {
    if (seen.has(key) || existing.hash === null) continue;
    const slash = key.indexOf('/');
    items.push({ collection: key.slice(0, slash) as SyncCollection, id: key.slice(slash + 1), json: '', deleted: true, rev: existing.rev + 1, baseRev: existing.rev });
  }
  return { items, tooLarge };
}

async function pushChanges(backend: AccountBackend, uid: string, items: PushItem[]): Promise<boolean> {
  const db = await getDb();
  let conflicted = false;
  let batch: PushItem[] = [];
  let bytes = 0;
  const send = async () => {
    if (batch.length === 0) return;
    const { conflicts } = await backend.push(uid, batch);
    const refused = new Set(conflicts);
    conflicted = conflicted || refused.size > 0;
    const tx = db.transaction('syncMeta', 'readwrite');
    for (const item of batch) {
      const key = itemKey(item.collection, item.id);
      if (!refused.has(key)) await tx.store.put({ hash: item.deleted ? null : fingerprint(item.json), rev: item.rev }, key);
    }
    await tx.done;
    batch = [];
    bytes = 0;
  };
  for (const item of items) {
    if (batch.length >= MAX_BATCH_ITEMS || bytes + item.json.length > MAX_BATCH_BYTES) await send();
    batch.push(item);
    bytes += item.json.length;
  }
  await send();
  return conflicted;
}

let backendInstance: AccountBackend | null = null;
let running = false;
let again = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 0;

/** After a failed sync, tries again on its own, waiting a little longer each time (up to five minutes). */
function retryLater() {
  clearTimeout(retryTimer);
  retryDelay = Math.min(retryDelay ? retryDelay * 2 : 15_000, 5 * 60_000);
  retryTimer = setTimeout(() => void syncNow(), retryDelay);
}

/** Runs one sync. Failures never affect saved work, and only change the status the student sees. */
export async function syncNow(): Promise<void> {
  const account = getActiveAccount();
  if (!account || !backendInstance) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  setState({ phase: 'syncing', message: '' });
  try {
    const db = await getDb();
    let tooLarge: string[] = [];
    // A conflict means another device just wrote, so pull its version and try again.
    for (let round = 0; round < 4; round++) {
      const since = ((await db.get('meta', CURSOR_KEY)) as number | undefined) ?? 0;
      const { items, cursor } = await backendInstance.pull(account.uid, since);
      const changed = await applyPulled(items);
      await db.put('meta', cursor, CURSOR_KEY);
      watchFrom(cursor);
      // A setting chosen on another device takes effect here straight away.
      if (items.some((item) => item.collection === 'settings')) await applySyncedSettings();
      if (changed > 0) notifyChanged();
      const changes = await collectChanges();
      tooLarge = changes.tooLarge;
      if (!(await pushChanges(backendInstance, account.uid, changes.items))) break;
    }
    setState({ phase: 'synced', lastSyncedAt: Date.now(), tooLarge, message: '', pending: false });
    // Files go up after the records, so another device learns where they are on the next sync.
    void import('./driveFiles').then(({ backUpFiles }) => backUpFiles());
    retryDelay = 0;
    clearTimeout(retryTimer);
  } catch (error) {
    const kind = error instanceof BackendError ? error.kind : 'other';
    const phase: SyncPhase = kind === 'offline' ? 'offline' : kind === 'quota' ? 'quota' : kind === 'denied' ? 'denied' : 'error';
    setState({ phase, message: (error as Error).message });
    // Offline waits for the connection to return; a refusal needs the student; anything else retries.
    if (phase === 'error') retryLater();
  } finally {
    running = false;
    if (again) {
      again = false;
      void syncNow();
    }
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let lastFocusCheck = 0;
let stopWatching: (() => void) | null = null;
let watchingSince = 0;
/** A listener that has run a long while is restarted from the latest point, so reconnecting re-reads little. */
const WATCH_REFRESH_MS = 30 * 60_000;
let watchStarted = 0;

/** Listens for changes saved on the student's other devices, and syncs within seconds of one. */
function watchFrom(cursor: number) {
  const account = getActiveAccount();
  if (!account || !backendInstance) return;
  if (stopWatching && cursor <= watchingSince) return;
  if (stopWatching && Date.now() - watchStarted < WATCH_REFRESH_MS) return;
  stopWatching?.();
  watchingSince = cursor;
  watchStarted = Date.now();
  stopWatching = backendInstance.watchChanges(account.uid, cursor, () => void syncNow());
}

/** Starts syncing for the signed-in account. */
export async function startSync(): Promise<void> {
  const account = getActiveAccount();
  if (!account) return;
  backendInstance = await loadBackend();
  backendInstance.watchUser((user) => {
    // Signed out somewhere else, or a different account: never keep showing the wrong data.
    if (!user) switchAccount(null);
    else if (user.uid !== account.uid) switchAccount({ uid: user.uid, email: user.email, photoURL: user.photoURL, usesGoogle: user.usesGoogle });
    else if (user.photoURL !== account.photoURL || user.email !== account.email || Boolean(user.usesGoogle) !== Boolean(account.usesGoogle)) {
      updateAccountDetails({ uid: user.uid, email: user.email, photoURL: user.photoURL, usesGoogle: user.usesGoogle });
    }
  });
  subscribe(() => {
    if (!state.pending) setState({ pending: true });
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), AFTER_CHANGE_MS);
  });
  // Settings live in this browser; these keep the synced copy in step with them.
  watchSettings();
  await recordCurrentSettings().catch(() => undefined);
  const check = () => {
    if (Date.now() - lastFocusCheck < FOCUS_CHECK_MS) return;
    lastFocusCheck = Date.now();
    void syncNow();
  };
  window.addEventListener('focus', check);
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  lastFocusCheck = Date.now();
  await syncNow();
}

export async function loadBackend(): Promise<AccountBackend> {
  if (import.meta.env.VITE_ACCOUNT_BACKEND === 'test') return (await import('./testBackend')).backend;
  return (await import('./firebaseSetup')).backend;
}

/** Removes this student's online copy. What's on this device stays, and syncing stops until they sign in again. */
export async function deleteOnlineCopy(): Promise<void> {
  const account = getActiveAccount();
  if (!account || !backendInstance) throw new Error('You aren\'t signed in.');
  await backendInstance.deleteAll(account.uid);
  const db = await getDb();
  await db.clear('syncMeta');
  await db.delete('meta', CURSOR_KEY);
}

export async function signOutOfAccount(): Promise<void> {
  // Google Drive's permission is forgotten too, so the next person on this computer can't use it.
  try { localStorage.removeItem(`${CURRENT_DB}-drive-access`); } catch { /* nothing kept */ }
  await backendInstance?.signOut();
}
