import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calculator, gridStep, pan, plotSegments, STANDARD_VIEW, valueTable, zoom,
  type AngleMode, type CalcResult, type ShowAs, type Viewport,
} from '../data/calculatorRules';

const MODE_KEY = 'study-forge-calc-angle';
const SHOW_KEY = 'study-forge-calc-show';
const remembered = <T extends string>(key: string, allowed: T[], fallback: T): T => {
  try {
    const saved = localStorage.getItem(key) as T | null;
    return saved && allowed.includes(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
};
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* private browsing */ } };

// Each key types what it says; the label is what a screen reader says.
const KEYS: { show: string; type: string; label?: string; wide?: boolean; kind?: 'fn' | 'op' }[][] = [
  [{ show: 'sin', type: 'sin(', kind: 'fn' }, { show: 'cos', type: 'cos(', kind: 'fn' }, { show: 'tan', type: 'tan(', kind: 'fn' }, { show: 'ln', type: 'ln(', kind: 'fn', label: 'natural log' }, { show: 'log', type: 'log(', kind: 'fn', label: 'log base 10' }],
  [{ show: 'sin⁻¹', type: 'asin(', kind: 'fn', label: 'inverse sine' }, { show: 'cos⁻¹', type: 'acos(', kind: 'fn', label: 'inverse cosine' }, { show: 'tan⁻¹', type: 'atan(', kind: 'fn', label: 'inverse tangent' }, { show: 'eˣ', type: 'e^(', kind: 'fn', label: 'e to the power' }, { show: '10ˣ', type: '10^(', kind: 'fn', label: '10 to the power' }],
  [{ show: 'x²', type: '^2', kind: 'fn', label: 'squared' }, { show: 'xʸ', type: '^', kind: 'fn', label: 'to the power' }, { show: '√', type: '√(', kind: 'fn', label: 'square root' }, { show: 'n!', type: '!', kind: 'fn', label: 'factorial' }, { show: 'π', type: 'π', kind: 'fn', label: 'pi' }],
  [{ show: '(', type: '(', kind: 'op', label: 'open bracket' }, { show: ')', type: ')', kind: 'op', label: 'close bracket' }, { show: 'e', type: 'e', kind: 'fn', label: 'e' }, { show: 'Ans', type: 'Ans', kind: 'fn', label: 'last answer' }, { show: '÷', type: '÷', kind: 'op', label: 'divide' }],
  [{ show: '7', type: '7' }, { show: '8', type: '8' }, { show: '9', type: '9' }, { show: 'x', type: 'x', kind: 'fn', label: 'x' }, { show: '×', type: '×', kind: 'op', label: 'times' }],
  [{ show: '4', type: '4' }, { show: '5', type: '5' }, { show: '6', type: '6' }, { show: ',', type: ',', kind: 'op', label: 'comma' }, { show: '−', type: '−', kind: 'op', label: 'minus' }],
  [{ show: '1', type: '1' }, { show: '2', type: '2' }, { show: '3', type: '3' }, { show: '%', type: '%', kind: 'op', label: 'percent' }, { show: '+', type: '+', kind: 'op', label: 'plus' }],
  [{ show: '0', type: '0', wide: true }, { show: '.', type: '.', label: 'decimal point' }, { show: '(−)', type: '-', kind: 'op', label: 'negative' }],
];

const LINE_COLORS = ['var(--accent)', '#d9480f', '#2b8a3e'];
const LINE_NAMES = ['first', 'second', 'third'];

