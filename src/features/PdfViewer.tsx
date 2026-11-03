import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Draws PDFs itself so they behave the same on phones, where built-in PDF frames often fail. */
export function PdfViewer({ blob, onFail }: { blob: Blob; onFail: (message: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let task: ReturnType<typeof pdfjs.getDocument> | null = null;
    let active = true;
    void (async () => {
      try {
        const data = new Uint8Array(await blob.arrayBuffer());
        task = pdfjs.getDocument({ data });
        const loaded = await task.promise;
        if (active) setDoc(loaded);
      } catch (error) {
        if (active) onFail((error as Error).message);
      }
    })();
    return () => {
      active = false;
      void task?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

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
  return (
    <>
      <div className="tools" role="group" aria-label="PDF controls">
        <button className="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous page</button>
        <span role="status">Page {page} of {doc.numPages}</span>
        <button className="button" disabled={page >= doc.numPages} onClick={() => setPage(page + 1)}>Next page</button>
        <button className="button" disabled={zoom <= 0.5} onClick={() => setZoom(zoom - 0.25)} aria-label="Zoom out">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="button" disabled={zoom >= 3} onClick={() => setZoom(zoom + 0.25)} aria-label="Zoom in">+</button>
      </div>
      <div className="pdf-stage"><canvas ref={canvas} data-testid="pdf-canvas" aria-label={`Page ${page} of the PDF`} /></div>
    </>
  );
}
