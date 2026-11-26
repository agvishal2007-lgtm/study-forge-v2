/**
 * Ticks that have been tapped but not yet saved, held outside the screen that drew them.
 *
 * A planner row already moved the moment it was tapped and let the save follow, which is how a box
 * avoids springing back and looking like a missed tap. That worked while the row stayed where it
 * was. Ticking something off moves it from the list into Done — a different list, in a different
 * part of the page — so React takes the row apart and builds it again, and anything the old row was
 * holding goes with it. The rebuilt row reads the stored value, which has not caught up yet, and
 * the tick springs back after all.
 *
 * Keeping these here instead means the tick belongs to the task rather than to whichever list is
 * showing it, so it survives the move. Each one is dropped as soon as what is stored agrees with
 * it, and dropped if the save fails, so nothing lingers and no change is ever quietly lost.
 *
 * Found by a slow machine: on a fast one the save lands before anything is redrawn, so the bug
 * never shows.
 */
const wanted = new Map<string, boolean>();
const listeners = new Set<() => void>();

/** Changes with every change, so a screen watching this knows to draw again. */
let version = 0;
export const tickVersion = (): number => version;

export const pendingTick = (id: string): boolean | undefined => wanted.get(id);

export function setPendingTick(id: string, value: boolean | undefined): void {
  if (value === undefined) {
    if (!wanted.delete(id)) return;
  } else {
    if (wanted.get(id) === value) return;
    wanted.set(id, value);
  }
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribePendingTicks(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** For tests, so one does not leave a tick behind for the next. */
export function forgetPendingTicks(): void {
  if (wanted.size === 0) return;
  wanted.clear();
  version += 1;
  listeners.forEach((listener) => listener());
}
