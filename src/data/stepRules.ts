/*
 * Assignment breakdown: optional steps inside one planner item. The item itself stays the real
 * deadline. Step dates are the student's own targets; nothing here ever moves the official due date,
 * and finishing every step only offers to mark the item done, it never does it on its own.
 */
import type { PlannerStep } from './types';

export const STEP_LIMITS = { count: 30, title: 120 } as const;

/** Common stages for a written or project assignment. Each is optional and can be renamed or removed. */
export const SUGGESTED_STEPS = ['Choose a topic', 'Research', 'Outline', 'Draft', 'Revise', 'Submit'] as const;

const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Keeps only well-formed steps, so a damaged or old record can never break the page. */
export function cleanSteps(value: unknown): PlannerStep[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const steps: PlannerStep[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const step = raw as Partial<PlannerStep>;
    const title = typeof step.title === 'string' ? step.title.trim().slice(0, STEP_LIMITS.title) : '';
    if (!title || typeof step.id !== 'string' || seen.has(step.id)) continue;
    seen.add(step.id);
    steps.push({ id: step.id, title, done: step.done === true, targetDate: isDate(step.targetDate) ? step.targetDate : '' });
    if (steps.length >= STEP_LIMITS.count) break;
  }
  return steps;
}

export function addStep(steps: PlannerStep[], title: string, id: string): PlannerStep[] {
  const trimmed = title.trim().slice(0, STEP_LIMITS.title);
  if (!trimmed || steps.length >= STEP_LIMITS.count) return steps;
  return [...steps, { id, title: trimmed, done: false, targetDate: '' }];
}

/** Adds the suggested stages that aren't already there (by name), keeping everything the student has. */
export function addSuggested(steps: PlannerStep[], makeId: () => string): PlannerStep[] {
  const have = new Set(steps.map((step) => step.title.toLowerCase()));
  let next = steps;
  for (const title of SUGGESTED_STEPS) if (!have.has(title.toLowerCase())) next = addStep(next, title, makeId());
  return next;
}

export function moveStep(steps: PlannerStep[], id: string, by: -1 | 1): PlannerStep[] {
  const from = steps.findIndex((step) => step.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= steps.length) return steps;
  const next = [...steps];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number);
  const value = new Date(Date.UTC(y, m - 1, d + days));
  return value.toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/**
 * Suggests target dates for the unfinished steps, spread evenly from today up to the due date, with
 * the last step on the due date itself. Steps already done or already given a date keep theirs. If
 * there's no due date, or it has passed, nothing changes and the reason is returned instead.
 */
export function spreadTargets(steps: PlannerStep[], today: string, dueDate: string): { steps: PlannerStep[]; problem: string } {
  if (!isDate(dueDate)) return { steps, problem: 'Add a due date first, then target dates can be suggested.' };
  const span = daysBetween(today, dueDate);
  if (span < 0) return { steps, problem: 'The due date has passed, so no target dates were suggested.' };
  const open = steps.filter((step) => !step.done && !step.targetDate);
  if (open.length === 0) return { steps, problem: 'Every unfinished step already has a target date.' };
  const dates = new Map<string, string>();
  open.forEach((step, index) => dates.set(step.id, addDays(today, Math.round((span * (index + 1)) / open.length))));
  return { steps: steps.map((step) => (dates.has(step.id) ? { ...step, targetDate: dates.get(step.id)! } : step)), problem: '' };
}

export interface StepProgress { done: number; total: number; next: PlannerStep | null; lateTargets: number }

export function stepProgress(steps: PlannerStep[] | undefined, today: string): StepProgress | null {
  const list = steps ?? [];
  if (list.length === 0) return null;
  const left = list.filter((step) => !step.done);
  return {
    done: list.length - left.length,
    total: list.length,
    next: left[0] ?? null,
    lateTargets: left.filter((step) => step.targetDate && step.targetDate < today).length,
  };
}

/** One line for the Planner list, such as "2 of 6 steps done. Next: Outline (target Nov 14)". */
export function describeProgress(progress: StepProgress, formatDate: (date: string) => string): string {
  const head = `${progress.done} of ${progress.total} ${progress.total === 1 ? 'step' : 'steps'} done`;
  if (!progress.next) return `${head}.`;
  const target = progress.next.targetDate ? ` (target ${formatDate(progress.next.targetDate)})` : '';
  return `${head}. Next: ${progress.next.title}${target}`;
}