function Graph({ calc, lines }: { calc: Calculator; lines: string[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<Viewport>(STANDARD_VIEW);
  const graphs = useMemo(() => lines.map((line) => (line.trim() ? calc.graph(line) : null)), [calc, lines, calc.mode]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      element.width = width * ratio;
      element.height = height * ratio;
      const ctx = element.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const style = getComputedStyle(element);
      const color = (name: string) => style.getPropertyValue(name).trim() || '#888';
      const px = (x: number) => ((x - view.xMin) / (view.xMax - view.xMin)) * width;
      const py = (y: number) => height - ((y - view.yMin) / (view.yMax - view.yMin)) * height;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color('--raised');
      ctx.fillRect(0, 0, width, height);
      // Grid, then axes, then numbers on the axes.
      const xs = gridStep(view.xMax - view.xMin);
      const ys = gridStep(view.yMax - view.yMin);
      ctx.strokeStyle = color('--line');
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.ceil(view.xMin / xs) * xs; x <= view.xMax; x += xs) { ctx.moveTo(px(x), 0); ctx.lineTo(px(x), height); }
      for (let y = Math.ceil(view.yMin / ys) * ys; y <= view.yMax; y += ys) { ctx.moveTo(0, py(y)); ctx.lineTo(width, py(y)); }
      ctx.stroke();
      ctx.strokeStyle = color('--muted');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px(0), 0); ctx.lineTo(px(0), height);
      ctx.moveTo(0, py(0)); ctx.lineTo(width, py(0));
      ctx.stroke();
      ctx.fillStyle = color('--muted');
      ctx.font = '11px system-ui, sans-serif';
      const axisY = Math.min(Math.max(py(0) + 12, 12), height - 4);
      const axisX = Math.min(Math.max(px(0) + 4, 4), width - 30);
      for (let x = Math.ceil(view.xMin / xs) * xs; x <= view.xMax; x += xs) if (Math.abs(x) > xs / 2) ctx.fillText(String(Number(x.toPrecision(6))), px(x) + 2, axisY);
      for (let y = Math.ceil(view.yMin / ys) * ys; y <= view.yMax; y += ys) if (Math.abs(y) > ys / 2) ctx.fillText(String(Number(y.toPrecision(6))), axisX, py(y) - 2);
      graphs.forEach((graph, index) => {
        if (!graph || 'error' in graph) return;
        ctx.strokeStyle = index === 0 ? color('--accent') : LINE_COLORS[index];
        ctx.lineWidth = 2.5;
        ctx.setLineDash(index === 2 ? [6, 4] : []);
        for (const segment of plotSegments(graph.fn, view, Math.max(200, Math.round(width)))) {
          ctx.beginPath();
          segment.forEach((point, i) => (i ? ctx.lineTo(px(point.x), py(point.y)) : ctx.moveTo(px(point.x), py(point.y))));
          ctx.stroke();
        }
        ctx.setLineDash([]);
      });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [graphs, view]);
  const first = graphs.findIndex((graph) => graph && !('error' in graph));
  const firstGraph = first === -1 ? null : graphs[first];
  const table = firstGraph && !('error' in firstGraph) ? valueTable(firstGraph.fn, view) : [];
  const described = lines.map((line, i) => (line.trim() && graphs[i] && !('error' in graphs[i]!) ? `${LINE_NAMES[i]} line y = ${line.replace(/^\s*y\s*=\s*/i, '')}` : null)).filter(Boolean).join('; ');
  return (
    <div className="calc-graph">
      {graphs.map((graph, i) => graph && 'error' in graph && <p key={i} className="error" role="alert">Line {i + 1}: {graph.error}</p>)}
      <canvas ref={canvas} className="calc-canvas" data-testid="calc-canvas" role="img"
        aria-label={described ? `Graph of ${described}, x from ${Number(view.xMin.toPrecision(4))} to ${Number(view.xMax.toPrecision(4))}` : 'An empty graph'} />
      <div className="calc-view-buttons" role="group" aria-label="Move the graph">
        <button type="button" className="button" onClick={() => setView((v) => zoom(v, 0.5))}>Zoom in</button>
        <button type="button" className="button" onClick={() => setView((v) => zoom(v, 2))}>Zoom out</button>
        <button type="button" className="button" aria-label="Move left" onClick={() => setView((v) => pan(v, -0.25, 0))}>←</button>
        <button type="button" className="button" aria-label="Move right" onClick={() => setView((v) => pan(v, 0.25, 0))}>→</button>
        <button type="button" className="button" aria-label="Move up" onClick={() => setView((v) => pan(v, 0, 0.25))}>↑</button>
        <button type="button" className="button" aria-label="Move down" onClick={() => setView((v) => pan(v, 0, -0.25))}>↓</button>
        <button type="button" className="button" onClick={() => setView(STANDARD_VIEW)}>Standard view</button>
      </div>
      {table.length > 0 && (
        <details className="calc-table">
          <summary>Table of values for line {first + 1}</summary>
          <table data-testid="calc-table">
            <thead><tr><th scope="col">x</th><th scope="col">y</th></tr></thead>
            <tbody>{table.map((row) => <tr key={row.x}><td>{row.x}</td><td>{row.y ?? 'undefined'}</td></tr>)}</tbody>
          </table>
        </details>
      )}
    </div>
  );
}

/**
 * Study Forge's own scientific and graphing calculator. Answers can go into the note as equations.
 * It runs on the device; nothing is sent anywhere.
 */
