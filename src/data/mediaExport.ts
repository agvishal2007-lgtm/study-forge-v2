// Downloading a recording in a widely supported format. Conversion happens on the student's own
// device with the browser's own encoders (and a bundled MP3 encoder), so nothing is uploaded and
// nothing costs money. A format is only offered when this browser can genuinely produce it, and
// the original file is never changed.
import {
  ALL_FORMATS, BlobSource, BufferTarget, canEncodeAudio, canEncodeVideo, Conversion, ConversionCanceledError, Input,
  Mp3OutputFormat, Mp4OutputFormat, Output, QUALITY_HIGH, WavOutputFormat, WebMOutputFormat,
  type AudioCodec, type OutputFormat, type VideoCodec,
} from 'mediabunny';
import { registerMp3Encoder } from '@mediabunny/mp3-encoder';

export type ExportFormat = 'original' | 'mp3' | 'm4a' | 'wav' | 'mp4' | 'webm';

export interface ExportChoice {
  format: ExportFormat;
  /** "MP3", "MP4 (H.264 + AAC)". */
  label: string;
  extension: string;
  /** Said plainly next to the choice. */
  note: string;
  /** True when the file is already in this format and downloads as it is. */
  direct: boolean;
}

let mp3Ready = false;
const ensureMp3 = () => {
  if (mp3Ready) return;
  // Browsers can't make MP3 themselves; this adds an encoder that runs on the device.
  if (typeof registerMp3Encoder === 'function') registerMp3Encoder();
  mp3Ready = true;
};

const extensionOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

/** What the file already is, judged from its type and name. */
function containerOf(type: string, name: string): string {
  const ext = extensionOf(name);
  if (/mpeg|mp3/.test(type) || ext === 'mp3') return 'mp3';
  if (/wav/.test(type) || ext === 'wav') return 'wav';
  if (/webm/.test(type) || ext === 'webm') return 'webm';
  if (/audio\/(mp4|aac|x-m4a)/.test(type) || ext === 'm4a') return 'm4a';
  if (/video\/(mp4|quicktime)/.test(type) || ext === 'mp4' || ext === 'mov') return 'mp4';
  return ext;
}

/**
 * What can actually be produced here, in the order a student most likely wants: the default
 * (MP3 for audio, MP4 for video) first, then the original, then the rest.
 */
export async function exportChoices(blob: Blob, name: string, looksLikeVideo: boolean): Promise<{ choices: ExportChoice[]; isVideo: boolean }> {
  const already = containerOf(blob.type, name);
  // A .webm can hold sound alone, so the file itself decides whether this is a video.
  let isVideo = looksLikeVideo;
  try {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    isVideo = (await input.getVideoTracks()).length > 0;
  } catch {
    // Unreadable here; the file's type stands, and conversion will say so if it can't proceed.
  }
  const canAudio = async (codec: AudioCodec) => {
    try { return await canEncodeAudio(codec); } catch { return false; }
  };
  const canVideo = async (codec: VideoCodec) => {
    try { return await canEncodeVideo(codec); } catch { return false; }
  };
  ensureMp3();
  const [mp3, aac, opus, avc, vp9, vp8] = await Promise.all([
    canAudio('mp3'), canAudio('aac'), canAudio('opus'), canVideo('avc'), canVideo('vp9'), canVideo('vp8'),
  ]);
  const choices: ExportChoice[] = [];
  const add = (format: ExportFormat, label: string, extension: string, possible: boolean, note: string) => {
    const direct = already === format;
    if (direct || possible) choices.push({ format, label, extension, note: direct ? 'Already in this format, so it downloads as it is.' : note, direct });
  };
  if (isVideo) {
    add('mp4', 'MP4 (H.264 + AAC)', 'mp4', avc && aac, 'Plays almost everywhere. Made on this device; longer videos take a while.');
    add('webm', 'WebM', 'webm', (vp9 || vp8) && opus, 'Smaller files; plays in browsers and VLC, not always in Apple apps.');
    add('mp3', 'Audio only (MP3)', 'mp3', mp3, 'Just the sound, for listening on the go.');
  } else {
    add('mp3', 'MP3', 'mp3', mp3, 'Plays almost everywhere.');
    add('m4a', 'M4A (AAC)', 'm4a', aac, 'Good quality at a small size; plays on Apple devices and most others.');
    add('wav', 'WAV', 'wav', true, 'Uncompressed, so the file is large. Useful for editing.');
  }
  choices.push({ format: 'original', label: `Original (${already.toUpperCase() || 'as recorded'})`, extension: extensionOf(name) || already, note: 'Exactly as it was recorded, unchanged.', direct: true });
  return { choices, isVideo };
}

