/** Reads a pasted class schedule. This file only calculates, so it can be tested directly. */
export interface ScheduleRow {
  code: string;
  name: string;
  /** 0 is Sunday. */
  days: number[];
  startTime: string;
  endTime: string;
  location: string;
  /** Dates printed beside the class, if any. */
  startDate: string;
  endDate: string;
}

const pad = (value: number) => String(value).padStart(2, '0');

const DAY_NAMES: [RegExp, number][] = [
  [/^su(n(day)?)?$/i, 0], [/^mo(n(day)?)?$/i, 1], [/^tu(e(s(day)?)?)?$/i, 2], [/^we(d(nesday)?)?$/i, 3],
  [/^th(u(r(s(day)?)?)?)?$/i, 4], [/^fr(i(day)?)?$/i, 5], [/^sa(t(urday)?)?$/i, 6],
];
const LETTERS: Record<string, number> = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 };

const dayName = (word: string) => DAY_NAMES.find(([pattern]) => pattern.test(word))?.[1];

/** Understands MWF, TR, TTh, MoWeFr, Mon/Wed, and Tuesday and Thursday. Returns null for anything else. */
export function readDays(text: string): number[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const words = trimmed.split(/\s*(?:[,/&+]|\band\b|\s)\s*/i).filter(Boolean);
  const named = words.map(dayName);
  const days = new Set<number>();
  if (named.every((day) => day !== undefined)) {
    named.forEach((day) => days.add(day as number));
  } else if (words.length === 1 && /^(?:Mo|Tu|We|Th|Fr|Sa|Su){2,7}$/.test(trimmed)) {
    (trimmed.match(/../g) ?? []).forEach((word) => days.add(dayName(word) as number));
  } else if (words.every((word) => /^(?:Th|[MTWRFSU])+$/.test(word))) {
    (words.join('').match(/Th|[MTWRFSU]/g) ?? []).forEach((word) => days.add(word === 'Th' ? 4 : LETTERS[word]));
  } else {
    return null;
  }
  return [...days].sort((a, b) => a - b);
}

const TIME_RANGE = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?(?![a-z])|\b(\d{1,2})(?::(\d{2}))?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?(?![a-z])|\b(\d{1,2}):(\d{2})\s*(?:-|–|—|to)\s*(\d{1,2}):(\d{2})\b/i;

const clock = (hour: number, minute: number) => `${pad(hour)}:${pad(minute)}`;
const to24 = (hour: number, meridiem: string) => {
  if (hour < 1 || hour > 12) return hour;
  const pm = meridiem.toLowerCase() === 'p';
  return (hour % 12) + (pm ? 12 : 0);
};

function readTimes(found: RegExpMatchArray): { startTime: string; endTime: string } | null {
  let start: [number, number];
  let end: [number, number];
  if (found[1] !== undefined) {
    start = [to24(+found[1], found[3]), +(found[2] ?? 0)];
    end = [to24(+found[4], found[6]), +(found[5] ?? 0)];
  } else if (found[7] !== undefined) {
    // Only the end says AM or PM, so the start takes the same one unless that would put it after the end.
    end = [to24(+found[9], found[11]), +(found[10] ?? 0)];
    start = [to24(+found[7], found[11]), +(found[8] ?? 0)];
    if (start[0] * 60 + start[1] >= end[0] * 60 + end[1]) start = [to24(+found[7], found[11].toLowerCase() === 'p' ? 'a' : 'p'), start[1]];
  } else {
    // No AM or PM at all. Classes don't meet at 2 in the morning, so low hours are afternoon.
    const guess = (hour: number) => (hour >= 1 && hour <= 7 ? hour + 12 : hour);
    start = [guess(+found[12]), +found[13]];
    end = [guess(+found[14]), +found[15]];
  }
  if (start[0] > 23 || end[0] > 23 || start[1] > 59 || end[1] > 59) return null;
  if (start[0] * 60 + start[1] >= end[0] * 60 + end[1]) return null;
  return { startTime: clock(...start), endTime: clock(...end) };
}

const CODE = /\b([A-Z]{2,5})[\s-]?(\d{3}[A-Z]?)\b(?:[\s-]*(?:section\s*)?\d{1,3}\b(?=\s*[-–—:|]))?/;
const DATE_RANGE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(?:-|–|—|to)\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/;
const fullYear = (year: string) => (year.length === 2 ? `20${year}` : year);
const isoDate = (month: string, day: string, year: string) => `${fullYear(year)}-${pad(+month)}-${pad(+day)}`;

