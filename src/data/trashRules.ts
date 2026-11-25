/*
 * When Trash empties itself, and what that means in words.
 *
 * Deliberately pure: no database, no clock of its own. Every decision about what is old enough to
 * go is made here from a time passed in, so it can be tested exactly and so the same answer is
 * given to the Trash page, to the settings screen and to the sweep itself.
 *
 * Nothing here deletes anything. It only says what has passed its date.
 */

/** How long Trash keeps something. 'never' means it waits until the student says so. */
export type Retention = 7 | 14 | 30 | 60 | 90 | 'never';

export const RETENTION_CHOICES: { value: Retention; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
  { value: 'never', label: 'Never — I’ll delete things myself' },
];

/**
 * What a new student starts with.
 *
 * Thirty days is long enough that nobody loses work they meant to keep, and short enough that
 * Trash doesn't quietly become a second copy of everything. A student who has been using Study
 * Forge already is NOT moved onto this: see `startingPolicy`.
 */
export const RECOMMENDED: Retention = 30;

const DAY = 24 * 60 * 60 * 1000;

export const isRetention = (value: unknown): value is Retention =>
  value === 'never' || RETENTION_CHOICES.some((choice) => choice.value === value);

/** The moment something in Trash is due to go, or null when nothing is due to happen to it. */
export function expiresAt(deletedAt: number, policy: Retention): number | null {
  if (policy === 'never' || !Number.isFinite(deletedAt) || deletedAt <= 0) return null;
  return deletedAt + policy * DAY;
}

export function isExpired(deletedAt: number, policy: Retention, now: number): boolean {
  const due = expiresAt(deletedAt, policy);
  return due !== null && due <= now;
}

/**
 * What a student who has never chosen gets.
 *
 * A brand-new account starts on the recommendation. Anyone who already has something in Trash, or
 * any work at all, keeps deleting things themselves until they choose otherwise — their Trash was
 * filled under the old promise that nothing goes until they say so, and an upgrade is not consent.
 */
export const startingPolicy = (hasExistingWork: boolean): Retention => (hasExistingWork ? 'never' : RECOMMENDED);

/** The things a change to this policy would delete straight away, so a student can be asked first. */
export function dueAtOnce<T extends { deletedAt: number }>(rows: T[], policy: Retention, now: number): T[] {
  return rows.filter((row) => isExpired(row.deletedAt, policy, now));
}

/** The policy in plain words, for the line on the Trash page. */
export function retentionWords(policy: Retention): string {
  if (policy === 'never') return 'Things here stay until you delete them.';
  return `Things here are deleted ${policy} days after you put them in Trash.`;
}

/**
 * How long something has left, in words. Said in whole days, and never promised to the minute:
 * the sweep runs when Study Forge is next opened, not on a server while the app is closed.
 */
export function timeLeftWords(deletedAt: number, policy: Retention, now: number): string {
  const due = expiresAt(deletedAt, policy);
  if (due === null) return '';
  if (due <= now) return 'due to be deleted next time you open Study Forge';
  const days = Math.ceil((due - now) / DAY);
  return days === 1 ? 'deleted tomorrow' : `deleted in ${days} days`;
}
