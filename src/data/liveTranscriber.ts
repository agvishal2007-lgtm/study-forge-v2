import { loadRecognizer, SAMPLE_RATE_HZ, TranscribeError, type TranscribeProgress } from './transcribe';
import type { TranscriptSegment } from './types';

/*
 * Live, on-device transcription while a lecture records. It listens to the same sound the recording
 * gets, collects it in windows of about half a minute, and reads each window with the speech model
 * while the next one fills, so words appear a little behind the speaker. Nothing is uploaded, and
 * the recording itself never waits for it.
 */
const TEST_BUILD = import.meta.env.VITE_ACCOUNT_BACKEND === 'test';
const WINDOW_SECONDS = TEST_BUILD ? 2 : 28;

export type LiveStatus = 'starting' | 'downloading' | 'listening' | 'unavailable';

export interface LiveListener {
  onSegment: (segment: TranscriptSegment) => void;
  onStatus: (status: LiveStatus, message: string) => void;
}

export class LiveTranscriber {
  private processor: ScriptProcessorNode;
  private sink: GainNode;
  private buffer: Float32Array[] = [];
  private buffered = 0;
  /** Recording time covered so far, in 16 kHz samples. Paused time isn't counted, matching the recording. */
  private heard = 0;
  private windowStart = 0;
  private paused = false;
  private queue: Promise<void> = Promise.resolve();
  private recognizer: ReturnType<typeof loadRecognizer>;
  private broken = false;
  readonly segments: TranscriptSegment[] = [];

  constructor(private context: AudioContext, sources: AudioNode[], private listener: LiveListener) {
    this.processor = context.createScriptProcessor(4096, 1, 1);
    // Silent output, so the student never hears themselves; it only has to be connected to run.
    this.sink = context.createGain();
    this.sink.gain.value = 0;
    for (const source of sources) source.connect(this.processor);
    this.processor.connect(this.sink);
    this.sink.connect(context.destination);
    this.processor.onaudioprocess = (event) => this.take(event.inputBuffer.getChannelData(0));
    listener.onStatus('starting', '');
    this.recognizer = loadRecognizer((progress: TranscribeProgress) => {
      if (progress.stage === 'downloading') listener.onStatus('downloading', `Downloading the speech model, ${progress.percent}% (first time only).`);
    });
    this.recognizer.then(
      () => { if (!this.broken) listener.onStatus('listening', ''); },
      (error: unknown) => this.fail(error instanceof TranscribeError ? error.message : "The live transcript couldn't start."),
    );
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  private fail(message: string) {
    if (this.broken) return;
    this.broken = true;
    this.buffer = [];
    this.buffered = 0;
    this.listener.onStatus('unavailable', `${message} The recording carries on, and you can still pin notes to moments. You can make a transcript after it's saved.`);
  }

  /** Turns the device's sound into 16 kHz mono, which is what the model reads. */
  private take(input: Float32Array) {
    if (this.paused || this.broken) return;
    const ratio = this.context.sampleRate / SAMPLE_RATE_HZ;
    const length = Math.floor(input.length / ratio);
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) out[i] = input[Math.floor(i * ratio)];
    this.buffer.push(out);
    this.buffered += length;
    this.heard += length;
    if (this.buffered >= WINDOW_SECONDS * SAMPLE_RATE_HZ) this.flush();
  }

  private flush() {
    if (this.buffered === 0) return;
    const samples = new Float32Array(this.buffered);
    let at = 0;
    for (const part of this.buffer) { samples.set(part, at); at += part.length; }
    const startMs = Math.round((this.windowStart / SAMPLE_RATE_HZ) * 1000);
    const endMs = Math.round((this.heard / SAMPLE_RATE_HZ) * 1000);
    this.windowStart = this.heard;
    this.buffer = [];
    this.buffered = 0;
    // Each window is read in turn, so passages always arrive in order.
    this.queue = this.queue.then(async () => {
      if (this.broken) return;
      try {
        const recognize = await this.recognizer;
        const text = await recognize(samples);
        if (text) {
          const segment = { id: `live-${startMs}`, startMs, endMs, text };
          this.segments.push(segment);
          this.listener.onSegment(segment);
        }
      } catch (error) {
        this.fail(error instanceof TranscribeError ? error.message : "The live transcript stopped.");
      }
    });
  }

  /** Stops listening, reads whatever is left (a second or more), and returns every passage. */
  async finish(): Promise<TranscriptSegment[]> {
    this.processor.onaudioprocess = null;
    try { this.processor.disconnect(); this.sink.disconnect(); } catch { /* already gone */ }
    if (this.buffered >= SAMPLE_RATE_HZ) this.flush();
    await this.queue;
    return this.segments;
  }
}
