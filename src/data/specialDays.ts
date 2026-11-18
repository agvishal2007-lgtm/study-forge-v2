import { getDb, notifyChanged } from './db';
import { DEFAULT_SPECIAL, type SpecialDay } from './specialDayRules';

export * from './specialDayRules';

/*
 * Special days live in the same synced place the rest of this work uses, one record each under a
 * prefix of their own, so they follow a student between devices with no new collection and no
 * change to what governs access.
 */
const PREFIX = 'special-';

export async function listSpecialDays(): Promise<SpecialDay[]> {
  const all = (await (await getDb()).getAll('studyState')) as { id: string; value: unknown }[];
  return all
    .filter((record) => record.id.startsWith(PREFIX) && record.value && typeof record.value === 'object')
    .map((record) => record.value as SpecialDay)
    .filter((day) => typeof day.date === 'string')
    .map((day) => ({ ...day, blocks: Array.isArray(day.blocks) ? day.blocks.filter((block) => Number.isInteger(block)) : [] }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

export async function saveSpecialDay(day: SpecialDay): Promise<void> {
  const db = await getDb();
  const current = (await db.get('studyState', day.id)) as { updatedAt?: number } | undefined;
  const updatedAt = Math.max(Date.now(), (current?.updatedAt ?? 0) + 1);
  await db.put('studyState', { id: day.id, value: { ...day, updatedAt }, updatedAt });
  notifyChanged();
}

export async function createSpecialDay(fields: Partial<SpecialDay> & { date: string }): Promise<SpecialDay> {
  const now = Date.now();
  const day: SpecialDay = {
    ...DEFAULT_SPECIAL,
    ...fields,
    blocks: fields.blocks ?? [],
    id: `${PREFIX}${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  await saveSpecialDay(day);
  return day;
}

export async function deleteSpecialDay(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('studyState', id);
  notifyChanged();
}
