/*
 * Reading-position and bookmark rules for textbook navigation. Pure, so they can be tested.
 */
export interface Bookmark { page: number; label: string; at: number }
export interface Reading { page: number; at: number; bookmarks: Bookmark[] }

export const EMPTY_READING: Reading = { page: 0, at: 0, bookmarks: [] };

/** Keeps only sensible values from storage or another device. Page 0 means never opened. */
export function cleanReading(raw: unknown): Reading {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_READING, bookmarks: [] };
  const value = raw as Partial<Reading>;
  const page = Number.isInteger(value.page) && (value.page as number) > 0 ? (value.page as number) : 0;
  const bookmarks = Array.isArray(value.bookmarks)
    ? value.bookmarks.filter((mark) => mark && Number.isInteger(mark.page) && mark.page > 0)
      .map((mark) => ({ page: mark.page, label: typeof mark.label === 'string' ? mark.label.slice(0, 80) : '', at: typeof mark.at === 'number' ? mark.at : 0 }))
    : [];
  return { page, at: typeof value.at === 'number' ? value.at : 0, bookmarks: sortMarks(dedupe(bookmarks)) };
}

const dedupe = (marks: Bookmark[]) => [...new Map(marks.map((mark) => [mark.page, mark])).values()];
const sortMarks = (marks: Bookmark[]) => [...marks].sort((a, b) => a.page - b.page);

/** Adds a bookmark, or relabels the one already on that page. */
export const addBookmark = (reading: Reading, page: number, label: string, at: number): Reading =>
  ({ ...reading, bookmarks: sortMarks(dedupe([...reading.bookmarks.filter((mark) => mark.page !== page), { page, label: label.trim().slice(0, 80), at }])) });

export const removeBookmark = (reading: Reading, page: number): Reading =>
  ({ ...reading, bookmarks: reading.bookmarks.filter((mark) => mark.page !== page) });

/** Where to open: an explicit page (from search or a note) wins, then where they stopped, then page 1. */
export function startingPage(asked: number | null, reading: Reading, pages: number): number {
  const page = asked ?? (reading.page || 1);
  return Math.min(Math.max(1, page), Math.max(1, pages));
}

export interface OutlineEntry { title: string; page: number | null; depth: number }

/** Flattens a PDF's table of contents, keeping each entry's depth for indenting. */
export function flattenOutline(items: { title: string; page: number | null; items: unknown[] }[], depth = 0): OutlineEntry[] {
  return items.flatMap((item) => [
    { title: item.title.trim() || 'Untitled section', page: item.page, depth },
    ...flattenOutline(item.items as { title: string; page: number | null; items: unknown[] }[], depth + 1),
  ]);
}

/** The section the given page falls in: the last contents entry starting at or before it. */
export function currentSection(outline: OutlineEntry[], page: number): OutlineEntry | null {
  let found: OutlineEntry | null = null;
  for (const entry of outline) if (entry.page !== null && entry.page <= page && (!found || entry.page >= (found.page ?? 0))) found = entry;
  return found;
}

/*
 * Online textbooks (a paid publisher site such as Connect, MyLab, MindTap or VitalSource) can't be
 * opened inside Study Forge: they need the student's own login. So the student keeps their place in
 * their own words ("Chapter 4, 4.2, page 112"), with named spots and, if the site gives one, a direct
 * address for that chapter.
 */
export interface BookSpot { id: string; label: string; place: string; url: string }
export interface OnlineReading { place: string; at: number; spots: BookSpot[] }

export const BOOK_LIMITS = { place: 120, label: 80, spots: 50 } as const;

export function cleanOnlineReading(raw: unknown, tidy: (url: string) => string | null): OnlineReading {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<OnlineReading>;
  const text = (input: unknown, max: number) => (typeof input === 'string' ? input.trim().slice(0, max) : '');
  const spots = Array.isArray(value.spots)
    ? value.spots.filter((spot) => spot && typeof spot.id === 'string')
      .map((spot) => ({ id: spot.id, label: text(spot.label, BOOK_LIMITS.label), place: text(spot.place, BOOK_LIMITS.place), url: typeof spot.url === 'string' ? tidy(spot.url) ?? '' : '' }))
      .filter((spot) => spot.label || spot.place)
      .slice(0, BOOK_LIMITS.spots)
    : [];
  return { place: text(value.place, BOOK_LIMITS.place), at: typeof value.at === 'number' ? value.at : 0, spots };
}
