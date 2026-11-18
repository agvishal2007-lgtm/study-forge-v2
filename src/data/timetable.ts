import { getDb, notifyChanged } from './db';
import { blankTimetable, blankTime, type BlockTime, type Timetable } from './timetableRules';

export * from './timetableRules';

/*
 * Where the daily schedule is kept: one record in the same synced place Trash, terms and reminders
 * use, so it follows a student between devices with no new collection and no change to anything
 * that governs access.
 */
const ID = 'timetable';

/** Whatever was saved, read defensively — a half-written or older record must not crash a page. */
export async function getTimetable(): Promise<Timetable | null> {
  const record = (await (await getDb()).get('studyState', ID)) as { value?: unknown } | undefined;
  const saved = record?.value as Partial<Timetable> | undefined;
  if (!saved || !Array.isArray(saved.periodNames) || !Array.isArray(saved.days)) return null;
  const periodNames = saved.periodNames.map((name) => (typeof name === 'string' ? name : ''));
  const days = saved.days.map((day) =>
    Array.isArray(day) ? periodNames.map((_, index) => (typeof day[index] === 'string' ? (day[index] as string) : '')) : periodNames.map(() => ''),
  );
  // Times are read back the same careful way as the rest. An earlier version of this function
  // rebuilt the record field by field and left these out, which threw away every time a student
  // had typed the moment the page was reloaded.
  const time = (value: unknown): BlockTime => {
    const given = value as Partial<BlockTime> | undefined;
    return {
      start: typeof given?.start === 'string' ? given.start : '',
      end: typeof given?.end === 'string' ? given.end : '',
    };
  };
  const storedTimes = Array.isArray(saved.times) ? saved.times : [];
  const times = days.map((_, day) =>
    periodNames.map((__, period) =>
      Array.isArray(storedTimes[day]) ? time(storedTimes[day][period]) : blankTime(),
    ),
  );
  return periodNames.length === 0
    ? null
    : { periodNames, days, times, sameTimes: saved.sameTimes !== false };
}

export async function saveTimetable(table: Timetable): Promise<void> {
  const db = await getDb();
  const updatedAt = Date.now();
  await db.put('studyState', { id: ID, value: table, updatedAt });
  notifyChanged();
}

/** The saved grid, or a fresh empty one of the right shape to start filling in. */
export async function timetableOrBlank(periods: number, cycleLength: number): Promise<Timetable> {
  const saved = await getTimetable();
  if (saved) return saved;
  return blankTimetable(Array.from({ length: periods }, () => ''), cycleLength);
}
