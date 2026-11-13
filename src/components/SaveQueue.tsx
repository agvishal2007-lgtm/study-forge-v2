import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SaveCancelled } from '../data/blobs';
import { formatBytes } from '../data/format';
import { fileMaterial, findByHash, getStorageStatus, hashFile, requestKeepFiles, storeMaterial } from '../data/store';
import type { Material } from '../data/types';

type Phase = 'waiting' | 'checking' | 'saving' | 'saved' | 'duplicate' | 'failed' | 'cancelled';

interface Target {
  courseId: string | null;
  topicId: string | null;
}

interface SaveItem {
  key: string;
  name: string;
  size: number;
  phase: Phase;
  bytes: number;
  target: Target;
  material?: Material;
  message?: string;
}

interface Queue {
  items: SaveItem[];
  addFiles: (files: File[], target: Target) => void;
  cancel: (key: string) => void;
  retry: (key: string) => void;
  dismiss: (key: string) => void;
  moveExisting: (key: string) => Promise<void>;
  clearFinished: () => void;
}

const QueueContext = createContext<Queue | null>(null);

export function useSaveQueue() {
  const queue = useContext(QueueContext);
  if (!queue) throw new Error('useSaveQueue must be used inside SaveProvider');
  return queue;
}

const describeFailure = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'This device is out of space for Study Forge. Free up some space and try again.';
  }
  return `The file wasn't saved. ${error instanceof Error ? error.message : ''}`.trim();
};

/** Redraws progress at most ten times a second, however many pieces a large file has. */
function throttled(report: (bytes: number) => void) {
  let last = 0;
  return (bytes: number) => {
    const now = performance.now();
    if (now - last < 100) return;
    last = now;
    report(bytes);
  };
}

