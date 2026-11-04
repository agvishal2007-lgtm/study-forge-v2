import type { PlannerItem } from './types';

/** The dashboard's wording. This file only calculates, so it can be tested directly. */
const count = (value: number, word: string, plural = `${word}s`) => `${value} ${value === 1 ? word : plural}`;

function joinWords(parts: string[]): string {
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')}${parts.length > 2 ? ',' : ''} and ${parts[parts.length - 1]}`;
}

export interface DaySummary {
  overdue: number;
  dueSoon: number;
  cardsDue: number;
  firstOverdue?: string;
  firstDue?: string;
  nextLesson?: string;
}

/** One plain sentence on what the day holds, built only from what the student has saved. */
export function daySummary(day: DaySummary): string {
  const parts: string[] = [];
  if (day.overdue > 0) parts.push(`${count(day.overdue, 'overdue item')}`);
  if (day.dueSoon > 0) parts.push(`${count(day.dueSoon, 'item')} due in the next 7 days`);
  if (day.cardsDue > 0) parts.push(`${count(day.cardsDue, 'flashcard')} to review`);
  const start = day.firstOverdue ?? day.firstDue ?? (day.cardsDue > 0 ? 'your flashcards' : day.nextLesson);
  if (parts.length === 0) return start ? `Nothing is due. You could study ${start} next.` : 'Nothing needs your attention right now.';
  return `You have ${joinWords(parts)}. Start with ${start}.`;
}

/** What to do next with an item, going only by its type and status. */
export function nextStep(item: Pick<PlannerItem, 'status' | 'type' | 'estimateHours'>): string {
  let step: string;
  if (item.status === 'Ready to Submit') step = 'Submit it';
  else if (item.status === 'In Progress') step = 'Keep going';
  else if (item.type === 'Exam' || item.type === 'Quiz') step = 'Start studying';
  else if (item.type === 'Reading') step = 'Start reading';
  else step = 'Get started';
  if (item.estimateHours && item.status !== 'Ready to Submit') step += `, about ${count(item.estimateHours, 'hour')}`;
  return step;
}
