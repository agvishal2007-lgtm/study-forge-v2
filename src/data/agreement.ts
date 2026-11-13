/*
 * Agreeing to the Terms of Use and the Privacy Policy. Everyone agrees once per device before using
 * Study Forge, and again whenever either document changes (the version below changes with them).
 */
export const AGREEMENT_VERSION = '2026-11-13';
const KEY = 'study-forge-agreed';
const EVENT = 'study-forge-agreed';

export function hasAgreed(): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { version?: string } | null;
    return saved?.version === AGREEMENT_VERSION;
  } catch {
    return false;
  }
}

/** Records the agreement with its date. If the browser refuses to store it, it lasts for this visit. */
let thisVisit = false;
export function recordAgreement(): void {
  thisVisit = true;
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: AGREEMENT_VERSION, at: new Date().toISOString() }));
  } catch {
    // Private browsing can refuse; the agreement still counts for this visit.
  }
  window.dispatchEvent(new Event(EVENT));
}

export const agreedNow = () => thisVisit || hasAgreed();

export function subscribeAgreement(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
