import { getDb, notifyChanged } from './db';

/**
 * Undo works on snapshots, not on replayed opposites. Each undoable action records exactly what a
 * record looked like before and after it ran, so undoing is simply putting the earlier version
 * back. That also makes "respecting later changes" straightforward: if a record no longer matches
 * the version this action left behind, something happened since, and undoing would quietly throw
 * that away. It is refused and the student is told why.
 *
 * The stack lives for the visit. Reloading the page ends it, because an undo offered hours later,
 * after work the student has forgotten, is a trap rather than a safety net.
 */
export type UndoStore = 'courses' | 'topics' | 'materials' | 'resourceLinks';

interface Snapshot {
  store: UndoStore;
  id: string;
  /** What the record was. null means it did not exist yet. */
  before: Record<string, unknown> | null;
  /** What the action left. null means the action removed it. */
  after: Record<string, unknown> | null;
}

export interface UndoAction {
  id: string;
  at: number;
  /** What the student did, in their words: "Renamed Biology". */
  label: string;
  snapshots: Snapshot[];
}

const LIMIT = 25;
let stack: UndoAction[] = [];
const listeners = new Set<() => void>();

const announce = () => listeners.forEach((listener) => listener());

export function watchUndo(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The action an Undo would reverse right now, or nothing. */
export const lastAction = (): UndoAction | null => stack[stack.length - 1] ?? null;

export function clearUndo() {
  stack = [];
  announce();
}

export function recordUndo(label: string, snapshots: Snapshot[]) {
  if (snapshots.length === 0) return;
  stack = [...stack, { id: crypto.randomUUID(), at: Date.now(), label, snapshots }].slice(-LIMIT);
  announce();
}

/** Reads a record so an action can snapshot it before and after itself. */
export async function snapshotOf(store: UndoStore, id: string): Promise<Record<string, unknown> | null> {
  const found = await (await getDb()).get(store, id);
  return (found as Record<string, unknown> | undefined) ?? null;
}

const same = (one: unknown, two: unknown) => JSON.stringify(one ?? null) === JSON.stringify(two ?? null);

const WORD: Record<UndoStore, string> = { courses: 'course', topics: 'topic', materials: 'file', resourceLinks: 'link to a course' };

/**
 * Puts the last action back. Returns what happened, in a sentence fit to show a student. Nothing is
 * changed unless every record is still exactly as the action left it.
 */
export async function undoLast(): Promise<{ ok: boolean; message: string }> {
  const action = lastAction();
  if (!action) return { ok: false, message: 'There is nothing to undo.' };
  const db = await getDb();
  for (const snapshot of action.snapshots) {
    const current = (await db.get(snapshot.store, snapshot.id)) ?? null;
    if (!same(current, snapshot.after)) {
      // Dropping this action keeps the student from pressing Undo again and again on a dead entry.
      stack = stack.filter((entry) => entry.id !== action.id);
      announce();
      const changed = current === null ? 'has since been removed' : 'has changed since';
      return { ok: false, message: `This can't be undone: the ${WORD[snapshot.store]} ${changed}. Nothing was altered.` };
    }
  }
  for (const snapshot of action.snapshots) {
    if (snapshot.before === null) await db.delete(snapshot.store, snapshot.id);
    else await db.put(snapshot.store, snapshot.before as never);
  }
  stack = stack.filter((entry) => entry.id !== action.id);
  announce();
  notifyChanged();
  return { ok: true, message: `Undone: ${action.label.charAt(0).toLowerCase()}${action.label.slice(1)}.` };
}
