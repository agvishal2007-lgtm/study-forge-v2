import { DEFAULT_WEIGHTS, PRIORITY_MODES, type PriorityMode, type Weights } from './priorityRules';

/**
 * The student's saved way of ordering work. Kept on the device, so it is remembered between visits
 * without needing an account. Today's Plan reads the same choice, so the two never disagree.
 */

const MODE_KEY = 'study-forge-priority-mode';
const WEIGHTS_KEY = 'study-forge-priority-weights';
const PINNED_KEY = 'study-forge-priority-pinned';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // Private windows and blocked storage are fine; the usual order is used.
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Remembering the choice is a convenience, never a requirement.
  }
  // Lets the student's other devices follow, when they're signed in.
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('study-forge-setting-changed', { detail: 'priorities' }));
};

export function savedMode(): PriorityMode {
  const value = read(MODE_KEY);
  return PRIORITY_MODES.includes(value as PriorityMode) ? (value as PriorityMode) : 'due';
}

export const saveMode = (mode: PriorityMode) => write(MODE_KEY, mode);

export function savedWeights(): Weights {
  const raw = read(WEIGHTS_KEY);
  if (!raw) return DEFAULT_WEIGHTS;
  try {
    const parsed = JSON.parse(raw) as Partial<Weights>;
    const number = (value: unknown, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10 ? value : fallback;
    return {
      urgency: number(parsed.urgency, DEFAULT_WEIGHTS.urgency),
      points: number(parsed.points, DEFAULT_WEIGHTS.points),
      impact: number(parsed.impact, DEFAULT_WEIGHTS.impact),
      effort: number(parsed.effort, DEFAULT_WEIGHTS.effort),
      importance: number(parsed.importance, DEFAULT_WEIGHTS.importance),
    };
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

export const saveWeights = (weights: Weights) => write(WEIGHTS_KEY, JSON.stringify(weights));

export function savedPinned(): string[] {
  const raw = read(PINNED_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export const savePinned = (ids: string[]) => write(PINNED_KEY, JSON.stringify(ids));
