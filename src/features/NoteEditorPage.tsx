import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { applyFormat, applyToBox, NoteToolbar } from '../components/NoteToolbar';
import { continueList } from '../data/noteFormat';
import { equationInsertPoint } from '../data/equationTemplates';

// The calculator loads only when it's opened, so notes stay quick.
const CalculatorPanel = lazy(() => import('../components/CalculatorPanel'));
import { NoteView } from '../components/NoteView';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useStillHere } from '../components/useStillHere';
import { deleteNote, getNote, NoteConflict, saveNote } from '../data/notes';
import { getMaterial, listCourses, listTopics } from '../data/store';
import type { Note } from '../data/types';
import { useLive } from '../data/useLive';

type Status = 'loading' | 'blank' | 'unsaved' | 'saving' | 'saved' | 'failed' | 'conflict';
const SAVE_DELAY_MS = 600;

const STATUS_TEXT: Partial<Record<Status, string>> = {
  blank: 'Saves as you type',
  unsaved: 'Saving soon…',
  saving: 'Saving…',
  saved: 'Saved',
};

interface Draft {
  title: string;
  body: string;
  courseId: string | null;
  topicId: string | null;
  materialId: string | null;
}

/** Where a brand-new note is filed. An existing note keeps wherever it already is. */
export interface NoteStart {
  courseId: string | null;
  topicId: string | null;
  materialId: string | null;
}

/**
 * The note editor, on its own page or in a panel beside a file. Both use this one component, so
 * saving as you type, the other-tab conflict check and the save on leaving behave identically.
 */
