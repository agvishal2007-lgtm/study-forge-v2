/** How search matches and shows results. This file only calculates, so it can be tested directly. */

/** Ignores capitals and accents, and keeps each character in place so matches can be highlighted. */
export const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export const searchTerms = (query: string) => [...new Set(normalize(query).split(/\s+/).filter(Boolean))];

/** Every word has to appear, in any order. */
export function matches(text: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const clean = normalize(text);
  return terms.every((term) => clean.includes(term));
}

export interface Piece {
  text: string;
  match: boolean;
}

/** Splits text so the matching words can be highlighted. */
export function highlight(text: string, terms: string[]): Piece[] {
  if (terms.length === 0 || !text) return text ? [{ text, match: false }] : [];
  const lower = [...text].map((character) => normalize(character)[0] ?? character).join('');
  const hit = new Array<boolean>(text.length).fill(false);
  const chars = [...text];
  if (lower.length !== chars.length) return [{ text, match: false }];
  for (const term of terms) {
    for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, at + 1)) {
      for (let i = at; i < at + term.length; i++) hit[i] = true;
    }
  }
  const pieces: Piece[] = [];
  chars.forEach((character, index) => {
    const previous = pieces[pieces.length - 1];
    if (previous && previous.match === hit[index]) previous.text += character;
    else pieces.push({ text: character, match: hit[index] });
  });
  return pieces;
}

/** A short piece of text around the first match. */
export function snippet(text: string, terms: string[], width = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= width) return flat;
  const clean = normalize(flat);
  const found = terms.map((term) => clean.indexOf(term)).filter((at) => at !== -1);
  const first = found.length > 0 ? Math.min(...found) : 0;
  const start = Math.max(0, first - Math.floor(width / 3));
  const end = Math.min(flat.length, start + width);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

export const SEARCH_GROUPS = ['Notes', 'Files', 'Flashcards', 'Practice', 'Planner', 'Lessons', 'Courses'] as const;
export type SearchGroup = (typeof SEARCH_GROUPS)[number];

export interface Searchable {
  group: SearchGroup;
  title: string;
  body: string;
  to: string;
  detail?: string;
}

export interface SearchHit extends Searchable {
  snippet: string;
}

/** Title matches come first within each group. */
export function runSearch(items: Searchable[], query: string): { group: SearchGroup; hits: SearchHit[] }[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  return SEARCH_GROUPS
    .map((group) => {
      const found = items.filter((item) => item.group === group && matches(`${item.title} ${item.body}`, terms));
      const sorted = found
        .map((item, index) => ({ item, index, inTitle: matches(item.title, terms) }))
        .sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || a.index - b.index)
        .map(({ item }) => ({ ...item, snippet: snippet(item.body, terms) }));
      return { group, hits: sorted };
    })
    .filter((entry) => entry.hits.length > 0);
}
