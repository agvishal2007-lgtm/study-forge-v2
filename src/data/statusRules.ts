import { isDone } from './plannerRules.ts';
import type { PlannerItem } from './types';

/**
 * The five shared meanings for a piece of work, and the colour maths used to prove they stay
 * readable. Pure, so both the interface and the tests can rely on them.
 */

export const WORK_STATUSES = ['overdue', 'soon', 'doing', 'todo', 'done'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

/** Always shown as words next to the colour, never colour alone. */
export const STATUS_LABEL: Record<WorkStatus, string> = {
  overdue: 'Overdue',
  soon: 'Due soon',
  doing: 'In progress',
  todo: 'Not started',
  done: 'Completed',
};

/** A shape that differs per status, so the five are told apart without seeing colour. */
export const STATUS_MARK: Record<WorkStatus, string> = {
  overdue: '!',
  soon: '*',
  doing: '>',
  todo: 'o',
  done: 'v',
};

const dayNumber = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
};

/**
 * What a piece of work counts as today. Finished work is never called overdue just because its date
 * has passed, and a deadline that has arrived outranks how far along the work is, so nothing urgent
 * hides behind "in progress".
 */
export function workStatus(
  item: Pick<PlannerItem, 'status' | 'dueDate'>,
  today: string,
  dueSoonDays = 2,
): WorkStatus {
  if (isDone(item)) return 'done';
  if (item.dueDate) {
    const days = dayNumber(item.dueDate) - dayNumber(today);
    if (days < 0) return 'overdue';
    if (days <= dueSoonDays) return 'soon';
  }
  if (item.status === 'In Progress' || item.status === 'Ready to Submit') return 'doing';
  return 'todo';
}

/* ---- Colour maths, so contrast is measured rather than guessed. ---- */

/** Accepts '#rrggbb', '#rgb' or 'rgb(r, g, b)'. Returns null if it can't be read. */
export function readColour(value: string): [number, number, number] | null {
  const text = value.trim().toLowerCase();
  const rgb = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!hex) return null;
  const digits = hex[1].length === 3 ? hex[1].split('').map((d) => d + d).join('') : hex[1];
  return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16)) as [number, number, number];
}

/** Relative luminance, as WCAG defines it. */
export function luminance(colour: string): number {
  const rgb = readColour(colour);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((channel) => {
    const part = channel / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio between two colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(one: string, two: string): number {
  const a = luminance(one);
  const b = luminance(two);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
