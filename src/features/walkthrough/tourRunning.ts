import { useSyncExternalStore } from 'react';

/**
 * Whether the walkthrough is on screen right now. Screens that would otherwise greet a student
 * with something of their own — the first-time setup on Courses, say — stay out of the way while
 * the tour is teaching, and offer themselves once it's over.
 */
let running = false;
const listeners = new Set<() => void>();

export function setTourRunning(next: boolean) {
  if (running === next) return;
  running = next;
  listeners.forEach((listener) => listener());
}

export const isTourRunning = () => running;
export const useTourRunning = () => useSyncExternalStore(
  (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  () => running,
  () => false,
);
