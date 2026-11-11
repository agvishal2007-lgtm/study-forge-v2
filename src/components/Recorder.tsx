import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatBytes, formatDuration } from '../data/format';
import { appendPiece, createSession, finishSession, holdRecordingLock } from '../data/recordings';
import { getStorageStatus, requestKeepFiles } from '../data/store';
import type { Material } from '../data/types';
import { readAccess } from '../data/permissions';

const PIECE_MS = 5000;
const VOICE_BITRATE = 64000; // Clear for speech, and about 90 MB for 3 hours.
const SCREEN_AUDIO_BITRATE = 96000;
const SCREEN_VIDEO_BITRATE = 1_000_000; // Readable slides, and about 500 MB per hour.
const AUDIO_FORMATS = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
const VIDEO_FORMATS = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/mp4', 'video/webm'];
const SILENCE_WARNING_MS = 20000;
const LOW_SPACE_BYTES = 1024 ** 3;

export type RecordingSource = 'microphone' | 'screen';

/** Phones and some browsers can't share a screen at all. */
export const canRecordScreen = () =>
  typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'paused' | 'saving';

interface StartOptions {
  source: RecordingSource;
  /** Virtual lectures only: also record the student's own voice. */
  withMicrophone: boolean;
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
  source: RecordingSource;
  /** False when the lecture's own sound isn't being captured, such as when tab audio wasn't shared. */
  hasAudio: boolean;
  /** True when the student's microphone is part of the recording. */
  micIncluded: boolean;
  /** True after a long stretch with no sound reaching the recording. */
  silent: boolean;
  warning: string;
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

function describeScreenFailure(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return 'Screen sharing was cancelled, so nothing was recorded. Start again and choose what to share. If no choice appears, allow screen sharing for this browser in your device settings.';
  }
  if (name === 'NotFoundError' || name === 'NotSupportedError') {
    return "This browser or device can't share its screen. Try Chrome or Edge on a computer.";
  }
  return `Screen recording couldn't start. ${error instanceof Error ? error.message : ''}`.trim();
}

const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();

