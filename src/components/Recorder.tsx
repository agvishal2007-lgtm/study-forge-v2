import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatBytes, formatDuration } from '../data/format';
import { appendPiece, createSession, finishSession, holdRecordingLock } from '../data/recordings';
import { requestKeepFiles } from '../data/store';
import type { Material } from '../data/types';

const PIECE_MS = 5000;
const VOICE_BITRATE = 64000; // Clear for speech, and about 90 MB for 3 hours.
const FORMATS = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'paused' | 'saving';

interface StartOptions {
  name: string;
  courseId: string | null;
  topicId: string | null;
}

interface Recorder {
  phase: RecorderPhase;
  name: string;
  bytes: number;
  level: number;
  /** The microphone was silenced by the device, such as by a phone call. */
  muted: boolean;
  error: string;
  notice: string;
  saved: Material | null;
  getElapsed: () => number;
  start: (options: StartOptions) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  clearResult: () => void;
}

const RecorderContext = createContext<Recorder | null>(null);

export function useRecorder() {
  const recorder = useContext(RecorderContext);
  if (!recorder) throw new Error('useRecorder must be used inside RecorderProvider');
  return recorder;
}

/** Re-renders a few times a second, only where a running clock is on screen. */
export function useElapsed(): number {
  const { getElapsed, phase } = useRecorder();
  const [, tick] = useState(0);
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => tick((value) => value + 1), 500);
    return () => clearInterval(timer);
  }, [phase]);
  return getElapsed();
}

function describeMicFailure(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return "Study Forge doesn't have permission to use your microphone. Allow it in your browser's site settings, then try again.";
  }
  if (name === 'NotFoundError') return 'No microphone was found. Connect one, then try again.';
  if (name === 'NotReadableError') return 'Another app may be using your microphone. Close it, then try again.';
  return `Recording couldn't start. ${error instanceof Error ? error.message : ''}`.trim();
}

const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();

