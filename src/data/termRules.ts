import { letterFor, type TermKind } from './schoolLevelRules.ts';

/*
 * Academic terms as records of their own: a name, how the year is split, optional dates, and a
 * status. They exist so a student can come back years later, open a past term, and see what they
 * took, what it was worth and how it went — without any of that depending on a course still being
 * active, or on a term still being the current one.
 *
 * This file only calculates, so it can be tested directly.
 */
export type TermStatus = 'upcoming' | 'current' | 'past' | 'archived';
export const TERM_STATUSES: TermStatus[] = ['upcoming', 'current', 'past', 'archived'];

export const TERM_STATUS_LABEL: Record<TermStatus, string> = {
  upcoming: 'Coming up',
  current: 'Now',
  past: 'Finished',
  archived: 'Put away',
};

export interface Term {
  id: string;
  name: string;
  kind: TermKind;
  /** Optional, YYYY-MM-DD. Empty means the student didn't say. */
  start: string;
  end: string;
  status: TermStatus;
  createdAt: number;
  updatedAt: number;
}

/** What a student recorded about one class in a term. Nothing here is ever guessed. */
export interface CourseRecord {
  id: string;
  name: string;
  code: string;
  term: string;
  /** Credit hours, as the student entered them. Null means not entered, never assumed to be zero. */
  credits: number | null;
  /** The final grade as the student entered it, such as "A-" or "Pass". Empty means not entered. */
  finalGrade: string;
  status: string;
}

/**
 * Where a term sits in time, worked out from its dates when they were given. A term the student
 * put away stays put away: that is their decision, not something a date should undo.
 */
export function statusFor(term: Pick<Term, 'start' | 'end' | 'status'>, today: string): TermStatus {
  if (term.status === 'archived') return 'archived';
  if (term.start && today < term.start) return 'upcoming';
  if (term.end && today > term.end) return 'past';
  if (term.start || term.end) return 'current';
  return term.status;
}

/** Terms in the order a student thinks of them: what's on now, then what's coming, then back in time. */
export function orderTerms(terms: Term[], today: string): Term[] {
  const rank: Record<TermStatus, number> = { current: 0, upcoming: 1, past: 2, archived: 3 };
  return [...terms].sort((a, b) => {
    const byStatus = rank[statusFor(a, today)] - rank[statusFor(b, today)];
    if (byStatus !== 0) return byStatus;
    // Within a group, by date when there is one, and newest first for anything finished.
    const aKey = a.start || a.name;
    const bKey = b.start || b.name;
    const backwards = statusFor(a, today) === 'past' || statusFor(a, today) === 'archived';
    return backwards ? bKey.localeCompare(aKey) : aKey.localeCompare(bKey);
  });
}

export interface TermSummary {
  /** Credits on classes the student is taking or took, whether or not a grade was entered. */
  attempted: number;
  /** Credits on classes with a final grade that isn't a fail. */
  earned: number;
  /** Classes counted, and how many had a grade. */
  classes: number;
  graded: number;
  /** An unweighted 4.0 average of the grades entered. Null when none were. */
  gpa: number | null;
  /** True when some class has no credits entered, so the totals are not the whole story. */
  incomplete: boolean;
}

const FAILING = new Set(['F', 'E', 'U', 'NP', 'FAIL', 'NO PASS', 'INCOMPLETE', 'W', 'WITHDRAWN']);
const PASSING_WORDS = new Set(['P', 'PASS', 'CR', 'CREDIT', 'S', 'SATISFACTORY']);

/** True when a grade a student typed counts as passing. Unknown wording is not assumed either way. */
export function passed(grade: string): boolean | null {
  const clean = grade.trim().toUpperCase();
  if (!clean) return null;
  if (FAILING.has(clean)) return false;
  if (PASSING_WORDS.has(clean)) return true;
  if (/^[A-D][+-]?$/.test(clean)) return true;
  return null;
}

/**
 * Adds up one term. Only what the student actually entered is counted: a class with no credits
 * adds nothing and is flagged, and a grade nobody recognises is left out of the average rather
 * than guessed at. Study Forge is not a transcript, and this never pretends to be one.
 */
export function summarizeTerm(records: CourseRecord[]): TermSummary {
  let attempted = 0;
  let earned = 0;
  let graded = 0;
  let points = 0;
  let pointed = 0;
  let incomplete = false;
  for (const record of records) {
    if (record.credits === null) incomplete = true;
    else attempted += record.credits;
    const result = passed(record.finalGrade);
    if (record.finalGrade.trim()) graded += 1;
    if (result === true && record.credits !== null) earned += record.credits;
    // Only letter grades carry points. Pass/fail has no place in an average.
    const clean = record.finalGrade.trim().toUpperCase();
    if (/^[A-F][+-]?$/.test(clean)) {
      points += letterFor(gradeToPercent(clean)).points;
      pointed += 1;
    }
  }
  return {
    attempted: round(attempted),
    earned: round(earned),
    classes: records.length,
    graded,
    gpa: pointed > 0 ? Math.round((points / pointed) * 100) / 100 : null,
    incomplete,
  };
}

const round = (value: number) => Math.round(value * 100) / 100;

/** The middle of the band a letter stands for, so a letter can go back through the usual scale. */
function gradeToPercent(letter: string): number {
  const table: Record<string, number> = {
    'A+': 98, A: 95, 'A-': 91, 'B+': 88, B: 85, 'B-': 81, 'C+': 78, C: 75, 'C-': 71,
    'D+': 68, D: 65, 'D-': 61, F: 50, E: 50,
  };
  return table[letter] ?? 50;
}

/** Adds up several terms without counting the same class twice. */
export function summarizeAll(records: CourseRecord[]): TermSummary {
  const seen = new Set<string>();
  return summarizeTerm(records.filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  }));
}