export function NoteEditor({ id, start, panel = false, onDeleted }: {
  id: string;
  start: NoteStart;
  /** Beside a file: no page padding, and no line pointing back at the file already on screen. */
  panel?: boolean;
  onDeleted: (where: { courseId: string | null }) => void;
}) {
  const [previewing, setPreviewing] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const bodyBox = useRef<HTMLTextAreaElement>(null);
  const stillHere = useStillHere();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [failure, setFailure] = useState('');
  const [other, setOther] = useState<Note | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const latest = useRef<Draft | null>(null);
  const version = useRef<number | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const conflicted = useRef(false);

  /** Saves one at a time, so a slow save can't land on top of a newer one. */
  const flush = useCallback((force = false) => {
    clearTimeout(timer.current);
    if (!dirty.current || !latest.current) return queue.current;
    const snapshot = latest.current;
    dirty.current = false;
    queue.current = queue.current.then(async () => {
      setStatus('saving');
      try {
        version.current = await saveNote({ id, ...snapshot }, force ? 'force' : version.current);
        conflicted.current = false;
        setOther(null);
        setFailure('');
        setStatus(dirty.current ? 'unsaved' : 'saved');
      } catch (error) {
        dirty.current = true;
        if (error instanceof NoteConflict) {
          conflicted.current = true;
          setOther(error.current);
          setStatus('conflict');
        } else {
          setFailure((error as Error).message);
          setStatus('failed');
        }
      }
    });
    return queue.current;
  }, [id]);

  useEffect(() => {
    let active = true;
    void getNote(id).then((note) => {
      if (!active) return;
      const loaded: Draft = note
        ? { title: note.title, body: note.body, courseId: note.courseId, topicId: note.topicId, materialId: note.materialId }
        : { title: '', body: '', ...start };
      version.current = note?.updatedAt ?? null;
      latest.current = loaded;
      setDraft(loaded);
      setStatus(note ? 'saved' : 'blank');
    }).catch((error: Error) => {
      if (active) {
        setFailure(error.message);
        setStatus('failed');
      }
    });
    return () => {
      active = false;
      // Leaving with an unresolved conflict keeps this version as its own note, so nothing is lost.
      void flush().then(() => {
        const unsaved = latest.current;
        if (!dirty.current || !unsaved || !conflicted.current) return;
        dirty.current = false;
        void saveNote({ id: crypto.randomUUID(), ...unsaved, title: `${unsaved.title || 'Untitled note'} (copy)` }, null);
      });
    };
    // Only reload when a different note opens. Where a new note is filed is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const saveNow = () => { if (document.visibilityState === 'hidden') void flush(); };
    const leave = () => void flush();
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault(); };
    document.addEventListener('visibilitychange', saveNow);
    window.addEventListener('pagehide', leave);
    window.addEventListener('beforeunload', warn);
    return () => {
      document.removeEventListener('visibilitychange', saveNow);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('beforeunload', warn);
    };
  }, [flush]);

  const change = (patch: Partial<Draft>) => {
    if (!latest.current) return;
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setDraft(next);
    dirty.current = true;
    setStatus((current) => (current === 'conflict' ? current : 'unsaved'));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  const { data: courses } = useLive(listCourses);
  const { data: topics } = useLive(() => (draft?.courseId ? listTopics(draft.courseId) : Promise.resolve([])), [draft?.courseId]);
  const { data: file } = useLive(() => (draft?.materialId ? getMaterial(draft.materialId) : Promise.resolve(undefined)), [draft?.materialId]);

  const frame = panel ? 'note-editor note-panel' : 'page note-editor';
  if (status === 'loading') return <p className={panel ? 'muted' : 'page muted'}>Loading…</p>;
  if (!draft) return <div className={panel ? 'note-panel' : 'page'}><h1>This note couldn't be opened</h1><p className="error" role="alert">{failure}</p><Link to="/notes">Go to Notes</Link></div>;

  const hasRecord = version.current !== null;
  return (
    <div className={frame}>
      <header className="viewer-head">
        <label className="note-title-label">Title
          <input className="note-title" value={draft.title} onChange={(event) => change({ title: event.target.value })} placeholder="Untitled note" />
        </label>
        <div className="row-actions">
          <span className="muted" role="status" data-testid="save-status">{STATUS_TEXT[status]}</span>
          {hasRecord && <button className="text-button danger-text" onClick={() => setConfirmDelete(true)}>Delete note</button>}
        </div>
      </header>

      {status === 'failed' && (
        <div className="error-box" role="alert">
          <strong>This note isn't saved.</strong> Your text is still here. Copy it somewhere safe if this keeps happening. {failure}
          <div><button className="button" onClick={() => void flush()}>Try saving again</button></div>
        </div>
      )}
      {status === 'conflict' && other && (
        <div className="error-box" role="alert" data-testid="note-conflict">
          <strong>This note changed in another tab.</strong> Choose which version to keep. The other version will be replaced.
          <div className="row-actions conflict-actions">
            <button className="button" onClick={() => void flush(true)}>Keep what's on this screen</button>
            <button
              className="button"
              onClick={() => {
                const loaded: Draft = { title: other.title, body: other.body, courseId: other.courseId, topicId: other.topicId, materialId: other.materialId };
                dirty.current = false;
                conflicted.current = false;
                clearTimeout(timer.current);
                version.current = other.updatedAt;
                latest.current = loaded;
                setDraft(loaded);
                setOther(null);
                setStatus('saved');
              }}
            >
              Use the other version
            </button>
          </div>
        </div>
      )}

      <div className="filing">
        <label>Course
          <select value={draft.courseId ?? ''} onChange={(event) => change({ courseId: event.target.value || null, topicId: null })}>
            <option value="">No course</option>
            {courses?.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
          </select>
        </label>
        {draft.courseId && (
          <label>Topic
            <select value={draft.topicId ?? ''} onChange={(event) => change({ topicId: event.target.value || null })}>
              <option value="">No topic</option>
              {topics?.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {file && !panel && <p>About <Link to={`/files/${file.id}`}>{file.name}</Link></p>}

      <div className="note-mode" role="group" aria-label="View">
        <button type="button" className="button" aria-pressed={!previewing} onClick={() => setPreviewing(false)}>Write</button>
        <button type="button" className="button" aria-pressed={previewing} onClick={() => setPreviewing(true)}>Preview</button>
        {!previewing && <NoteToolbar box={bodyBox} onChange={(body) => change({ body })} onCalculator={() => setCalculating((now) => !now)} calculatorOpen={calculating} />}
      </div>
      {previewing && <NoteView body={draft.body} />}
      <div className={calculating && !previewing ? 'note-with-calc' : 'note-alone'}>
      <label className="note-body-label" hidden={previewing}>Your note
        <textarea ref={bodyBox} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && !event.nativeEvent.isComposing) {
            const box = event.currentTarget;
            const next = continueList(box.value, box.selectionStart, box.selectionEnd);
            if (next) {
              event.preventDefault();
              applyToBox(box, next, (body) => change({ body }));
            }
            return;
          }
          if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
          const kind = event.key.toLowerCase() === 'b' ? 'bold' : event.key.toLowerCase() === 'i' ? 'italic' : null;
          if (kind) {
            event.preventDefault();
            applyFormat(event.currentTarget, kind, (body) => change({ body }));
          }
        }} autoFocus={!hasRecord} className="note-body" value={draft.body} onChange={(event) => change({ body: event.target.value })} />
      </label>
      {calculating && !previewing && (
        <Suspense fallback={<p className="muted">Opening the calculator…</p>}>
          <CalculatorPanel
            onClose={() => setCalculating(false)}
            onInsert={(tex) => {
              const box = bodyBox.current;
              if (!box) return;
              const at = equationInsertPoint(box.value, box.selectionEnd);
              const before = box.value.slice(0, at);
              const insert = `${before && !/\s$/.test(before) ? ' ' : ''}$${tex}$`;
              applyToBox(box, { from: at, to: at, insert, selectionStart: at + insert.length, selectionEnd: at + insert.length }, (body) => change({ body }));
            }}
          />
        </Suspense>
      )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this note?"
          confirmLabel="Delete note"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setConfirmDelete(false);
            dirty.current = false;
            clearTimeout(timer.current);
            try {
              await queue.current;
              await deleteNote(id);
              if (stillHere.current) onDeleted({ courseId: draft.courseId });
            } catch (error) {
              setFailure((error as Error).message);
              setStatus('failed');
            }
          }}
        >
          <p>This permanently removes the note from this device. It can't be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** A note on its own page, at /notes/:id. A new one is filed from the address it was opened with. */
export function NoteEditorPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return (
    <NoteEditor
      key={id}
      id={id}
      start={{ courseId: params.get('course'), topicId: params.get('topic'), materialId: params.get('file') }}
      onDeleted={({ courseId }) => navigate(courseId ? `/courses/${courseId}` : '/notes', { replace: true })}
    />
  );
}
