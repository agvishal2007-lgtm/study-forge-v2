import { lazy, Suspense, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useStillHere } from '../components/useStillHere';
import { readBlob } from '../data/blobs';
import { formatBytes, KIND_LABEL, kindOf } from '../data/format';
import { deleteMaterial, fileMaterial, getMaterial, listCourses, listTopics } from '../data/store';
import type { Material } from '../data/types';
import { useLive } from '../data/useLive';

const PdfViewer = lazy(() => import('./PdfViewer').then((module) => ({ default: module.PdfViewer })));
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
    courses: await listCourses(),
    topics: material.courseId ? await listTopics(material.courseId) : [],
  }), [material.courseId]);
  const [failure, setFailure] = useState('');
  const move = (courseId: string | null, topicId: string | null) => {
    setFailure('');
    fileMaterial(material.id, courseId, topicId).catch((error: Error) => setFailure(`The file wasn't moved. ${error.message}`));
  };
  if (!data) return null;
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
      {failure && <p className="error" role="alert">{failure}</p>}
    </div>
  );
}

export default function ViewerPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const stage = useRef<HTMLDivElement>(null);
  const stillHere = useStillHere();
  const [confirm, setConfirm] = useState(false);
  const [failure, setFailure] = useState('');
  const [viewFailure, setViewFailure] = useState('');
  const [full, setFull] = useState(false);
  const { data: material, loading } = useLive(() => getMaterial(id), [id]);
  const { data: blob, error: blobError, loading: blobLoading } = useLive(() => readBlob(id), [id]);
  const [url, setUrl] = useState<string | null>(null);

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

  if (loading && !material) return <p className="page muted">Loading…</p>;
  if (!material) return <div className="page"><h1>This file isn't here</h1><p>It may have been deleted.</p><Link to="/library">Go to Library</Link></div>;

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
  else if (kind === 'pdf') body = <Suspense fallback={<p className="muted">Opening PDF…</p>}><PdfViewer blob={blob} onFail={fail} /></Suspense>;
  else if (!url) body = kind === 'text' ? <TextView blob={blob} /> : <p className="muted">Opening file…</p>;
  else if (kind === 'image') body = <ImageView url={url} name={material.name} />;
  else if (kind === 'audio') body = <audio controls src={url} data-testid="audio-player" onLoadedMetadata={measureLength} onError={() => fail('audio')} />;
  else if (kind === 'video') body = <video controls playsInline src={url} data-testid="video-player" onLoadedMetadata={measureLength} onError={() => fail('video')} />;
  else if (kind === 'text') body = <TextView blob={blob} />;
  else body = fallback("Study Forge can't display this file type yet, but the original is safe. You can download it and open it in another app.");

  return (
    <div className="page viewer">
      <header className="viewer-head">
        <div>
          <h1>{material.name}</h1>
          <p className="muted">{KIND_LABEL[kind]}, {formatBytes(material.size)}</p>
        </div>
        <div className="row-actions">
          {url && <a className="button" href={url} download={material.name}>Download</a>}
          <button className="text-button danger-text" onClick={() => setConfirm(true)}>Delete file</button>
        </div>
      </header>
      <Filing material={material} />
      <div ref={stage} className={full ? 'stage full' : 'stage'}>
        {blob && <button className="button stage-toggle" onClick={() => void toggleFull()}>{full ? 'Exit full screen' : 'Full screen'}</button>}
        {body}
      </div>
      {failure && <p className="error" role="alert">{failure}</p>}
      {confirm && (
        <ConfirmDialog
          title={`Delete ${material.name}?`}
          confirmLabel="Delete file"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            setConfirm(false);
            try {
              const destination = material.courseId ? `/courses/${material.courseId}` : '/library';
              await deleteMaterial(material.id);
              if (stillHere.current) navigate(destination, { replace: true });
            } catch (error) {
              setFailure(`The file wasn't deleted. ${(error as Error).message}`);
            }
          }}
        >
          <p>This permanently removes the file from this device. It can't be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
