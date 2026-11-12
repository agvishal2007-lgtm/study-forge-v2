import { getDb, notifyChanged } from './db';
import { localNow } from './plannerRules';
import type { PlannerItem, PlannerStatus } from './types';

export async function listPlannerItems(): Promise<PlannerItem[]> {
  return (await getDb()).getAll('plannerItems');
}

export const getPlannerItem = async (id: string) => (await getDb()).get('plannerItems', id);

export async function savePlannerItem(item: Omit<PlannerItem, 'createdAt' | 'updatedAt'> & { createdAt?: number }): Promise<void> {
  const db = await getDb();
  const current = await db.get('plannerItems', item.id);
  const updatedAt = Math.max(Date.now(), (current?.updatedAt ?? 0) + 1);
  // Anything the form doesn't show (where it came from in Google Calendar, a pin) is kept as it was,
  // so editing a Google deadline never cuts its link and a later delete is still remembered.
  await db.put('plannerItems', { ...current, ...item, createdAt: current?.createdAt ?? item.createdAt ?? updatedAt, updatedAt });
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
  const tx = (await getDb()).transaction(['plannerItems', 'calendarEvents'], 'readwrite');
  const item = await tx.objectStore('plannerItems').get(id);
  await tx.objectStore('plannerItems').delete(id);
  if (item?.sourceId) {
    // It came from a connected calendar, so this is remembered or the next update would add it back.
    const now = Date.now();
    await tx.objectStore('calendarEvents').put({
      id: `removed-${id}`, title: item.title, courseId: null, kind: 'Event', date: item.dueDate || localNow().date, startTime: '', endTime: '', location: '', whatToDo: '', priority: 'Normal',
      completed: true, seriesId: '', plannerItemId: null, source: 'manual', sourceCalendar: '', hidden: true, createdAt: now, updatedAt: now,
    });
  }
  await tx.done;
  notifyChanged();
}
