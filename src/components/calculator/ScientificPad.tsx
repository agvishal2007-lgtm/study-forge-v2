import { useRef, useState } from 'react';
import type { CalcResult, Calculator, ShowAs } from '../../data/calculatorRules';

// Each key types what it says; the label is what a screen reader says.
const KEYS: { show: string; type: string; label?: string; wide?: boolean; kind?: 'fn' | 'op' }[] = [
  { show: 'sin', type: 'sin(', kind: 'fn' }, { show: 'cos', type: 'cos(', kind: 'fn' }, { show: 'tan', type: 'tan(', kind: 'fn' }, { show: 'ln', type: 'ln(', kind: 'fn', label: 'natural log' }, { show: 'log', type: 'log(', kind: 'fn', label: 'log base 10' },
  { show: 'sin⁻¹', type: 'sin⁻¹(', kind: 'fn', label: 'inverse sine' }, { show: 'cos⁻¹', type: 'cos⁻¹(', kind: 'fn', label: 'inverse cosine' }, { show: 'tan⁻¹', type: 'tan⁻¹(', kind: 'fn', label: 'inverse tangent' }, { show: 'eˣ', type: 'e^(', kind: 'fn', label: 'e to the power' }, { show: '10ˣ', type: '10^(', kind: 'fn', label: '10 to the power' },
  { show: 'x²', type: '^2', kind: 'fn', label: 'squared' }, { show: 'xʸ', type: '^', kind: 'fn', label: 'to the power' }, { show: '√', type: '√(', kind: 'fn', label: 'square root' }, { show: 'n!', type: '!', kind: 'fn', label: 'factorial' }, { show: 'π', type: 'π', kind: 'fn', label: 'pi' },
  { show: '(', type: '(', kind: 'op', label: 'open bracket' }, { show: ')', type: ')', kind: 'op', label: 'close bracket' }, { show: 'e', type: 'e', kind: 'fn', label: 'e' }, { show: '×10ˣ', type: 'ᴇ', kind: 'fn', label: 'times ten to the power, for scientific notation' }, { show: '÷', type: '÷', kind: 'op', label: 'divide' },
  { show: '7', type: '7' }, { show: '8', type: '8' }, { show: '9', type: '9' }, { show: 'Ans', type: 'Ans', kind: 'fn', label: 'last answer' }, { show: '×', type: '×', kind: 'op', label: 'times' },
  { show: '4', type: '4' }, { show: '5', type: '5' }, { show: '6', type: '6' }, { show: '%', type: '%', kind: 'op', label: 'percent' }, { show: '−', type: '−', kind: 'op', label: 'minus' },
  { show: '1', type: '1' }, { show: '2', type: '2' }, { show: '3', type: '3' }, { show: ',', type: ',', kind: 'op', label: 'comma' }, { show: '+', type: '+', kind: 'op', label: 'plus' },
  { show: '0', type: '0', wide: true }, { show: '.', type: '.', label: 'decimal point' }, { show: '(−)', type: '-', kind: 'op', label: 'negative' },
];

