import { useEffect, useRef, useState } from 'react';
import { deleteTranscript, getTranscript, saveTranscript } from '../data/transcripts';
import { TRANSCRIBE_MODEL, TranscribeError, transcribe, type TranscribeProgress } from '../data/transcribe';
import type { Material } from '../data/types';
import { useLive } from '../data/useLive';

const STAGE_WORDS: Record<TranscribeProgress['stage'], string> = {
  preparing: 'Getting the sound ready',
  downloading: 'Downloading the speech model (first time only)',
  listening: 'Listening to your recording',
};

export function TranscriptPanel({ material, blob }: { material: Material; blob: Blob }) {
  const { data: transcript, loading } = useLive(() => getTranscript(material.id), [material.id]);
  const [progress, setProgress] = useState<TranscribeProgress | null>(null);
  const [problem, setProblem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const active = useRef(false);
  useEffect(() => () => { active.current = false; }, []);

  const run = () => {
    if (active.current) return;
    active.current = true;
    setProblem('');
    setProgress({ stage: 'preparing', percent: 0 });
    transcribe(blob, (next) => { if (active.current) setProgress(next); }, () => active.current)
      .then(async (text) => {
        if (!active.current) return;
        if (!text) {
          setProblem('No words were found in this recording.');
          return;
        }
        await saveTranscript(material.id, text, TRANSCRIBE_MODEL);
      })
      .catch((error: unknown) => {
        if (active.current) setProblem(error instanceof TranscribeError ? error.message : `The transcript couldn't be made. ${(error as Error).message}`);
      })
      .finally(() => { active.current = false; setProgress(null); });
  };

  const working = progress !== null;

  return (
    <section className="file-notes transcript-panel" aria-labelledby="transcript-heading" data-testid="transcript-panel">
      <h2 id="transcript-heading">Transcript</h2>
      {!loading && !transcript && !working && (
        <div className="notice">
          <p>Turn this recording into text you can read and search. It happens on your device, so nothing is uploaded. The first time, it downloads a speech model, which needs internet. It can be slow on long recordings, and it's rougher than paid tools, especially with background noise.</p>
          <button className="button primary" onClick={run} data-testid="make-transcript">Make a transcript</button>
        </div>
      )}
      {working && (
        <div className="backup-progress" role="status" data-testid="transcript-progress">
          <p>{STAGE_WORDS[progress.stage]}{progress.stage !== 'preparing' ? `, ${progress.percent}%` : '…'}</p>
          <div className="meter"><span style={{ width: `${progress.stage === 'preparing' ? 5 : progress.percent}%` }} /></div>
          <p className="row-actions"><button className="button" onClick={() => { active.current = false; setProgress(null); }}>Stop</button></p>
        </div>
      )}
      {problem && <p className="error" role="alert" data-testid="transcript-problem">{problem}</p>}
      {transcript && !working && (
        <div data-testid="transcript-text">
          <p className="muted file-meta">This transcript is searchable. It was made on your device and can have mistakes, so check anything important against the recording.</p>
          <div className="transcript-body">{transcript.text}</div>
          <div className="row-actions">
            <button className="button" onClick={async () => {
              try {
                await navigator.clipboard.writeText(transcript.text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setProblem('Copying failed. You can select the text instead.');
              }
            }}>{copied ? 'Copied' : 'Copy'}</button>
            <button className="button" onClick={run}>Make it again</button>
            <button className="text-button danger-text" onClick={() => setConfirmDelete(true)}>Delete transcript</button>
          </div>
          {confirmDelete && (
            <div className="notice" role="alertdialog" aria-label="Delete transcript">
              <p>Delete this transcript? The recording is kept.</p>
              <div className="row-actions">
                <button className="button danger" onClick={async () => { setConfirmDelete(false); await deleteTranscript(material.id); }}>Delete transcript</button>
                <button className="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
