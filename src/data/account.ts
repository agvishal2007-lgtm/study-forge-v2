/**
 * Which account's data is open in this browser. Each account has separate storage on the
 * device, so a second student on a shared computer can't open the first student's work.
 * Using Study Forge without signing in has its own space too.
 */
const KEY = 'study-forge-account';

export interface ActiveAccount {
  uid: string;
  email: string;
  photoURL?: string;
  /** Signed in with Google, so that account's calendar can be offered. */
  usesGoogle?: boolean;
}

export function getActiveAccount(): ActiveAccount | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!parsed || typeof parsed.uid !== 'string') return null;
    return { uid: parsed.uid, email: String(parsed.email ?? ''), photoURL: typeof parsed.photoURL === 'string' ? parsed.photoURL : undefined, usesGoogle: parsed.usesGoogle === true };
  } catch {
    return null;
  }
}

/** Switching accounts reloads the page, so no screen can keep showing the previous account's data. */
export function switchAccount(account: ActiveAccount | null): void {
  if (account) localStorage.setItem(KEY, JSON.stringify(account));
  else localStorage.removeItem(KEY);
  location.reload();
}

/** Refreshes account details, such as a new profile picture, without reloading anything. */
export function updateAccountDetails(account: ActiveAccount): void {
  localStorage.setItem(KEY, JSON.stringify(account));
  window.dispatchEvent(new Event('study-forge-account-updated'));
}

const safe = (uid: string) => uid.replace(/[^a-zA-Z0-9_-]/g, '_');
const active = getActiveAccount();

/** The device storage names for one account, or for no account when uid is null. */
export const dbNameFor = (uid: string | null) => (uid ? `study-forge-user-${safe(uid)}` : 'study-forge');
export const folderNameFor = (uid: string | null) => (uid ? `materials-${safe(uid)}` : 'materials');
export const CURRENT_DB = dbNameFor(active?.uid ?? null);
export const CURRENT_FOLDER = folderNameFor(active?.uid ?? null);

// Another tab signing in or out must not leave this tab showing the wrong account.
if (typeof window !== 'undefined') {
  const openedAs = active?.uid ?? null;
  window.addEventListener('storage', (event) => {
    // Only a different person needs a reload, not a refreshed profile picture.
    if (event.key === KEY && (getActiveAccount()?.uid ?? null) !== openedAs) location.reload();
  });
}
