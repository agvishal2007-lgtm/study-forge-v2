/*
 * The personal knowledge library: shelves for things worth keeping beyond one course, such as
 * research papers, career information, writing guides and subject references. A shelf is just a
 * label on the same file or link record, so nothing is copied and there's no second library.
 */
import type { Material } from './types';

/** Suggested shelves. Students can type any name of their own. */
export const SUGGESTED_SHELVES = ['Research papers', 'Career', 'Writing and citation', 'Subject references', 'Study guides', 'Educational links'];

export interface Shelf { name: string; items: Material[] }

/** The student's shelves in alphabetical order, each with its items newest first. */
export function shelvesOf(materials: Material[]): Shelf[] {
  // "career" and "Career" are the same shelf, shown with the first spelling used.
  const groups = new Map<string, Shelf>();
  for (const item of materials) {
    const name = (item.shelf ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const shelf = groups.get(key) ?? { name, items: [] };
    shelf.items.push(item);
    groups.set(key, shelf);
  }
  return [...groups.values()]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((shelf) => ({ name: shelf.name, items: [...shelf.items].sort((x, y) => y.createdAt - x.createdAt) }));
}

/** Every shelf name in use plus the suggestions, without repeats, for the picker. */
export function shelfChoices(materials: Material[]): string[] {
  const used = shelvesOf(materials).map((shelf) => shelf.name);
  const lower = new Set(used.map((name) => name.toLowerCase()));
  return [...used, ...SUGGESTED_SHELVES.filter((name) => !lower.has(name.toLowerCase()))];
}

/** Files and links that belong to no course and sit on no shelf, so they're easy to find and file. */
export const looseItems = (materials: Material[]) => materials.filter((item) => !item.courseId && !(item.shelf ?? '').trim());
