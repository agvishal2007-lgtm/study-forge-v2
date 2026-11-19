import { getDb, notifyChanged } from './db';
import { EMPTY_REVIEW, withNewCourses, type ImportReview } from './importReviewRules';

export * from './importReviewRules';

/*
 * Kept in the same synced place the rest of this work uses, so the review follows a student to
 * whichever device they next open — an import often happens on a phone and gets tidied on a laptop.
 */
const ID = 'import-review';

export async function getImportReview(): Promise<ImportReview> {
  const record = (await (await getDb()).get('studyState', ID)) as { value?: Partial<ImportReview> } | undefined;
  const saved = record?.value;
  if (!saved || typeof saved !== 'object') return EMPTY_REVIEW;
  return {
    courseIds: Array.isArray(saved.courseIds) ? saved.courseIds.filter((id): id is string => typeof id === 'string') : [],
    at: typeof saved.at === 'number' ? saved.at : 0,
    explained: saved.explained === true,
  };
}

async function save(review: ImportReview): Promise<void> {
  const db = await getDb();
  await db.put('studyState', { id: ID, value: review, updatedAt: Date.now() });
  notifyChanged();
}

/** Records courses an import created. Quiet about failure: an import must not fall over for this. */
export async function noteImportedCourses(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const review = await getImportReview();
    const next = withNewCourses(review, ids, Date.now());
    if (next !== review) await save(next);
  } catch {
    // The courses themselves are already saved; only the reminder to review them is lost.
  }
}

/** The student has seen the explanation. Said once, not every time. */
export async function markImportExplained(): Promise<void> {
  const review = await getImportReview();
  if (!review.explained) await save({ ...review, explained: true });
}

/** They have looked over the names, however they left them. */
export async function clearImportReview(): Promise<void> {
  const review = await getImportReview();
  await save({ ...review, courseIds: [], at: 0 });
}
