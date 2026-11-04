import { getDb, notifyChanged } from './db';
import type { PlannerItem, PlannerStatus } from './types';

export async function listPlannerItems(): Promise<PlannerItem[]> {
  return (await getDb()).getAll('plannerItems');
}

export const getPlannerItem = async (id: string) => (await getDb()).get('plannerItems', id);

export async function savePlannerItem(item: Omit<PlannerItem, 'createdAt' | 'updatedAt'> & { createdAt?: number }): Promise<void> {
  const db = await getDb();
  const current = await db.get('plannerItems', item.id);
  const updatedAt = Math.max(Date.now(), (current?.updatedAt ?? 0) + 1);
  await db.put('plannerItems', { ...item, createdAt: current?.createdAt ?? item.createdAt ?? updatedAt, updatedAt });
  notifyChanged();
}

export async function setPlannerStatus(id: string, status: PlannerStatus): Promise<void> {
  const tx = (await getDb()).transaction('plannerItems', 'readwrite');
  const item = await tx.store.get(id);
  if (!item) throw new Error('This item no longer exists.');
  await tx.store.put({ ...item, status, updatedAt: Math.max(Date.now(), item.updatedAt + 1) });
  await tx.done;
  notifyChanged();
}

export async function deletePlannerItem(id: string): Promise<void> {
  await (await getDb()).delete('plannerItems', id);
  notifyChanged();
}
