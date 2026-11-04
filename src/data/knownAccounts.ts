/**
 * Hints for "I forgot which email I used". Only a shortened form is kept, in this browser only,
 * so someone else on a shared computer can't read a full address.
 */
const KEY = 'study-forge-known-accounts';
const LIMIT = 5;

export interface KnownAccount {
  hint: string;
  method: string;
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return email ? `${email.slice(0, 2)}***` : '';
  const name = email.slice(0, at);
  return `${name.slice(0, Math.min(2, Math.max(1, name.length - 1)))}***${email.slice(at)}`;
}

export function listKnownAccounts(): KnownAccount[] {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((entry) => typeof entry?.hint === 'string' && typeof entry?.method === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberAccount(email: string, method: string): void {
  const hint = maskEmail(email);
  if (!hint) return;
  try {
    const others = listKnownAccounts().filter((entry) => entry.hint !== hint);
    localStorage.setItem(KEY, JSON.stringify([{ hint, method }, ...others].slice(0, LIMIT)));
  } catch { /* A hint is only a convenience, so a blocked save changes nothing. */ }
}

export function forgetKnownAccounts(): void {
  try { localStorage.removeItem(KEY); } catch { /* Nothing was saved. */ }
}
