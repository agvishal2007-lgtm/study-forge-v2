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

async function authCall(path: string, body: unknown): Promise<AccountUser> {
  let response: Response;
  try {
    response = await fetch(`${SERVER}${path}`, { method: 'POST', body: JSON.stringify(body) });
  } catch {
    throw Object.assign(new Error('offline'), { code: 'auth/network-request-failed' });
  }
  const answer = await response.json();
  if (!response.ok) throw Object.assign(new Error(answer.code), { code: answer.code });
  return answer;
}

const storedUser = (): (AccountUser & { password?: boolean }) | null => JSON.parse(localStorage.getItem(STORED) ?? 'null');

export const backend: AccountBackend = {
  providers: ['google', 'microsoft'],
  async signUpWithEmail(email, password) {
    const user = await authCall('/signUp', { email, password });
    localStorage.setItem(STORED, JSON.stringify({ ...user, password: true }));
    return user;
  },
  async signInWithEmail(email, password) {
    const user = await authCall('/signIn', { email, password });
    localStorage.setItem(STORED, JSON.stringify({ ...user, password: true }));
    return user;
  },
  async sendPasswordReset(email) {
    await authCall('/reset', { email });
  },
  async needsEmailConfirmation() {
    const user = storedUser();
    if (!user?.password) return false;
    const answer = await authCall('/confirmed', { email: user.email }) as unknown as { confirmed: boolean };
    return !answer.confirmed;
  },
  async sendEmailConfirmation() {
    await authCall('/sendConfirmation', { email: storedUser()?.email });
  },
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
  watchChanges(uid, since, onChange) {
    let latest = since;
    const timer = setInterval(async () => {
      try {
        const { cursor } = await call('/pull', { uid, since: latest });
        if (cursor > latest) { latest = cursor; onChange(); }
      } catch {
        // Offline: the next tick tries again.
      }
    }, 2000);
    return () => clearInterval(timer);
  },
  async deleteAll(uid) {
    await call('/deleteAll', { uid });
  },
};
