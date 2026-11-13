import { useEffect, useRef, useState } from 'react';
import { deleteNote, getNote, saveNote } from '../data/notes';
import { formatStamp, momentOfSelection, segmentForNote, type MomentNote } from '../data/momentRules';
import type { TranscriptSegment } from '../data/types';
import { continueList } from '../data/noteFormat';
import { applyToBox } from './NoteToolbar';

/** One note pinned to a moment. It saves by itself while the student types. */
export function MomentNoteCard({ note, segments, active, focus, onJump }: {
  note: MomentNote;
  segments: TranscriptSegment[];
  active?: boolean;
  focus?: boolean;
  onJump?: (note: MomentNote) => void;
}) {
  const [text, setText] = useState(note.body);
  const [state, setState] = useState<'saved' | 'saving' | 'failed'>('saved');
  const [confirming, setConfirming] = useState(false);
  const version = useRef(note.updatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (focus) box.current?.focus(); }, [focus]);
  // Saves whatever is typed when the card goes away, so leaving mid-sentence loses nothing.
  const pending = useRef<string | null>(null);
  const save = async (body: string) => {
    pending.current = null;
    setState('saving');
    try {
      const current = await getNote(note.id);
      if (!current) return;
      version.current = await saveNote({ ...current, body }, version.current === current.updatedAt ? current.updatedAt : 'force');
      setState('saved');
    } catch {
      setState('failed');
    }
  };
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (pending.current !== null) void save(pending.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const change = (body: string) => {
    setText(body);
    pending.current = body;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(body), 500);
  };
  const quote = note.quote || segmentForNote(note, segments)?.text || '';
  return (
    <li className="moment-card" data-testid="moment-note" data-active={active ? 'true' : undefined} data-at={note.atMs}>
      <div className="moment-head">
        {onJump
          ? <button type="button" className="moment-stamp" onClick={() => onJump(note)} aria-label={`Play from ${formatStamp(note.atMs)}`}>▶ {formatStamp(note.atMs)}</button>
          : <span className="moment-stamp">{formatStamp(note.atMs)}</span>}
        <span className="muted small" role="status">{state === 'saving' ? 'Saving…' : state === 'failed' ? 'Not saved yet, will retry as you type' : 'Saved'}</span>
      </div>
      {quote && <blockquote className="moment-quote">{quote}</blockquote>}
      <label className="sr-only" htmlFor={`moment-${note.id}`}>Note at {formatStamp(note.atMs)}</label>
      <textarea id={`moment-${note.id}`} ref={box} rows={3} value={text} placeholder="Your note about this moment" onChange={(event) => change(event.target.value)} onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return;
        const next = continueList(event.currentTarget.value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
        if (next) { event.preventDefault(); applyToBox(event.currentTarget, next, change); }
      }} />
      <div className="row-actions">
        {confirming ? (
          <>
            <span className="small">Move this note to Trash?</span>
            <button type="button" className="button danger" onClick={() => void deleteNote(note.id)}>Delete</button>
            <button type="button" className="button" onClick={() => setConfirming(false)}>Keep</button>
          </>
        ) : <button type="button" className="text-button danger-text" onClick={() => setConfirming(true)}>Delete note</button>}
      </div>
    </li>
  );
}

/**
 * A transcript a student can read and pin notes to. While live, it follows the newest words unless
 * the student scrolls back or picks something, and new words never disturb what they're doing.
 */
export function TranscriptView({ segments, notes, live, highlightId, onAddNote, onSegment, emptyText }: {
  segments: TranscriptSegment[];
  notes: MomentNote[];
  live?: boolean;
  highlightId?: string | null;
  onAddNote: (atMs: number, quote: string, segmentId: string) => void;
  onSegment?: (segment: TranscriptSegment) => void;
  emptyText: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [picked, setPicked] = useState<{ segment: TranscriptSegment; text: string } | null>(null);
  const annotated = new Set(notes.map((note) => segmentForNote(note, segments)?.id).filter(Boolean));

  useEffect(() => {
    if (live && following && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [segments.length, live, following]);

  useEffect(() => {
    if (!highlightId || !list.current) return;
    list.current.querySelector(`[data-segment-id="${CSS.escape(highlightId)}"]`)?.scrollIntoView({ block: 'center' });
  }, [highlightId]);

  /** Reading back pauses following; the transcript itself keeps growing. */
  const scrolled = () => {
    const el = list.current;
    if (!el || !live) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (!atBottom && following) setFollowing(false);
  };

  const choose = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (!text || !selection?.anchorNode) return;
    const element = (selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode.parentElement)?.closest('[data-segment-id]');
    const segment = segments.find((entry) => entry.id === element?.getAttribute('data-segment-id'));
    if (!segment) return;
    setPicked({ segment, text });
    if (live) setFollowing(false);
  };

  const add = (segment: TranscriptSegment, text: string) => {
    // A note on a whole passage keeps that passage's words, so it never loses its context.
    onAddNote(momentOfSelection(segment, segment.text, text), text || segment.text, segment.id);
    setPicked(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="transcript-live">
      <div className="transcript-scroll" ref={list} onScroll={scrolled} onMouseUp={choose} onTouchEnd={() => setTimeout(choose, 50)} onKeyUp={choose} data-testid="transcript-view" tabIndex={0} aria-label="Transcript">
        {segments.length === 0 && <p className="muted">{emptyText}</p>}
        {segments.map((segment) => (
          <p key={segment.id} className="transcript-segment" data-segment-id={segment.id} data-annotated={annotated.has(segment.id) ? 'true' : undefined} data-highlight={highlightId === segment.id ? 'true' : undefined}>
            <button type="button" className="segment-stamp" onClick={() => onSegment?.(segment)} aria-label={`${formatStamp(segment.startMs)}${annotated.has(segment.id) ? ', has a note' : ''}`}>{formatStamp(segment.startMs)}</button>{' '}
            <span className="segment-text">{segment.text}</span>{' '}
            <button type="button" className="text-button segment-note" onClick={() => add(segment, '')} aria-label={`Add a note at ${formatStamp(segment.startMs)}`}>+ Note</button>
          </p>
        ))}
      </div>
      {picked && (
        <div className="picked-bar" role="status" data-testid="picked-bar">
          <span className="small">“{picked.text.length > 80 ? `${picked.text.slice(0, 80)}…` : picked.text}”</span>
          <button type="button" className="button primary" onClick={() => add(picked.segment, picked.text)}>Add note</button>
          <button type="button" className="text-button" onClick={() => setPicked(null)}>Cancel</button>
        </div>
      )}
      {live && !following && (
        <button type="button" className="button return-live" onClick={() => { setFollowing(true); setPicked(null); }} data-testid="return-live">Return to live ↓</button>
      )}
    </div>
  );
}
