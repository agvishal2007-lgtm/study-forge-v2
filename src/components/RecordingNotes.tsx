import { useEffect, useState, type RefObject } from 'react';
import { addMomentNote, listNotes } from '../data/notes';
import { byMoment, exportMoments, formatStamp, isMomentNote, segmentAt, segmentForNote, type MomentNote } from '../data/momentRules';
import { getTranscript } from '../data/transcripts';
import type { Material } from '../data/types';
import { useLive } from '../data/useLive';
import { MomentNoteCard, TranscriptView } from './MomentNotes';

/**
 * Reviewing a recording: notes pinned to moments beside the timed transcript. Clicking a note plays
 * from that moment and shows its passage; clicking a passage shows its note. The recording file
 * itself is never changed.
 */
export function RecordingNotes({ material, media }: { material: Material; media: RefObject<HTMLMediaElement | null> }) {
  const { data } = useLive(async () => {
    const [notes, transcript] = await Promise.all([listNotes(), getTranscript(material.id)]);
    return { notes: notes.filter((note) => note.materialId === material.id), transcript };
  }, [material.id]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const segments = data?.transcript?.segments ?? [];
  const moments = byMoment((data?.notes ?? []).filter(isMomentNote));

  // While it plays, the passage being spoken is marked, so transcript and sound stay together.
  useEffect(() => {
    const element = media.current;
    if (!element || segments.length === 0) return;
    const follow = () => { if (following) setHighlight(segmentAt(segments, element.currentTime * 1000)?.id ?? null); };
    element.addEventListener('timeupdate', follow);
    return () => element.removeEventListener('timeupdate', follow);
  }, [media, segments, following]);

  const playFrom = (ms: number) => {
    const element = media.current;
    if (!element) return;
    element.currentTime = ms / 1000;
    void element.play().catch(() => undefined);
  };

  const jump = (note: MomentNote) => {
    playFrom(note.atMs);
    setHighlight(segmentForNote(note, segments)?.id ?? null);
    setActiveNotes([note.id]);
    setFollowing(true);
  };

  const pin = async (atMs: number, quote = '', segmentId: string | null = null) => {
    const note = await addMomentNote({ materialId: material.id, courseId: material.courseId, topicId: material.topicId }, atMs, quote, segmentId);
    setFresh(note.id);
  };

  const download = (format: 'md' | 'txt') => {
    const text = exportMoments(material.name, moments, segments, format);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: format === 'md' ? 'text/markdown' : 'text/plain' }));
    link.download = `${material.name.replace(/\.[^.]+$/, '')} notes.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return (
    <section className="file-notes recording-notes" aria-labelledby="moments-heading" data-testid="recording-notes">
      <h2 id="moments-heading">Notes at moments</h2>
      <div className="row-actions">
        <button type="button" className="button primary" data-testid="note-current" onClick={() => void pin((media.current?.currentTime ?? 0) * 1000)}>Note at {formatStamp((media.current?.currentTime ?? 0) * 1000)}</button>
        {moments.length > 0 && (
          <>
            <button type="button" className="button" onClick={() => download('md')}>Download notes (.md)</button>
            <button type="button" className="button" onClick={() => download('txt')}>Download notes (.txt)</button>
            <button type="button" className="button" onClick={() => { document.documentElement.classList.add('printing-notes'); window.print(); document.documentElement.classList.remove('printing-notes'); }}>Print or save as PDF</button>
          </>
        )}
      </div>
      <div className="review-layout">
        {segments.length > 0 ? (
          <div>
            <h3 className="small-heading">Transcript</h3>
            <TranscriptView
              segments={segments}
              notes={moments}
              highlightId={highlight}
              onAddNote={(atMs, quote, segmentId) => void pin(atMs, quote, segmentId)}
              onSegment={(segment) => {
                playFrom(segment.startMs);
                setHighlight(segment.id);
                setActiveNotes(moments.filter((note) => segmentForNote(note, segments)?.id === segment.id).map((note) => note.id));
              }}
              emptyText=""
            />
            <p className="muted small">Select words, then Add note, or tap + Note. Tap a time to play from there and see its notes.</p>
          </div>
        ) : (
          <p className="muted small">No timed transcript yet. You can still pin notes to the moment the player is at. Making a transcript lets you attach notes to exact words.</p>
        )}
        <div>
          <h3 className="small-heading">{moments.length === 0 ? 'No notes at moments yet' : `${moments.length} ${moments.length === 1 ? 'note' : 'notes'}, in lecture order`}</h3>
          <ul className="plain-list moment-list" data-testid="moment-notes">
            {moments.map((note) => (
              <MomentNoteCard key={note.id} note={note} segments={segments} active={activeNotes.includes(note.id)} focus={note.id === fresh} onJump={jump} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
