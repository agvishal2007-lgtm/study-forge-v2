/*
 * SAT and PSAT preparation: the facts, and the arithmetic that follows from them.
 *
 * Two things this file is careful about. The score scales are the real published ones rather than
 * remembered approximations, and they are kept here in one place so no screen invents its own. And
 * nothing here predicts a score: practice at home tells a student which topics they are shaky on,
 * which is useful and honest, and it does not forecast a test day, which would not be.
 *
 * Score scales, from the College Board's own score explanations:
 *   SAT            total 400-1600, each section 200-800
 *   PSAT/NMSQT     total 320-1520, each section 160-760
 *   PSAT 10        total 320-1520, each section 160-760
 *   PSAT 8/9       total 240-1440, each section 120-720
 * Scores are reported in steps of ten, and a total is the two section scores added together.
 * The National Merit Selection Index, which only the PSAT/NMSQT has, is twice the Reading and
 * Writing score plus the Math score, divided by ten: 48 to 228.
 */

export type TestId = 'sat' | 'psat-nmsqt' | 'psat-10' | 'psat-8-9';
export type Section = 'rw' | 'math';

export interface TestFacts {
  id: TestId;
  label: string;
  /** Who normally sits it, said as a hint and never used to decide anything. */
  who: string;
  sectionLow: number;
  sectionHigh: number;
  /** Whether a National Merit Selection Index exists for this test. */
  selectionIndex: boolean;
}

export const TESTS: TestFacts[] = [
  { id: 'sat', label: 'SAT', who: 'usually grade 11 or 12', sectionLow: 200, sectionHigh: 800, selectionIndex: false },
  { id: 'psat-nmsqt', label: 'PSAT/NMSQT', who: 'usually grade 10 or 11', sectionLow: 160, sectionHigh: 760, selectionIndex: true },
  { id: 'psat-10', label: 'PSAT 10', who: 'usually grade 10', sectionLow: 160, sectionHigh: 760, selectionIndex: false },
  { id: 'psat-8-9', label: 'PSAT 8/9', who: 'usually grade 8 or 9', sectionLow: 120, sectionHigh: 720, selectionIndex: false },
];

export const testFacts = (id: TestId): TestFacts => TESTS.find((test) => test.id === id) ?? TESTS[0];

/** The lowest and highest total a test can report: its two sections at their floor and ceiling. */
export const totalRange = (id: TestId): [number, number] => {
  const facts = testFacts(id);
  return [facts.sectionLow * 2, facts.sectionHigh * 2];
};

export const SECTION_LABEL: Record<Section, string> = { rw: 'Reading and Writing', math: 'Math' };

/**
 * The content domains each section is built from. These are the College Board's own domain names,
 * used so a student's weak areas line up with the words on their real score report.
 */
export const DOMAINS: { id: string; section: Section; label: string }[] = [
  { id: 'information', section: 'rw', label: 'Information and Ideas' },
  { id: 'craft', section: 'rw', label: 'Craft and Structure' },
  { id: 'expression', section: 'rw', label: 'Expression of Ideas' },
  { id: 'conventions', section: 'rw', label: 'Standard English Conventions' },
  { id: 'algebra', section: 'math', label: 'Algebra' },
  { id: 'advanced', section: 'math', label: 'Advanced Math' },
  { id: 'data', section: 'math', label: 'Problem-Solving and Data Analysis' },
  { id: 'geometry', section: 'math', label: 'Geometry and Trigonometry' },
];

export const domainLabel = (id: string): string => DOMAINS.find((domain) => domain.id === id)?.label ?? id;
export const domainsIn = (section: Section) => DOMAINS.filter((domain) => domain.section === section);

/** A section score as reported: inside the scale, and a step of ten. */
export function validSection(test: TestId, score: number): boolean {
  const facts = testFacts(test);
  return Number.isInteger(score) && score % 10 === 0 && score >= facts.sectionLow && score <= facts.sectionHigh;
}

/** A total is the two sections added, never entered on its own. */
export const totalOf = (rw: number, math: number): number => rw + math;

/**
 * The National Merit Selection Index: twice Reading and Writing, plus Math, divided by ten.
 * Only the PSAT/NMSQT has one, so anything else gets null rather than a number that doesn't exist.
 */
export function selectionIndex(test: TestId, rw: number, math: number): number | null {
  if (!testFacts(test).selectionIndex) return null;
  if (!validSection(test, rw) || !validSection(test, math)) return null;
  return (rw * 2 + math) / 10;
}

