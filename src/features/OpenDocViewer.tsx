import { useEffect, useState } from 'react';
import { readOpenDoc, type Block, type OpenDocContent } from '../data/openDocReader';

/** Headings and paragraphs, as plain text. Nothing from the file is put on the page as markup. */
function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === 'para') return <p key={index}>{block.text}</p>;
        const level = Math.min(block.level + 1, 6);
        const Heading = `h${level}` as 'h2';
        return <Heading key={index}>{block.text}</Heading>;
      })}
    </>
  );
}

/** Where a student got to in a book, so coming back opens the same chapter. */
const placeKey = (id: string) => `study-forge-reading-${id}`;
const savedChapter = (id: string) => {
  try { return Number(localStorage.getItem(placeKey(id))) || 0; } catch { return 0; }
};

export function OpenDocViewer({ blob, name, materialId, onFail }: { blob: Blob; name: string; materialId: string; onFail: (what: string) => void }) {
  const [content, setContent] = useState<OpenDocContent | null>(null);
  const [chosen, setChosen] = useState(() => savedChapter(materialId));
  useEffect(() => {
    let active = true;
    readOpenDoc(blob, name).then((read) => { if (active) setContent(read); }, () => { if (active) onFail('document'); });
    return () => { active = false; };
  }, [blob, name, onFail]);

  if (!content) return <p className="muted">Opening file…</p>;
  const reading = <p className="notice">A reading view: the words and tables, not the original layout or styling. Download the file to see it exactly as made.</p>;

  if (content.kind === 'odt') {
    return <div className="doc-view">{reading}{content.blocks.length ? <Blocks blocks={content.blocks} /> : <p className="muted">This document has no text in it.</p>}</div>;
  }

  if (content.kind === 'ods') {
    const sheet = content.sheets[Math.min(chosen, content.sheets.length - 1)];
    if (!sheet) return <p className="muted">This spreadsheet has no sheets in it.</p>;
    return (
      <div className="doc-view">
        {reading}
        {content.sheets.length > 1 && (
          <div className="sheet-tabs" role="group" aria-label="Sheets">
            {content.sheets.map((entry, index) => (
              <button key={index} className="button" aria-pressed={entry === sheet} onClick={() => setChosen(index)}>{entry.name}</button>
            ))}
          </div>
        )}
        {sheet.truncated && <p className="notice">Showing the first 2,000 rows. Download the file to see the rest.</p>}
        <div className="sheet-scroll" tabIndex={0}>
          <table className="sheet">
            <tbody>
              {sheet.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (content.kind === 'odp') {
    return (
      <div className="doc-view">
        {reading}
        <ol className="slide-list">
          {content.slides.map((slide, index) => (
            <li key={index} className="slide-card">
              <h2>{slide.title}</h2>
              {slide.paragraphs.map((text, p) => <p key={p}>{text}</p>)}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // A book: one chapter at a time, and the place is kept.
  const total = content.chapters.length;
  if (!total) return <p className="muted">This book has no readable text in it.</p>;
  const at = Math.min(chosen, total - 1);
  const go = (next: number) => {
    setChosen(next);
    try { localStorage.setItem(placeKey(materialId), String(next)); } catch { /* the place just isn't kept */ }
    document.querySelector('.doc-view')?.scrollIntoView({ block: 'start' });
  };
  return (
    <div className="doc-view">
      <p className="muted">{content.title}</p>
      <div className="chapter-bar">
        <button className="button" disabled={at === 0} onClick={() => go(at - 1)}>Previous</button>
        <label>Chapter
          <select value={at} onChange={(event) => go(Number(event.target.value))}>
            {content.chapters.map((chapter, index) => <option key={index} value={index}>{index + 1}. {chapter.title.slice(0, 60)}</option>)}
          </select>
        </label>
        <button className="button" disabled={at === total - 1} onClick={() => go(at + 1)}>Next</button>
      </div>
      <Blocks blocks={content.chapters[at].blocks} />
    </div>
  );
}
