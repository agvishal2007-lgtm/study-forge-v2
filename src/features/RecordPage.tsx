import { formatWhen } from '../data/dateFormat';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AddFiles } from '../components/AddFiles';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { canRecordScreen, Meter, useElapsed, useRecorder, type RecordingSource } from '../components/Recorder';
import { formatBytes, formatDate, formatDuration } from '../data/format';
import { discardSession, finishSession, listUnfinished } from '../data/recordings';
import { listCourses, listTopics } from '../data/store';
import type { RecordingSession } from '../data/types';
import { useLive } from '../data/useLive';

const defaultName = () => `Lecture ${formatWhen(new Date(), { month: 'short', day: 'numeric', year: 'numeric' })}`;

function Interrupted() {
  const { data } = useLive(listUnfinished);
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState('');
  const [discarding, setDiscarding] = useState<RecordingSession | null>(null);
  if (!data || data.length === 0) return null;
  return (
    <section aria-labelledby="interrupted-heading">
      <h2 id="interrupted-heading">Interrupted recordings</h2>
      <p>These stopped before they were finished, and what was captured is safe. The last few seconds may be missing.</p>
      {failure && <p className="error" role="alert">{failure}</p>}
      <ul className="files">
        {data.map((session) => (
          <li key={session.id}>
            <strong>{session.name}</strong>
            <span className="muted file-meta">
              {formatDate(session.startedAt)}, about {formatDuration(session.elapsedMs)}, {formatBytes(session.bytes)}
            </span>
            <div className="row-actions">
              <button
                className="button"
                disabled={busy === session.id}
                onClick={async () => {
                  setBusy(session.id);
                  setFailure('');
                  try {
                    await finishSession(session.id);
                  } catch (error) {
                    setFailure(`The recording wasn't saved, but it's still here. ${(error as Error).message}`);
                  } finally {
                    setBusy('');
                  }
                }}
              >
                Save recording
              </button>
              <button className="text-button danger-text" onClick={() => setDiscarding(session)}>Discard</button>
            </div>
          </li>
        ))}
      </ul>
      {discarding && (
        <ConfirmDialog
          title={`Discard ${discarding.name}?`}
          confirmLabel="Discard recording"
          onCancel={() => setDiscarding(null)}
          onConfirm={async () => {
            const { id } = discarding;
            setDiscarding(null);
            await discardSession(id).catch((error: Error) => setFailure(`The recording wasn't discarded. ${error.message}`));
          }}
        >
          <p>This permanently removes the captured audio from this device. It can't be undone.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function Recording() {
  const { phase, name, bytes, muted, source, hasAudio, micIncluded, silent, warning, pause, resume, stop } = useRecorder();
  const elapsed = useElapsed();
  const [hiddenWhileRecording, setHidden] = useState(false);
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'hidden') setHidden(true); };
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  return (
    <div className="studio">
      <p className="studio-state">
        <span className={phase === 'recording' ? 'dot live' : 'dot'} aria-hidden="true" />
        {phase === 'recording' ? 'Recording' : 'Paused'}{source === 'screen' ? ' your screen' : ''}: {name}
      </p>
      <p className="studio-clock" data-testid="clock" role="timer">{formatDuration(elapsed)}</p>
      {!hasAudio && (
        <div className="error-box" role="alert" data-testid="no-audio">
          <strong>{micIncluded ? "The lecture's sound isn't being recorded, only your microphone." : 'No sound is being recorded.'}</strong> Stop, start again, and turn on the option to share audio when your browser asks what to share. If you shared a whole window, try sharing a browser tab instead, because that's where audio sharing is most reliable.
        </div>
      )}
      {(hasAudio || micIncluded) && <Meter />}
      {(hasAudio || micIncluded) && silent && phase === 'recording' && (
        <p className="notice" role="status" data-testid="silent">No sound has reached this recording for a while. If the lecture is already talking, stop and check what you shared.</p>
      )}
      {warning && <p className="notice" role="status">{warning}</p>}
      <p className="muted">
        {formatBytes(bytes)} saved to this device so far.{' '}
        {source === 'screen'
          ? "Use the browser's Stop sharing button or the one below to finish."
          : 'You can open your slides and notes while this runs.'}
      </p>
      {muted && <p className="error" role="alert">Your device has silenced the microphone, possibly for a call. Recording will pick up again when it's released.</p>}
      {hiddenWhileRecording && source === 'microphone' && <p className="notice">You left this page during recording. Some phones stop the microphone when you do, so check that the sound bar still moves.</p>}
      <div className="row-actions">
        {phase === 'recording'
          ? <button className="button" onClick={pause}>Pause</button>
          : <button className="button" onClick={resume}>Resume</button>}
        <button className="button primary" onClick={stop}>Stop and save</button>
      </div>
    </div>
  );
}

export function RecordPage() {
  const { phase, error, notice, saved, start, clearResult } = useRecorder();
  const [params] = useSearchParams();
  const [title, setTitle] = useState(defaultName);
  const [courseId, setCourseId] = useState(params.get('course') ?? '');
  // Smart Add can arrive here already knowing where the recording belongs.
  const [topicId, setTopicId] = useState(params.get('topic') ?? '');
  const [source, setSource] = useState<RecordingSource>('microphone');
  const [withMicrophone, setWithMicrophone] = useState(false);
  const screenAvailable = canRecordScreen();
  const { data: courses } = useLive(listCourses);
  const { data: topics } = useLive(() => (courseId ? listTopics(courseId) : Promise.resolve([])), [courseId]);
  const running = phase === 'recording' || phase === 'paused';

  return (
    <div className="page">
      <h1>Record a lecture</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {saved && (
        <p className="notice" role="status">
          Saved “{saved.name}”. <Link to={`/files/${saved.id}`} onClick={clearResult}>Play it</Link>
        </p>
      )}

      {running ? <Recording /> : (
        <section className="studio" aria-label="Set up a recording">
          <fieldset className="source-choice" data-tour="record-source">
            <legend>Where is the lecture?</legend>
            <label className={source === 'microphone' ? 'source chosen' : 'source'}>
              <input type="radio" name="source" checked={source === 'microphone'} onChange={() => setSource('microphone')} />
              <span><strong>In person</strong><br /><span className="muted">Records the room with your microphone.</span></span>
            </label>
            <label className={source === 'screen' ? 'source chosen' : 'source'}>
              <input type="radio" name="source" checked={source === 'screen'} disabled={!screenAvailable} onChange={() => setSource('screen')} />
              <span><strong>Virtual</strong><br /><span className="muted">{screenAvailable ? 'Records your screen and the lecture audio.' : "Needs Chrome or Edge on a computer. This browser or device can't record its screen."}</span></span>
            </label>
          </fieldset>
          <div className="inline-form">
            <label>Recording name<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label>Course
              <select value={courseId} onChange={(event) => { setCourseId(event.target.value); setTopicId(''); }}>
                <option value="">No course</option>
                {courses?.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
            </label>
            {courseId && (
              <label>Topic
                <select value={topicId} onChange={(event) => setTopicId(event.target.value)}>
                  <option value="">No topic</option>
                  {topics?.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
                </select>
              </label>
            )}
          </div>
          {source === 'screen' && (
            <div className="screen-help">
              <label className="check">
                <input type="checkbox" checked={withMicrophone} onChange={(event) => setWithMicrophone(event.target.checked)} />
                Also record my microphone, for my own questions
              </label>
              <p>Your browser will ask what to share:</p>
              <ol>
                <li>If the lecture is in a browser tab, choose that tab. This is the most reliable way to capture its sound.</li>
                <li>Turn on the option to share audio. Without it, the recording will have no lecture sound.</li>
                <li>If the lecture is in the Zoom or Teams app, audio capture depends on your computer. On Windows, share your entire screen with system audio. On a Mac, join in a browser tab if you can.</li>
              </ol>
              <p className="muted">Use Chrome or Edge for sound. Safari and Firefox may record only the picture. Uses about 500 MB per hour of this device's space.</p>
            </div>
          )}
          <button
            data-tour="record-start"
            className="button primary record-button"
            disabled={phase !== 'idle'}
            onClick={() => void start({ source, withMicrophone, name: title.trim() || defaultName(), courseId: courseId || null, topicId: topicId || null })}
          >
            {phase === 'starting' ? (source === 'screen' ? 'Waiting for you to choose what to share…' : 'Waiting for microphone…') : phase === 'saving' ? 'Saving recording…' : source === 'screen' ? 'Choose screen and start' : 'Start recording'}
          </button>
          <p className="muted">
            Saved to this device every 5 seconds.
            {source === 'microphone' && ' On a phone, keep this page open and the screen unlocked, because locking it can stop the microphone.'}
          </p>
        </section>
      )}

      <Interrupted />

      {!running && (
        <section aria-labelledby="other-recorder">
          <h2 id="other-recorder">Recorded somewhere else?</h2>
          <p className="muted">Add audio or video from your phone's recorder app or anywhere else.</p>
          <AddFiles courseId={courseId || null} topicId={topicId || null} />
        </section>
      )}
    </div>
  );
}
