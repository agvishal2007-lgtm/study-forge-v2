import type { RefObject } from 'react';
import { applyEdit, formatEdit, type FormatKind, type FormatEdit } from '../data/noteFormat';

// Each button shows a small icon and its name, so nobody has to guess what a letter means.
const ICON: Record<FormatKind, string> = {
  bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z',
  italic: 'M10 5h8M6 19h8M14 5l-4 14',
  heading: 'M5 5v14M15 5v14M5 12h10M19 9v10',
  bullet: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  number: 'M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M3.5 13.5a1.5 1.5 0 1 1 2.5 1.2L3.5 17H6',
  check: 'M4 5h4v4H4zM4 15h4v4H4zM5 17l1 1 2-2.5M11 7h9M11 17h9',
  math: 'M4 6h7M7.5 6c-.5 6-1.5 10-3.5 12M14 9l6 8M20 9l-6 8',
};
const BUTTONS: { kind: FormatKind; label: string; word: string }[] = [
  { kind: 'bold', label: 'Bold', word: 'Bold' },
  { kind: 'italic', label: 'Italic', word: 'Italic' },
  { kind: 'heading', label: 'Heading', word: 'Heading' },
  { kind: 'bullet', label: 'Bullet points', word: 'Bullets' },
  { kind: 'number', label: 'Numbered list', word: 'Numbering' },
  { kind: 'check', label: 'Checklist', word: 'Checklist' },
  { kind: 'math', label: 'Equation, like x^2 or \\frac{a}{b}', word: 'Equation' },
];

/** Changes the text the way typing would, so Undo keeps working wherever the browser allows it. */
export function applyFormat(box: HTMLTextAreaElement, kind: FormatKind, onChange: (text: string) => void) {
  applyToBox(box, formatEdit(box.value, box.selectionStart, box.selectionEnd, kind), onChange);
}

/** Makes an edit as if typed, so the browser's own undo still works. */
export function applyToBox(box: HTMLTextAreaElement, edit: FormatEdit, onChange: (text: string) => void) {
  box.focus();
  box.setSelectionRange(edit.from, edit.to);
  let typed = false;
  try {
    typed = edit.insert ? document.execCommand('insertText', false, edit.insert) : document.execCommand('delete');
  } catch {
    typed = false;
  }
  if (typed) {
    // Set right away, because anything later could move the cursor while the student is typing.
    box.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  } else {
    // This route has to wait for the page to show the new text first.
    onChange(applyEdit(box.value, edit));
    requestAnimationFrame(() => box.setSelectionRange(edit.selectionStart, edit.selectionEnd));
  }
}

export function NoteToolbar({ box, onChange }: { box: RefObject<HTMLTextAreaElement | null>; onChange: (text: string) => void }) {
  return (
    <div className="note-toolbar" role="toolbar" aria-label="Formatting">
      {BUTTONS.map(({ kind, label, word }) => (
        <button
          key={kind}
          type="button"
          className={`note-tool note-tool-${kind}`}
          aria-label={label}
          title={label}
          // Keeps the selection in the note when the button is pressed.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { if (box.current) applyFormat(box.current, kind, onChange); }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[kind]} /></svg>
          <span className="note-tool-word">{word}</span>
        </button>
      ))}
    </div>
  );
}
