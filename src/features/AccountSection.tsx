import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
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

export function AccountSection() {
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [confirmationFailed, setConfirmationFailed] = useState(false);
  useEffect(() => {
    if (!getActiveAccount()) return undefined;
    let active = true;
    void loadBackend().then((backend) => backend.needsEmailConfirmation()).then((needed) => { if (active) setNeedsConfirmation(needed); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const account = getActiveAccount();
  const sync = useSyncExternalStore(subscribeSync, getSyncState);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [guest, setGuest] = useState<GuestSummary | null>(null);
  const [report, setReport] = useState<RestoreReport | null>(null);
  const [confirm, setConfirm] = useState<'' | 'remove-device' | 'delete-online' | 'remove-guest'>('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (account) void getGuestSummary().then(setGuest).catch(() => setGuest(null));
  }, [account?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <p className="muted">Use Sign in or Sign up at the top right. <Link to="/privacy">Privacy</Link></p>
      </section>
    );
  }

  const trouble = sync.phase === 'offline' || sync.phase === 'quota' || sync.phase === 'denied' || sync.phase === 'error';
  return (
    <section aria-labelledby="account-heading">
      <h2 id="account-heading">Account</h2>
      <p className={trouble ? 'notice' : 'muted'} role="status" data-testid="sync-status" data-phase={sync.phase}>
        {PHASE_TEXT[sync.phase]}{sync.phase === 'synced' && sync.lastSyncedAt ? ` on ${formatDate(sync.lastSyncedAt)}.` : ''}
      </p>
      {needsConfirmation && (
        <p className="notice" data-testid="confirm-email">
          Please confirm your email, so you can reset your password if you ever forget it. Look for our email, including in spam.{' '}
          <button className="text-button" disabled={confirmationSent} onClick={() => {
            setConfirmationFailed(false);
            void loadBackend().then((backend) => backend.sendEmailConfirmation()).then(() => setConfirmationSent(true), () => setConfirmationFailed(true));
          }}>{confirmationSent ? 'Sent again' : 'Send it again'}</button>
          {confirmationFailed && <span> That didn't send. Wait a few minutes and try again.</span>}
        </p>
      )}
      {sync.tooLarge.length > 0 && <p className="error" role="alert">Too large to save online, so only on this device: {sync.tooLarge.join(', ')}.</p>}
      <p className="muted">Courses, notes, lessons, and progress follow you. Files and recordings stay on this device, so keep making backups of those.</p>
      <div className="row-actions">
        <button className="button" disabled={busy} onClick={() => void syncNow()}>Save online now</button>
        <button className="text-button danger-text" disabled={busy} onClick={() => setConfirm('remove-device')}>Remove my work from this device</button>
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

      {confirm === 'remove-device' && (
        <ConfirmDialog
          title="Remove your work from this device?"
          confirmLabel="Remove and sign out"
          onCancel={() => setConfirm('')}
          onConfirm={async () => {
            setConfirm('');
            setBusy(true);
            setFailure('');
            try {
              await syncNow();
              if (getSyncState().phase !== 'synced') {
                setFailure("Your work couldn't be saved online just now, so nothing was removed from this device. Connect to the internet and try again.");
                setBusy(false);
                return;
              }
              await removeAccountFromDevice();
              await signOutOfAccount();
              switchAccount(null);
            } catch (error) {
              setFailure(`This didn't finish. ${(error as Error).message}`);
              setBusy(false);
            }
          }}
        >
          <p>For shared computers. This signs you out and clears your account from this device.</p>
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
