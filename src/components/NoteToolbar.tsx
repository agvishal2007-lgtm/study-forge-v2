import type { RefObject } from 'react';
import { applyEdit, formatEdit, type FormatKind } from '../data/noteFormat';

const BUTTONS: { kind: FormatKind; label: string; show: string }[] = [
  { kind: 'bold', label: 'Bold', show: 'B' },
  { kind: 'italic', label: 'Italic', show: 'I' },
  { kind: 'heading', label: 'Heading', show: 'H' },
  { kind: 'bullet', label: 'Bullet list', show: '•' },
  { kind: 'number', label: 'Numbered list', show: '1.' },
  { kind: 'check', label: 'Checklist', show: '☐' },
];

/** Changes the text the way typing would, so Undo keeps working wherever the browser allows it. */
export function applyFormat(box: HTMLTextAreaElement, kind: FormatKind, onChange: (text: string) => void) {
  const edit = formatEdit(box.value, box.selectionStart, box.selectionEnd, kind);
  box.focus();
  box.setSelectionRange(edit.from, edit.to);
  let typed = false;
  try {
    typed = edit.insert ? document.execCommand('insertText', false, edit.insert) : document.execCommand('delete');
  } catch {
    typed = false;
  }
  if (!typed) onChange(applyEdit(box.value, edit));
  requestAnimationFrame(() => box.setSelectionRange(edit.selectionStart, edit.selectionEnd));
}

export function NoteToolbar({ box, onChange }: { box: RefObject<HTMLTextAreaElement | null>; onChange: (text: string) => void }) {
  return (
    <div className="note-toolbar" role="toolbar" aria-label="Formatting">
      {BUTTONS.map(({ kind, label, show }) => (
        <button
          key={kind}
          type="button"
          className={`note-tool note-tool-${kind}`}
          aria-label={label}
          title={label}
          // Keeps the selection in the note when the button is pressed.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { if (box.current) applyFormat(box.current, kind, onChange); }}
        >{show}</button>
      ))}
    </div>
  );
}
