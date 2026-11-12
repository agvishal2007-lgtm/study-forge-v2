/*
 * How dates and times read. Every date and time already comes from the device's own clock and time
 * zone, wherever the student is. These two preferences only change how they are written:
 * - date order: the device's own way, or Month/Day/Year, Day/Month/Year, or Year-Month-Day
 * - clock: the device's own way, or 12-hour or 24-hour
 * No DOM or React here, so the pure rules files (and their tests) can use it.
 */

export type DateOrder = 'device' | 'mdy' | 'dmy' | 'ymd';
export type ClockStyle = 'device' | '12' | '24';

export const DATE_ORDER_KEY = 'study-forge-date-order';
export const CLOCK_KEY = 'study-forge-clock';

const read = (key: string): string | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
};

export function getDateOrder(): DateOrder {
  const saved = read(DATE_ORDER_KEY);
  return saved === 'mdy' || saved === 'dmy' || saved === 'ymd' ? saved : 'device';
}

export function getClockStyle(): ClockStyle {
  const saved = read(CLOCK_KEY);
  return saved === '12' || saved === '24' ? saved : 'device';
}

/** The language-and-region that writes dates in the chosen order. undefined means the device's own. */
const LOCALE: Record<DateOrder, string | undefined> = { device: undefined, mdy: 'en-US', dmy: 'en-GB', ymd: 'en-CA' };

/** Options with the student's clock choice added, when the format shows a time. */
function withClock(options: Intl.DateTimeFormatOptions, clock: ClockStyle): Intl.DateTimeFormatOptions {
  if (clock === 'device' || (options.hour === undefined && options.timeStyle === undefined)) return options;
  return { ...options, hourCycle: clock === '12' ? 'h12' : 'h23' };
}

/** Writes a moment (or a Date) the way the student chose. */
export function formatWhen(when: Date | number, options: Intl.DateTimeFormatOptions, order = getDateOrder(), clock = getClockStyle()): string {
  const date = typeof when === 'number' ? new Date(when) : when;
  const locale = LOCALE[order];
  const opts = withClock(options, clock);
  // Year-Month-Day written with numbers is the ISO order everywhere.
  if (order === 'ymd' && opts.month === undefined && opts.hour === undefined && opts.weekday === undefined) {
    return new Intl.DateTimeFormat('en-CA', { ...opts, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
  return new Intl.DateTimeFormat(locale, opts).format(date);
}

/** A calendar day stored as YYYY-MM-DD, written out. It is the same day wherever the student is. */
export function formatDay(day: string, options: Intl.DateTimeFormatOptions, order = getDateOrder()): string {
  const [year, month, date] = day.split('-').map(Number);
  return formatWhen(new Date(Date.UTC(year, month - 1, date)), { ...options, timeZone: 'UTC' }, order);
}

/** A clock time stored as HH:MM, written as 2:30 PM or 14:30 as the student chose. */
export function formatClockTime(time: string, clock = getClockStyle(), order = getDateOrder()): string {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  if (clock === '24') return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  if (clock === '12') return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
  return formatWhen(new Date(Date.UTC(2000, 0, 1, hours, minutes)), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }, order, 'device');
}

/** Example text for Settings, so each choice shows what it looks like. */
export function sampleDate(order: DateOrder): string {
  return formatWhen(new Date(Date.UTC(2026, 10, 25, 12)), { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' }, order);
}
export function sampleTime(clock: ClockStyle): string {
  return formatClockTime('16:30', clock);
}

const listeners = new Set<() => void>();
let version = 0;

/** Saves a choice, redraws every screen with it, and lets the student's other devices follow. */
export function setDateFormat(choice: { order?: DateOrder; clock?: ClockStyle }, announce = true): void {
  try {
    if (choice.order) localStorage.setItem(DATE_ORDER_KEY, choice.order);
    if (choice.clock) localStorage.setItem(CLOCK_KEY, choice.clock);
  } catch {
    // Private browsing can refuse this; nothing else changes.
  }
  version += 1;
  listeners.forEach((listener) => listener());
  if (announce && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('study-forge-setting-changed', { detail: 'appearance' }));
}

export function subscribeDateFormat(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const dateFormatVersion = () => version;
