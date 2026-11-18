import { getDb, notifyChanged } from './db';
import { DEFAULT_TERM_KIND, getSchool } from './schoolLevel';
import type { TermKind } from './schoolLevelRules';
import { statusFor, type Term, type TermStatus } from './termRules';

export * from './termRules';

/*
 * Where terms are kept. Each one is a single record in the same synced place Trash uses, so terms
 * follow a student between devices without a new collection, without a rules change, and without
 * costing anything more to run.
 *
 * A course still carries its term's name as text, exactly as before. Terms are matched to courses
 * by that name, so nothing already saved has to be rewritten and nothing can be orphaned by this.
 */
const PREFIX = 'term-';

export async function listTerms(): Promise<Term[]> {
  const all = (await (await getDb()).getAll('studyState')) as { id: string; value: unknown }[];
  return all
    .filter((record) => record.id.startsWith(PREFIX) && record.value && typeof record.value === 'object')
    .map((record) => record.value as Term)
    .filter((term) => typeof term.name === 'string' && term.name.trim().length > 0);
}

export async function saveTerm(term: Term): Promise<void> {
  const db = await getDb();
  const current = (await db.get('studyState', term.id)) as { updatedAt?: number } | undefined;
  const updatedAt = Math.max(Date.now(), (current?.updatedAt ?? 0) + 1);
  await db.put('studyState', { id: term.id, value: { ...term, updatedAt }, updatedAt });
  notifyChanged();
}

export async function createTerm(name: string, kind?: TermKind): Promise<Term> {
  const now = Date.now();
  const term: Term = {
    id: `${PREFIX}${crypto.randomUUID()}`,
    name: name.trim(),
    kind: kind ?? getSchool().termKind ?? DEFAULT_TERM_KIND.college,
    start: '',
    end: '',
    status: 'current',
    createdAt: now,
    updatedAt: now,
  };
  await saveTerm(term);
  return term;
}

/** Puts a term away, or takes it back out. Course statuses are never touched by this. */
export async function setTermStatus(id: string, status: TermStatus): Promise<void> {
  const record = (await (await getDb()).get('studyState', id)) as { value: Term } | undefined;
  if (!record) throw new Error('That term no longer exists.');
  await saveTerm({ ...record.value, status });
}

export async function deleteTerm(id: string): Promise<void> {
  await (await getDb()).delete('studyState', id);
  notifyChanged();
}

/**
 * Makes sure every term name already written on a course has a record, so a student who has been
 * using Study Forge for a year sees their old terms without entering anything again. Existing
 * records are left exactly as they are.
 */
export async function termsForCourses(courseTerms: string[]): Promise<Term[]> {
  const existing = await listTerms();
  const known = new Set(existing.map((term) => term.name));
  const missing = [...new Set(courseTerms.map((name) => name.trim()).filter(Boolean))].filter((name) => !known.has(name));
  if (missing.length === 0) return existing;
  const made: Term[] = [];
  for (const name of missing) {
    // Anything carried over from before is treated as finished unless the student says otherwise;
    // guessing that an old term is still running would put stale classes on their dashboard.
    const term = await createTerm(name);
    const settled: Term = { ...term, status: 'past' };
    await saveTerm(settled);
    made.push(settled);
  }
  return [...existing, ...made];
}

export const liveStatus = (term: Term, today: string) => statusFor(term, today);
