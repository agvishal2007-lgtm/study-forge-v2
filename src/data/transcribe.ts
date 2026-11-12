import type { TranscriptSegment } from './types';
/**
 * Turns a recording into text, entirely on the device. The speech model downloads the first time it's
 * used and is then cached, so nothing is ever uploaded. It's slower and rougher than paid services,
 * especially on long or noisy audio. In the test build this is replaced by a stub, so tests never need
 * the model.
 */
export const TRANSCRIBE_MODEL = 'Xenova/whisper-tiny.en';
const TEST_BUILD = import.meta.env.VITE_ACCOUNT_BACKEND === 'test';
const SAMPLE_RATE = 16000;
const CHUNK_SECONDS = 28;

export type TranscribeStage = 'preparing' | 'downloading' | 'listening';
export interface TranscribeProgress {
  stage: TranscribeStage;
  percent: number;
}
export class TranscribeError extends Error {}
export const SAMPLE_RATE_HZ = SAMPLE_RATE;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
/** Turns the recording's sound into 16kHz mono samples, which is what the model expects. */
async function decodeAudio(blob: Blob): Promise<Float32Array> {
  const AudioCtx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) throw new TranscribeError("This browser can't read the recording's sound.");
  const bytes = await blob.arrayBuffer();
  const context = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(bytes.slice(0));
  } catch {
    throw new TranscribeError("The recording's sound couldn't be read. It may be a video the browser can't open on its own.");
  } finally {
    void context.close();
  }
  if (decoded.sampleRate === SAMPLE_RATE && decoded.numberOfChannels === 1) return decoded.getChannelData(0).slice();
  const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0).slice();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Recognizer = (samples: Float32Array) => Promise<string>;
let recognizerPromise: Promise<Recognizer> | null = null;

/** Loads the speech model once, and reuses it for every transcript, live or afterwards. */
export function loadRecognizer(onProgress: (progress: TranscribeProgress) => void): Promise<Recognizer> {
  if (TEST_BUILD) {
    let count = 0;
    return Promise.resolve(async () => {
      await wait(30);
      count += 1;
      const canned = (window as any).__testLiveTranscript as string[] | undefined;
      if ((window as any).__testTranscriberBroken) throw new TranscribeError('broken');
      return canned?.[(count - 1) % canned.length] ?? `Spoken passage number ${count}.`;
    });
  }
  recognizerPromise ??= (async () => {
    // Loaded from a CDN at run time, so the heavy speech library never ships in the site or its build.
    let transformers: any;
    try {
      const url = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
      transformers = await import(/* @vite-ignore */ url);
    } catch {
      throw new TranscribeError(navigator.onLine ? "The transcriber couldn't start." : 'Making a transcript the first time needs internet. Connect, then try again.');
    }
    const { pipeline, env } = transformers;
    // Only ever use the public model; never look for a local one.
    env.allowLocalModels = false;
    let recognizer: any;
    try {
      recognizer = await pipeline('automatic-speech-recognition', TRANSCRIBE_MODEL, {
        progress_callback: (event: any) => {
          if (event?.status === 'progress' && event.total) onProgress({ stage: 'downloading', percent: Math.min(100, Math.round((event.loaded / event.total) * 100)) });
        },
      });
    } catch {
      throw new TranscribeError(navigator.onLine ? "The transcriber couldn't load. Try again in a moment." : 'Making a transcript the first time needs internet. Connect, then try again.');
    }
    return async (samples: Float32Array) => {
      const result = await recognizer(samples, { chunk_length_s: 30, stride_length_s: 5 });
      const text = Array.isArray(result) ? result.map((item: any) => item.text).join(' ') : result?.text;
      return String(text ?? '').replace(/\s+/g, ' ').trim();
    };
  })().catch((error) => {
    recognizerPromise = null;
    throw error;
  });
  return recognizerPromise;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
}

/** Joins passages into one readable text. */
export const textOf = (segments: TranscriptSegment[]) => segments.map((segment) => segment.text).join(' ').replace(/\s+/g, ' ').trim();

/** Reads the recording aloud into timed passages, reporting progress. isActive lets the page stop it by leaving. */
export async function transcribe(blob: Blob, onProgress: (progress: TranscribeProgress) => void, isActive: () => boolean): Promise<TranscriptResult> {
  if (TEST_BUILD) {
    onProgress({ stage: 'preparing', percent: 0 });
    await wait(20);
    onProgress({ stage: 'listening', percent: 50 });
    await wait(20);
    onProgress({ stage: 'listening', percent: 100 });
    const canned = (window as any).__testTranscript;
    if (typeof canned === 'string' && canned.startsWith('ERROR:')) throw new TranscribeError(canned.slice(6));
    const text = typeof canned === 'string' ? canned : 'This is a sample transcript used only in testing.';
    // One passage per sentence, five seconds each, so timing can be tested without the model.
    const sentences = text.match(/[^.!?]+[.!?]*/g)?.map((part: string) => part.trim()).filter(Boolean) ?? [text];
    const segments = sentences.map((sentence: string, index: number) => ({ id: `s${index}`, startMs: index * 5000, endMs: (index + 1) * 5000, text: sentence }));
    return { text: textOf(segments), segments };
  }

  onProgress({ stage: 'preparing', percent: 0 });
  const audio = await decodeAudio(blob);
  if (!isActive()) throw new TranscribeError('Stopped.');
  if (audio.length < SAMPLE_RATE / 2) throw new TranscribeError('This recording is too short, or has no sound.');
  const recognize = await loadRecognizer(onProgress);
  if (!isActive()) throw new TranscribeError('Stopped.');

  // Reading in windows gives real progress, timed passages, and keeps memory in check on long lectures.
  const windowSize = CHUNK_SECONDS * SAMPLE_RATE;
  const segments: TranscriptSegment[] = [];
  for (let start = 0; start < audio.length; start += windowSize) {
    if (!isActive()) throw new TranscribeError('Stopped.');
    onProgress({ stage: 'listening', percent: Math.min(99, Math.round((start / audio.length) * 100)) });
    const end = Math.min(audio.length, start + windowSize);
    let text = '';
    try {
      text = await recognize(audio.subarray(start, end));
    } catch {
      throw new TranscribeError('The recording could not be read all the way through. The transcript may be incomplete.');
    }
    if (text) segments.push({ id: `s${Math.round((start / SAMPLE_RATE) * 1000)}`, startMs: Math.round((start / SAMPLE_RATE) * 1000), endMs: Math.round((end / SAMPLE_RATE) * 1000), text });
  }
  onProgress({ stage: 'listening', percent: 100 });
  return { text: textOf(segments), segments };
}