export interface ScoreEntry {
  id: string;
  test: TestId;
  /** YYYY-MM-DD, the day they sat it. */
  date: string;
  /** What they were working from, in their words — "Bluebook practice 3", "school PSAT". */
  source: string;
  rw: number;
  math: number;
  createdAt: number;
  updatedAt: number;
}

/** Scores oldest first, which is the order a change over time has to be read in. */
export const inOrder = (scores: ScoreEntry[]): ScoreEntry[] =>
  [...scores].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

export interface Progress {
  latest: ScoreEntry | null;
  best: ScoreEntry | null;
  /** Change in total from the first score to the latest. Null until there are two. */
  change: number | null;
  /** How far the latest total is below the goal, or 0 once it is met. Null without a goal. */
  toGoal: number | null;
}

/** What the scores add up to. Nothing here guesses at a future score. */
export function progressOf(scores: ScoreEntry[], goalTotal: number | null): Progress {
  const ordered = inOrder(scores.filter((score) => validSection(score.test, score.rw) && validSection(score.test, score.math)));
  if (ordered.length === 0) return { latest: null, best: null, change: null, toGoal: null };
  const latest = ordered[ordered.length - 1];
  const best = ordered.reduce((top, score) => (totalOf(score.rw, score.math) > totalOf(top.rw, top.math) ? score : top), ordered[0]);
  const latestTotal = totalOf(latest.rw, latest.math);
  return {
    latest,
    best,
    change: ordered.length < 2 ? null : latestTotal - totalOf(ordered[0].rw, ordered[0].math),
    toGoal: goalTotal === null ? null : Math.max(0, goalTotal - latestTotal),
  };
}

/** Whole days from today to the test, negative once it has passed. Null when no date is set. */
export function daysUntil(testDate: string | null, today: string): number | null {
  if (!testDate) return null;
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${testDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86400000);
}

/** How that reads in a sentence, without pretending a passed date is still coming. */
export function describeCountdown(days: number | null): string {
  if (days === null) return 'No test date set yet.';
  if (days < 0) return `That date was ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ago.`;
  if (days === 0) return 'Your test is today.';
  if (days === 1) return 'Your test is tomorrow.';
  if (days < 14) return `${days} days to go.`;
  const weeks = Math.floor(days / 7);
  return `${days} days to go — about ${weeks} ${weeks === 1 ? 'week' : 'weeks'}.`;
}

export interface Attempt {
  id: string;
  questionId: string;
  domain: string;
  correct: boolean;
  /** When it was answered, so a run of old mistakes doesn't outweigh recent work forever. */
  at: number;
  createdAt: number;
  updatedAt: number;
}

export interface DomainStanding {
  domain: string;
  label: string;
  section: Section;
  tried: number;
  right: number;
  /** Null when nothing has been tried: an untried topic is unknown, not zero. */
  accuracy: number | null;
}

/** How each domain is going, every domain listed whether or not it has been practised. */
export function standings(attempts: Attempt[]): DomainStanding[] {
  return DOMAINS.map((domain) => {
    const mine = attempts.filter((attempt) => attempt.domain === domain.id);
    const right = mine.filter((attempt) => attempt.correct).length;
    return {
      domain: domain.id,
      label: domain.label,
      section: domain.section,
      tried: mine.length,
      right,
      accuracy: mine.length === 0 ? null : Math.round((right / mine.length) * 100),
    };
  });
}

/**
 * What to practise next. Anything never tried comes first — an unknown is more useful to resolve
 * than a known weakness to confirm — and after that the lowest accuracy, with more attempts
 * breaking a tie so one unlucky question doesn't dominate.
 */
export function nextFocus(attempts: Attempt[]): DomainStanding | null {
  const all = standings(attempts);
  if (all.length === 0) return null;
  const untried = all.filter((standing) => standing.tried === 0);
  if (untried.length > 0) return untried[0];
  return [...all].sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || b.tried - a.tried)[0];
}

/** Domains worth working on: tried at least a few times and under a threshold. */
export const weakAreas = (attempts: Attempt[], under = 70, atLeast = 3): DomainStanding[] =>
  standings(attempts)
    .filter((standing) => standing.tried >= atLeast && standing.accuracy !== null && standing.accuracy < under)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0));
