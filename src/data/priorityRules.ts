import { isDone } from './plannerRules.ts';
import { workStatus } from './statusRules.ts';
import { gradeImpact } from './gradeRules.ts';
import type { GradeCategory, PlannerItem } from './types';

/**
 * How work is ranked. This is the single ranking engine: Today's Plan uses the same one with the
 * same saved choice, so the two never disagree. It is pure, so every mode can be tested directly.
 *
 * Two rules run through all of it. Nothing is invented: a factor a student hasn't filled in is
 * reported as missing rather than guessed, and raw points are never treated as grade impact. And
 * nothing urgent is hidden: overdue and due-soon work is returned separately so every mode can keep
 * it in view.
 */

export const PRIORITY_MODES = ['due', 'points', 'impact', 'quickest', 'personal', 'balanced', 'custom'] as const;
export type PriorityMode = (typeof PRIORITY_MODES)[number];

export const PRIORITY_MODE_LABEL: Record<PriorityMode, string> = {
  due: 'Earliest due date',
  points: 'Highest raw points',
  impact: 'Greatest grade impact',
  quickest: 'Quickest to finish',
  personal: 'Most important to me',
  balanced: 'Balanced',
  custom: 'My own weighting',
};

export interface Weights {
  urgency: number;
  points: number;
  impact: number;
  effort: number;
  importance: number;
}

export const DEFAULT_WEIGHTS: Weights = { urgency: 3, points: 2, impact: 2, effort: 1, importance: 2 };

/** What a factor contributed, and why, so a student can see how a ranking was reached. */
export interface Factor {
  name: string;
  /** 0 to 1 after normalising across the work being ranked. */
  value: number;
  /** What the student actually entered, in words. */
  detail: string;
}

export interface Ranked {
  item: PlannerItem;
  score: number;
  factors: Factor[];
  /** Factors that could not be used because the student hasn't entered them. */
  missing: string[];
}

const dayNumber = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
};

const IMPORTANCE: Record<string, number> = { High: 1, Normal: 0.5, Low: 0 };

/** Spreads values across 0 to 1 using the largest one present, so one huge item can't swamp the rest. */
const share = (value: number, largest: number) => (largest > 0 ? value / largest : 0);

/**
 * Ranks work, highest first. `today` decides urgency. `weights` is only used by the balanced and
 * custom modes. Finished work is left out: it is not waiting to be done.
 */
export function rankWork(
  items: PlannerItem[],
  options: { mode: PriorityMode; today: string; weights?: Weights; pinned?: string[]; categories?: GradeCategory[] },
): { ranked: Ranked[]; urgent: PlannerItem[] } {
  const { mode, today, weights = DEFAULT_WEIGHTS, pinned = [], categories = [] } = options;
  const waiting = items.filter((item) => !isDone(item));

  const daysLeft = (item: PlannerItem) => (item.dueDate ? dayNumber(item.dueDate) - dayNumber(today) : null);
  const horizon = Math.max(1, ...waiting.map((item) => Math.abs(daysLeft(item) ?? 0)));
  const mostPoints = Math.max(0, ...waiting.map((item) => item.points ?? 0));
  const longest = Math.max(0, ...waiting.map((item) => item.estimateHours ?? 0));
  const impacts = new Map(waiting.map((item) => [item.id, gradeImpact(item, categories, items)]));
  const biggestImpact = Math.max(0, ...[...impacts.values()].map((value) => value ?? 0));

  const scored = waiting.map((item): Ranked => {
    const missing: string[] = [];
    const days = daysLeft(item);

    // Sooner is higher; anything overdue is already at the top of urgency.
    const urgency = days === null ? 0 : days < 0 ? 1 : Math.max(0, 1 - days / horizon);
    if (days === null) missing.push('due date');

    const points = item.points ?? null;
    if (points === null) missing.push('points');

    // Grade impact is only real once the course's categories and weights exist. It is never faked from points.
    const impact = impacts.get(item.id) ?? null;
    if (impact === null) missing.push('grade impact');

    const hours = item.estimateHours ?? null;
    if (hours === null) missing.push('time estimate');
    // Quicker work scores higher, so a short task isn't buried under a long one.
    const effort = hours === null || longest === 0 ? 0 : Math.max(0, 1 - share(hours, longest));

    const importance = IMPORTANCE[item.priority] ?? 0.5;

    const factors: Factor[] = [
      { name: 'Urgency', value: urgency, detail: days === null ? 'No due date' : days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}` },
      { name: 'Points', value: share(points ?? 0, mostPoints), detail: points === null ? 'Not entered' : `${points} points` },
      { name: 'Time needed', value: effort, detail: hours === null ? 'Not estimated' : `${hours} hour${hours === 1 ? '' : 's'}` },
      { name: 'Grade impact', value: share(impact ?? 0, biggestImpact), detail: impact === null ? 'Needs grading categories' : `${impact}% of the final grade` },
      { name: 'Importance to you', value: importance, detail: item.priority },
    ];

    const by = (name: string) => factors.find((factor) => factor.name === name)?.value ?? 0;
    let score: number;
    if (mode === 'due') score = by('Urgency');
    else if (mode === 'points') score = by('Points');
    else if (mode === 'quickest') score = by('Time needed');
    else if (mode === 'personal') score = by('Importance to you');
    else if (mode === 'impact') score = by('Grade impact');
    else {
      const used = mode === 'balanced' ? DEFAULT_WEIGHTS : weights;
      const total = used.urgency + used.points + used.effort + used.importance;
      const total2 = total + used.impact;
      score = total2 === 0 ? 0 : (
        by('Urgency') * used.urgency
        + by('Points') * used.points
        + by('Grade impact') * used.impact
        + by('Time needed') * used.effort
        + by('Importance to you') * used.importance
      ) / total2;
    }

    return { item, score, factors, missing };
  });

  const place = (entry: Ranked) => {
    const at = pinned.indexOf(entry.item.id);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  const urgencyOf = (entry: Ranked) => entry.factors[0].value;

  const ranked = [...scored].sort((a, b) =>
    place(a) - place(b)
    || b.score - a.score
    || urgencyOf(b) - urgencyOf(a)
    || a.item.title.localeCompare(b.item.title));

  // Whatever the mode, these stay in view.
  const urgent = waiting
    .filter((item) => ['overdue', 'soon'].includes(workStatus(item, today)))
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));

  return { ranked, urgent };
}
