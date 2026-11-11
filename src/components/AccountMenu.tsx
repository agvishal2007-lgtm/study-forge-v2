import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { WalkthroughButton } from '../features/walkthrough/Walkthrough';
import { getActiveAccount, switchAccount } from '../data/account';
import { setThemeChoice, useIsDark } from '../data/theme';
import { getSyncState, loadBackend, signOutOfAccount, subscribeSync, syncNow } from '../data/sync';

/** One tap between light and dark. On small phones this lives in Settings, because the bar is full. */
function ThemeButton() {
  const dark = useIsDark();
  return (
    <button className="icon-button theme-button" onClick={() => setThemeChoice(dark ? 'light' : 'dark')} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dark
          ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
          : <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />}
      </svg>
    </button>
  );
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
  // Getting this ready early means the sign-in window can open as soon as it's tapped.
  useEffect(() => { void loadBackend().catch(() => undefined); }, []);
  return (
    <>
      <Link className="icon-button" to="/settings" aria-label="Settings" title="Settings"><GearIcon /></Link>
      <Link className="button primary" to="/auth">Log In / Sign Up</Link>
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
      <Link className="icon-button" to="/search" aria-label="Search" title="Search">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
      </Link>
      <ThemeButton />
      <WalkthroughButton />
      {getActiveAccount() ? <SignedIn /> : <SignedOut />}
    </nav>
  );
}
