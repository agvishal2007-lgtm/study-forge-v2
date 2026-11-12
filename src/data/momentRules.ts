import type { Note, TranscriptSegment } from './types';

/*
 * Notes pinned to moments in a recording (Genio-style). Pure rules, so they can be tested directly.
 */

export type MomentNote = Note & { atMs: number };

export const isMomentNote = (note: Note): note is MomentNote => typeof note.atMs === 'number';

/** 0:07, 12:05 or 1:02:09, the way a media player shows time. */
export function formatStamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** The passage being spoken at a moment, or the nearest one before it. */
export function segmentAt(segments: TranscriptSegment[], ms: number): TranscriptSegment | null {
  let found: TranscriptSegment | null = null;
  for (const segment of segments) {
    if (segment.startMs <= ms) found = segment;
    else break;
  }
  return found;
}

/**
 * The passage a note belongs to. Its own passage if that still exists; if the transcript was made
 * again, whichever passage now covers the note's moment. The note's time never changes.
 */
export function segmentForNote(note: Pick<Note, 'atMs' | 'segmentId'>, segments: TranscriptSegment[]): TranscriptSegment | null {
  if (note.segmentId) {
    const same = segments.find((segment) => segment.id === note.segmentId);
    if (same) return same;
  }
  return typeof note.atMs === 'number' ? segmentAt(segments, note.atMs) : null;
}

/** Notes in the order they happened in the lecture; notes made at the same moment by when they were written. */
export const byMoment = (notes: MomentNote[]) => [...notes].sort((a, b) => a.atMs - b.atMs || a.createdAt - b.createdAt);

/** Where a chosen bit of transcript text falls, so a note on it gets the right moment. */
export function momentOfSelection(segment: TranscriptSegment, text: string, chosen: string): number {
  const at = chosen ? text.indexOf(chosen) : -1;
  if (at <= 0 || text.length === 0) return segment.startMs;
  // Assume steady speech across the passage: good enough to land within a few seconds.
  return Math.round(segment.startMs + (segment.endMs - segment.startMs) * (at / text.length));
}

/** Notes with their timestamps and the words they were attached to, ready to save as a file. */
export function exportMoments(title: string, notes: MomentNote[], segments: TranscriptSegment[], format: 'md' | 'txt'): string {
  const lines: string[] = [format === 'md' ? `# ${title}` : title, '', format === 'md' ? '_Notes with timestamps from Study Forge_' : 'Notes with timestamps from Study Forge', ''];
  for (const note of byMoment(notes)) {
    const quote = note.quote || segmentForNote(note, segments)?.text || '';
    lines.push(format === 'md' ? `## ${formatStamp(note.atMs)}` : `[${formatStamp(note.atMs)}]`);
    if (quote) lines.push(format === 'md' ? `> ${quote.replace(/\n/g, '\n> ')}` : `  "${quote}"`);
    lines.push(note.body.trim() || '(no note written)', '');
  }
  if (notes.length === 0) lines.push('No timestamped notes yet.');
  return lines.join('\n');
}
