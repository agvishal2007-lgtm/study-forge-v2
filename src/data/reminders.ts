import { getDb, notifyChanged } from './db';
import { DEFAULT_QUIET, stamp, type QuietHours, type Reminder } from './reminderRules';

export * from './reminderRules';

/*
 * Where reminders are kept: one record each in the same synced place Trash and terms use, so they
 * follow a student between devices with no new collection and nothing more to run. Quiet hours are
 * a single record beside them.
 */
const PREFIX = 'reminder-';
const QUIET_ID = 'quiet-hours';

export async function listReminders(): Promise<Reminder[]> {
  const all = (await (await getDb()).getAll('studyState')) as { id: string; value: unknown }[];
  return all
    .filter((record) => record.id.startsWith(PREFIX) && record.value && typeof record.value === 'object')
    .map((record) => record.value as Reminder)
    .filter((reminder) => typeof reminder.text === 'string')
    .sort((a, b) => a.at.localeCompare(b.at) || a.createdAt - b.createdAt);
}

export async function saveReminder(reminder: Reminder): Promise<void> {
  const db = await getDb();
  const current = (await db.get('studyState', reminder.id)) as { updatedAt?: number } | undefined;
  const updatedAt = Math.max(Date.now(), (current?.updatedAt ?? 0) + 1);
  await db.put('studyState', { id: reminder.id, value: { ...reminder, updatedAt }, updatedAt });
  notifyChanged();
}

export async function createReminder(fields: Partial<Reminder> & { text: string; at: string }): Promise<Reminder> {
  const now = Date.now();
  const reminder: Reminder = {
    id: `${PREFIX}${crypto.randomUUID()}`,
    text: fields.text.trim(),
    repeat: fields.repeat ?? 'once',
    at: fields.at,
    fromTime: fields.fromTime ?? '09:00',
    toTime: fields.toTime ?? '17:00',
    paused: false,
    lastShown: '',
    createdAt: now,
    updatedAt: now,
  };
  await saveReminder(reminder);
  return reminder;
}

export async function deleteReminder(id: string): Promise<void> {
  await (await getDb()).delete('studyState', id);
  notifyChanged();
}

/** Writes down that a reminder has been shown for a moment, so it isn't shown again for it. */
export async function markShown(id: string, when: Date): Promise<void> {
  const record = (await (await getDb()).get('studyState', id)) as { value: Reminder } | undefined;
  if (!record) return;
  await saveReminder({ ...record.value, lastShown: stamp(when) });
}

export async function getQuietHours(): Promise<QuietHours> {
  const record = (await (await getDb()).get('studyState', QUIET_ID)) as { value: QuietHours } | undefined;
  const saved = record?.value;
  if (!saved || typeof saved !== 'object') return DEFAULT_QUIET;
  return {
    on: saved.on === true,
    start: typeof saved.start === 'string' ? saved.start : DEFAULT_QUIET.start,
    end: typeof saved.end === 'string' ? saved.end : DEFAULT_QUIET.end,
    days: Array.isArray(saved.days) ? saved.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : DEFAULT_QUIET.days,
  };
}

export async function saveQuietHours(quiet: QuietHours): Promise<void> {
  const db = await getDb();
  const updatedAt = Date.now();
  await db.put('studyState', { id: QUIET_ID, value: quiet, updatedAt });
  notifyChanged();
}
