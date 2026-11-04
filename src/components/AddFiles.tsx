import { useEffect, useRef, useState } from 'react';
import { getActiveAccount } from '../data/account';
import { CLOUD_LABEL, CloudError, cloudSources, pickFromCloud, prepareCloud, type CloudSource } from '../data/cloudImport';
import { useSaveQueue } from './SaveQueue';

/** Choose or drag files, or pick them from another service. Saving keeps running while the student moves between screens. */
export function AddFiles({ courseId = null, topicId = null }: { courseId?: string | null; topicId?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<CloudSource | null>(null);
  const [ready, setReady] = useState<CloudSource[]>([]);
  const [problem, setProblem] = useState('');
  const { addFiles } = useSaveQueue();
  const sources = cloudSources();

  useEffect(() => {
    let active = true;
    sources.forEach((source) => {
      prepareCloud(source).then(
        () => { if (active) setReady((current) => [...new Set([...current, source])]); },
        () => undefined,
      );
    });
    return () => { active = false; };
    // The list of services doesn't change while the site is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (source: CloudSource) => {
    setBusy(source);
    setProblem('');
    // Nothing is awaited before this call, so the window opens as part of the tap itself.
    pickFromCloud(source, getActiveAccount()?.email).then(({ files, failed }) => {
      if (files.length > 0) addFiles(files, { courseId, topicId });
      if (failed.length > 0) setProblem(`These couldn't be copied from ${CLOUD_LABEL[source]}: ${failed.join(', ')}. Try them again, or download them and add them from your device.`);
    }, (error: unknown) => {
      if (!(error instanceof CloudError && error.code === 'cancelled')) setProblem((error as Error).message);
    }).finally(() => setBusy(null));
  };

  return (
    <div
      data-tour="add-files"
      className={over ? 'drop over' : 'drop'}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        addFiles([...event.dataTransfer.files], { courseId, topicId });
      }}
    >
      <button className="button primary" onClick={() => input.current?.click()}>Add files</button>
      <span className="muted">or drag them here</span>
      {sources.map((source) => (
        <button key={source} className="button" disabled={busy !== null || !ready.includes(source)} onClick={() => pick(source)}>
          {busy === source ? 'Getting files…' : `From ${CLOUD_LABEL[source]}`}
        </button>
      ))}
      {problem && <p className="error drop-problem" role="alert">{problem}</p>}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        data-testid="file-input"
        onChange={(event) => {
          addFiles([...(event.target.files ?? [])], { courseId, topicId });
          event.target.value = '';
        }}
      />
    </div>
  );
}
