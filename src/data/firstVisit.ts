import { getDb } from './db';

/**
 * Whether this is a genuinely new visitor, which is the only time the welcome page takes the place
 * of a student's own dashboard. Anyone with work on this device, or an account, goes straight to
 * Today — Study Forge works without an account, so a student who never signs in must not be met by
 * a sales page every time they open it.
 */
const SEEN = 'study-forge-seen-welcome';

/** The stores that mean a student has started using Study Forge. */
const WORK = ['courses', 'materials', 'notes', 'plannerItems', 'decks', 'practiceSets', 'lessons', 'recordings', 'calendarEvents'] as const;

export const WELCOME_SEEN_EVENT = 'study-forge-welcome-seen';

export function markWelcomeSeen() {
  try {
    localStorage.setItem(SEEN, 'yes');
  } catch {
    // A private window simply sees the welcome page again; nothing breaks.
  }
  // Starting from the welcome page lands on the same address it already occupies, so the decision
  // has to be retaken rather than waited for.
  window.dispatchEvent(new Event(WELCOME_SEEN_EVENT));
}

const welcomeSeen = (): boolean => {
  try {
    return localStorage.getItem(SEEN) === 'yes';
  } catch {
    return false;
  }
};

export async function hasAnyWork(): Promise<boolean> {
  try {
    const db = await getDb();
    const counts = await Promise.all(WORK.map((store) => db.count(store)));
    return counts.some((count) => count > 0);
  } catch {
    // If the database can't be read, assume there is work rather than showing a sales page
    // over someone's own screen.
    return true;
  }
}

/** True only for someone with no account, no saved work, and who has not been here before. */
export async function isNewVisitor(signedIn: boolean): Promise<boolean> {
  if (signedIn || welcomeSeen()) return false;
  return !(await hasAnyWork());
}
