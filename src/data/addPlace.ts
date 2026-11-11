import type { Place } from './smartAddRules';

/**
 * The last place a student filed something, kept on the device so Smart Add can suggest it next
 * time. It is only ever a suggestion, and a blocked or private store simply means no suggestion.
 */
const KEY = 'study-forge-add-place';

export function rememberPlace(place: Place) {
  try {
    localStorage.setItem(KEY, JSON.stringify(place));
  } catch {
    // Remembering is a convenience, never a requirement.
  }
}

export function lastPlace(): Place | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Place>;
    return { courseId: parsed.courseId ?? null, topicId: parsed.topicId ?? null };
  } catch {
    return null;
  }
}
