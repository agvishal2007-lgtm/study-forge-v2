import { lazy, Suspense, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { NewNoteButton, NoteList } from '../components/NoteList';
import { NoteEditor } from './NoteEditorPage';
import { listNotes } from '../data/notes';
import { useStillHere } from '../components/useStillHere';
import { readBlob } from '../data/blobs';
import { formatBytes, KIND_LABEL, kindOf, olderOfficeAdvice } from '../data/format';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { LINK_CATEGORY_LABEL, siteOf } from '../data/linkRules';
import { addResourceLink, fileMaterial, getCourse, getMaterial, listAllCourses, listResourceLinks, listTopics, removeResourceLink, setMaterialStatus, setPinned } from '../data/store';
import type { Material } from '../data/types';
import { TranscriptPanel } from './TranscriptPanel';
import { useLive } from '../data/useLive';

const PdfViewer = lazy(() => import('./PdfViewer').then((module) => ({ default: module.PdfViewer })));
const OfficeViewer = lazy(() => import('./OfficeViewer').then((module) => ({ default: module.OfficeViewer })));
const OpenDocViewer = lazy(() => import('./OpenDocViewer').then((module) => ({ default: module.OpenDocViewer })));
const TEXT_LIMIT = 2 * 1024 * 1024;

function TextView({ blob }: { blob: Blob }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void blob.slice(0, TEXT_LIMIT).text().then((value) => active && setText(value));
    return () => { active = false; };
  }, [blob]);
  if (text === null) return <p className="muted">Opening file…</p>;
  return (
    <>
      {blob.size > TEXT_LIMIT && <p className="notice">Showing the first 2 MB. Download the file to see all of it.</p>}
      <pre className="text-view" tabIndex={0}>{text}</pre>
    </>
  );
}

function ImageView({ url, name }: { url: string; name: string }) {
  const [zoom, setZoom] = useState(1);
  return (
    <>
      <div className="tools" role="group" aria-label="Image controls">
        <button className="button" disabled={zoom <= 0.5} onClick={() => setZoom(zoom - 0.25)} aria-label="Zoom out">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="button" disabled={zoom >= 3} onClick={() => setZoom(zoom + 0.25)} aria-label="Zoom in">+</button>
      </div>
      <div className="pdf-stage"><img src={url} alt={name} style={{ width: `${zoom * 100}%` }} /></div>
    </>
  );
}

/** Browser recordings often don't state their length, which breaks the seek bar until it's measured. */
function measureLength(event: SyntheticEvent<HTMLMediaElement>) {
  const media = event.currentTarget;
  if (Number.isFinite(media.duration)) return;
  media.addEventListener('timeupdate', () => { media.currentTime = 0; }, { once: true });
  media.currentTime = 1e101;
}

