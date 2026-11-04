export interface AccountUser {
  uid: string;
  email: string;
  photoURL?: string;
}

export type LoginProvider = 'google' | 'microsoft';

export type SyncCollection = 'courses' | 'topics' | 'notes' | 'lessons' | 'checkpoints' | 'checkpointProgress' | 'plannerItems' | 'decks' | 'cards' | 'cardProgress' | 'practiceSets' | 'practiceQuestions' | 'practiceAttempts' | 'examResults';

export interface RemoteItem {
  collection: SyncCollection;
  id: string;
  json: string;
  deleted: boolean;
  rev: number;
}

export interface PushItem extends RemoteItem {
  /** The version this device last saw. If the server has moved on, the write is refused. */
  baseRev: number;
}

export interface PullResult {
  items: RemoteItem[];
  cursor: number;
}

export type BackendErrorKind = 'offline' | 'quota' | 'denied' | 'other';

export class BackendError extends Error {
  kind: BackendErrorKind;

  constructor(kind: BackendErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** Everything the app needs from the online service, so the sync rules don't depend on one vendor. */
export interface AccountBackend {
  watchUser(listener: (user: AccountUser | null) => void): void;
  /** The sign-in buttons this site has been set up for. */
  providers: LoginProvider[];
  signIn(provider?: LoginProvider): Promise<AccountUser>;
  signUpWithEmail(email: string, password: string): Promise<AccountUser>;
  signInWithEmail(email: string, password: string): Promise<AccountUser>;
  sendPasswordReset(email: string): Promise<void>;
  /** True when this account uses a password and its email hasn't been confirmed yet. */
  needsEmailConfirmation(): Promise<boolean>;
  sendEmailConfirmation(): Promise<void>;
  signOut(): Promise<void>;
  pull(uid: string, since: number): Promise<PullResult>;
  /** Writes what it can and returns the items refused because another device got there first. */
  push(uid: string, items: PushItem[]): Promise<{ conflicts: string[] }>;
  deleteAll(uid: string): Promise<void>;
}

export const itemKey = (collection: string, id: string) => `${collection}/${id}`;
