import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { getReading, saveReading } from '../data/reading';
import { addBookmark, currentSection, flattenOutline, removeBookmark, startingPage, type OutlineEntry, type Reading } from '../data/readingRules';
import { formatWhen } from '../data/dateFormat';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Asks the open PDF to show a page, for example from a page note beside it. */
export const GOTO_PAGE = 'study-forge-goto-page';

/**
 * Draws PDFs itself so they behave the same on phones, where built-in PDF frames often fail. With
 * a file id it is also a textbook reader: contents, go to page, bookmarks, the page you stopped on,
 * and notes tied to a page.
 */
export function PdfViewer({ blob, onFail, initialPage = null, materialId, onNotePage }: { blob: Blob; onFail: (message: string) => void; initialPage?: number | null; materialId?: string; onNotePage?: (page: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(initialPage ?? 1);
  const [zoom, setZoom] = useState(1);
  const [reading, setReading] = useState<Reading | null>(null);
  const [outline, setOutline] = useState<OutlineEntry[] | null>(null);
  const [resumed, setResumed] = useState<number | null>(null);
  const [goTo, setGoTo] = useState('');
  const [label, setLabel] = useState('');
  // The same file read again after an unrelated change (a bookmark, a note) is not reloaded, so the
  // page never jumps or flickers: loading follows the file's size and type, not the read itself.
  const signature = `${blob.size}:${blob.type}`;
  const latestBlob = useRef(blob);
  latestBlob.current = blob;

  useEffect(() => {
    let task: ReturnType<typeof pdfjs.getDocument> | null = null;
    let active = true;
    void (async () => {
      try {
        const data = new Uint8Array(await latestBlob.current.arrayBuffer());
        task = pdfjs.getDocument({ data });
        const loaded = await task.promise;
        if (active) {
          const saved = materialId ? await getReading(materialId) : null;
          // A search result or a page note can ask for a page; otherwise open where they stopped.
          const start = startingPage(initialPage, saved ?? { page: 0, at: 0, bookmarks: [] }, loaded.numPages);
          if (initialPage === null && saved?.page && saved.page > 1) setResumed(start);
          setReading(saved);
          setPage(start);
          setDoc(loaded);
          void loaded.getOutline().then(async (items) => {
            if (!items?.length) { setOutline([]); return; }
            const pageOf = async (dest: unknown): Promise<number | null> => {
              try {
                const explicit = typeof dest === 'string' ? await loaded.getDestination(dest) : dest as unknown[];
                if (!explicit?.[0]) return null;
                return (await loaded.getPageIndex(explicit[0] as never)) + 1;
              } catch {
                return null;
              }
            };
            type Item = { title: string; dest: unknown; items: Item[] };
            const withPages = async (list: Item[]): Promise<{ title: string; page: number | null; items: unknown[] }[]> =>
              Promise.all(list.map(async (item) => ({ title: item.title, page: await pageOf(item.dest), items: await withPages(item.items ?? []) })));
            if (active) setOutline(flattenOutline(await withPages(items as unknown as Item[])));
          }).catch(() => setOutline([]));
        }
      } catch (error) {
        if (active) onFail((error as Error).message);
      }
    })();
    return () => {
      active = false;
      void task?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Remembers the page, a moment after the student stops turning pages.
  useEffect(() => {
    if (!doc || !materialId) return;
    const timer = setTimeout(() => {
      void saveReading(materialId, (now) => ({ ...now, page, at: Date.now() })).then(setReading).catch(() => undefined);
    }, 1200);
    return () => clearTimeout(timer);
  }, [doc, page, materialId]);

  // A page note beside the file can send the reader to its page.
  useEffect(() => {
    const go = (event: Event) => {
      const wanted = (event as CustomEvent<number>).detail;
      if (doc && Number.isInteger(wanted)) setPage(Math.min(Math.max(1, wanted), doc.numPages));
    };
    window.addEventListener(GOTO_PAGE, go);
    return () => window.removeEventListener(GOTO_PAGE, go);
  }, [doc]);

  useEffect(() => {
    if (!doc || !canvas.current) return;
    const target = canvas.current;
    let task: ReturnType<pdfjs.PDFPageProxy['render']> | null = null;
    let active = true;
    void (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        if (!active) return;
        const available = target.parentElement?.clientWidth ?? 800;
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = (Math.min(available, 900) / base.width) * zoom;
        const ratio = window.devicePixelRatio || 1;
        const viewport = pdfPage.getViewport({ scale: scale * ratio });
        target.width = viewport.width;
        target.height = viewport.height;
        target.style.width = `${viewport.width / ratio}px`;
        task = pdfPage.render({ canvas: target, viewport });
        await task.promise;
        target.dataset.renderedPage = String(page);
      } catch (error) {
        if ((error as Error).name !== 'RenderingCancelledException') onFail((error as Error).message);
      }
    })();
    return () => {
      active = false;
      task?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, zoom]);

  if (!doc) return <p className="muted">Opening PDF…</p>;
  const marked = reading?.bookmarks.find((mark) => mark.page === page);
  const section = outline ? currentSection(outline, page) : null;
  const toggleMark = () => {
    if (!materialId) return;
    void saveReading(materialId, (now) => (marked ? removeBookmark(now, page) : addBookmark(now, page, label || section?.title || '', Date.now()))).then((next) => { setReading(next); setLabel(''); });
  };
  return (
    <>
      {resumed && <p className="notice" role="status" data-testid="resumed">Picked up where you left off, on page {resumed}. <button className="text-button" onClick={() => { setPage(1); setResumed(null); }}>Start from page 1</button></p>}
      <div className="tools" role="group" aria-label="PDF controls">
        <button className="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous page</button>
        <span role="status">Page {page} of {doc.numPages}</span>
        <button className="button" disabled={page >= doc.numPages} onClick={() => setPage(page + 1)}>Next page</button>
        <button className="button" disabled={zoom <= 0.5} onClick={() => setZoom(zoom - 0.25)} aria-label="Zoom out">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="button" disabled={zoom >= 3} onClick={() => setZoom(zoom + 0.25)} aria-label="Zoom in">+</button>
        <form className="goto-page" onSubmit={(event) => { event.preventDefault(); const wanted = Number(goTo); if (Number.isInteger(wanted) && wanted >= 1 && wanted <= doc.numPages) { setPage(wanted); setGoTo(''); } }}>
          <label className="sr-only" htmlFor="goto-page">Go to page</label>
          <input id="goto-page" inputMode="numeric" value={goTo} onChange={(event) => setGoTo(event.target.value.replace(/\D/g, ''))} placeholder="Page" aria-label="Go to page" />
          <button className="button" type="submit" disabled={!goTo}>Go</button>
        </form>
      </div>
      {materialId && (
        <div className="book-tools" data-testid="book-tools">
          {section && <p className="muted small book-section" data-testid="book-section">In: {section.title}</p>}
          <div className="row-actions">
            {!marked && <input className="bookmark-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Bookmark name (optional)" aria-label="Bookmark name" maxLength={80} />}
            <button className="button" aria-pressed={Boolean(marked)} onClick={toggleMark}>{marked ? `Remove bookmark on page ${page}` : `Bookmark page ${page}`}</button>
            {onNotePage && <button className="button" onClick={() => onNotePage(page)}>Note this page</button>}
          </div>
          <details className="book-panel" open={Boolean(outline?.length)}>
            <summary>Contents{outline?.length ? ` (${outline.length})` : ''}</summary>
            {outline === null ? <p className="muted small">Reading the contents…</p>
              : outline.length === 0 ? <p className="muted small">This PDF has no table of contents. Use Go to page or bookmarks instead.</p>
              : (
                <ol className="book-outline" data-testid="book-outline">
                  {outline.map((entry, index) => (
                    <li key={index} style={{ paddingLeft: `${entry.depth}rem` }}>
                      {entry.page
                        ? <button className={`text-button${section === entry ? ' current' : ''}`} onClick={() => setPage(entry.page!)} aria-current={section === entry ? 'true' : undefined}>{entry.title} <span className="muted small">p. {entry.page}</span></button>
                        : <span className="muted">{entry.title}</span>}
                    </li>
                  ))}
                </ol>
              )}
          </details>
          <details className="book-panel" open={Boolean(reading?.bookmarks.length)}>
            <summary>Bookmarks{reading?.bookmarks.length ? ` (${reading.bookmarks.length})` : ''}</summary>
            {!reading?.bookmarks.length
              ? <p className="muted small">No bookmarks yet. Bookmark a page to come back to it.</p>
              : (
                <ul className="plain-list" data-testid="bookmarks">
                  {reading.bookmarks.map((mark) => (
                    <li key={mark.page} className="bookmark-row">
                      <button className="text-button" onClick={() => setPage(mark.page)}>Page {mark.page}{mark.label ? `: ${mark.label}` : ''}</button>
                      <span className="muted small">{mark.at ? formatWhen(mark.at, { month: 'short', day: 'numeric' }) : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
          </details>
        </div>
      )}
      <div className="pdf-stage"><canvas ref={canvas} data-testid="pdf-canvas" aria-label={`Page ${page} of the PDF`} /></div>
    </>
  );
}