export default function CalculatorPanel({ onInsert, onClose }: { onInsert?: (tex: string) => void; onClose?: () => void }) {
  const [mode, setMode] = useState<AngleMode>(() => remembered(MODE_KEY, ['deg', 'rad'], 'deg'));
  const [showAs, setShowAs] = useState<ShowAs>(() => remembered(SHOW_KEY, ['decimal', 'fraction'], 'decimal'));
  const calc = useMemo(() => new Calculator(mode), []);
  calc.setMode(mode);
  calc.showAs = showAs;
  const [tab, setTab] = useState<'calc' | 'graph'>('calc');
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<CalcResult[]>([]);
  const [failure, setFailure] = useState('');
  const [lines, setLines] = useState(['', '', '']);
  const [graphLines, setGraphLines] = useState(['', '', '']);
  const field = useRef<HTMLInputElement>(null);

  const type = (text: string) => {
    const box = field.current;
    const start = box?.selectionStart ?? input.length;
    const end = box?.selectionEnd ?? input.length;
    // A bare operator first thing continues from the last answer, as on a school calculator.
    const prefix = !input && history.length && /^[+×÷^!%]|^\^2$|^−$/.test(text) ? 'Ans' : '';
    const next = input.slice(0, start) + prefix + text + input.slice(end);
    setInput(next);
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
  const remake = (nextShow: ShowAs) => {
    setShowAs(nextShow);
    remember(SHOW_KEY, nextShow);
  };

  return (
    <section className="calc-panel" aria-label="Calculator" data-testid="calculator">
      <p className="calc-warning" role="note" data-testid="calc-warning">
        <span aria-hidden="true">⚠️</span>
        <span><b>For writing notes only.</b> Don’t use this calculator on a quiz, test or exam. It isn’t an approved exam calculator, and using it there could break your school’s rules.</span>
      </p>
      <div className="calc-head">
        <div className="calc-tabs" role="tablist" aria-label="Calculator view">
          <button type="button" role="tab" aria-selected={tab === 'calc'} className="button" onClick={() => setTab('calc')}>Calculate</button>
          <button type="button" role="tab" aria-selected={tab === 'graph'} className="button" onClick={() => setTab('graph')}>Graph</button>
        </div>
        <div className="calc-modes">
          <div className="calc-segment" role="group" aria-label="Angles">
            <button type="button" className="button" aria-pressed={mode === 'deg'} onClick={() => { setMode('deg'); remember(MODE_KEY, 'deg'); }}>Degrees</button>
            <button type="button" className="button" aria-pressed={mode === 'rad'} onClick={() => { setMode('rad'); remember(MODE_KEY, 'rad'); }}>Radians</button>
          </div>
          {tab === 'calc' && (
            <div className="calc-segment" role="group" aria-label="Show answers as">
              <button type="button" className="button" aria-pressed={showAs === 'decimal'} onClick={() => remake('decimal')}>Decimal</button>
              <button type="button" className="button" aria-pressed={showAs === 'fraction'} onClick={() => remake('fraction')}>Fraction</button>
            </div>
          )}
        </div>
        {onClose && <button type="button" className="button calc-close" onClick={onClose}>Close calculator</button>}
      </div>

      {tab === 'calc' ? (
        <>
          <form className="calc-entry" onSubmit={(event) => { event.preventDefault(); run(); }}>
            <label className="sr-only" htmlFor="calc-input">Expression</label>
            <input id="calc-input" ref={field} className="calc-input" value={input} autoComplete="off" spellCheck={false} inputMode="text"
              placeholder="e.g. 2sin(30) + √16" onChange={(event) => { setInput(event.target.value); setFailure(''); }} />
            <button type="submit" className="button primary calc-equals" aria-label="Work it out">=</button>
          </form>
          {failure && <p className="error" role="alert">{failure}</p>}
          <div className="calc-keys">
            {KEYS.flat().map((key) => (
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
              <li>Fractions: 1/3 + 1/4 shows 7/12 when Fraction is on.</li>
              <li>Ans is the last answer. Start with + or × to keep going from it.</li>
              <li>Your own functions: f(x) = x^2, then f(3).</li>
              <li>Also nCr as combinations(5, 2), matrices like [1, 2; 3, 4], and units like 10 cm to inch.</li>
            </ul>
          </details>
        </>
      ) : (
        <>
          <form className="calc-lines" onSubmit={(event) => { event.preventDefault(); setGraphLines(lines); }}>
            {lines.map((line, i) => (
              <label key={i} className="calc-line-input">
                <span className="calc-swatch" style={{ color: LINE_COLORS[i], borderTopStyle: i === 2 ? 'dashed' : 'solid' }} aria-hidden="true" />
                <span>Line {i + 1}: y =</span>
                <input value={line} placeholder={i === 0 ? 'x^2 - 2' : ''} autoComplete="off" spellCheck={false}
                  onChange={(event) => setLines((now) => now.map((old, j) => (j === i ? event.target.value : old)))} />
              </label>
            ))}
            <div className="row-actions">
              <button type="submit" className="button primary">Draw</button>
              {onInsert && graphLines.some((line) => line.trim()) && (
                <button type="button" className="button" onClick={() => onInsert(graphLines.filter((line) => line.trim()).map((line) => calc.lineTex(line)).join(',\\quad '))}>
                  Put the lines in the note
                </button>
              )}
            </div>
          </form>
          <Graph calc={calc} lines={graphLines} />
        </>
      )}
    </section>
  );
}
