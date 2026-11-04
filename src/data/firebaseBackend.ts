import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import {
  collection, doc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, startAfter, Timestamp, where, writeBatch,
  type Firestore,
} from 'firebase/firestore/lite';
import {
  createUserWithEmailAndPassword, FacebookAuthProvider, GoogleAuthProvider, OAuthProvider, onAuthStateChanged, reload, sendEmailVerification,
  sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut,
} from 'firebase/auth';
import { BackendError, itemKey, type AccountBackend, type AccountUser, type LoginProvider, type PullResult, type PushItem, type RemoteItem } from './accountBackend.ts';

const PAGE = 300;
/** Server times can land slightly out of order, so each check looks back a little. */
const OVERLAP_MS = 10_000;

function translate(error: unknown): BackendError {
  const code = String((error as { code?: string }).code ?? '');
  if (code.includes('resource-exhausted')) return new BackendError('quota', 'The daily limit for saving online has been reached.');
  if (code.includes('permission-denied') || code.includes('unauthenticated')) return new BackendError('denied', 'Saving online was refused.');
  if (code.includes('unavailable') || code.includes('network') || code.includes('deadline-exceeded')) return new BackendError('offline', 'Study Forge can\'t reach the internet.');
  return new BackendError('other', (error as Error).message);
}

const docId = (item: { collection: string; id: string }) => encodeURIComponent(itemKey(item.collection, item.id));

function providerFor(provider: LoginProvider) {
  if (provider === 'microsoft') {
    const microsoft = new OAuthProvider('microsoft.com');
    microsoft.setCustomParameters({ prompt: 'select_account' });
    return microsoft;
  }
  if (provider === 'facebook') {
    const facebook = new FacebookAuthProvider();
    facebook.addScope('email');
    return facebook;
  }
  const google = new GoogleAuthProvider();
  google.setCustomParameters({ prompt: 'select_account' });
  return google;
}

export function createFirebaseBackend(_app: FirebaseApp, auth: Auth, db: Firestore, providers: LoginProvider[] = ['google']): AccountBackend {
  const toUser = (user: { uid: string; email: string | null; displayName: string | null; photoURL: string | null }): AccountUser => ({
    uid: user.uid,
    // Some Facebook accounts have no email to share.
    email: user.email ?? user.displayName ?? 'Your account',
    photoURL: user.photoURL ?? undefined,
  });
  return {
    providers,
    watchUser(listener) {
      onAuthStateChanged(auth, (user) => listener(user ? toUser(user) : null));
    },
    async signIn(provider = 'google') {
      const { user } = await signInWithPopup(auth, providerFor(provider));
      return toUser(user);
    },
    async signUpWithEmail(email, password) {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      // The account works either way, and the student can ask for this email again in Settings.
      await sendEmailVerification(user).catch(() => undefined);
      return toUser(user);
    },
    async signInWithEmail(email, password) {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      return toUser(user);
    },
    async sendPasswordReset(email) {
      await sendPasswordResetEmail(auth, email);
    },
    async needsEmailConfirmation() {
      const { currentUser } = auth;
      if (!currentUser) return false;
      await reload(currentUser).catch(() => undefined);
      return !currentUser.emailVerified && currentUser.providerData.some((entry) => entry.providerId === 'password');
    },
    async sendEmailConfirmation() {
      if (auth.currentUser) await sendEmailVerification(auth.currentUser);
    },
    async signOut() {
      await signOut(auth);
    },
    async pull(uid, since): Promise<PullResult> {
      try {
        const items: RemoteItem[] = [];
        let cursor = since;
        const start = Timestamp.fromMillis(Math.max(0, since - OVERLAP_MS));
        const base = query(collection(db, 'users', uid, 'items'), where('syncedAt', '>', start), orderBy('syncedAt'), limit(PAGE));
        let page = await getDocs(base);
        for (;;) {
          for (const snapshot of page.docs) {
            const data = snapshot.data();
            items.push({ collection: data.collection, id: data.id, json: data.json, deleted: data.deleted, rev: data.rev });
            cursor = Math.max(cursor, (data.syncedAt as Timestamp).toMillis());
          }
          if (page.docs.length < PAGE) break;
          page = await getDocs(query(base, startAfter(page.docs[page.docs.length - 1])));
        }
        return { items, cursor };
      } catch (error) {
        throw translate(error);
      }
    },
    async push(uid, items: PushItem[]) {
      try {
        return await runTransaction(db, async (transaction) => {
          const conflicts: string[] = [];
          const refs = items.map((item) => doc(db, 'users', uid, 'items', docId(item)));
          const current = await Promise.all(refs.map((ref) => transaction.get(ref)));
          items.forEach((item, index) => {
            const serverRev = current[index].exists() ? (current[index].data().rev as number) : 0;
            if (serverRev !== item.baseRev) {
              conflicts.push(itemKey(item.collection, item.id));
              return;
            }
            transaction.set(refs[index], {
              collection: item.collection, id: item.id, json: item.json, deleted: item.deleted, rev: item.rev, syncedAt: serverTimestamp(),
            });
          });
          return { conflicts };
        });
      } catch (error) {
        throw translate(error);
      }
    },
    async deleteAll(uid) {
      try {
        const items = collection(db, 'users', uid, 'items');
        for (;;) {
          const page = await getDocs(query(items, limit(PAGE)));
          if (page.empty) return;
          const batch = writeBatch(db);
          page.docs.forEach((snapshot) => batch.delete(snapshot.ref));
          await batch.commit();
        }
      } catch (error) {
        throw translate(error);
      }
    },
  };
}
