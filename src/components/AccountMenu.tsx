import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { WalkthroughButton } from '../features/walkthrough/Walkthrough';
import { getActiveAccount, switchAccount } from '../data/account';
import type { AccountBackend } from '../data/accountBackend';
import { getSyncState, loadBackend, signOutOfAccount, subscribeSync, syncNow } from '../data/sync';

function describeSignInFailure(error: unknown): string {
  const code = String((error as { code?: string }).code ?? '');
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return '';
  if (code.includes('popup-blocked')) return 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.';
  if (code.includes('network')) return "Study Forge can't reach the internet, so you can't sign in right now.";
  if (code.includes('unauthorized-domain')) return "This site isn't set up to allow sign-in yet. Tell whoever runs it.";
  if (code.includes('web-storage') || code.includes('storage')) return 'Your browser is blocking the site data that sign-in needs. Allow site data, or leave private browsing, then try again.';
  if (code.includes('admin') || code.includes('access-denied')) return "Your school blocked this sign-in. You can still use Study Forge without an account, or ask your school's IT help desk to allow it.";
  return `Sign-in didn't work. ${(error as Error).message}`;
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.91 1.2V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-2.91-1.2l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0-1.2-2.91H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.2-2.91l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.52.99Z" />
    </svg>
  );
}

function Avatar({ photoURL, email }: { photoURL?: string; email: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoURL]);
  if (photoURL && !failed) {
    // Google's picture links can refuse requests that say which site they came from.
    return <img className="avatar" src={photoURL} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  }
  return <span className="avatar avatar-letter" aria-hidden="true">{(email[0] ?? '?').toUpperCase()}</span>;
}

function SignedOut() {
  // Phones block a sign-in window that opens late, so its code must be ready before the tap.
  const [backend, setBackend] = useState<AccountBackend | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    let active = true;
    loadBackend().then(
      (loaded) => { if (active) setBackend(loaded); },
      () => { if (active) setLoadFailed(true); },
    );
    return () => { active = false; };
  }, []);

  const signIn = async () => {
    if (!backend) {
      setFailure("Sign-in couldn't load. Check your internet connection, then reload this page.");
      return;
    }
    setBusy(true);
    setFailure('');
    try {
      // Nothing is awaited before this call, so the window opens as part of the tap itself.
      const user = await backend.signIn();
      switchAccount({ uid: user.uid, email: user.email, photoURL: user.photoURL });
    } catch (error) {
      setFailure(describeSignInFailure(error));
      setBusy(false);
    }
  };

  return (
    <>
      <Link className="icon-button" to="/settings" aria-label="Settings" title="Settings"><GearIcon /></Link>
      <button className="button primary" disabled={busy || (!backend && !loadFailed)} onClick={() => void signIn()}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      {failure && <p className="topbar-message error" role="alert">{failure}</p>}
    </>
  );
}

function SignedIn() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [account, setAccount] = useState(getActiveAccount());
  const sync = useSyncExternalStore(subscribeSync, getSyncState);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => setAccount(getActiveAccount());
    window.addEventListener('study-forge-account-updated', refresh);
    return () => window.removeEventListener('study-forge-account-updated', refresh);
  }, []);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menu.current?.querySelector<HTMLButtonElement>('.avatar-button')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const signOut = async () => {
    setOpen(false);
    setBusy(true);
    setFailure('');
    try {
      // Save anything recent if it's quick. A slow connection never holds this up, because the
      // work stays on this device and saves online the next time this student signs in.
      await Promise.race([syncNow(), new Promise((resolve) => setTimeout(resolve, 3000))]);
      await signOutOfAccount();
      switchAccount(null);
    } catch (error) {
      setFailure(`Signing out didn't finish. ${(error as Error).message}`);
      setBusy(false);
    }
  };

  if (!account) return null;
  const syncLine = sync.phase === 'synced' ? 'Saved online' : sync.phase === 'syncing' ? 'Saving online…' : sync.phase === 'off' ? '' : 'Not saved online right now';
  return (
    <div className="account-menu" ref={menu}>
      <button
        className="avatar-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Account menu for ${account.email}`}
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        <Avatar photoURL={account.photoURL} email={account.email} />
      </button>
      {open && (
        <div className="account-dropdown" data-testid="account-dropdown">
          <p className="account-email">{account.email}</p>
          {syncLine && <p className="muted account-sync">{syncLine}</p>}
          <Link className="dropdown-item" to="/settings" onClick={() => setOpen(false)}>Settings</Link>
          <button className="dropdown-item" onClick={() => void signOut()}>Sign out</button>
        </div>
      )}
      {failure && <p className="topbar-message error" role="alert">{failure}</p>}
    </div>
  );
}

/** The top-right corner on every screen. */
export function AccountMenu() {
  return (
    <nav className="topbar" aria-label="Account">
      <WalkthroughButton />
      {getActiveAccount() ? <SignedIn /> : <SignedOut />}
    </nav>
  );
}