export function SaveProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SaveItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  // The chosen files, kept until each is saved, so a failed or cancelled one can be tried again.
  const chosen = useRef(new Map<string, File>());
  const chain = useRef<Promise<void>>(Promise.resolve());

  const update = useCallback((key: string, patch: Partial<SaveItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const process = useCallback(async (key: string, file: File, target: Target, controller: AbortController) => {
    const { signal } = controller;
    if (signal.aborted) return;
    try {
      update(key, { phase: 'checking', bytes: 0 });
      const hash = await hashFile(file, signal, throttled((bytes) => update(key, { bytes })));
      const existing = await findByHash(hash);
      if (existing) {
        update(key, { phase: 'duplicate', material: existing });
        return;
      }
      const { usage, quota } = await getStorageStatus();
      if (usage !== null && quota !== null && file.size > quota - usage) {
        update(key, {
          phase: 'failed',
          message: `This file needs ${formatBytes(file.size)}, but only ${formatBytes(quota - usage)} is free. Free up space and try again.`,
        });
        return;
      }
      update(key, { phase: 'saving', bytes: 0 });
      const material = await storeMaterial(file, hash, target, signal, throttled((bytes) => update(key, { bytes })));
      update(key, { phase: 'saved', bytes: file.size, material });
      chosen.current.delete(key);
      void requestKeepFiles();
    } catch (error) {
      const cancelled = error instanceof SaveCancelled || (error instanceof DOMException && error.name === 'AbortError');
      update(key, cancelled ? { phase: 'cancelled' } : { phase: 'failed', message: describeFailure(error) });
    } finally {
      controllers.current.delete(key);
    }
  }, [update]);

  const queue = useMemo<Queue>(() => ({
    items,
    addFiles(files, target) {
      for (const file of files) {
        const key = crypto.randomUUID();
        const controller = new AbortController();
        controllers.current.set(key, controller);
        chosen.current.set(key, file);
        setItems((current) => [...current, { key, name: file.name, size: file.size, phase: 'waiting', bytes: 0, target }]);
        chain.current = chain.current.then(() => process(key, file, target, controller));
      }
    },
    cancel(key) {
      controllers.current.get(key)?.abort();
      // A running save reports Cancelled itself, once it has really stopped and cleaned up.
      setItems((current) => current.map((item) => (item.key === key && item.phase === 'waiting' ? { ...item, phase: 'cancelled' } : item)));
    },
    retry(key) {
      const file = chosen.current.get(key);
      const item = items.find((candidate) => candidate.key === key);
      if (!file || !item) return;
      const controller = new AbortController();
      controllers.current.set(key, controller);
      update(key, { phase: 'waiting', bytes: 0, message: undefined });
      chain.current = chain.current.then(() => process(key, file, item.target, controller));
    },
    dismiss(key) {
      chosen.current.delete(key);
      setItems((current) => current.filter((item) => item.key !== key));
    },
    async moveExisting(key) {
      const item = items.find((candidate) => candidate.key === key);
      if (!item?.material) return;
      try {
        await fileMaterial(item.material.id, item.target.courseId, item.target.topicId);
        setItems((current) => current.filter((candidate) => candidate.key !== key));
      } catch (error) {
        update(key, { phase: 'failed', message: describeFailure(error) });
      }
    },
    clearFinished() {
      for (const item of items) if (item.phase === 'saved' || item.phase === 'cancelled') chosen.current.delete(item.key);
      setItems((current) => current.filter((item) => item.phase !== 'saved' && item.phase !== 'cancelled'));
    },
  }), [items, process, update]);

  return <QueueContext.Provider value={queue}>{children}</QueueContext.Provider>;
}

const PHASE_LABEL: Partial<Record<Phase, string>> = {
  waiting: 'Waiting',
  checking: 'Checking for duplicates',
  saving: 'Saving',
  saved: 'Saved',
  cancelled: 'Cancelled',
};

/** How long a finished list stays up, so it's seen, before it gets out of the way. */
export const FINISHED_CLEAR_MS = 12_000;

export function SavePanel() {
  const { items, cancel, retry, dismiss, moveExisting, clearFinished } = useSaveQueue();
  const [held, setHeld] = useState(false);
  // Going to another screen lets go of the card, so it can't stay up forever because a button in it
  // still had focus or the pointer was resting on it.
  const { pathname } = useLocation();
  useEffect(() => setHeld(false), [pathname]);
  const allFinished = items.length > 0 && items.every((item) => item.phase === 'saved' || item.phase === 'cancelled');
  // Once everything is saved, the card clears itself so it stops covering buttons. It waits while
  // the student is pointing at it or using it. Problems (failures, duplicates) stay until handled.
  useEffect(() => {
    if (!allFinished || held) return;
    const timer = setTimeout(clearFinished, FINISHED_CLEAR_MS);
    return () => clearTimeout(timer);
  }, [allFinished, held, clearFinished, items.length]);
  // Leave room at the bottom of the page, so nothing underneath is out of reach while it shows.
  useEffect(() => {
    document.documentElement.classList.toggle('save-panel-open', items.length > 0);
    return () => document.documentElement.classList.remove('save-panel-open');
  }, [items.length]);
  if (items.length === 0) return null;
  const canClear = items.some((item) => item.phase === 'saved' || item.phase === 'cancelled');
  return (
    <section
      className="save-panel"
      aria-label="Files being saved"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHeld(false); }}
    >
      <div className="save-head">
        <h2>Saving files</h2>
        {canClear && <button className="text-button" onClick={clearFinished}>Clear finished</button>}
      </div>
      <ul>
        {items.map((item) => {
          const active = item.phase === 'checking' || item.phase === 'saving';
          const percent = item.size ? Math.min(100, Math.round((item.bytes / item.size) * 100)) : 100;
          return (
            <li key={item.key} data-phase={item.phase}>
              <div className="save-name">{item.name}</div>
              {item.phase === 'duplicate' && item.material ? (
                <>
                  <p>You already saved this file as “{item.material.name}”.</p>
                  <div className="row-actions">
                    <Link className="text-button" to={`/files/${item.material.id}`} onClick={() => dismiss(item.key)}>Open existing</Link>
                    {item.target.courseId && (
                      <button className="text-button" onClick={() => void moveExisting(item.key)}>Move it here</button>
                    )}
                    <button className="text-button" onClick={() => dismiss(item.key)}>Cancel</button>
                  </div>
                </>
              ) : item.phase === 'failed' ? (
                <>
                  <p className="error" role="alert">{item.message}</p>
                  <span className="row-actions">
                    <button className="text-button" onClick={() => retry(item.key)}>Try again</button>
                    <button className="text-button" onClick={() => dismiss(item.key)}>Dismiss</button>
                  </span>
                </>
              ) : (
                <>
                  <div className="save-status" role="status">
                    <span>{PHASE_LABEL[item.phase]}{active ? ` ${percent}%` : ''}</span>
                    {item.phase === 'saved' && item.material && (
                      <Link className="text-button" to={`/files/${item.material.id}`} onClick={() => dismiss(item.key)}>Open</Link>
                    )}
                    {(active || item.phase === 'waiting') && (
                      <button className="text-button" onClick={() => cancel(item.key)}>Cancel</button>
                    )}
                    {item.phase === 'cancelled' && (
                      <button className="text-button" onClick={() => retry(item.key)}>Try again</button>
                    )}
                  </div>
                  {active && (
                    <div className="meter" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${PHASE_LABEL[item.phase]} ${item.name}`}>
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
