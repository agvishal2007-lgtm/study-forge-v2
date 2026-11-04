import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AccountBackend } from '../data/accountBackend';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getActiveAccount, switchAccount } from '../data/account';
import { getGuestSummary, openGuestAsBackup, removeAccountFromDevice, removeGuestData, type GuestSummary } from '../data/accountData';
import { restoreBackup, type RestoreReport } from '../data/backup';
import { formatDate } from '../data/format';
import { deleteOnlineCopy, getSyncState, loadBackend, signOutOfAccount, subscribeSync, syncNow, type SyncPhase } from '../data/sync';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

const PHASE_TEXT: Record<SyncPhase, string> = {
  off: 'Connecting…',
  syncing: 'Saving online…',
  synced: 'Saved online',
  offline: "You're offline. Your work is safe on this device and will save online when you reconnect.",
  quota: "Study Forge reached its free daily limit for saving online. Your work is safe on this device and will save online after the limit resets, usually overnight.",
  denied: "Saving online was refused, so your work is only on this device for now. Sign out and back in, and if that doesn't help, tell whoever runs this site.",
  error: "Saving online didn't work this time. Your work is safe on this device, and it will try again.",
};

function describeSignInFailure(error: unknown): string {
  const code = String((error as { code?: string }).code ?? '');
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return '';
  if (code.includes('popup-blocked')) return 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.';
  if (code.includes('network')) return "Study Forge can't reach the internet, so you can't sign in right now.";
  if (code.includes('unauthorized-domain')) return "This site isn't set up to allow sign-in yet. Tell whoever runs it.";
  if (code.includes('web-storage') || code.includes('storage')) return 'Your browser is blocking the site data that sign-in needs. Allow site data, or leave private browsing, then try again.';
  if (code.includes('admin') || code.includes('access-denied')) return 'Your school blocked this sign-in. You can still use Study Forge without an account, or ask your school\'s IT help desk to allow it.';
  return `Sign-in didn't work. ${(error as Error).message}`;
}

