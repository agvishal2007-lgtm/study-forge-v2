import type { PlannerItem } from './types';

/** The Planner's date rules. This file only calculates, so it can be tested directly. */
const DONE = ['Submitted', 'Waiting for Grade', 'Completed'];
export const isDone = (item: Pick<PlannerItem, 'status'>) => DONE.includes(item.status);

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

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

const formatDay = (date: string) => {
  const [year, month, day] = parts(date);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

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
