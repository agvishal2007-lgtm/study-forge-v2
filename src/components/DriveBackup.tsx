import { useEffect, useState, useSyncExternalStore } from 'react';
import { backUpFiles, getDriveState, isDriveBackupOn, prepareDrive, reconnectDrive, subscribeDrive, turnOffDriveBackup, turnOnDriveBackup, DriveError } from '../data/driveFiles';
import { formatBytes } from '../data/format';

const PHASE_TEXT: Record<string, string> = {
  idle: 'Up to date.',
  uploading: 'Uploading…',
  'waiting-recording': 'Paused while you record. It continues once the recording is saved.',
  offline: "Offline. Files go up when you're back online.",
  error: 'Something went wrong. It will try again on its own.',
  'needs-permission': 'Google Drive needs your permission again before more files can go up.',
};

/** Settings: sending files and recordings to the student's own Google Drive, so other devices can open them. */
export function DriveBackup({ email }: { email: string }) {
  const drive = useSyncExternalStore(subscribeDrive, getDriveState);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    void isDriveBackupOn().then((value) => {
      setOn(value);
      if (value) void backUpFiles();
    });
    void prepareDrive().catch(() => undefined);
  }, []);

  const act = async (work: () => Promise<void>, nowOn: boolean) => {
    setBusy(true);
    setFailure('');
    try {
      await work();
      setOn(nowOn);
    } catch (error) {
      if ((error as DriveError).kind !== 'cancelled') setFailure((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (on === null) return null;
  return (
    <section aria-labelledby="drive-heading" data-testid="drive-backup">
      <h3 id="drive-heading">Files and recordings on your other devices</h3>
      {!on ? (
        <>
          <p>Files and recordings can sync through your own Google Drive, into a folder called Study Forge. Study Forge can only see the files it puts there, never the rest of your Drive. It uses your Drive space, not ours.</p>
          <button className="button" disabled={busy} onClick={() => void act(() => turnOnDriveBackup(email), true)}>Sync files with my Google Drive</button>
        </>
      ) : (
        <>
          <p role="status" data-testid="drive-status" data-phase={drive.phase}>
            {drive.total > 0 ? `${drive.inDrive} of ${drive.total} ${drive.total === 1 ? 'file is' : 'files are'} in your Google Drive. ` : 'No files to sync yet. '}
            {PHASE_TEXT[drive.phase] ?? ''}
          </p>
          {drive.current && (
            <div data-testid="drive-progress">
              <p className="muted">Uploading {drive.current.name}: {formatBytes(drive.current.sent)} of {formatBytes(drive.current.size)}</p>
              <progress max={drive.current.size || 1} value={drive.current.sent} aria-label={`Uploading ${drive.current.name}`} />
            </div>
          )}
          {drive.message && drive.phase !== 'idle' && <p className="muted">{drive.message}</p>}
          <div className="row-actions">
            {drive.phase === 'needs-permission' && <button className="button" disabled={busy} onClick={() => void act(() => reconnectDrive(email), true)}>Give Google Drive permission</button>}
            <button className="text-button" disabled={busy} onClick={() => void act(turnOffDriveBackup, false)}>Stop syncing files from this device</button>
          </div>
          <p className="muted">A file counts as synced only after Google Drive confirms it arrived intact. Stopping keeps the copies already in your Drive.</p>
        </>
      )}
      {failure && <p className="error" role="alert">{failure}</p>}
    </section>
  );
}
