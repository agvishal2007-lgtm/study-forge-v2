import type { CardProgress, CardRating, Flashcard } from './types';
import { formatDay } from './dateFormat.ts';

/**
 * The review schedule. This file only calculates, so it can be tested directly.
 * The 1, 5, 10, and 15 day steps come from the project blueprint. They're a starting
 * point, and a more adaptive schedule can replace them later.
 */
export const INTERVAL_DAYS = [1, 5, 10, 15];
const LAST_STAGE = INTERVAL_DAYS.length - 1;

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** What each rating does: its new stage, and the days until the card comes back. */
export function outcome(progress: Pick<CardProgress, 'stage'> | null | undefined, rating: CardRating): { stage: number; days: number } {
  const next = progress ? Math.min(progress.stage + 1, LAST_STAGE) : 0;
  switch (rating) {
    // Starting over: the next Good brings it back in 1 day, as if it were new.
    case 'Again': return { stage: -1, days: 0 };
    case 'Hard': return { stage: progress?.stage ?? -1, days: 1 };
    case 'Good': return { stage: next, days: INTERVAL_DAYS[next] };
    case 'Easy': {
      const stage = Math.min(next + 1, LAST_STAGE);
      return { stage, days: INTERVAL_DAYS[stage] };
    }
  }
}

export function nextProgress(cardId: string, progress: CardProgress | null | undefined, rating: CardRating, today: string, now: number): CardProgress {
  const { stage, days } = outcome(progress, rating);
  return {
    cardId,
    stage,
    dueDate: addDays(today, days),
    lastRating: rating,
    lastReviewedAt: now,
    reviews: (progress?.reviews ?? 0) + 1,
    lapses: (progress?.lapses ?? 0) + (rating === 'Again' ? 1 : 0),
    updatedAt: Math.max(now, (progress?.updatedAt ?? 0) + 1),
  };
}

/** A card that's never been reviewed counts as due. */
export const isDue = (progress: Pick<CardProgress, 'dueDate'> | null | undefined, today: string) => !progress || progress.dueDate <= today;

/** Weak means Again was the last answer, or Again came up twice or more and Good hasn't followed twice in a row since. */
export const isWeak = (progress: Pick<CardProgress, 'lastRating' | 'lapses' | 'stage'> | null | undefined) =>
  !!progress && (progress.lastRating === 'Again' || (progress.lapses >= 2 && progress.stage < 1));

/** Cards already reviewed and waiting come first, oldest due date first, then new cards. */
export function dueQueue(cards: Flashcard[], progress: Map<string, CardProgress>, today: string): Flashcard[] {
  return cards
    .filter((card) => isDue(progress.get(card.id), today))
    .sort((a, b) => {
      const dueA = progress.get(a.id)?.dueDate;
      const dueB = progress.get(b.id)?.dueDate;
      if (dueA && dueB && dueA !== dueB) return dueA < dueB ? -1 : 1;
      if (!!dueA !== !!dueB) return dueA ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
}

export const describeInterval = (days: number) => (days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`);

/** Plain words for when a card comes back, such as "Due today" or "Due Nov 10". */
export function describeCardDue(progress: Pick<CardProgress, 'dueDate'> | null | undefined, today: string): string {
  if (!progress) return 'New';
  if (progress.dueDate <= today) return 'Due today';
  if (progress.dueDate === addDays(today, 1)) return 'Due tomorrow';
  return `Due ${formatDay(progress.dueDate, { month: 'short', day: 'numeric' })}`;
}