/** A filename that keeps the recording's name and gets the right ending. */
export function exportName(name: string, choice: ExportChoice): string {
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${base || 'Recording'}.${choice.extension}`;
}

const formatFor = (format: ExportFormat): OutputFormat => {
  switch (format) {
    case 'mp3': return new Mp3OutputFormat();
    case 'wav': return new WavOutputFormat();
    case 'webm': return new WebMOutputFormat();
    // An M4A is an MP4 holding only sound. 'in-memory' puts the index first, so players can start
    // before the whole file is read.
    default: return new Mp4OutputFormat({ fastStart: 'in-memory' });
  }
};

const TYPES: Record<ExportFormat, string> = {
  original: '', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm',
};

/**
 * Produces the file. Progress runs from 0 to 1. Cancelling stops it cleanly; nothing is kept.
 * Throws with a sentence fit to show the student if the file can't be made.
 */
export async function exportRecording(
  blob: Blob, choice: ExportChoice, onProgress: (share: number) => void, signal: AbortSignal,
): Promise<Blob> {
  if (choice.direct) return blob;
  ensureMp3();
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  const output = new Output({ format: formatFor(choice.format), target: new BufferTarget() });
  const audioOnly = ['mp3', 'm4a', 'wav'].includes(choice.format);
  const audioCodec: AudioCodec | undefined = choice.format === 'mp3' ? 'mp3'
    : choice.format === 'wav' ? 'pcm-s16'
      : choice.format === 'webm' ? 'opus' : 'aac';
  const conversion = await Conversion.init({
    input,
    output,
    video: audioOnly ? { discard: true } : { codec: choice.format === 'webm' ? ((await canEncodeVideo('vp9')) ? 'vp9' : 'vp8') : 'avc', bitrate: QUALITY_HIGH },
    audio: { codec: audioCodec, ...(choice.format === 'wav' ? {} : { bitrate: QUALITY_HIGH }) },
  });
  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks.map((entry) => entry.reason).join(', ');
    throw new Error(`This browser can't turn this recording into ${choice.label}${reasons ? ` (${reasons})` : ''}. The original is still available.`);
  }
  // A track that would silently go missing (say, the sound of a video) means the file would be wrong.
  const lost = conversion.discardedTracks.filter((entry) => !(audioOnly && entry.track.type === 'video'));
  if (lost.length) throw new Error(`Part of this recording couldn't be converted to ${choice.label}. The original is still available.`);
  conversion.onProgress = (share) => onProgress(share);
  const stop = () => { void conversion.cancel(); };
  signal.addEventListener('abort', stop, { once: true });
  try {
    await conversion.execute();
  } catch (error) {
    if (error instanceof ConversionCanceledError || signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    throw new Error(`Converting to ${choice.label} didn't finish. The original is still available.`);
  } finally {
    signal.removeEventListener('abort', stop);
  }
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer || buffer.byteLength === 0) throw new Error(`Converting to ${choice.label} made an empty file, so it wasn't offered. The original is still available.`);
  return new Blob([buffer], { type: TYPES[choice.format] });
}
