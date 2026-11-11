import type { StudyTime } from './types';

/**
 * The pure maths behind study time, kept apart from the database so it can be tested on its own.
 * A study surface runs a clock (studyClock.ts) that credits seconds only while the tab is open and
 * the student isn't idle; these functions decide how much to credit and add the saved records up.
 */

/** How long, in milliseconds, without the tab visible or an interaction before the clock pauses. */
export const IDLE_MS = 90_000;
/** A single step never credits more than this, so a frozen background timer or a sleeping laptop
 *  can't suddenly add a huge gap. */
export const MAX_STEP_MS = 30_000;

/**
 * How many seconds of active study to credit between two moments. Nothing is credited while the tab
 * is hidden or after the student has gone idle.
 */
export function activeSeconds(args: {
  fromMs: number;
  toMs: number;
  visible: boolean;
  lastInteractMs: number;
}): number {
  const { fromMs, toMs, visible, lastInteractMs } = args;
  if (!visible) return 0;
  if (toMs - lastInteractMs > IDLE_MS) return 0;
  const step = Math.min(toMs - fromMs, MAX_STEP_MS);
  return step <= 0 ? 0 : Math.round(step / 1000);
}

/** Total seconds across every device and day. */
export const totalSeconds = (records: StudyTime[]): number => records.reduce((sum, record) => sum + record.seconds, 0);

/** Seconds per day, adding the devices together. */
export function secondsByDate(records: StudyTime[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const record of records) map.set(record.date, (map.get(record.date) ?? 0) + record.seconds);
  return map;
}

/** Seconds per course across every device and day. */
export function secondsByCourse(records: StudyTime[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const record of records) {
    for (const [courseId, seconds] of Object.entries(record.byCourse)) {
      map.set(courseId, (map.get(courseId) ?? 0) + seconds);
    }
  }
  return map;
}

/** Seconds over a set of dates (e.g. the last 7 days). */
export const secondsOverDates = (byDate: Map<string, number>, dates: string[]): number =>
  dates.reduce((sum, date) => sum + (byDate.get(date) ?? 0), 0);

/** A short, human duration: "0m", "45m", "1h 05m", "3h". */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(whole / 60);
  const minutes = whole % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}
