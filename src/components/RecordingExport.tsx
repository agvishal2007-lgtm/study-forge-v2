import { useEffect, useRef, useState } from 'react';
import type { ExportChoice } from '../data/mediaExport';

/** Hands a finished file to the browser's own download, with a name a student will recognise. */
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before the address is released.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Download a recording as MP3 (audio) or MP4 (video), or in any other format this device can
 * genuinely make. The conversion library only loads when a recording is opened.
 */
export function RecordingExport({ blob, name, isVideo }: { blob: Blob; name: string; isVideo: boolean }) {
  const [choices, setChoices] = useState<ExportChoice[] | null>(null);
  const [video, setVideo] = useState(isVideo);
  const [working, setWorking] = useState<{ choice: ExportChoice; share: number } | null>(null);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const stop = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    import('../data/mediaExport')
      .then(({ exportChoices }) => exportChoices(blob, name, isVideo))
      .then((found) => { if (active) { setChoices(found.choices); setVideo(found.isVideo); } })
      // Without the converter, the original can still always be downloaded.
      .catch(() => { if (active) setChoices([]); });
    return () => { active = false; stop.current?.abort(); };
  }, [blob, name, isVideo]);

  const run = async (choice: ExportChoice) => {
    const { exportName, exportRecording } = await import('../data/mediaExport');
    const controller = new AbortController();
    stop.current = controller;
    setMessage(null);
    setWorking({ choice, share: 0 });
    try {
      const file = await exportRecording(blob, choice, (share) => setWorking({ choice, share }), controller.signal);
      save(file, exportName(name, choice));
      setMessage({ text: `${exportName(name, choice)} is downloading.`, failed: false });
    } catch (error) {
      if ((error as Error).name === 'AbortError') setMessage({ text: 'Stopped. Nothing was saved, and the recording is unchanged.', failed: false });
      else setMessage({ text: (error as Error).message, failed: true });
    } finally {
      setWorking(null);
      stop.current = null;
    }
  };

  if (!choices) return <p className="muted">Checking which formats this device can make…</p>;
  const main = choices.find((choice) => choice.format === (video ? 'mp4' : 'mp3'));
  const others = choices.filter((choice) => choice !== main);

  return (
    <section className="export" aria-labelledby="export-heading" data-testid="recording-export">
      <h2 id="export-heading">Download</h2>
      {main
        ? <button className="button primary" disabled={Boolean(working)} onClick={() => void run(main)}>Download {main.format.toUpperCase()}</button>
        : <p className="muted">This browser can't make {video ? 'an MP4' : 'an MP3'} from this recording. The other options below still work, and a different browser may be able to.</p>}
      {working && (
        <div className="export-progress" role="status">
          <span>Making {working.choice.label}… {Math.round(working.share * 100)}%</span>
          <progress max={1} value={working.share} aria-label={`Making ${working.choice.label}`} />
          <button className="text-button" onClick={() => stop.current?.abort()}>Stop</button>
        </div>
      )}
      {message && <p className={message.failed ? 'error' : 'notice'} role={message.failed ? 'alert' : 'status'}>{message.text}</p>}
      <details className="export-more">
        <summary>More export options</summary>
        <ul className="export-list">
          {others.map((choice) => (
            <li key={choice.format}>
              <button className="button" disabled={Boolean(working)} onClick={() => void run(choice)}>{choice.label}</button>
              <span className="muted">{choice.note}</span>
            </li>
          ))}
        </ul>
        <p className="muted">Converting happens on this device, so nothing is uploaded. Formats this browser can't make aren't listed.</p>
      </details>
    </section>
  );
}