function Filing({ material }: { material: Material }) {
  const { data } = useLive(async () => ({
    courses: await listAllCourses(),
    topics: material.courseId ? await listTopics(material.courseId) : [],
    links: await listResourceLinks(material.id),
  }), [material.courseId, material.id]);
  const [failure, setFailure] = useState('');
  const [alsoCourse, setAlsoCourse] = useState('');
  const { data: alsoTopics } = useLive(() => (alsoCourse ? listTopics(alsoCourse) : Promise.resolve([])), [alsoCourse]);
  const move = (courseId: string | null, topicId: string | null) => {
    setFailure('');
    fileMaterial(material.id, courseId, topicId).catch((error: Error) => setFailure(`The file wasn't moved. ${error.message}`));
  };
  if (!data) return null;
  const nameOf = (courseId: string) => data.courses.find((course) => course.id === courseId)?.name ?? 'a course';
  return (
    <div className="filing">
      <label>Course
        <select value={material.courseId ?? ''} onChange={(event) => move(event.target.value || null, null)}>
          <option value="">No course</option>
          {data.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
        </select>
      </label>
      {material.courseId && (
        <label>Topic
          <select value={material.topicId ?? ''} onChange={(event) => move(material.courseId, event.target.value || null)}>
            <option value="">No topic</option>
            {data.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
          </select>
        </label>
      )}

      <div className="also-in" data-testid="also-in">
        <h2>Also in</h2>
        <p className="muted small">
          The same file or link can belong to more than one course or topic. Nothing is copied, and taking it out of
          one place never removes it from the others or deletes it.
        </p>
        {data.links.length > 0
          ? (
            <ul className="plain-list">
              {data.links.map((link) => (
                <li key={link.id}>
                  <span>{nameOf(link.courseId)}<TopicName courseId={link.courseId} topicId={link.topicId} /></span>
                  <button
                    className="text-button danger-text"
                    onClick={() => void removeResourceLink(link.id)}
                    aria-label={`Take it out of ${nameOf(link.courseId)}`}
                  >
                    Take it out
                  </button>
                </li>
              ))}
            </ul>
          )
          : <p className="muted">Only where it is filed above.</p>}
        <div className="also-add">
          <label>Add it to
            <select value={alsoCourse} onChange={(event) => setAlsoCourse(event.target.value)}>
              <option value="">Choose a course</option>
              {data.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            </select>
          </label>
          {alsoCourse && (
            <label>Topic (optional)
              <select
                onChange={(event) => {
                  const chosen = event.target.value;
                  if (!chosen) return;
                  void addResourceLink(material.id, alsoCourse, chosen === '__course__' ? null : chosen);
                  setAlsoCourse('');
                }}
                defaultValue=""
              >
                <option value="" disabled>Choose, or add to the whole course</option>
                <option value="__course__">The whole course</option>
                {(alsoTopics ?? []).map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>
      {failure && <p className="error" role="alert">{failure}</p>}
    </div>
  );
}

/** The name of a topic inside another course, looked up on its own so the list stays simple. */
function TopicName({ courseId, topicId }: { courseId: string; topicId: string | null }) {
  const { data } = useLive(() => (topicId ? listTopics(courseId) : Promise.resolve([])), [courseId, topicId]);
  if (!topicId) return null;
  const topic = data?.find((candidate) => candidate.id === topicId);
  return <span className="muted"> · {topic?.name ?? 'a topic'}</span>;
}

export default function ViewerPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const startPage = Number(params.get('page')) || 1;
  // The note open beside the file. It lives in the address, so reloading keeps the same pair open.
  const beside = params.get('note');
  // On a phone the two can't both fit, so one shows at a time. Both stay open underneath, so
  // switching keeps the place in each.
  const [pane, setPane] = useState<'file' | 'note'>('file');
  const openBeside = (noteId: string | null) => {
    const next = new URLSearchParams(params);
    if (noteId) next.set('note', noteId);
    else next.delete('note');
    setParams(next, { replace: true });
    setPane(noteId ? 'note' : 'file');
  };
  const navigate = useNavigate();
  const stage = useRef<HTMLDivElement>(null);
  const stillHere = useStillHere();
  const [failure, setFailure] = useState('');
  const [viewFailure, setViewFailure] = useState('');
  const [full, setFull] = useState(false);
  const { data: material, loading } = useLive(() => getMaterial(id), [id]);
  const { data: blob, error: blobError, loading: blobLoading } = useLive(() => readBlob(id), [id]);
  const [url, setUrl] = useState<string | null>(null);
  const { data: notes } = useLive(async () => (await listNotes()).filter((note) => note.materialId === id), [id]);

  // Files read back from storage lose their type, and some browsers need it to play them.
  const mimeType = material?.mimeType;
  useEffect(() => {
    if (!blob) return;
    const created = URL.createObjectURL(blob.type || !mimeType ? blob : blob.slice(0, blob.size, mimeType));
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [blob, mimeType]);

  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  // The trail back up: through its course when it has one, otherwise through the Library.
  const { data: owner } = useLive(
    async () => (material?.courseId ? (await getCourse(material.courseId)) ?? null : null),
    [material?.courseId],
  );

  if (loading && !material) return <p className="page muted">Loading…</p>;
  if (!material) return <div className="page"><h1>This file isn't here</h1><p>It may have been deleted.</p><Link to="/library">Go to Library</Link></div>;

  const trailFor = (name: string) => (owner
    ? [{ label: 'Courses', to: '/courses' }, { label: owner.name, to: `/courses/${owner.id}` }, { label: name }]
    : [{ label: 'Library', to: '/library' }, { label: name }]);

  if (material.kind === 'link') {
    const leaveForBin = async () => {
      try {
        const destination = material.courseId ? `/courses/${material.courseId}` : '/library';
        await setMaterialStatus(material.id, 'trashed');
        if (stillHere.current) navigate(destination, { replace: true });
      } catch (error) {
        setFailure(`The link wasn't moved. ${(error as Error).message}`);
      }
    };
    return (
      <div className="page viewer">
        <Breadcrumbs trail={trailFor(material.name)} />
        <header className="viewer-head">
          <div>
            <h1>{material.name}</h1>
            <p className="muted">{LINK_CATEGORY_LABEL[material.category]}{siteOf(material.url) && ` · ${siteOf(material.url)}`}</p>
          </div>
          <div className="row-actions">
            <a className="button" href={material.url} target="_blank" rel="noopener noreferrer">Open in a new tab</a>
            <button className="text-button danger-text" onClick={() => void leaveForBin()}>Move to bin</button>
          </div>
        </header>
        {failure && <p className="error" role="alert">{failure}</p>}
        <p className="notice" data-testid="link-notice">
          This is a saved address, not a copy of the page. Study Forge has not downloaded or imported anything behind
          it, a site that needs your login will still ask for it, and removing this link never changes or deletes the
          original.
        </p>
        <p className="link-address"><a href={material.url} target="_blank" rel="noopener noreferrer">{material.url}</a></p>
        <Filing material={material} />
        <section className="file-notes" aria-labelledby="file-notes-heading">
          <h2 id="file-notes-heading">Notes on this link</h2>
          <NewNoteButton courseId={material.courseId} topicId={material.topicId} materialId={material.id} />
          {notes && notes.length > 0 && <NoteList notes={notes} />}
        </section>
      </div>
    );
  }

  const kind = kindOf(material);
  const fallback = (reason: string) => (
    <div className="notice" data-testid="viewer-fallback">
      <p>{reason}</p>
      {url && <a className="button" href={url} download={material.name}>Download {material.name}</a>}
    </div>
  );
  const fail = (what: string) => setViewFailure(what);

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    } catch {
      // Some phones don't allow full screen for page content, so use the whole window.
      setFull((value) => !value);
    }
  };

  let body;
  if (blobLoading && !blob) body = <p className="muted">Opening file…</p>;
  else if (blobError) body = <p className="error" role="alert">This file couldn't be read. {blobError.message}</p>;
  else if (!blob) body = <p className="error" role="alert">This file is no longer on this device. The browser may have cleared it, or it was deleted in another tab.</p>;
  else if (viewFailure) body = fallback(`Study Forge couldn't display this ${KIND_LABEL[kind].toLowerCase()} file, but the original is safe. You can download it and open it in another app.`);
  else if (kind === 'pdf') body = <Suspense fallback={<p className="muted">Opening PDF…</p>}><PdfViewer key={startPage} initialPage={startPage} blob={blob} onFail={fail} /></Suspense>;
  else if (kind === 'word' || kind === 'sheet' || kind === 'slides') body = <Suspense fallback={<p className="muted">Opening file…</p>}><OfficeViewer kind={kind} blob={blob} onFail={fail} /></Suspense>;
  else if (kind === 'opendoc' || kind === 'ebook') body = <Suspense fallback={<p className="muted">Opening file…</p>}><OpenDocViewer blob={blob} name={material.name} materialId={material.id} onFail={fail} /></Suspense>;
  else if (kind === 'code') body = <TextView blob={blob} />;
  else if (!url) body = kind === 'text' ? <TextView blob={blob} /> : <p className="muted">Opening file…</p>;
  else if (kind === 'image') body = <ImageView url={url} name={material.name} />;
  else if (kind === 'audio') body = <audio controls src={url} data-testid="audio-player" onLoadedMetadata={measureLength} onError={() => fail('audio')} />;
  else if (kind === 'video') body = <video controls playsInline src={url} data-testid="video-player" onLoadedMetadata={measureLength} onError={() => fail('video')} />;
  else if (kind === 'text') body = <TextView blob={blob} />;
  else if (olderOfficeAdvice(material.name)) body = fallback(olderOfficeAdvice(material.name));
  else body = fallback("Study Forge can't display this file type yet, but the original is safe. You can download it and open it in another app.");

  return (
    <div className="page viewer">
      <Breadcrumbs trail={trailFor(material.name)} />
      <header className="viewer-head">
        <div>
          <h1>{material.name}</h1>
          <p className="muted">{KIND_LABEL[kind]}, {formatBytes(material.size)}</p>
        </div>
        <div className="row-actions">
          {url && <a className="button" href={url} download={material.name}>Download</a>}
          <button className="button" aria-pressed={Boolean(material.pinnedAt)} onClick={() => void setPinned(material.id, !material.pinnedAt)}>
            {material.pinnedAt ? 'Unpin' : 'Pin'}
          </button>
          <button
            className="text-button danger-text"
            onClick={async () => {
              try {
                const destination = material.courseId ? `/courses/${material.courseId}` : '/library';
                await setMaterialStatus(material.id, 'trashed');
                if (stillHere.current) navigate(destination, { replace: true });
              } catch (error) {
                setFailure(`The file wasn't moved. ${(error as Error).message}`);
              }
            }}
          >
            Move to bin
          </button>
        </div>
      </header>
      <Filing material={material} />
      {beside && (
        <div className="pane-switch" role="group" aria-label="Show">
          <button type="button" className="button" aria-pressed={pane === 'file'} onClick={() => setPane('file')}>File</button>
          <button type="button" className="button" aria-pressed={pane === 'note'} onClick={() => setPane('note')}>Notes</button>
        </div>
      )}
      <div className={beside ? `workspace-split showing-${pane}` : undefined}>
        <div ref={stage} className={full ? 'stage full' : 'stage'}>
          {blob && <button className="button stage-toggle" onClick={() => void toggleFull()}>{full ? 'Exit full screen' : 'Full screen'}</button>}
          {body}
        </div>
        {beside && (
          <aside className="beside" aria-label="Notes beside this file">
            <div className="beside-head">
              <h2>Notes beside this file</h2>
              <button className="text-button" onClick={() => openBeside(null)}>Close notes</button>
            </div>
            {notes && notes.length > 1 && (
              <label className="beside-pick">Open note
                <select value={beside} onChange={(event) => openBeside(event.target.value)}>
                  {notes.map((note) => <option key={note.id} value={note.id}>{note.title || 'Untitled note'}</option>)}
                  {!notes.some((note) => note.id === beside) && <option value={beside}>New note</option>}
                </select>
              </label>
            )}
            <NoteEditor
              key={beside}
              id={beside}
              panel
              start={{ courseId: material.courseId, topicId: material.topicId, materialId: material.id }}
              onDeleted={() => openBeside(null)}
            />
          </aside>
        )}
      </div>
      {failure && <p className="error" role="alert">{failure}</p>}
      {(kind === 'audio' || kind === 'video') && blob && <TranscriptPanel material={material} blob={blob} />}
      <section className="file-notes" aria-labelledby="file-notes-heading">
        <h2 id="file-notes-heading">Notes on this file</h2>
        <div className="row-actions">
          <button className="button primary" onClick={() => openBeside(crypto.randomUUID())}>Write notes beside this</button>
          {notes && notes.length > 0 && !beside && (
            <button className="button" onClick={() => openBeside(notes[0].id)}>Open the latest beside it</button>
          )}
          <NewNoteButton courseId={material.courseId} topicId={material.topicId} materialId={material.id} label="New note on its own page" />
        </div>
        {notes && notes.length > 0 && <NoteList notes={notes} />}
      </section>
    </div>
  );
}
