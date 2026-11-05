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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* eslint-disable @typescript-eslint/no-explicit-any */
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

/** Reads the recording aloud into text, reporting progress. isActive lets the page stop it by leaving. */
export async function transcribe(blob: Blob, onProgress: (progress: TranscribeProgress) => void, isActive: () => boolean): Promise<string> {
  if (TEST_BUILD) {
    onProgress({ stage: 'preparing', percent: 0 });
    await wait(20);
    onProgress({ stage: 'listening', percent: 50 });
    await wait(20);
    onProgress({ stage: 'listening', percent: 100 });
    const canned = (window as any).__testTranscript;
    if (typeof canned === 'string' && canned.startsWith('ERROR:')) throw new TranscribeError(canned.slice(6));
    return typeof canned === 'string' ? canned : 'This is a sample transcript used only in testing.';
  }

  onProgress({ stage: 'preparing', percent: 0 });
  const audio = await decodeAudio(blob);
  if (!isActive()) throw new TranscribeError('Stopped.');
  if (audio.length < SAMPLE_RATE / 2) throw new TranscribeError('This recording is too short, or has no sound.');

  let transformers;
  try {
    transformers = await import('@huggingface/transformers');
  } catch {
    throw new TranscribeError(navigator.onLine ? "The transcriber couldn't start." : 'Making a transcript the first time needs internet. Connect, then try again.');
  }
  const { pipeline, env } = transformers as any;
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
  if (!isActive()) throw new TranscribeError('Stopped.');

  // Reading in windows gives real progress and keeps memory in check on long lectures.
  const windowSize = CHUNK_SECONDS * SAMPLE_RATE;
  const parts: string[] = [];
  for (let start = 0; start < audio.length; start += windowSize) {
    if (!isActive()) throw new TranscribeError('Stopped.');
    onProgress({ stage: 'listening', percent: Math.min(99, Math.round((start / audio.length) * 100)) });
    const slice = audio.subarray(start, Math.min(audio.length, start + windowSize));
    try {
      const result = await recognizer(slice, { chunk_length_s: 30, stride_length_s: 5 });
      const text = Array.isArray(result) ? result.map((item: any) => item.text).join(' ') : result?.text;
      if (text) parts.push(String(text).trim());
    } catch {
      throw new TranscribeError('The recording could not be read all the way through. The transcript may be incomplete.');
    }
  }
  onProgress({ stage: 'listening', percent: 100 });
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
