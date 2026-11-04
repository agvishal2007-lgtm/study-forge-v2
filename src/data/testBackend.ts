import { BackendError, type AccountBackend, type AccountUser } from './accountBackend';

/** Only included in the test build. It talks to tests/fakeAccountServer.cjs in place of Firebase. */
const STORED = 'test-signed-in-user';
const SERVER = (window as unknown as { __testServer?: string }).__testServer ?? 'http://localhost:4199';

async function call<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${SERVER}${path}`, { method: 'POST', body: JSON.stringify(body) });
  } catch {
    throw new BackendError('offline', 'Study Forge can\'t reach the internet.');
  }
  if (response.status === 429) throw new BackendError('quota', 'The daily limit for saving online has been reached.');
  if (response.status === 403) throw new BackendError('denied', 'Saving online was refused.');
  if (!response.ok) throw new BackendError('other', `Server said ${response.status}`);
  return response.json();
}

export const backend: AccountBackend = {
  watchUser(listener) {
    const stored = localStorage.getItem(STORED);
    setTimeout(() => listener(stored ? JSON.parse(stored) : null), 0);
  },
  async signIn() {
    const user = (window as unknown as { __testSignIn?: AccountUser | string }).__testSignIn;
    if (typeof user === 'string' || !user) throw Object.assign(new Error('closed'), { code: user ?? 'auth/popup-closed-by-user' });
    localStorage.setItem(STORED, JSON.stringify(user));
    return user;
  },
  async signOut() {
    localStorage.removeItem(STORED);
  },
  pull: (uid, since) => call('/pull', { uid, since }),
  push: (uid, items) => call('/push', { uid, items }),
  async deleteAll(uid) {
    await call('/deleteAll', { uid });
  },
};
