import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getSyncState, subscribeSync, syncNow, type SyncState } from '../data/sync';
import { getDriveState, subscribeDrive, type DriveState } from '../data/driveFiles';

export type BadgeTone = 'synced' | 'syncing' | 'pending' | 'failed';

/** What the badge says, from the real state of syncing. Green only when nothing is waiting. */
export function badgeFor(sync: SyncState, drive: DriveState): { tone: BadgeTone; label: string; why: string } | null {
  if (sync.phase === 'off') return null;
  const filesWaiting = drive.phase !== 'off' ? Math.max(0, drive.total - drive.inDrive) : 0;
  if (sync.phase === 'error' || sync.phase === 'quota' || sync.phase === 'denied') {
    return { tone: 'failed', label: 'Sync failed', why: sync.message || 'Something went wrong. Your work is safe on this device.' };
  }
  if (drive.phase === 'error') return { tone: 'failed', label: 'Sync failed', why: drive.message || 'A file could not be uploaded to Google Drive. It will try again.' };
  if (sync.phase === 'syncing' || drive.phase === 'uploading') return { tone: 'syncing', label: 'Syncing', why: drive.phase === 'uploading' && drive.current ? `Uploading ${drive.current.name} to your Google Drive.` : 'Sending and fetching your latest changes.' };
  if (sync.phase === 'offline' || drive.phase === 'offline') return { tone: 'pending', label: 'Offline', why: "You're offline. Changes are saved on this device and will sync when you reconnect." };
  if (sync.pending) return { tone: 'pending', label: 'Pending', why: 'Recent changes are saved on this device and will sync in a moment.' };
  if (filesWaiting > 0) {
    const why = drive.phase === 'needs-permission' ? 'Google Drive needs your permission again before files can upload. You can give it in Settings.'
      : drive.phase === 'waiting-recording' ? 'File uploads are paused while you record.' : 'Files are waiting to upload to your Google Drive.';
    return { tone: 'pending', label: 'Pending', why };
  }
  return { tone: 'synced', label: 'Synced', why: 'Everything is synced across your devices.' };
}

const ICONS: Record<BadgeTone, string> = {
  synced: 'M5 12.5l4.5 4.5L19 7.5',
  syncing: 'M20 12a8 8 0 0 1-14.5 4.6M4 12a8 8 0 0 1 14.5-4.6M18.5 3.5v4h-4M5.5 20.5v-4h4',
  pending: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  failed: 'M12 8v5M12 16.5v.5M12 3l9.5 17h-19L12 3Z',
};

/** Always-visible sync status. Tapping it only shows details; it never goes anywhere or changes anything. */
export function SyncBadge() {
  const sync = useSyncExternalStore(subscribeSync, getSyncState);
  const drive = useSyncExternalStore(subscribeDrive, getDriveState);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); };
  }, [open]);

  const badge = badgeFor(sync, drive);
  if (!badge) return null;
  const filesWaiting = drive.phase !== 'off' ? Math.max(0, drive.total - drive.inDrive) : 0;
  const last = sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }) : null;
  return (
    <div className="sync-badge-wrap" ref={box}>
      <button type="button" className="sync-badge" data-testid="sync-badge" data-tone={badge.tone} aria-expanded={open} aria-label={`Sync status: ${badge.label}. Show details`} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[badge.tone]} /></svg>
        <span className="sync-badge-text">{badge.label}</span>
      </button>
      {open && (
        <div className="sync-popover" role="status" data-testid="sync-popover">
          <p><b>{badge.label}</b></p>
          <p>{badge.why}</p>
          <p className="muted small">{last ? `Last synced ${last}.` : 'Not synced yet on this device.'}</p>
          <p className="muted small" data-testid="sync-pending">
            {sync.pending || sync.phase === 'offline' || badge.tone === 'failed' ? 'Some changes are waiting to sync. ' : 'No changes are waiting. '}
            {drive.phase === 'off' ? '' : filesWaiting > 0 ? `${filesWaiting} ${filesWaiting === 1 ? 'file or recording is' : 'files or recordings are'} waiting to upload.` : 'No file or recording uploads are waiting.'}
          </p>
          {(badge.tone === 'failed' || sync.phase === 'offline') && <button type="button" className="button" onClick={() => void syncNow()}>Retry sync</button>}
        </div>
      )}
    </div>
  );
}
