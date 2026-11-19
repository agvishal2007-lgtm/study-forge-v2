import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { SmartAdd } from './SmartAdd';
import { SOUNDS, anyPlaying, isPlaying, playSound, stopAll, stopSound, subscribeFocus } from '../data/focusSounds';
import { setTodoPanelOpen, subscribeTodoPanel, todoPanelOpen } from './TodoPanel';
import { SyncBadge } from './SyncBadge';
import { WalkthroughButton } from '../features/walkthrough/Walkthrough';
import { getActiveAccount, switchAccount } from '../data/account';
import { toggleLook, useIsDark } from '../data/theme';
import { getSyncState, loadBackend, signOutOfAccount, subscribeSync, syncNow } from '../data/sync';
import { isDeviceOnly } from '../data/schoolLevel';

/** One tap between light and dark, and nothing else. Automatic options live only in Settings. */
function ThemeButton() {
  const dark = useIsDark();
  return (
    <button className="icon-button theme-button" data-testid="theme-toggle" data-shows={dark ? 'sun' : 'moon'} onClick={toggleLook} aria-label={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'} title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dark
          ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
          : <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />}
      </svg>
    </button>
  );
}

/**
 * Sound, one tap away, beside light and dark. Starting it brings back the last mix the student
 * had; the first time, brown noise, which is the gentlest. Choosing and mixing stays in Settings,
 * because this button is for the moment you sit down to study, not for fiddling.
 */
/**
 * Sound from the top bar, with the choice of which sound right there.
 *
 * Tapping opens a short list rather than starting something unasked: five sounds is a choice, and
 * making one of them the one you always get is how a student ends up with the wrong noise or, as
 * happened, no audible noise at all. Each row starts and stops that sound on its own, so they can
 * be layered. Mixing, per-sound volume and the fading timer stay in Settings, where there is room.
 */
function SoundButton() {
  const [open, setOpen] = useState(false);
  const [, redraw] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => subscribeFocus(() => redraw((count) => count + 1)), []);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const on = anyPlaying();

  return (
    <div
      className="sound-menu-wrap"
      ref={wrap}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); button.current?.focus(); }
      }}
    >
      <button
        ref={button}
        className="icon-button sound-button"
        data-testid="sound-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={on}
        onClick={() => setOpen((now) => !now)}
        aria-label={on ? 'Focus sounds, playing' : 'Focus sounds'}
        title={on ? 'Focus sounds, playing' : 'Focus sounds'}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {on
            ? <><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" /></>
            : <><path d="M4 11v2M8 9v6M12 11v2M16 9v6M20 11v2" /></>}
        </svg>
      </button>
      {open && (
        <div className="sound-menu" role="menu" aria-label="Focus sounds" data-testid="sound-menu">
          {SOUNDS.map((sound) => {
            const playing = isPlaying(sound.id);
            return (
              <button
                key={sound.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={playing}
                data-testid={`sound-pick-${sound.id}`}
                // Started straight from the press, because a phone only allows sound then.
                onClick={() => (playing ? stopSound(sound.id) : playSound(sound.id, 0.5))}
              >
                <b>{sound.name}</b>
                <span className="muted small">{playing ? 'Playing — tap to stop' : sound.what}</span>
              </button>
            );
          })}
          {on && (
            <button type="button" role="menuitem" className="sound-menu-stop" data-testid="sound-stop-all" onClick={() => stopAll()}>
              Stop all sounds
            </button>
          )}
          <Link className="sound-menu-more" role="menuitem" to="/settings/sounds" onClick={() => setOpen(false)}>
            Mixing, volume and a fading timer
          </Link>
        </div>
      )}
    </div>
  );
}

/** The to-do list, one tap away and staying where it is put, so it can be seen while working. */
function TodoButton() {
  const [open, setOpen] = useState(todoPanelOpen());
  useEffect(() => subscribeTodoPanel(() => setOpen(todoPanelOpen())), []);
  return (
    <button
      className="icon-button todo-button"
      data-testid="todo-toggle"
      aria-pressed={open}
      onClick={() => setTodoPanelOpen(!open)}
      aria-label={open ? 'Close your to-do list' : 'Open your to-do list'}
      title={open ? 'Close your to-do list' : 'Open your to-do list'}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m3 6.5 1.8 1.8L8 5" /><path d="m3 13.5 1.8 1.8L8 12" /><path d="M11 7h10M11 14h10M11 20h7" />
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
  useEffect(() => { if (!isDeviceOnly()) void loadBackend().catch(() => undefined); }, []);
  return (
    <>
      <Link className="icon-button" to="/settings" aria-label="Settings" title="Settings"><GearIcon /></Link>
      {!isDeviceOnly() && <Link className="button primary" to="/auth" data-tour="account">Log In / Sign Up</Link>}
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
  const syncLine = sync.phase === 'synced' ? 'Synced across devices' : sync.phase === 'syncing' ? 'Syncing…' : sync.phase === 'off' ? ''
    : sync.phase === 'offline' ? 'Offline, waiting to sync' : sync.phase === 'error' ? 'Sync failed, retrying' : 'Not syncing right now';
  return (
    <div className="account-menu" ref={menu} data-tour="account">
      <SyncBadge />
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
          <button
            className="dropdown-item phone-only"
            data-testid="dropdown-todo"
            onClick={() => { setTodoPanelOpen(!todoPanelOpen()); setOpen(false); }}
          >
            {todoPanelOpen() ? 'Hide my to-do list' : 'My to-do list'}
          </button>
          <Link className="dropdown-item" to="/settings" onClick={() => setOpen(false)}>Settings</Link>
          <Link className="dropdown-item" to="/trash" onClick={() => setOpen(false)}>Trash</Link>
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
      <SmartAdd />
      <Link className="icon-button" to="/search" aria-label="Search" title="Search">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
      </Link>
      {/*
        * Eight controls plus the account button do not fit a phone: at 393px the + button sat at
        * x = -19 and at 320px both + and Search were off the screen entirely — the "I can't even
        * press it" problem, measured. Sound and light/dark stay here because they are what this bar
        * is for. The to-do list and the help menu move into the account menu on a phone, and the
        * to-do list is also in the + menu, so nothing becomes unreachable.
        */}
      <span className="topbar-roomy">
        <TodoButton />
      </span>
      <SoundButton />
      <ThemeButton />
      <span className="topbar-roomy">
        <WalkthroughButton />
      </span>
      {getActiveAccount() ? <SignedIn /> : <SignedOut />}
    </nav>
  );
}
