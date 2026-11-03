import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AddFiles } from '../components/AddFiles';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Meter, useElapsed, useRecorder } from '../components/Recorder';
import { formatBytes, formatDate, formatDuration } from '../data/format';
import { discardSession, finishSession, listUnfinished } from '../data/recordings';
import { listCourses, listTopics } from '../data/store';
import type { RecordingSession } from '../data/types';
import { useLive } from '../data/useLive';

const defaultName = () => `Lecture ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

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
  const { phase, name, bytes, muted, pause, resume, stop } = useRecorder();
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
        {phase === 'recording' ? 'Recording' : 'Paused'}: {name}
      </p>
      <p className="studio-clock" data-testid="clock" role="timer">{formatDuration(elapsed)}</p>
      <Meter />
      <p className="muted">{formatBytes(bytes)} saved to this device so far. You can open your slides and notes while this runs.</p>
      {muted && <p className="error" role="alert">Your device has silenced the microphone, possibly for a call. Recording will pick up again when it's released.</p>}
      {hiddenWhileRecording && <p className="notice">You left this page during recording. Some phones stop the microphone when you do, so check that the sound bar still moves.</p>}
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
  const [topicId, setTopicId] = useState('');
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
          <button
            className="button primary record-button"
            disabled={phase !== 'idle'}
            onClick={() => void start({ name: title.trim() || defaultName(), courseId: courseId || null, topicId: topicId || null })}
          >
            {phase === 'starting' ? 'Waiting for microphone…' : phase === 'saving' ? 'Saving recording…' : 'Start recording'}
          </button>
          <p className="muted">Audio is saved to this device every 5 seconds. On a phone, keep this page open and the screen unlocked, because locking it can stop the microphone.</p>
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
