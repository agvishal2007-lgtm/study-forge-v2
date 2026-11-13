import { readStudyState, writeStudyState } from './studyState';

/*
 * Academy progress: which lessons a student has finished, and where they stopped in an unfinished
 * one. A lesson only counts as finished when its hands-on activity was actually done, never just
 * because it was opened. It's kept with study in progress, so it follows a signed-in student to their
 * other devices and is kept on the device without an account.
 */
export interface LessonProgress { stage: number; done: boolean; doneAt?: number }
export type AcademyProgress = Record<string, LessonProgress>;

const clean = (raw: unknown): AcademyProgress => {
  const out: AcademyProgress = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Partial<LessonProgress>;
    out[id] = { stage: Number.isInteger(item.stage) && (item.stage as number) >= 0 ? (item.stage as number) : 0, done: item.done === true, ...(typeof item.doneAt === 'number' ? { doneAt: item.doneAt } : {}) };
  }
  return out;
};

export const getAcademyProgress = async (): Promise<AcademyProgress> => clean(await readStudyState('academyProgress'));

async function update(id: string, change: (now: LessonProgress) => LessonProgress) {
  const all = await getAcademyProgress();
  all[id] = change(all[id] ?? { stage: 0, done: false });
  await writeStudyState('academyProgress', all);
}

/** Remembers which part of a lesson the student reached, so they can pick up there. */
export const saveLessonStage = (id: string, stage: number) => update(id, (now) => ({ ...now, stage }));
/** Only called when the lesson's activity was completed. Finishing again keeps the first date. */
export const finishLesson = (id: string) => update(id, (now) => ({ ...now, done: true, doneAt: now.doneAt ?? Date.now() }));
