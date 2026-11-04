import { useEffect, useRef, useState } from 'react';
import { useRecorder } from '../components/Recorder';
import {
  BackupError, createBackup, getBackupSummary, getLastBackupAt, openBackup, restoreBackup,
  type BackupResult, type OpenedBackup, type RestoreReport,
} from '../data/backup';
import { formatBytes, formatDate } from '../data/format';
import { useLive } from '../data/useLive';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const wasCancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

function Progress({ label, done, total, onCancel }: { label: string; done: number; total: number; onCancel: () => void }) {
  const percent = total > 0 ? Math.min(99, Math.round((done / total) * 100)) : 0;
  return (
    <div className="backup-progress">
      <div className="save-status" role="status">
        <span>{label} {percent}%</span>
        <button className="text-button" onClick={onCancel}>Cancel</button>
      </div>
      <div className="meter" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function BackupSection() {
  const { phase } = useRecorder();
  const recording = phase !== 'idle';
  const { data } = useLive(async () => {
    const [summary, last] = await Promise.all([getBackupSummary(), getLastBackupAt()]);
    return { summary, last };
  });
  const [busy, setBusy] = useState<'' | 'backup' | 'reading' | 'restore'>('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [result, setResult] = useState<BackupResult | null>(null);
  const [notice, setNotice] = useState('');
  const [opened, setOpened] = useState<OpenedBackup | null>(null);
  const [report, setReport] = useState<RestoreReport | null>(null);
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const lastDraw = useRef(0);

  useEffect(() => {
    if (opened && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [opened]);

  useEffect(() => {
    if (busy !== 'backup' && busy !== 'restore') return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const clear = () => {
    setError('');
    setResult(null);
    setNotice('');
    setReport(null);
  };
  const draw = (done: number, total: number) => {
    const now = performance.now();
    if (now - lastDraw.current < 100) return;
    lastDraw.current = now;
    setProgress({ done, total });
  };

  const backUp = async () => {
    clear();
    setBusy('backup');
    setProgress({ done: 0, total: 0 });
    controller.current = new AbortController();
    try {
      setResult(await createBackup(controller.current.signal, draw));
    } catch (failure) {
      // Browsers report a cancelled stream in different ways, so also check whether Cancel was pressed.
      if (wasCancelled(failure) || controller.current?.signal.aborted) setNotice('The backup was cancelled, and no backup was saved.');
      else if (failure instanceof DOMException && failure.name === 'QuotaExceededError') setError('The backup needs more free space on this device. Free up some space and try again, or choose another drive.');
      else setError(`The backup failed, so don't rely on it. ${(failure as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    clear();
    setBusy('reading');
    try {
      setOpened(await openBackup(file));
    } catch (failure) {
      setError(failure instanceof BackupError ? failure.message : `This file couldn't be read. ${(failure as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const restore = async () => {
    const backup = opened;
    if (!backup) return;
    dialog.current?.close();
    setOpened(null);
    clear();
    setBusy('restore');
    setProgress({ done: 0, total: 0 });
    controller.current = new AbortController();
    try {
      setReport(await restoreBackup(backup, controller.current.signal, draw));
    } catch (failure) {
      if (wasCancelled(failure) || controller.current?.signal.aborted) setNotice('The restore was cancelled. Anything already restored stays, and you can restore again to finish.');
      else setError(`The restore stopped. Anything already restored stays, and you can try again. ${(failure as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const noSpace = opened && opened.freeBytes !== null && opened.neededBytes > opened.freeBytes;
  const summary = data?.summary;

  return (
    <section aria-labelledby="backup-heading" data-tour="backup">
      <h2 id="backup-heading">Backup</h2>
      <p>Save everything to one .zip file, then keep it somewhere safe, like Google Drive or a USB drive. You can also open it on any computer to get your files and notes.</p>
      {summary && <p className="muted" data-testid="backup-summary">
        {plural(summary.courses, 'course')}, {plural(summary.files, 'file')} ({formatBytes(summary.bytes)}), {plural(summary.notes, 'note')}, and {plural(summary.lessons, 'lesson')}. {data?.last ? `Last backup: ${formatDate(data.last)}.` : 'You haven\'t made a backup yet.'}
      </p>}
      {summary && summary.interrupted > 0 && (
        <p className="notice">{plural(summary.interrupted, 'interrupted recording')} won't be in the backup. Save or discard {summary.interrupted === 1 ? 'it' : 'them'} on the Record screen first.</p>
      )}
      {recording && <p className="notice">A recording is running, and it won't be in a backup until it's saved.</p>}

      <div className="row-actions">
        <button className="button primary" disabled={busy !== ''} onClick={() => void backUp()}>Create backup</button>
        <button className="button" disabled={busy !== ''} onClick={() => fileInput.current?.click()}>Restore from backup</button>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          data-testid="restore-input"
          onChange={(event) => {
            void choose(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>

      {busy === 'backup' && <Progress label="Creating backup" done={progress.done} total={progress.total} onCancel={() => controller.current?.abort()} />}
      {busy === 'restore' && <Progress label="Restoring" done={progress.done} total={progress.total} onCancel={() => controller.current?.abort()} />}
      {busy === 'reading' && <p className="muted" role="status">Reading backup…</p>}

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {result && (
        <div className="notice" role="status" data-testid="backup-result">
          <p>Backup created with {plural(result.files, 'file')} and {plural(result.notes, 'note')}. Check your downloads or the place you chose, then move it somewhere safe.</p>
          {result.missing.length > 0 && <p className="error">{plural(result.missing.length, 'file')} couldn't be included because this browser no longer has {result.missing.length === 1 ? 'it' : 'them'}: {result.missing.join(', ')}.</p>}
        </div>
      )}
      {report && (
        <div className="notice" role="status" data-testid="restore-report">
          <p>Restore finished. Added {plural(report.coursesAdded, 'course')}, {plural(report.topicsAdded, 'topic')}, {plural(report.filesAdded, 'file')}, {plural(report.notesAdded, 'note')}, and {plural(report.lessonsAdded, 'lesson')}.</p>
          {(report.filesAlreadyHere > 0 || report.notesAlreadyHere > 0) && <p>Already here, so left alone: {plural(report.filesAlreadyHere, 'file')} and {plural(report.notesAlreadyHere, 'note')}.</p>}
          {report.notesCopied > 0 && <p>{plural(report.notesCopied, 'note')} differed from this device's version, so the backup's version was added as a copy marked “from backup”.</p>}
          {report.damaged.length > 0 && <p className="error">{plural(report.damaged.length, 'file')} in the backup {report.damaged.length === 1 ? 'is' : 'are'} damaged and weren't restored: {report.damaged.join(', ')}.</p>}
          {report.stoppedEarly && <p className="error">{report.stoppedEarly}</p>}
        </div>
      )}

      {opened && (
        <dialog ref={dialog} className="dialog" aria-labelledby="restore-title" onCancel={() => setOpened(null)}>
          <h2 id="restore-title">Restore this backup?</h2>
          <p>Made on {formatDate(opened.manifest.createdAt)}, with {plural(opened.manifest.courses.length, 'course')}, {plural(opened.manifest.materials.length, 'file')}, {plural(opened.manifest.notes.length, 'note')}, and {plural(opened.manifest.lessons.length, 'lesson')}.</p>
          <p>This only adds what's missing. Nothing on this device is replaced or deleted.</p>
          <p className="muted">{plural(opened.newFiles, 'new file')}, needing {formatBytes(opened.neededBytes)}{opened.freeBytes !== null ? ` of about ${formatBytes(opened.freeBytes)} available` : ''}.</p>
          {noSpace && <p className="error" role="alert">This device doesn't have enough space for all of it. Files are restored until space runs out, and you can restore again after freeing some.</p>}
          <div className="dialog-actions">
            <button className="button" autoFocus onClick={() => { dialog.current?.close(); setOpened(null); }}>Cancel</button>
            <button className="button primary" onClick={() => void restore()}>Restore</button>
          </div>
        </dialog>
      )}
    </section>
  );
}