/** Lives above every screen, so recording continues while the student reads their slides. */
export function RecorderProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [name, setName] = useState('');
  const [bytes, setBytes] = useState(0);
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState<Material | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const clock = useRef({ banked: 0, since: null as number | null });
  const teardown = useRef<() => void>(() => undefined);

  const getElapsed = useCallback(() => {
    const { banked, since } = clock.current;
    return banked + (since === null ? 0 : Date.now() - since);
  }, []);

  const start = useCallback(async ({ name: title, courseId, topicId }: StartOptions) => {
    if (recorderRef.current) return;
    setError('');
    setNotice('');
    setSaved(null);
    setBytes(0);
    setMuted(false);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError("This browser can't record audio. Use a recorder app on your device, then add the file here.");
      return;
    }
    setPhase('starting');
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = FORMATS.find((format) => MediaRecorder.isTypeSupported(format));
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: VOICE_BITRATE });
      const id = crypto.randomUUID();
      await createSession({
        id,
        name: title,
        courseId,
        topicId,
        mimeType: recorder.mimeType || mimeType || 'audio/webm',
        startedAt: Date.now(),
        elapsedMs: 0,
        bytes: 0,
      });
      const releaseLock = holdRecordingLock(id);

      // Show the student that sound is actually reaching the microphone.
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const meter = setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128));
        setLevel(Math.min(1, peak / 96));
      }, 150);

      // Ask the device not to sleep. Some devices refuse, so the page also warns about it.
      let wakeLock: WakeLockSentinel | null = null;
      const keepAwake = async () => {
        if (document.visibilityState === 'visible' && navigator.wakeLock) {
          wakeLock = await navigator.wakeLock.request('screen').catch(() => null);
        }
      };
      void keepAwake();
      document.addEventListener('visibilitychange', keepAwake);
      window.addEventListener('beforeunload', warnBeforeLeaving);

      const activeStream = stream;
      teardown.current = () => {
        clearInterval(meter);
        void audioContext.close().catch(() => undefined);
        activeStream.getTracks().forEach((track) => track.stop());
        document.removeEventListener('visibilitychange', keepAwake);
        window.removeEventListener('beforeunload', warnBeforeLeaving);
        void wakeLock?.release().catch(() => undefined);
        setLevel(0);
      };

      let sequence = 0;
      let writes: Promise<void> = Promise.resolve();
      let stopReason = '';
      recorder.ondataavailable = ({ data }) => {
        if (!data.size) return;
        const current = sequence++;
        writes = writes.then(async () => {
          setBytes(await appendPiece(id, current, data, getElapsed()));
        }).catch((failure: Error) => {
          stopReason = `Saving failed, so recording stopped. ${failure.name === 'QuotaExceededError' ? 'This device is out of space.' : failure.message}`;
          if (recorder.state !== 'inactive') recorder.stop();
        });
      };
      recorder.onerror = () => {
        stopReason = 'The browser stopped the recording because of an error.';
        if (recorder.state !== 'inactive') recorder.stop();
      };
      recorder.onstop = async () => {
        clock.current = { banked: getElapsed(), since: null };
        recorderRef.current = null;
        teardown.current();
        setPhase('saving');
        await writes;
        try {
          const material = await finishSession(id);
          setSaved(material);
          if (!material) setNotice('Nothing was captured, so no file was saved.');
          else if (stopReason) setNotice(`${stopReason} Everything captured up to that point was saved.`);
          void requestKeepFiles();
        } catch (failure) {
          setError(`The recording is safe on this device, but it couldn't be finished. Use Save recording under Interrupted recordings to try again. ${(failure as Error).message}`);
        } finally {
          releaseLock();
          setPhase('idle');
        }
      };
      for (const track of stream.getAudioTracks()) {
        track.onended = () => {
          stopReason = 'The microphone was disconnected or turned off.';
          if (recorder.state !== 'inactive') recorder.stop();
        };
        track.onmute = () => setMuted(true);
        track.onunmute = () => setMuted(false);
      }

      recorderRef.current = recorder;
      clock.current = { banked: 0, since: Date.now() };
      setName(title);
      recorder.start(PIECE_MS);
      setPhase('recording');
    } catch (failure) {
      stream?.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      setError(describeMicFailure(failure));
      setPhase('idle');
    }
  }, [getElapsed]);

  const value = useMemo<Recorder>(() => ({
    phase, name, bytes, level, muted, error, notice, saved, getElapsed, start,
    pause() {
      const recorder = recorderRef.current;
      if (recorder?.state !== 'recording') return;
      recorder.pause();
      clock.current = { banked: getElapsed(), since: null };
      setPhase('paused');
    },
    resume() {
      const recorder = recorderRef.current;
      if (recorder?.state !== 'paused') return;
      recorder.resume();
      clock.current = { banked: clock.current.banked, since: Date.now() };
      setPhase('recording');
    },
    stop() {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    },
    clearResult() {
      setSaved(null);
      setNotice('');
      setError('');
    },
  }), [phase, name, bytes, level, muted, error, notice, saved, getElapsed, start]);

  return <RecorderContext.Provider value={value}>{children}</RecorderContext.Provider>;
}

export function Meter() {
  const { level } = useRecorder();
  return (
    <div className="level" data-testid="level" data-level={level.toFixed(2)} aria-hidden="true">
      <span style={{ transform: `scaleX(${level})` }} />
    </div>
  );
}

/** Stays visible on every other screen, so nobody forgets a recording is running. */
export function RecordingBar() {
  const { phase, name, bytes } = useRecorder();
  const { pathname } = useLocation();
  const elapsed = useElapsed();
  if ((phase !== 'recording' && phase !== 'paused') || pathname === '/record') return null;
  return (
    <div className="recording-bar" data-testid="recording-bar">
      <span className={phase === 'recording' ? 'dot live' : 'dot'} aria-hidden="true" />
      <span className="recording-bar-text">
        {phase === 'recording' ? 'Recording' : 'Paused'} {formatDuration(elapsed)}, {name}, {formatBytes(bytes)} saved
      </span>
      <Link to="/record">Go to recording</Link>
    </div>
  );
}
