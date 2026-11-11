import { getDb, notifyChanged } from './db';
import type { GradeCategory } from './types';

/** Grading categories, as the student copies them from their syllabus. */

export const listGradeCategories = async (courseId: string): Promise<GradeCategory[]> =>
  (await (await getDb()).getAllFromIndex('gradeCategories', 'courseId', courseId))
    .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);

export const listAllGradeCategories = async (): Promise<GradeCategory[]> => (await getDb()).getAll('gradeCategories');

export async function addGradeCategory(courseId: string, name: string, weight: number): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const db = await getDb();
  const now = Date.now();
  const count = (await db.getAllFromIndex('gradeCategories', 'courseId', courseId)).length;
  await db.put('gradeCategories', {
    id: crypto.randomUUID(),
    courseId,
    name: trimmed,
    weight: Number.isFinite(weight) && weight >= 0 ? weight : 0,
    position: count,
    createdAt: now,
    updatedAt: now,
  });
  notifyChanged();
}

export async function updateGradeCategory(id: string, changes: { name?: string; weight?: number }): Promise<void> {
  const db = await getDb();
  const category = await db.get('gradeCategories', id);
  if (!category) return;
  const name = changes.name === undefined ? category.name : changes.name.trim();
  if (!name) return;
  const weight = changes.weight === undefined ? category.weight : changes.weight;
  const now = Date.now();
  await db.put('gradeCategories', {
    ...category,
    name,
    weight: Number.isFinite(weight) && weight >= 0 ? weight : category.weight,
    updatedAt: Math.max(now, category.updatedAt + 1),
  });
  notifyChanged();
}

/** Removing a category never touches the work in it; that work simply stops counting towards one. */
export async function deleteGradeCategory(id: string): Promise<void> {
  const db = await getDb();
  const items = await db.getAll('plannerItems');
  for (const item of items.filter((entry) => entry.categoryId === id)) {
    await db.put('plannerItems', { ...item, categoryId: null, updatedAt: Math.max(Date.now(), item.updatedAt + 1) });
  }
  await db.delete('gradeCategories', id);
  notifyChanged();
}
