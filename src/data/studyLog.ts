import { getDb } from './db';
import { localNow } from './plannerRules';
import type { StudyDay } from './types';

const DEVICE_KEY = 'studyDevice';

export const listStudyDays = async (): Promise<StudyDay[]> => (await getDb()).getAll('studyDays');

/** Counts one bit of studying for today. A problem here never gets in the way of the studying itself. */
export async function logStudy(field: 'cards' | 'lessons'): Promise<void> {
  try {
    const db = await getDb();
    let device = await db.get('meta', DEVICE_KEY) as string | undefined;
    if (!device) {
      device = crypto.randomUUID();
      await db.put('meta', device, DEVICE_KEY);
    }
    const date = localNow().date;
    const id = `${date}_${device}`;
    const tx = db.transaction('studyDays', 'readwrite');
    const current = await tx.store.get(id);
    await tx.store.put({
      id,
      date,
      cards: current?.cards ?? 0,
      lessons: current?.lessons ?? 0,
      [field]: (current?.[field] ?? 0) + 1,
      updatedAt: Math.max(Date.now(), (current?.updatedAt ?? 0) + 1),
    });
    await tx.done;
  } catch {
    // The streak also reads saved answers and reviews, so a missed count here doesn't lose the day.
  }
}
