import { useEffect, useRef, useState, type RefObject } from 'react';
import { applyEdit, formatEdit, type FormatKind, type FormatEdit } from '../data/noteFormat';
import { EQUATION_GROUPS, templateEdit } from '../data/equationTemplates';
import { MathText, preloadMath } from './MathText';

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
];
const CALC_ICON = 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7h8M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01';

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

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

/** The Equation button opens a menu of many kinds of equation. Each goes in with its blank selected. */
function EquationMenu({ box, onChange }: { box: RefObject<HTMLTextAreaElement | null>; onChange: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const choose = (tex: string) => {
    setOpen(false);
    const target = box.current;
    if (target) applyToBox(target, templateEdit(target.value, target.selectionStart, target.selectionEnd, tex), onChange);
  };
  return (
    <span className="equation-wrap">
      <button
        ref={button}
        type="button"
        className="note-tool note-tool-math"
        aria-label="Equation"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Equation: pick a kind"
        onMouseDown={(event) => event.preventDefault()}
        onPointerEnter={preloadMath}
        onFocus={preloadMath}
        onClick={() => { preloadMath(); setOpen((now) => !now); }}
      >
        <Icon d={ICON.math} />
        <span className="note-tool-word">Equation</span>
      </button>
      {open && (
        <div
          ref={menu}
          className="equation-menu"
          role="dialog"
          aria-label="Choose an equation"
          data-testid="equation-menu"
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); button.current?.focus(); }
          }}
        >
          <p className="muted small equation-hint">The highlighted part is ready to type over. Equations are written like x^2 or {'\\frac{a}{b}'}.</p>
          {EQUATION_GROUPS.map((group) => (
            <section key={group.name} aria-label={group.name}>
              <h3>{group.name}</h3>
              <div className={group.name === 'Symbols' ? 'equation-grid equation-symbols' : 'equation-grid'}>
                {group.items.map((item) => (
                  <button key={item.label} type="button" className="equation-choice" aria-label={item.label} title={item.label}
                    onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item.tex)}>
                    <span className="equation-preview" aria-hidden="true"><MathText quiet source={item.tex.replace(/¦/g, '')} /></span>
                    {group.name !== 'Symbols' && <span className="equation-label">{item.label}</span>}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </span>
  );
}

export function NoteToolbar({ box, onChange, onCalculator, calculatorOpen }: {
  box: RefObject<HTMLTextAreaElement | null>;
  onChange: (text: string) => void;
  onCalculator?: () => void;
  calculatorOpen?: boolean;
}) {
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
          <Icon d={ICON[kind]} />
          <span className="note-tool-word">{word}</span>
        </button>
      ))}
      <EquationMenu box={box} onChange={onChange} />
      {onCalculator && (
        <button type="button" className="note-tool note-tool-calc" aria-label="Calculator" aria-pressed={Boolean(calculatorOpen)} title="Calculator"
          onMouseDown={(event) => event.preventDefault()} onClick={onCalculator}>
          <Icon d={CALC_ICON} />
          <span className="note-tool-word">Calculator</span>
        </button>
      )}
    </div>
  );
}
