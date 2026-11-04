import DOMPurify from 'dompurify';
import { useEffect, useMemo, useState } from 'react';
import { readPresentation, type SlideContent } from '../data/pptxReader';

const MAX_OFFICE_BYTES = 100 * 1024 * 1024;
const MAX_ROWS = 2000;

const useFile = <T,>(blob: Blob, read: (file: Blob) => Promise<T>, onFail: (what: string) => void) => {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let active = true;
    if (blob.size > MAX_OFFICE_BYTES) {
      onFail('too large');
      return undefined;
    }
    read(blob).then((result) => { if (active) setValue(result); }, (error: Error) => { if (active) onFail(error.message); });
    return () => { active = false; };
    // A file only needs reading once for each blob.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);
  return value;
};

function WordView({ blob, onFail }: { blob: Blob; onFail: (what: string) => void }) {
  const html = useFile(blob, async (file) => {
    const { default: mammoth } = await import('mammoth/mammoth.browser');
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    // A document can come from anyone, so nothing in it gets to run on this site.
    const clean = DOMPurify.sanitize(value, { FORBID_TAGS: ['style', 'form', 'input', 'button'], FORBID_ATTR: ['style'], ADD_ATTR: ['target'] });
    const page = new DOMParser().parseFromString(clean, 'text/html');
    page.querySelectorAll('a[href]').forEach((link) => {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });
    return page.body.innerHTML;
  }, onFail);
  if (html === null) return <p className="muted">Opening file…</p>;
  return (
    <>
      <p className="office-note">Reading view. The layout and fonts may differ from Word, so download the original for exact formatting.</p>
      {/* eslint-disable-next-line react/no-danger */}
      <div className="office-doc" data-testid="word-view" tabIndex={0} dangerouslySetInnerHTML={{ __html: html || '<p>This document has no text to show.</p>' }} />
    </>
  );
}

const cellText = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString(undefined, { timeZone: 'UTC' });
  return String(value);
};

function SheetView({ blob, onFail }: { blob: Blob; onFail: (what: string) => void }) {
  const sheets = useFile(blob, async (file) => {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    return (await readXlsxFile(file)) as unknown as { sheet: string; data: unknown[][] }[];
  }, onFail);
  const [chosen, setChosen] = useState(0);
  if (sheets === null) return <p className="muted">Opening file…</p>;
  const sheet = sheets[Math.min(chosen, sheets.length - 1)];
  const rows = sheet?.data ?? [];
  return (
    <>
      <p className="office-note">Reading view. Formulas show their last saved result, and formatting isn't shown.</p>
      {sheets.length > 1 && (
        <div className="sheet-tabs" role="group" aria-label="Sheets">
          {sheets.map((entry, index) => <button key={`${index}-${entry.sheet}`} className="button" aria-pressed={index === chosen} onClick={() => setChosen(index)}>{entry.sheet}</button>)}
        </div>
      )}
      {rows.length > MAX_ROWS && <p className="notice" data-testid="sheet-limit">Showing the first {MAX_ROWS.toLocaleString()} of {rows.length.toLocaleString()} rows. Download the file to see them all.</p>}
      {rows.length === 0
        ? <p className="muted">This sheet is empty.</p>
        : (
          <div className="sheet-scroll" tabIndex={0}>
            <table className="sheet-table" data-testid="sheet-view">
              <tbody>
                {rows.slice(0, MAX_ROWS).map((row, rowIndex) => (
                  <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cellText(cell)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </>
  );
}

function SlideImages({ images, label }: { images: Blob[]; label: string }) {
  const urls = useMemo(() => images.map((image) => URL.createObjectURL(image)), [images]);
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);
  return <>{urls.map((url, index) => <img key={url} src={url} alt={`${label}, picture ${index + 1}`} />)}</>;
}

function SlidesView({ blob, onFail }: { blob: Blob; onFail: (what: string) => void }) {
  const slides = useFile<SlideContent[]>(blob, readPresentation, onFail);
  if (slides === null) return <p className="muted">Opening file…</p>;
  return (
    <>
      <p className="office-note">Reading view. This shows each slide's words and pictures, but not its design, so download the original to present it.</p>
      <div data-testid="slides-view">
        {slides.map((slide, index) => (
          <article className="slide-card" key={index} data-testid="slide">
            <p className="slide-number">Slide {index + 1} of {slides.length}</p>
            {slide.title && <h2>{slide.title}</h2>}
            {slide.paragraphs.map((paragraph, line) => <p key={line}>{paragraph}</p>)}
            <SlideImages images={slide.images} label={`Slide ${index + 1}`} />
            {!slide.title && slide.paragraphs.length === 0 && slide.images.length === 0 && <p className="muted">No text or pictures to show on this slide.</p>}
            {slide.notes.length > 0 && <div className="slide-notes"><strong>Speaker notes</strong>{slide.notes.map((note, line) => <p key={line}>{note}</p>)}</div>}
          </article>
        ))}
      </div>
    </>
  );
}

export function OfficeViewer({ kind, blob, onFail }: { kind: 'word' | 'sheet' | 'slides'; blob: Blob; onFail: (what: string) => void }) {
  if (kind === 'word') return <WordView blob={blob} onFail={onFail} />;
  if (kind === 'sheet') return <SheetView blob={blob} onFail={onFail} />;
  return <SlidesView blob={blob} onFail={onFail} />;
}