/** The everyday scientific calculator: type or tap, press =, and earlier answers stay listed. */
export function ScientificPad({ calc, showAs, onShowAs, input, setInput, history, setHistory, onInsert }: {
  calc: Calculator;
  showAs: ShowAs;
  onShowAs: (next: ShowAs) => void;
  input: string;
  setInput: (next: string) => void;
  history: CalcResult[];
  setHistory: (update: (now: CalcResult[]) => CalcResult[]) => void;
  onInsert?: (tex: string) => void;
}) {
  const [failure, setFailure] = useState('');
  const field = useRef<HTMLInputElement>(null);

  const type = (text: string) => {
    const box = field.current;
    const start = box?.selectionStart ?? input.length;
    const end = box?.selectionEnd ?? input.length;
    // An operator first thing continues from the last answer, as on a school calculator.
    const prefix = !input && history.length && /^[+×÷^!%]|^\^2$/.test(text) ? 'Ans' : '';
    setInput(input.slice(0, start) + prefix + text + input.slice(end));
    setFailure('');
    requestAnimationFrame(() => {
      const at = start + prefix.length + text.length;
      box?.focus();
      box?.setSelectionRange(at, at);
    });
  };
  const run = () => {
    try {
      const result = calc.run(input);
      setHistory((now) => [result, ...now].slice(0, 30));
      setInput('');
      setFailure('');
    } catch (error) {
      setFailure((error as Error).message);
    }
  };

  return (
    <div className="sci" data-testid="scientific">
      <div className="calc-segment" role="group" aria-label="Show answers as">
        <button type="button" className="button" aria-pressed={showAs === 'decimal'} onClick={() => onShowAs('decimal')}>Decimal</button>
        <button type="button" className="button" aria-pressed={showAs === 'fraction'} onClick={() => onShowAs('fraction')}>Fraction</button>
      </div>
      <form className="calc-entry" onSubmit={(event) => { event.preventDefault(); run(); }}>
        <label className="sr-only" htmlFor="calc-input">Expression</label>
        <input id="calc-input" ref={field} className="calc-input" value={input} autoComplete="off" spellCheck={false} inputMode="text"
          placeholder="e.g. 2sin(30) + √16" onChange={(event) => { setInput(event.target.value); setFailure(''); }} />
        <button type="submit" className="button primary calc-equals" aria-label="Work it out">=</button>
      </form>
      {failure && <p className="error" role="alert">{failure}</p>}
      <div className="calc-keys">
        {KEYS.map((key) => (
          <button key={key.show} type="button" className={`calc-key${key.kind ? ` calc-key-${key.kind}` : ''}${key.wide ? ' calc-key-wide' : ''}`}
            aria-label={key.label ?? key.show} onMouseDown={(event) => event.preventDefault()} onClick={() => type(key.type)}>{key.show}</button>
        ))}
        <button type="button" className="calc-key calc-key-op" aria-label="Delete one" onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const box = field.current;
            const start = box?.selectionStart ?? input.length;
            const end = box?.selectionEnd ?? input.length;
            const from = start === end ? Math.max(0, start - 1) : start;
            setInput(input.slice(0, from) + input.slice(end));
            requestAnimationFrame(() => { box?.focus(); box?.setSelectionRange(from, from); });
          }}>⌫</button>
        <button type="button" className="calc-key calc-key-op" aria-label="Clear" onClick={() => { setInput(''); setFailure(''); }}>AC</button>
      </div>
      <ol className="calc-history" aria-label="Answers" aria-live="polite" data-testid="calc-history">
        {history.map((item, index) => (
          <li key={history.length - index}>
            <span className="calc-line"><span className="muted">{item.expression}</span> <b data-testid="calc-answer">= {item.answer}</b></span>
            <span className="row-actions">
              <button type="button" className="button" onClick={() => { setInput(item.expression); field.current?.focus(); }}>Edit</button>
              {onInsert && <button type="button" className="button" onClick={() => onInsert(item.tex)} aria-label={`Put ${item.expression} = ${item.answer} in the note`}>Put in note</button>}
            </span>
          </li>
        ))}
      </ol>
      <details className="calc-help">
        <summary>What it can do</summary>
        <ul>
          <li>Trig in degrees or radians, ln and log (base 10), log(8, 2) for any base, √, powers, n!, π and e.</li>
          <li>Scientific notation: 1.5 ×10ˣ 3 is 1500. Percent: 20% of 50 is 20% × 50.</li>
          <li>Fractions: 1/3 + 1/4 shows 7/12 when Fraction is on.</li>
          <li>Ans is the last answer. Start with + or × to keep going from it. Earlier answers stay listed below.</li>
          <li>Your own functions: f(x) = x^2, then f(3).</li>
        </ul>
      </details>
    </div>
  );
}
