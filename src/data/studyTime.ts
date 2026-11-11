import { getDb } from './db';
import { localNow } from './plannerRules';
import { getDevice } from './studyLog';
import type { StudyTime } from './types';

export * from './studyTimeRules';

/**
 * The one function that writes study time to the database. The maths lives in studyTimeRules.ts
 * (re-exported above) so it can be tested without a browser.
 */

export const listStudyTime = async (): Promise<StudyTime[]> => (await getDb()).getAll('studyTime');

/** Adds active study seconds to today's record for this device. A failure here never interrupts studying. */
export async function addStudySeconds(seconds: number, courseId?: string | null): Promise<void> {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  try {
    const db = await getDb();
    const device = await getDevice();
    const date = localNow().date;
    const id = `${date}_${device}`;
    const tx = db.transaction('studyTime', 'readwrite');
    const current = await tx.store.get(id);
    const byCourse = { ...(current?.byCourse ?? {}) };
    if (courseId) byCourse[courseId] = (byCourse[courseId] ?? 0) + seconds;
    await tx.store.put({
      id,
      date,
      seconds: (current?.seconds ?? 0) + seconds,
      byCourse,
      updatedAt: Math.max(Date.now(), (current?.updatedAt ?? 0) + 1),
    });
    await tx.done;
  } catch {
    // Study time is a convenience; losing a few seconds never gets in the way of studying.
  }
}
