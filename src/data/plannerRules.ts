import type { PlannerItem } from './types';
import { formatClockTime, formatDay as formatDayIn } from './dateFormat.ts';

/** The Planner's date rules. This file only calculates, so it can be tested directly. */
const DONE = ['Submitted', 'Waiting for Grade', 'Completed'];
export const isDone = (item: Pick<PlannerItem, 'status'>) => DONE.includes(item.status);

/**
 * What un-ticking a finished task sets it back to. Something that was only ticked off goes back to
 * the start; work that had been handed in goes back to In Progress, because it plainly isn't
 * un-started and saying so would lose what the student already knew about it.
 */
export function uncheckedStatus(status: PlannerItem['status']): PlannerItem['status'] {
  return status === 'Submitted' || status === 'Waiting for Grade' ? 'In Progress' : 'Not Started';
}

const parts = (date: string) => date.split('-').map(Number);
const dayNumber = (date: string) => {
  const [year, month, day] = parts(date);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
};
export const isValidDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = parts(date);
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
};

/** Today's date and time on this device, in the same format items use. */
export function localNow(now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

export type DueGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' | 'done';

export const GROUP_LABEL: Record<DueGroup, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'Next 7 days',
  later: 'Later',
  none: 'No due date',
  done: 'Done',
};

export const GROUP_ORDER: DueGroup[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none', 'done'];

export function groupOf(item: Pick<PlannerItem, 'status' | 'dueDate' | 'dueTime'>, now: { date: string; time: string }): DueGroup {
  if (isDone(item)) return 'done';
  if (!item.dueDate || !isValidDate(item.dueDate)) return 'none';
  const days = dayNumber(item.dueDate) - dayNumber(now.date);
  if (days < 0) return 'overdue';
  if (days === 0) return item.dueTime && item.dueTime < now.time ? 'overdue' : 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 7) return 'week';
  return 'later';
}

const PRIORITY_RANK = { High: 0, Normal: 1, Low: 2 };

/** Soonest first, then the time of day, then the most important. */
export function comparePlanner(a: PlannerItem, b: PlannerItem): number {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  if (a.dueTime !== b.dueTime) {
    if (!a.dueTime) return 1;
    if (!b.dueTime) return -1;
    return a.dueTime < b.dueTime ? -1 : 1;
  }
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt - b.createdAt;
}

export function groupItems(items: PlannerItem[], now: { date: string; time: string }): { group: DueGroup; items: PlannerItem[] }[] {
  return GROUP_ORDER
    .map((group) => ({
      group,
      items: items.filter((item) => groupOf(item, now) === group).sort(
        // Most recently due first among finished work, since that's what someone looks for.
        group === 'done' ? (a, b) => comparePlanner(b, a) : comparePlanner,
      ),
    }))
    .filter((entry) => entry.items.length > 0);
}

/** The sections the student has made, in the order they first made them, with no-section last. */
export function sectionsOf(items: PlannerItem[]): string[] {
  const seen = new Map<string, number>();
  for (const item of items) {
    const section = (item.section ?? '').trim();
    if (!section) continue;
    const first = seen.get(section);
    if (first === undefined || item.createdAt < first) seen.set(section, item.createdAt);
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([section]) => section);
}

/**
 * The same one list, grouped by the student's own sections instead of by when things are due.
 * A finished task stays in its section, because leaving it where it was is the whole point.
 */
export function groupBySection(items: PlannerItem[]): { section: string; items: PlannerItem[] }[] {
  const order = [...sectionsOf(items), ''];
  return order
    .map((section) => ({
      section,
      items: items.filter((item) => (item.section ?? '').trim() === section).sort(comparePlanner),
    }))
    .filter((entry) => entry.items.length > 0);
}

/** How a goal reads, such as "15 min goal, 20 done". Never a percentage and never a shortfall. */
export function describeGoal(goal: PlannerItem['goal']): string {
  if (!goal || !(goal.target > 0)) return '';
  const unit = goal.unit.trim();
  const target = `${goal.target}${unit ? ` ${unit}` : ''} goal`;
  if (!(goal.done > 0)) return target;
  return goal.done >= goal.target ? `${target}, ${goal.done} done` : `${target}, ${goal.done} so far`;
}

const formatTime = (time: string) => formatClockTime(time);

const formatDay = (date: string) => formatDayIn(date, { weekday: 'short', month: 'short', day: 'numeric' });

/** Plain words for a due date, such as "Due today at 3:00 PM" or "2 days overdue". */
export function describeDue(item: Pick<PlannerItem, 'status' | 'dueDate' | 'dueTime'>, now: { date: string; time: string }): string {
  if (!item.dueDate || !isValidDate(item.dueDate)) return 'No due date';
  const at = item.dueTime ? ` at ${formatTime(item.dueTime)}` : '';
  const days = dayNumber(item.dueDate) - dayNumber(now.date);
  if (isDone(item)) return `Was due ${formatDay(item.dueDate)}${at}`;
  if (days < -1) return `${-days} days overdue`;
  if (days === -1) return '1 day overdue';
  if (days === 0) return groupOf(item, now) === 'overdue' ? `Overdue since ${formatTime(item.dueTime)} today` : `Due today${at}`;
  if (days === 1) return `Due tomorrow${at}`;
  return `Due ${formatDay(item.dueDate)}${at}`;
}
