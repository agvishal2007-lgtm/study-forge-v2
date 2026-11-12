import { asOneUndo } from './undo';
import { fileMaterial, setMaterialStatus, setPinned, setShelf } from './store';
import type { Material } from './types';

export type BulkAction =
  | { kind: 'pin' }
  | { kind: 'unpin' }
  | { kind: 'archive' }
  | { kind: 'restore' }
  | { kind: 'trash' }
  | { kind: 'move'; courseId: string | null; topicId: string | null; place: string }
  | { kind: 'shelf'; shelf: string | null };

export interface BulkResult {
  done: number;
  /** Each one that didn't go, by name, with the reason in the student's words. */
  failed: { name: string; reason: string }[];
}

const things = (count: number) => (count === 1 ? '1 item' : `${count} items`);

/** What the action did, in a sentence: "Moved 12 items to the bin". */
export function describe(action: BulkAction, count: number): string {
  switch (action.kind) {
    case 'pin': return `Pinned ${things(count)}`;
    case 'unpin': return `Unpinned ${things(count)}`;
    case 'archive': return `Put away ${things(count)}`;
    case 'restore': return `Put back ${things(count)}`;
    case 'trash': return `Moved ${things(count)} to the bin`;
    case 'move': return `Moved ${things(count)} to ${action.place}`;
    case 'shelf': return action.shelf ? `Put ${things(count)} on ${action.shelf}` : `Took ${things(count)} off their shelf`;
  }
}

/**
 * Applies one action to many files and links. Every one is tried even if an earlier one fails,
 * the failures are reported by name rather than hidden in a total, and the whole batch is a
 * single Undo. Nothing here deletes a file for good; the furthest it goes is the bin.
 */
export async function runBulk(items: Material[], action: BulkAction): Promise<BulkResult> {
  const result: BulkResult = { done: 0, failed: [] };
  await asOneUndo(() => describe(action, result.done), async () => {
    for (const item of items) {
      try {
        if (action.kind === 'pin') await setPinned(item.id, true);
        else if (action.kind === 'unpin') await setPinned(item.id, false);
        else if (action.kind === 'archive') await setMaterialStatus(item.id, 'archived');
        else if (action.kind === 'restore') await setMaterialStatus(item.id, 'active');
        else if (action.kind === 'trash') await setMaterialStatus(item.id, 'trashed');
        else if (action.kind === 'shelf') await setShelf(item.id, action.shelf);
        else await fileMaterial(item.id, action.courseId, action.topicId);
        result.done += 1;
      } catch (error) {
        result.failed.push({ name: item.name, reason: (error as Error).message || 'It could not be changed.' });
      }
    }
  });
  return result;
}

/** The sentence shown afterwards. A partial result says exactly which ones didn't go. */
export function report(action: BulkAction, total: number, result: BulkResult): string {
  if (result.failed.length === 0) return `${describe(action, result.done)}.`;
  const list = result.failed.map((entry) => `${entry.name} (${entry.reason})`).join('; ');
  if (result.done === 0) return `Nothing was changed. ${list}`;
  return `${describe(action, result.done)} of ${total}. These didn't change: ${list}`;
}