export function AccountSection() {
  const account = getActiveAccount();
  const sync = useSyncExternalStore(subscribeSync, getSyncState);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [guest, setGuest] = useState<GuestSummary | null>(null);
  const [report, setReport] = useState<RestoreReport | null>(null);
  const [confirm, setConfirm] = useState<'' | 'sign-out' | 'remove-device' | 'delete-online' | 'remove-guest'>('');
  const [notice, setNotice] = useState('');
  // Phones block a sign-in window that opens late, so its code must be ready before the tap.
  const [backend, setBackend] = useState<AccountBackend | null>(null);

  useEffect(() => {
    if (account) return;
    let active = true;
    loadBackend().then(
      (loaded) => { if (active) setBackend(loaded); },
      () => { if (active) setFailure("Sign-in couldn't load. Check your internet connection, then reload this page."); },
    );
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (account) void getGuestSummary().then(setGuest).catch(() => setGuest(null));
  }, [account?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async () => {
    if (!backend) return;
    setBusy(true);
    setFailure('');
    try {
      // Nothing is awaited before this call, so the window opens as part of the tap itself.
      const user = await backend.signIn();
      switchAccount({ uid: user.uid, email: user.email });
    } catch (error) {
      setFailure(describeSignInFailure(error));
      setBusy(false);
    }
  };

  const signOut = async (removeHere: boolean) => {
    setConfirm('');
    setBusy(true);
    setFailure('');
    try {
      await syncNow();
      if (removeHere && getSyncState().phase !== 'synced') {
        setFailure("Your work couldn't be saved online just now, so nothing was removed from this device. Connect to the internet and try again.");
        setBusy(false);
        return;
      }
      if (removeHere) await removeAccountFromDevice();
      await signOutOfAccount();
      switchAccount(null);
    } catch (error) {
      setFailure(`Signing out didn't finish. ${(error as Error).message}`);
      setBusy(false);
    }
  };

  const copyGuest = async () => {
    setBusy(true);
    setFailure('');
    try {
      const opened = await openGuestAsBackup();
      if (opened) {
        setReport(await restoreBackup(opened, new AbortController().signal, () => undefined));
        void syncNow();
      }
    } catch (error) {
      setFailure(`Copying didn't finish. Anything already copied stays, and you can try again. ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!account) {
    return (
      <section aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        <p>Sign in to keep your courses, notes, lessons, and study progress across your devices. It's optional, and everything else works without it.</p>
        <ul className="plain-list">
          <li>Files and recordings stay on each device, so keep making backups of those.</li>
          <li>School Google accounts work if your school allows it. If yours blocks it, you'll see a message and can keep using Study Forge without signing in.</li>
          <li>Other students can't read your work. It's stored in Google's Firebase service, and whoever runs this site could technically view it, so don't save anything highly sensitive.</li>
        </ul>
        <button className="button primary" disabled={busy || !backend} onClick={() => void signIn()}>{busy ? 'Waiting for Google…' : backend ? 'Sign in with Google' : 'Getting sign-in ready…'}</button>
        {failure && <p className="error" role="alert">{failure}</p>}
      </section>
    );
  }

  const trouble = sync.phase === 'offline' || sync.phase === 'quota' || sync.phase === 'denied' || sync.phase === 'error';
  return (
    <section aria-labelledby="account-heading">
      <h2 id="account-heading">Account</h2>
      <p className="account-row">Signed in as <span className="account-email" data-testid="account-email">{account.email}</span></p>
      <p className={trouble ? 'notice' : 'muted'} role="status" data-testid="sync-status" data-phase={sync.phase}>
        {PHASE_TEXT[sync.phase]}{sync.phase === 'synced' && sync.lastSyncedAt ? ` on ${formatDate(sync.lastSyncedAt)}.` : ''}
      </p>
      {sync.tooLarge.length > 0 && <p className="error" role="alert">Too large to save online, so only on this device: {sync.tooLarge.join(', ')}.</p>}
      <p className="muted">Courses, notes, lessons, and progress follow you. Files and recordings stay on this device, so keep making backups of those.</p>
      <div className="row-actions">
        <button className="button" disabled={busy} onClick={() => void syncNow()}>Save online now</button>
        <button className="button" disabled={busy} onClick={() => setConfirm('sign-out')}>Sign out</button>
        <button className="text-button danger-text" disabled={busy} onClick={() => setConfirm('delete-online')}>Delete my online copy</button>
      </div>
      {failure && <p className="error" role="alert">{failure}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      {guest && !report && (
        <div className="notice" data-testid="guest-offer">
          <p>This device also has work from before you signed in: {plural(guest.courses, 'course')}, {plural(guest.files, 'file')}, {plural(guest.notes, 'note')}, and {plural(guest.lessons, 'lesson')}. It isn't in your account yet.</p>
          <p className="muted">Only add it if it's yours. On a shared computer, it could be someone else's.</p>
          <div className="row-actions">
            <button className="button" disabled={busy} onClick={() => void copyGuest()}>Add it to my account</button>
            <button className="text-button danger-text" disabled={busy} onClick={() => setConfirm('remove-guest')}>Delete it from this device</button>
          </div>
        </div>
      )}
      {report && (
        <div className="notice" role="status" data-testid="guest-report">
          <p>Added {plural(report.coursesAdded, 'course')}, {plural(report.filesAdded, 'file')}, {plural(report.notesAdded, 'note')}, and {plural(report.lessonsAdded, 'lesson')} to your account.</p>
          {report.damaged.length > 0 && <p className="error">{plural(report.damaged.length, 'file')} couldn't be copied: {report.damaged.join(', ')}. The originals weren't changed.</p>}
          {report.stoppedEarly && <p className="error">{report.stoppedEarly}</p>}
          <p>The original copy is still in this browser's no-account space.</p>
          <button className="text-button danger-text" onClick={() => setConfirm('remove-guest')}>Delete the original copy</button>
        </div>
      )}

      {confirm === 'sign-out' && (
        <div>
          <ConfirmDialog
            title="Sign out?"
            confirmLabel="Sign out and remove from this device"
            onCancel={() => setConfirm('')}
            onConfirm={() => setConfirm('remove-device')}
          >
            <p>Your work stays on this device under your account, and it comes back when you sign in again.</p>
            <p>On a shared computer, remove it instead. That permanently deletes your files and recordings from this device, because they aren't saved online.</p>
            <div className="dialog-extra"><button className="button primary" onClick={() => void signOut(false)}>Sign out and keep it here</button></div>
          </ConfirmDialog>
        </div>
      )}
      {confirm === 'remove-device' && (
        <ConfirmDialog title="Remove your work from this device?" confirmLabel="Remove and sign out" onCancel={() => setConfirm('')} onConfirm={() => void signOut(true)}>
          <p>Your courses, notes, lessons, and progress stay in your account. Your <strong>files and recordings will be permanently deleted from this device</strong> unless you've made a backup. It can't be undone.</p>
        </ConfirmDialog>
      )}
      {confirm === 'delete-online' && (
        <ConfirmDialog
          title="Delete your online copy?"
          confirmLabel="Delete online copy"
          onCancel={() => setConfirm('')}
          onConfirm={async () => {
            setConfirm('');
            setBusy(true);
            setFailure('');
            try {
              await deleteOnlineCopy();
              await signOutOfAccount();
              switchAccount(null);
            } catch (error) {
              setFailure(`Your online copy wasn't fully deleted. Try again. ${(error as Error).message}`);
              setBusy(false);
            }
          }}
        >
          <p>This permanently deletes your courses, notes, lessons, and progress from online storage, then signs you out. Other devices won't get them anymore. What's on this device stays. It can't be undone.</p>
        </ConfirmDialog>
      )}
      {confirm === 'remove-guest' && (
        <ConfirmDialog
          title="Delete the no-account work from this device?"
          confirmLabel="Delete it"
          onCancel={() => setConfirm('')}
          onConfirm={async () => {
            setConfirm('');
            try {
              await removeGuestData();
              setGuest(null);
              setReport(null);
              setNotice('The no-account work was deleted from this device.');
            } catch (error) {
              setFailure(`It wasn't deleted. ${(error as Error).message}`);
            }
          }}
        >
          <p>This permanently deletes what was saved in this browser without an account, including its files and recordings. Your account isn't affected. It can't be undone.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