/** Lives above every screen, so recording continues while the student reads their slides. */
export function RecorderProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [name, setName] = useState('');
  const [bytes, setBytes] = useState(0);
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [source, setSource] = useState<RecordingSource>('microphone');
  const [hasAudio, setHasAudio] = useState(true);
  const [micIncluded, setMicIncluded] = useState(false);
  const [silent, setSilent] = useState(false);
  const [warning, setWarning] = useState('');
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

  const start = useCallback(async ({ source: chosen, withMicrophone, name: title, courseId, topicId }: StartOptions) => {
    if (recorderRef.current) return;
    setError('');
    setNotice('');
    setSaved(null);
    setBytes(0);
    setMuted(false);
    setSilent(false);
    setWarning('');
    setHasAudio(true);
    setSource(chosen);
    if (chosen === 'screen' && !canRecordScreen()) {
      setError("This browser or device can't record its screen. Try Chrome or Edge on a computer, or record in person with the microphone.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError("This browser can't record audio. Use a recorder app on your device, then add the file here.");
      return;
    }
    // If the browser has already blocked the microphone, say so instead of firing a request that
    // cannot succeed and surfacing it as a failure. Screen sharing is asked for every time by design.
    const needsMicrophone = chosen === 'microphone' || withMicrophone;
    if (needsMicrophone && (await readAccess('microphone')) === 'denied') {
      setError(chosen === 'microphone'
        ? "Your browser is blocking the microphone for this site, so Study Forge can't ask again. Turn it back on in your browser's site settings for this page, then start again."
        : "Your browser is blocking the microphone for this site, so your own voice can't be recorded. Turn it back on in your browser's site settings, or start again without the microphone option.");
      return;
    }
    setPhase('starting');
    const captured: MediaStream[] = [];
    let audioContext: AudioContext | null = null;
    let screenStarted = false;
    try {
      let microphone: MediaStream | null = null;
      const notes: string[] = [];
      if (chosen === 'screen') {
        const display = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 15, max: 30 } },
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false },
          systemAudio: 'include',
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'include',
        } as DisplayMediaStreamOptions);
        captured.push(display);
        screenStarted = true;
        if (withMicrophone) {
          try {
            microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
            captured.push(microphone);
          } catch {
            notes.push("Your microphone couldn't be used, so your own voice won't be in this recording.");
          }
        }
      } else {
        microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
        captured.push(microphone);
      }

      // Combine the sound sources into one, and listen to the result for the sound bar.
      const audioSources = captured.filter((item) => item.getAudioTracks().length > 0);
      let analyser: AnalyserNode | null = null;
      let tracks: MediaStreamTrack[] = captured.flatMap((item) => item.getVideoTracks());
      if (audioSources.length > 0) {
        audioContext = new AudioContext();
        void audioContext.resume();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        const mix = audioSources.length > 1 ? audioContext.createMediaStreamDestination() : null;
        for (const item of audioSources) {
          const node = audioContext.createMediaStreamSource(item);
          node.connect(analyser);
          if (mix) node.connect(mix);
        }
        tracks = [...tracks, ...(mix ? mix.stream.getAudioTracks() : audioSources[0].getAudioTracks())];
      }
      const stream = new MediaStream(tracks);
      const screenHasSound = captured[0].getAudioTracks().length > 0;
      setHasAudio(chosen === 'microphone' || screenHasSound);
      setMicIncluded(microphone !== null);

      const { usage, quota } = await getStorageStatus();
      if (usage !== null && quota !== null && quota - usage < LOW_SPACE_BYTES && chosen === 'screen') {
        notes.push('This device has less than 1 GB of space left for Study Forge. Screen recordings use about 500 MB per hour.');
      }
      setWarning(notes.join(' '));

      const isScreen = chosen === 'screen';
      const mimeType = (isScreen ? VIDEO_FORMATS : AUDIO_FORMATS).find((format) => MediaRecorder.isTypeSupported(format));
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: isScreen ? SCREEN_AUDIO_BITRATE : VOICE_BITRATE,
        ...(isScreen ? { videoBitsPerSecond: SCREEN_VIDEO_BITRATE } : {}),
      });
      const id = crypto.randomUUID();
      await createSession({
        id,
        name: title,
        courseId,
        topicId,
        mimeType: recorder.mimeType || mimeType || (isScreen ? 'video/webm' : 'audio/webm'),
        startedAt: Date.now(),
        elapsedMs: 0,
        bytes: 0,
      });
      const releaseLock = holdRecordingLock(id);
      // A file going up to Drive steps aside, so it never competes with the recording.
      void import('../data/driveFiles').then(({ pauseForRecording }) => pauseForRecording());

      // Show the student that sound is really being captured, and warn if it stops.
      const samples = new Uint8Array(1024);
      let lastSound = Date.now();
      const meter = setInterval(() => {
        if (!analyser) return;
        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128));
        setLevel(Math.min(1, peak / 96));
        if (peak > 2 || recorder.state === 'paused') lastSound = Date.now();
        setSilent(Date.now() - lastSound > SILENCE_WARNING_MS);
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

      const activeContext = audioContext;
      teardown.current = () => {
        clearInterval(meter);
        void activeContext?.close().catch(() => undefined);
        captured.forEach((item) => item.getTracks().forEach((track) => track.stop()));
        document.removeEventListener('visibilitychange', keepAwake);
        window.removeEventListener('beforeunload', warnBeforeLeaving);
        void wakeLock?.release().catch(() => undefined);
        setLevel(0);
        setSilent(false);
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
      const stopWith = (reason: string) => {
        stopReason = reason;
        if (recorder.state !== 'inactive') recorder.stop();
      };
      if (isScreen) {
        // Clicking the browser's own "Stop sharing" button ends the screen track.
        for (const track of captured[0].getVideoTracks()) {
          track.onended = () => stopWith('You stopped sharing your screen, so the recording ended.');
        }
        for (const track of microphone?.getAudioTracks() ?? []) {
          track.onended = () => setWarning("Your microphone was disconnected. The screen and computer audio are still recording.");
        }
      } else {
        for (const track of microphone?.getAudioTracks() ?? []) {
          track.onended = () => stopWith('The microphone was disconnected or turned off.');
          track.onmute = () => setMuted(true);
          track.onunmute = () => setMuted(false);
        }
      }

      recorderRef.current = recorder;
      clock.current = { banked: 0, since: Date.now() };
      setName(title);
      recorder.start(PIECE_MS);
      setPhase('recording');
    } catch (failure) {
      captured.forEach((item) => item.getTracks().forEach((track) => track.stop()));
      void audioContext?.close().catch(() => undefined);
      recorderRef.current = null;
      setError(chosen === 'screen' && !screenStarted ? describeScreenFailure(failure) : describeMicFailure(failure));
      setPhase('idle');
    }
  }, [getElapsed]);

  const value = useMemo<Recorder>(() => ({
    phase, name, bytes, level, muted, source, hasAudio, micIncluded, silent, warning, error, notice, saved, getElapsed, start,
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
      setWarning('');
    },
  }), [phase, name, bytes, level, muted, source, hasAudio, micIncluded, silent, warning, error, notice, saved, getElapsed, start]);

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