/**
 * Text read from a picture often mixes up similar shapes inside times, such as 1O:5O or l0.00.
 * Only pieces that look like a time are touched, so names and rooms stay as they were read.
 */
export function cleanReadText(text: string): string {
  const digits = (piece: string) => piece.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1').replace(/[Ss]/g, '5');
  return text
    .replace(/(?<![A-Za-z0-9])([0-9OlI|]{1,2})[:.;,]\s?([0-9OolI|Ss]{2})(?=\s*(?:[ap]\.?m|[AP]\.?M|[-–—~]|to\b|\s|$))/g, (_, hour, minute) => `${digits(hour)}:${digits(minute)}`)
    .replace(/(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)\s*[~_=]\s*(\d)/gi, '$1 - $2')
    .replace(/[ \t]{2,}/g, '   ');
}

const tidy = (text: string) => text.replace(/^[\s\-–—:|,.]+|[\s\-–—:|,.]+$/g, '');

/** Takes the days from the words just before the time, and returns what's left in front of them. */
function splitDays(before: string): { days: number[] | null; rest: string } {
  const pieces = before.trim().split(/\s+/);
  for (let take = Math.min(pieces.length, 7); take >= 1; take--) {
    const days = readDays(pieces.slice(-take).join(' '));
    if (days) return { days, rest: pieces.slice(0, -take).join(' ') };
  }
  return { days: null, rest: before };
}

/**
 * Reads what it can line by line. A line with a course code and no time names the class for the lines after it,
 * which is how most school portals print a schedule. Anything it can't read is handed back, never guessed.
 */
export function readSchedule(text: string): { rows: ScheduleRow[]; unread: string[] } {
  const rows: ScheduleRow[] = [];
  const unread: string[] = [];
  let current = { code: '', name: '' };
  for (const original of text.split(/\r?\n/)) {
    let line = original.replace(/\t/g, '   ').trim();
    if (!line) continue;
    const dates = line.match(DATE_RANGE);
    if (dates) line = `${line.slice(0, dates.index)}   ${line.slice((dates.index ?? 0) + dates[0].length)}`.trim();
    const time = line.match(TIME_RANGE);
    const times = time ? readTimes(time) : null;
    if (!time || !times) {
      const code = line.match(CODE);
      if (code) current = { code: `${code[1]} ${code[2]}`, name: tidy(line.replace(code[0], '')) };
      else if (time || /\b(mon|tue|wed|thu|fri)/i.test(line)) unread.push(original.trim());
      else if (current.code && !current.name && line.length <= 80) current.name = tidy(line);
      continue;
    }
    const before = line.slice(0, time.index);
    let after = line.slice((time.index ?? 0) + time[0].length);
    const split = splitDays(before);
    let { days } = split;
    let { rest } = split;
    if (!days) {
      // Some tables put the days just after the time.
      const next = after.trim().split(/\s+/)[0] ?? '';
      const found = readDays(next);
      if (found) {
        days = found;
        rest = before;
        after = after.replace(next, '');
      }
    }
    if (!days) {
      unread.push(original.trim());
      continue;
    }
    const code = rest.match(CODE);
    const codeAfter = after.match(CODE);
    if (code) {
      current = { code: `${code[1]} ${code[2]}`, name: tidy(rest.replace(code[0], '')) };
    } else if (codeAfter) {
      current = { code: `${codeAfter[1]} ${codeAfter[2]}`, name: tidy(rest) };
      after = after.replace(codeAfter[0], '');
    } else if (tidy(rest)) {
      current = { code: '', name: tidy(rest) };
    }
    if (!current.code && !current.name) {
      unread.push(original.trim());
      continue;
    }
    rows.push({
      code: current.code,
      name: current.name,
      days,
      ...times,
      location: tidy(after.split(/\s{2,}|\|/).map(tidy).find(Boolean) ?? ''),
      startDate: dates ? isoDate(dates[1], dates[2], dates[3]) : '',
      endDate: dates ? isoDate(dates[4], dates[5], dates[6]) : '',
    });
  }
  return { rows, unread };
}
