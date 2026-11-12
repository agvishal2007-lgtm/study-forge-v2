import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { AngleMode, Calculator } from '../../data/calculatorRules';
import {
  CALC_MENU, findExtrema, findIntersections, findZeros, nearest, safe, screenNumber, STANDARD_WINDOW, tableRows, toScreen,
  traceStep, windowProblem, ZOOM_MENU, zoomWindow, type CalcKind, type GraphWindow,
} from '../../data/graphRules';

/*
 * A graphing calculator laid out like a TI-84-style handheld: the screen on top, the graphing keys
 * under it, 2nd and ALPHA shift keys, arrow keys, and the familiar Y=, WINDOW, ZOOM, TRACE, GRAPH,
 * TABLE, CALC and MODE screens. It's Study Forge's own build, not Texas Instruments software.
 * Only keys that work are shown.
 */

type Screen = 'home' | 'yeq' | 'window' | 'tblset' | 'graph' | 'table' | 'mode' | 'zoom' | 'calc' | 'math';

const FUNCTION_COLORS = ['#1d4ed8', '#b91c1c', '#111827', '#a21caf', '#15803d', '#9a3412'];
const FUNCTION_COLORS_DARK = ['#60a5fa', '#f87171', '#f3f4f6', '#e879f9', '#4ade80', '#fb923c'];

const MATH_MENU: { key: string; label: string; type: string }[] = [
  { key: '1', label: '▶Frac', type: '▶Frac' },
  { key: '2', label: '▶Dec', type: '▶Dec' },
  { key: '3', label: '³', type: '³' },
  { key: '4', label: '³√(', type: '³√(' },
  { key: '5', label: 'ˣ√( as root(x,n)', type: 'root(' },
  { key: '6', label: 'abs(', type: 'abs(' },
  { key: '7', label: 'round(', type: 'round(' },
  { key: '8', label: 'gcd(', type: 'gcd(' },
  { key: '9', label: 'lcm(', type: 'lcm(' },
  { key: '0', label: 'nCr', type: ' nCr ' },
  { key: 'A', label: 'nPr', type: ' nPr ' },
  { key: 'B', label: '!', type: '!' },
];

const WINDOW_FIELDS: (keyof GraphWindow)[] = ['xmin', 'xmax', 'xscl', 'ymin', 'ymax', 'yscl'];
const WINDOW_LABEL: Record<keyof GraphWindow, string> = { xmin: 'Xmin', xmax: 'Xmax', xscl: 'Xscl', ymin: 'Ymin', ymax: 'Ymax', yscl: 'Yscl' };

interface Key {
  id: string;
  label: string;
  /** What 2nd turns it into. */
  second?: { id: string; label: string };
  /** The letter ALPHA types. */
  alpha?: string;
  kind?: 'graph' | 'shift2' | 'alpha' | 'fn' | 'num' | 'op' | 'enter' | 'clear';
  aria?: string;
}

// Rows follow a TI-84-style keypad. Keys that aren't built here are left out rather than shown dead.
const ROWS: Key[][] = [
  [
    { id: 'yeq', label: 'Y=', kind: 'graph', aria: 'Y equals' },
    { id: 'window', label: 'WINDOW', kind: 'graph', second: { id: 'tblset', label: 'TBLSET' } },
    { id: 'zoom', label: 'ZOOM', kind: 'graph' },
    { id: 'trace', label: 'TRACE', kind: 'graph', second: { id: 'calc', label: 'CALC' } },
    { id: 'graph', label: 'GRAPH', kind: 'graph', second: { id: 'table', label: 'TABLE' } },
  ],
  [
    { id: '2nd', label: '2nd', kind: 'shift2', aria: 'Second' },
    { id: 'mode', label: 'MODE', kind: 'fn', second: { id: 'quit', label: 'QUIT' } },
    { id: 'del', label: 'DEL', kind: 'fn', aria: 'Delete' },
  ],
  [
    { id: 'alpha', label: 'ALPHA', kind: 'alpha' },
    { id: 'xt', label: 'X,T,θ,n', kind: 'fn', aria: 'X' },
    { id: 'math', label: 'MATH', kind: 'fn', alpha: 'A' },
  ],
  [
    { id: 'inv', label: 'x⁻¹', kind: 'fn', alpha: 'D', aria: 'reciprocal' },
    { id: 'sin', label: 'sin', kind: 'fn', alpha: 'E', second: { id: 'asin', label: 'sin⁻¹' } },
    { id: 'cos', label: 'cos', kind: 'fn', alpha: 'F', second: { id: 'acos', label: 'cos⁻¹' } },
    { id: 'tan', label: 'tan', kind: 'fn', alpha: 'G', second: { id: 'atan', label: 'tan⁻¹' } },
    { id: 'pow', label: '^', kind: 'op', alpha: 'H', second: { id: 'pi', label: 'π' }, aria: 'to the power' },
  ],
  [
    { id: 'sq', label: 'x²', kind: 'fn', alpha: 'I', second: { id: 'sqrt', label: '√' }, aria: 'squared' },
    { id: 'comma', label: ',', kind: 'fn', alpha: 'J', second: { id: 'ee', label: 'EE' }, aria: 'comma' },
    { id: 'lp', label: '(', kind: 'fn', alpha: 'K', aria: 'open bracket' },
    { id: 'rp', label: ')', kind: 'fn', alpha: 'L', aria: 'close bracket' },
    { id: 'div', label: '÷', kind: 'op', alpha: 'M', second: { id: 'e', label: 'e' }, aria: 'divide' },
  ],
  [
    { id: 'log', label: 'log', kind: 'fn', alpha: 'N', second: { id: 'tenx', label: '10ˣ' } },
    { id: '7', label: '7', kind: 'num', alpha: 'O' },
    { id: '8', label: '8', kind: 'num', alpha: 'P' },
    { id: '9', label: '9', kind: 'num', alpha: 'Q' },
    { id: 'mul', label: '×', kind: 'op', alpha: 'R', aria: 'times' },
  ],
  [
    { id: 'ln', label: 'ln', kind: 'fn', alpha: 'S', second: { id: 'ex', label: 'eˣ' } },
    { id: '4', label: '4', kind: 'num', alpha: 'T' },
    { id: '5', label: '5', kind: 'num', alpha: 'U' },
    { id: '6', label: '6', kind: 'num', alpha: 'V' },
    { id: 'sub', label: '−', kind: 'op', alpha: 'W', aria: 'minus' },
  ],
  [
    { id: 'sto', label: 'STO→', kind: 'fn', alpha: 'X', aria: 'store' },
    { id: '1', label: '1', kind: 'num', alpha: 'Y' },
    { id: '2', label: '2', kind: 'num', alpha: 'Z' },
    { id: '3', label: '3', kind: 'num', alpha: 'θ' },
    { id: 'add', label: '+', kind: 'op', aria: 'plus' },
  ],
  [
    { id: 'clear', label: 'CLEAR', kind: 'clear' },
    { id: '0', label: '0', kind: 'num' },
    { id: 'dot', label: '.', kind: 'num', aria: 'decimal point' },
    { id: 'neg', label: '(−)', kind: 'num', second: { id: 'ans', label: 'ANS' }, aria: 'negative' },
    { id: 'enter', label: 'ENTER', kind: 'enter', second: { id: 'entry', label: 'ENTRY' } },
  ],
];

/** What each typing key puts on the screen. */
const TYPES: Record<string, string> = {
  xt: 'X', inv: '⁻¹', sin: 'sin(', cos: 'cos(', tan: 'tan(', pow: '^', sq: '²', comma: ',', lp: '(', rp: ')', div: '÷',
  log: 'log(', mul: '×', ln: 'ln(', sub: '−', sto: '→', add: '+', dot: '.', neg: '-',
  asin: 'sin⁻¹(', acos: 'cos⁻¹(', atan: 'tan⁻¹(', pi: 'π', sqrt: '√(', ee: 'ᴇ', e: 'e', tenx: '10^(', ex: 'e^(', ans: 'Ans',
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
};

/** Keyboard keys on a computer, mapped to calculator keys. */
const KEYBOARD: Record<string, string> = {
  Enter: 'enter', Backspace: 'del', Delete: 'del', Escape: 'clear', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '^': 'pow', '(': 'lp', ')': 'rp', ',': 'comma', '.': 'dot', x: 'xt', X: 'xt',
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
};

interface HomeLine { input: string; output: string; error?: boolean }

export interface GraphingState {
  lines: HomeLine[];
  entry: string;
  funcs: string[];
  win: GraphWindow;
  tblStart: number;
  tblStep: number;
  digits: 'float' | number;
}

export const freshGraphingState = (): GraphingState => ({
  lines: [], entry: '', funcs: ['', '', '', '', '', ''], win: { ...STANDARD_WINDOW }, tblStart: 0, tblStep: 1, digits: 'float',
});

export function GraphingPad({ calc, angle, onAngle, state, setState, onInsert }: {
  calc: Calculator;
  angle: AngleMode;
  onAngle: (mode: AngleMode) => void;
  state: GraphingState;
  setState: (update: (now: GraphingState) => GraphingState) => void;
  onInsert?: (tex: string) => void;
}) {
  const [screen, setScreen] = useState<Screen>('home');
  const [second, setSecond] = useState(false);
  const [alpha, setAlpha] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [row, setRow] = useState(0);
  const [menuAt, setMenuAt] = useState(0);
  const [edit, setEdit] = useState<string | null>(null);
  const [trace, setTrace] = useState<{ fn: number; x: number } | null>(null);
  const [free, setFree] = useState<{ x: number; y: number } | null>(null);
  const [prompt, setPrompt] = useState<{ kind: 'value' | 'jump'; text: string } | null>(null);
  const [found, setFound] = useState<string>('');
  const [error, setError] = useState<{ title: string; detail: string; back: Screen } | null>(null);
  const [lastEntry, setLastEntry] = useState('');
  const [tblTop, setTblTop] = useState(0);
  const screenRef = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const { lines, entry, funcs, win, tblStart, tblStep, digits } = state;
  const num = useCallback((value: number) => screenNumber(value, digits), [digits]);

  const compiled = useMemo(() => funcs.map((text) => {
    if (!text.trim()) return null;
    const made = calc.graph(text);
    return 'error' in made ? { error: made.error } : { fn: made.fn };
    // angle changes what sin(X) means, so the lines are remade with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [funcs, calc, angle]);
  const active = compiled.map((item, index) => (item && 'fn' in item ? index : -1)).filter((index) => index >= 0);
  const fnAt = (index: number) => { const item = compiled[index]; return item && 'fn' in item ? item.fn : null; };

  const set = (patch: Partial<GraphingState>) => setState((now) => ({ ...now, ...patch }));

  /** Puts text at the cursor of whatever is being edited. */
  const typeText = (text: string, target: Screen = screen) => {
    if (target === 'home') {
      const at = cursor ?? entry.length;
      // An operator first thing continues from the last answer, as on the handheld.
      const prefix = !entry && lines.length && /^[+×÷^²⁻¹→−]/.test(text) && text !== '−' ? 'Ans' : '';
      set({ entry: entry.slice(0, at) + prefix + text + entry.slice(at) });
      setCursor(cursor === null ? null : at + prefix.length + text.length);
    } else if (target === 'yeq') {
      const current = funcs[row];
      const at = cursor ?? current.length;
      set({ funcs: funcs.map((f, i) => (i === row ? current.slice(0, at) + text + current.slice(at) : f)) });
      setCursor(cursor === null ? null : at + text.length);
    } else if (target === 'window' || target === 'tblset') {
      setEdit((now) => (now ?? '') + text);
    } else if (target === 'graph' && trace && /^[0-9.\-−]$/.test(text)) {
      setPrompt((now) => ({ kind: now?.kind ?? 'jump', text: (now?.text ?? '') + text }));
    } else if (target === 'graph' && prompt) {
      setPrompt({ ...prompt, text: prompt.text + text });
    }
  };

  const fail = (title: string, detail: string, back: Screen = screen) => setError({ title, detail, back });

  const commitField = () => {
    if (edit === null) return true;
    let value: number;
    try {
      const result = calc.run(edit.replace(/−/g, '-')).value;
      value = typeof result === 'number' ? result : Number.NaN;
    } catch {
      value = Number.NaN;
    }
    if (!Number.isFinite(value)) { fail('ERR:SYNTAX', 'That isn’t a number.'); return false; }
    if (screen === 'window') {
      const field = WINDOW_FIELDS[row];
      const next = { ...win, [field]: value };
      const problem = windowProblem(next);
      if (problem) { fail('ERR:WINDOW RANGE', problem); setEdit(null); return false; }
      set({ win: next });
    } else {
      if (row === 0) set({ tblStart: value });
      else if (value === 0) { fail('ERR:DOMAIN', 'ΔTbl can’t be 0.'); setEdit(null); return false; }
      else set({ tblStep: value });
    }
    setEdit(null);
    return true;
  };

  const go = (next: Screen) => {
    if (!commitField()) return;
    setScreen(next);
    setCursor(null);
    setRow(0);
    setMenuAt(0);
    setPrompt(null);
    setFound('');
    setFree(null);
    // CALC works from where the trace cursor was, so it's kept for that menu.
    if (next !== 'graph' && next !== 'calc') setTrace(null);
    if (next === 'table') setTblTop(0);
  };

  const startTrace = () => {
    if (active.length === 0) { go('graph'); setFound('No functions are turned on. Press Y= to enter one.'); return; }
    go('graph');
    setTrace({ fn: active[0], x: (win.xmin + win.xmax) / 2 });
  };

  const runCalc = (kind: CalcKind) => {
    if (active.length === 0) { fail('ERR:NO FUNCTIONS', 'Enter a function on the Y= screen first.', 'home'); return; }
    setScreen('graph');
    setPrompt(null);
    const current = trace?.fn ?? active[0];
    const x0 = trace?.x ?? (win.xmin + win.xmax) / 2;
    const fn = fnAt(current)!;
    if (kind === 'value') {
      setTrace({ fn: current, x: x0 });
      setPrompt({ kind: 'value', text: '' });
      return;
    }
    let result: { x: number; y: number } | null = null;
    let label = '';
    if (kind === 'zero') {
      result = nearest(findZeros(fn, win.xmin, win.xmax).map((x) => ({ x, y: 0 })), x0);
      label = 'Zero';
    } else if (kind === 'minimum' || kind === 'maximum') {
      result = nearest(findExtrema(fn, win.xmin, win.xmax, kind), x0);
      label = kind === 'minimum' ? 'Minimum' : 'Maximum';
    } else {
      const other = active.find((index) => index !== current);
      if (other === undefined) { fail('ERR:INVALID', 'Intersect needs two functions turned on.', 'graph'); return; }
      result = nearest(findIntersections(fn, fnAt(other)!, win.xmin, win.xmax), x0);
      label = 'Intersection';
    }
    if (!result) {
      setTrace({ fn: current, x: x0 });
      setFound(`ERR:NO SIGN CHNG — no ${label.toLowerCase()} of Y${current + 1} in this window. Try another window or ZOOM.`);
      return;
    }
    setTrace({ fn: current, x: result.x });
    setFound(`${label}  X=${num(result.x)}  Y=${num(result.y)}`);
  };

  const evaluate = () => {
    const text = entry.trim();
    const source = text || lastEntry;
    if (!source) return;
    try {
      const result = calc.run(source.replace(/−/g, '-'));
      const output = typeof result.value === 'number' && !/▶Frac$/.test(source) ? num(result.value) : result.answer;
      set({ lines: [...lines, { input: source, output }].slice(-40), entry: '' });
      setLastEntry(source);
      setCursor(null);
    } catch (problem) {
      fail('ERR:SYNTAX', (problem as Error).message, 'home');
    }
  };

  const moveTrace = (dx: number) => {
    if (!trace) return;
    const nextX = trace.x + dx * traceStep(win);
    let next = { ...win };
    // Moving past the edge slides the window along, as on the handheld.
    if (nextX > win.xmax || nextX < win.xmin) {
      const shift = nextX > win.xmax ? (win.xmax - win.xmin) / 4 : -(win.xmax - win.xmin) / 4;
      next = { ...win, xmin: win.xmin + shift, xmax: win.xmax + shift };
      set({ win: next });
    }
    setTrace({ ...trace, x: nextX });
    setFound('');
  };

  const press = (raw: string) => {
    if (error) { const back = error.back; setError(null); setScreen(back); return; }
    let id = raw;
    const key = ROWS.flat().find((item) => item.id === raw);
    if (second && key?.second) id = key.second.id;
    else if (alpha && key?.alpha) { typeText(key.alpha); setAlpha(false); setSecond(false); return; }
    if (id === '2nd') { setSecond((now) => !now); setAlpha(false); return; }
    if (id === 'alpha') { setAlpha((now) => !now); setSecond(false); return; }
    setSecond(false);
    setAlpha(false);

    // Screens and menus.
    if (id === 'yeq') return go('yeq');
    if (id === 'window') return go('window');
    if (id === 'tblset') return go('tblset');
    if (id === 'zoom') return go('zoom');
    if (id === 'calc') return go('calc');
    if (id === 'mode') return go('mode');
    if (id === 'math') return go('math');
    if (id === 'graph') return go('graph');
    if (id === 'table') return go('table');
    if (id === 'trace') return startTrace();
    if (id === 'quit') return go('home');
    if (id === 'entry') { if (screen === 'home') { set({ entry: lastEntry }); setCursor(null); } return; }

    // Menus pick by number, or by arrows and ENTER.
    const menu = screen === 'zoom' ? ZOOM_MENU : screen === 'calc' ? CALC_MENU : screen === 'math' ? MATH_MENU : null;
    if (menu) {
      const byDigit = menu.findIndex((item) => item.key === (TYPES[id] ?? '').toUpperCase());
      const choose = (index: number) => {
        if (screen === 'zoom') {
          const kind = ZOOM_MENU[index].kind;
          set({ win: zoomWindow(win, kind, angle, active.map((i) => fnAt(i)!)) });
          go('graph');
        } else if (screen === 'calc') runCalc(CALC_MENU[index].kind);
        else { setScreen('home'); setMenuAt(0); typeText(MATH_MENU[index].type, 'home'); }
      };
      if (byDigit >= 0) return choose(byDigit);
      if (id === 'up') return setMenuAt((at) => (at + menu.length - 1) % menu.length);
      if (id === 'down') return setMenuAt((at) => (at + 1) % menu.length);
      if (id === 'enter') return choose(menuAt);
      if (id === 'clear') return go('home');
      return;
    }

    if (screen === 'mode') {
      // Row 0: Radian / Degree. Row 1: Float or a fixed number of decimal places.
      if (id === 'up' || id === 'down') return setRow((r) => (r === 0 ? 1 : 0));
      if (row === 0 && (id === 'left' || id === 'right' || id === 'enter')) {
        if (id === 'enter') return;
        return onAngle(id === 'left' ? 'rad' : 'deg');
      }
      if (row === 1 && (id === 'left' || id === 'right')) {
        const options: ('float' | number)[] = ['float', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        const at = options.indexOf(digits);
        return set({ digits: options[(at + (id === 'left' ? options.length - 1 : 1)) % options.length] });
      }
      if (id === 'clear') return go('home');
      return;
    }

    if (screen === 'graph') {
      if (prompt && id === 'enter') {
        const value = Number(prompt.text.replace(/−/g, '-'));
        if (!Number.isFinite(value) || prompt.text === '') { setPrompt(null); return; }
        if (value < win.xmin || value > win.xmax) { fail('ERR:INVALID', 'That X is outside the window. Change Xmin and Xmax on the WINDOW screen.', 'graph'); setPrompt(null); return; }
        setTrace({ fn: trace?.fn ?? active[0] ?? 0, x: value });
        setPrompt(null);
        return;
      }
      if (prompt && id === 'del') return setPrompt({ ...prompt, text: prompt.text.slice(0, -1) });
      if (trace) {
        if (id === 'left') return moveTrace(-1);
        if (id === 'right') return moveTrace(1);
        if (id === 'up' || id === 'down') {
          const at = active.indexOf(trace.fn);
          const next = active[(at + (id === 'down' ? 1 : active.length - 1)) % active.length];
          setFound('');
          return setTrace({ ...trace, fn: next });
        }
      } else if (['left', 'right', 'up', 'down'].includes(id)) {
        // A free-moving cursor shows the coordinates of any point.
        const now = free ?? { x: (win.xmin + win.xmax) / 2, y: (win.ymin + win.ymax) / 2 };
        const sx = traceStep(win);
        const sy = (win.ymax - win.ymin) / 164;
        return setFree({ x: now.x + (id === 'left' ? -sx : id === 'right' ? sx : 0), y: now.y + (id === 'up' ? sy : id === 'down' ? -sy : 0) });
      }
      if (id === 'clear') return go('home');
      if (TYPES[id]) return typeText(TYPES[id]);
      return;
    }

    if (screen === 'table') {
      if (id === 'up') return setTblTop((top) => top - 1);
      if (id === 'down') return setTblTop((top) => top + 1);
      if (id === 'clear') return go('home');
      return;
    }

    if (screen === 'window' || screen === 'tblset') {
      const count = screen === 'window' ? WINDOW_FIELDS.length : 2;
      if (id === 'up' || id === 'down' || id === 'enter') {
        if (!commitField()) return;
        return setRow((r) => (id === 'up' ? (r + count - 1) % count : (r + 1) % count));
      }
      if (id === 'del') return setEdit((now) => (now ?? '').slice(0, -1));
      if (id === 'clear') return setEdit('');
      if (TYPES[id]) return typeText(TYPES[id]);
      return;
    }

    if (screen === 'yeq') {
      const current = funcs[row];
      if (id === 'up') { setRow((r) => (r + funcs.length - 1) % funcs.length); setCursor(null); return; }
      if (id === 'down' || id === 'enter') { setRow((r) => (r + 1) % funcs.length); setCursor(null); return; }
      if (id === 'left') return setCursor(Math.max(0, (cursor ?? current.length) - 1));
      if (id === 'right') return setCursor(Math.min(current.length, (cursor ?? current.length) + 1));
      if (id === 'clear') { set({ funcs: funcs.map((f, i) => (i === row ? '' : f)) }); setCursor(null); return; }
      if (id === 'del') {
        const at = cursor ?? current.length;
        if (at === 0) return;
        set({ funcs: funcs.map((f, i) => (i === row ? current.slice(0, at - 1) + current.slice(at) : f)) });
        setCursor(cursor === null ? null : at - 1);
        return;
      }
      if (TYPES[id]) return typeText(TYPES[id]);
      return;
    }

    // Home screen.
    if (id === 'enter') return evaluate();
    if (id === 'clear') { if (entry) set({ entry: '' }); else set({ lines: [] }); setCursor(null); return; }
    if (id === 'del') {
      const at = cursor ?? entry.length;
      if (at === 0) return;
      set({ entry: entry.slice(0, at - 1) + entry.slice(at) });
      setCursor(cursor === null ? null : at - 1);
      return;
    }
    if (id === 'left') return setCursor(Math.max(0, (cursor ?? entry.length) - 1));
    if (id === 'right') { const next = (cursor ?? entry.length) + 1; return setCursor(next >= entry.length ? null : next); }
    if (id === 'up') { set({ entry: lastEntry }); setCursor(null); return; }
    if (TYPES[id]) typeText(TYPES[id]);
  };

  // Keyboard typing works when the calculator has focus.
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const id = KEYBOARD[event.key];
    if (id) { event.preventDefault(); press(id); return; }
    if (/^[a-zA-Z]$/.test(event.key) && (screen === 'home' || screen === 'yeq')) {
      event.preventDefault();
      // Letters type as on a computer, so sin, cos, abs and variables can be typed directly.
      typeText(event.key === 'x' ? 'X' : event.key);
    }
  };

  // Draws the graph screen.
  useEffect(() => {
    if (screen !== 'graph') return;
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
      const dark = getComputedStyle(element).getPropertyValue('--lcd-dark').trim() === '1';
      const ink = dark ? '#e5e7eb' : '#111827';
      const colors = dark ? FUNCTION_COLORS_DARK : FUNCTION_COLORS;
      const { px, py } = toScreen(win, width, height);
      ctx.clearRect(0, 0, width, height);
      // Axes and tick marks every Xscl and Yscl.
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (win.ymin <= 0 && win.ymax >= 0) { ctx.moveTo(0, py(0) + 0.5); ctx.lineTo(width, py(0) + 0.5); }
      if (win.xmin <= 0 && win.xmax >= 0) { ctx.moveTo(px(0) + 0.5, 0); ctx.lineTo(px(0) + 0.5, height); }
      const ticks = (scale: number, from: number, to: number) => (scale > 0 && (to - from) / scale <= 200 ? Array.from({ length: Math.floor(to / scale) - Math.ceil(from / scale) + 1 }, (_, i) => (Math.ceil(from / scale) + i) * scale) : []);
      const axisY = Math.min(Math.max(py(0), 0), height);
      const axisX = Math.min(Math.max(px(0), 0), width);
      for (const x of ticks(win.xscl, win.xmin, win.xmax)) { ctx.moveTo(px(x) + 0.5, axisY - 3); ctx.lineTo(px(x) + 0.5, axisY + 3); }
      for (const y of ticks(win.yscl, win.ymin, win.ymax)) { ctx.moveTo(axisX - 3, py(y) + 0.5); ctx.lineTo(axisX + 3, py(y) + 0.5); }
      ctx.stroke();
      // Each function in its own colour, broken where it jumps off the screen.
      active.forEach((index) => {
        const fn = fnAt(index)!;
        ctx.strokeStyle = colors[index];
        ctx.lineWidth = 2;
        ctx.beginPath();
        let drawing = false;
        let lastY = 0;
        for (let i = 0; i <= width; i++) {
          const x = win.xmin + ((win.xmax - win.xmin) * i) / width;
          const y = safe(fn, x);
          const sy = py(y);
          if (!Number.isFinite(y) || (drawing && Math.abs(sy - lastY) > height * 2)) { drawing = false; continue; }
          if (drawing) ctx.lineTo(i, sy); else ctx.moveTo(i, sy);
          drawing = true;
          lastY = sy;
        }
        ctx.stroke();
      });
      // The trace or free cursor: a small cross.
      const point = trace ? { x: trace.x, y: safe(fnAt(trace.fn) ?? (() => Number.NaN), trace.x) } : free;
      if (point && Number.isFinite(point.y)) {
        ctx.strokeStyle = trace ? colors[trace.fn] : ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px(point.x) - 6, py(point.y)); ctx.lineTo(px(point.x) + 6, py(point.y));
        ctx.moveTo(px(point.x), py(point.y) - 6); ctx.lineTo(px(point.x), py(point.y) + 6);
        ctx.stroke();
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  });

  const traceY = trace ? safe(fnAt(trace.fn) ?? (() => Number.NaN), trace.x) : null;
  const shown = (text: string, at: number | null) => (at === null ? <>{text}<span className="lcd-cursor" aria-hidden="true">▮</span></> : <>{text.slice(0, at)}<span className="lcd-cursor" aria-hidden="true">▮</span>{text.slice(at)}</>);
  const graphDescription = active.length
    ? `Graph of ${active.map((i) => `Y${i + 1} = ${funcs[i]}`).join('; ')}. X from ${num(win.xmin)} to ${num(win.xmax)}, Y from ${num(win.ymin)} to ${num(win.ymax)}.`
    : 'An empty graph. Press Y= to enter a function.';

  const screenBody = () => {
    if (error) {
      return (
        <div className="lcd-text" role="alert">
          <p className="lcd-error">{error.title}</p>
          <p>{error.detail}</p>
          <p className="lcd-dim">Press any key to go back.</p>
        </div>
      );
    }
    switch (screen) {
      case 'home':
        return (
          <div className="lcd-text lcd-home" data-testid="lcd-home">
            {lines.slice(-6).map((line, i) => (
              <div key={`${lines.length}-${i}`} className="lcd-pair">
                <div className="lcd-in">{line.input}</div>
                <div className="lcd-out" data-testid="lcd-answer">{line.output}</div>
              </div>
            ))}
            <div className="lcd-in lcd-entry" data-testid="lcd-entry">{shown(entry, cursor)}</div>
          </div>
        );
      case 'yeq':
        return (
          <div className="lcd-text" data-testid="lcd-yeq">
            {funcs.map((text, i) => (
              <div key={i} className={`lcd-row${row === i ? ' lcd-selected' : ''}`}>
                <span className={`lcd-fname lcd-f${i}`}>Y{i + 1}=</span>
                <span data-testid={`lcd-y${i + 1}`}>{row === i ? shown(text, cursor) : text}</span>
                {compiled[i] && 'error' in compiled[i]! && <span className="lcd-dim"> (can’t graph)</span>}
              </div>
            ))}
          </div>
        );
      case 'window':
      case 'tblset': {
        const rows = screen === 'window'
          ? WINDOW_FIELDS.map((field) => ({ label: WINDOW_LABEL[field], value: win[field] }))
          : [{ label: 'TblStart', value: tblStart }, { label: 'ΔTbl', value: tblStep }];
        return (
          <div className="lcd-text" data-testid={`lcd-${screen}`}>
            <div className="lcd-title">{screen === 'window' ? 'WINDOW' : 'TABLE SETUP'}</div>
            {rows.map((item, i) => (
              <div key={item.label} className={`lcd-row${row === i ? ' lcd-selected' : ''}`}>
                {item.label}={row === i && edit !== null ? shown(edit, null) : num(item.value)}
              </div>
            ))}
          </div>
        );
      }
      case 'mode':
        return (
          <div className="lcd-text" data-testid="lcd-mode">
            <div className={`lcd-row${row === 0 ? ' lcd-selected' : ''}`}>
              <span className={angle === 'rad' ? 'lcd-on' : ''}>RADIAN</span> <span className={angle === 'deg' ? 'lcd-on' : ''}>DEGREE</span>
            </div>
            <div className={`lcd-row${row === 1 ? ' lcd-selected' : ''}`}>
              {(['float', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((d) => <span key={String(d)} className={digits === d ? 'lcd-on' : ''}>{d === 'float' ? 'FLOAT' : d} </span>)}
            </div>
            <p className="lcd-dim">▲▼ choose a row, ◀▶ change it.</p>
          </div>
        );
      case 'zoom':
      case 'calc':
      case 'math': {
        const items = screen === 'zoom' ? ZOOM_MENU : screen === 'calc' ? CALC_MENU : MATH_MENU;
        return (
          <div className="lcd-text" data-testid={`lcd-${screen}`}>
            <div className="lcd-title">{screen === 'zoom' ? 'ZOOM' : screen === 'calc' ? 'CALCULATE' : 'MATH'}</div>
            {items.map((item, i) => (
              <div key={item.key} className={`lcd-row${menuAt === i ? ' lcd-selected' : ''}`}>{item.key}:{item.label}</div>
            ))}
          </div>
        );
      }
      case 'table': {
        const shownFns = active.slice(0, 3);
        const rows = tableRows(shownFns.map((i) => fnAt(i)!), tblStart + tblTop * tblStep, tblStep, 7);
        return (
          <table className="lcd-table" data-testid="lcd-table">
            <thead><tr><th scope="col">X</th>{shownFns.map((i) => <th key={i} scope="col" className={`lcd-f${i}`}>Y{i + 1}</th>)}</tr></thead>
            <tbody>{rows.map((r) => <tr key={r.x}><td>{num(r.x)}</td>{r.ys.map((y, i) => <td key={i}>{y === null ? 'ERROR' : num(y)}</td>)}</tr>)}</tbody>
          </table>
        );
      }
      case 'graph':
        return (
          <div className="lcd-graph">
            <canvas ref={canvas} className="lcd-canvas" role="img" aria-label={graphDescription} data-testid="lcd-canvas" />
            {trace && <div className={`lcd-top lcd-f${trace.fn}`}>Y{trace.fn + 1}={funcs[trace.fn]}</div>}
            <div className="lcd-bottom" data-testid="lcd-coords" aria-live="polite">
              {prompt ? <>X={shown(prompt.text, null)}</>
                : found ? found
                : trace ? <>X={num(trace.x)}<span className="lcd-gap" />Y={traceY !== null && Number.isFinite(traceY) ? num(traceY) : ''}</>
                : free ? <>X={num(free.x)}<span className="lcd-gap" />Y={num(free.y)}</>
                : null}
            </div>
          </div>
        );
    }
  };

  // The status line shows when 2nd or ALPHA is waiting for the next key.
  const status = second ? '2nd' : alpha ? 'ALPHA' : '';
  return (
    <div className="ti" data-testid="graphing">
      <div className="ti-screen-wrap">
        <div ref={screenRef} className="ti-screen" tabIndex={0} onKeyDown={onKeyDown} aria-label="Calculator screen. Type, or use the keys below." data-screen={screen}>
          <div className="lcd-status" aria-live="polite">
            <span>{angle === 'deg' ? 'DEGREE' : 'RADIAN'} {digits === 'float' ? 'FLOAT' : `FIX ${digits}`}</span>
            <span className="lcd-shift" data-testid="lcd-shift">{status}</span>
          </div>
          {screenBody()}
        </div>
      </div>
      {onInsert && screen === 'home' && lines.length > 0 && (
        <button type="button" className="button ti-insert" onClick={() => {
          const last = lines[lines.length - 1];
          onInsert(`${calc.texFor(last.input)} = ${calc.texFor(last.output)}`);
        }}>Put the last answer in the note</button>
      )}
      {onInsert && screen === 'yeq' && active.length > 0 && (
        <button type="button" className="button ti-insert" onClick={() => onInsert(active.map((i) => `Y_{${i + 1}} = ${calc.texFor(funcs[i])}`).join(',\\quad '))}>Put the functions in the note</button>
      )}
      <div className="ti-keys" onKeyDown={onKeyDown}>
        {ROWS.map((keys, r) => {
          if (r === 2) return null;
          const cell = (key: Key) => (
            <div key={key.id} className="ti-cell">
              <span className="ti-labels" aria-hidden="true">
                <span className="ti-second">{key.second?.label ?? ''}</span>
                <span className="ti-alpha">{key.alpha ?? ''}</span>
              </span>
              <button
                type="button"
                className={`ti-key ti-${key.kind ?? 'fn'}${(key.id === '2nd' && second) || (key.id === 'alpha' && alpha) ? ' ti-armed' : ''}`}
                aria-label={`${key.aria ?? key.label}${key.second ? `, second: ${key.second.label}` : ''}${key.alpha ? `, alpha: ${key.alpha}` : ''}`}
                aria-pressed={key.id === '2nd' ? second : key.id === 'alpha' ? alpha : undefined}
                data-key={key.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { press(key.id); screenRef.current?.focus({ preventScroll: true }); }}
              >{key.label}</button>
            </div>
          );
          const arrow = (id: string, label: string, mark: string) => (
            <button type="button" className={`ti-key ti-arrow ti-${id}`} aria-label={label} data-key={id}
              onMouseDown={(event) => event.preventDefault()} onClick={() => { press(id); screenRef.current?.focus({ preventScroll: true }); }}>{mark}</button>
          );
          if (r === 1) {
            // 2nd, MODE, DEL over ALPHA, X,T,θ,n, MATH, with the arrow keys beside them, as on the handheld.
            return (
              <div key={r} className="ti-nav">
                <div className="ti-nav-keys">{[...ROWS[1], ...ROWS[2]].map(cell)}</div>
                <div className="ti-arrows" role="group" aria-label="Arrow keys">
                  {arrow('up', 'Up', '▲')}{arrow('left', 'Left', '◀')}{arrow('right', 'Right', '▶')}{arrow('down', 'Down', '▼')}
                </div>
              </div>
            );
          }
          return <div key={r} className={`ti-row ti-row-${r}`}>{keys.map(cell)}</div>;
        })}
      </div>
      <details className="calc-help">
        <summary>How to use the graphing calculator</summary>
        <ul>
          <li><b>Graph:</b> press Y=, type a function with X,T,θ,n (like X²−2), then GRAPH.</li>
          <li><b>WINDOW</b> sets Xmin, Xmax, Ymin and Ymax. <b>ZOOM</b> has Zoom In, Zoom Out, ZDecimal, ZSquare, ZStandard, ZTrig and ZoomFit.</li>
          <li><b>TRACE:</b> ◀ ▶ move along the line, ▲ ▼ switch lines. Type a number and ENTER to jump to that X.</li>
          <li><b>2nd CALC</b> finds a value, zero, minimum, maximum or intersection. It looks inside the current window and picks the one nearest the cursor.</li>
          <li><b>2nd TABLE</b> shows values; 2nd TBLSET sets where it starts and its step.</li>
          <li><b>MODE</b> switches Radian or Degree and decimal places. 2nd QUIT goes back to the home screen.</li>
          <li><b>STO→</b> stores a value, like 5 STO→ ALPHA A. A computer keyboard works too.</li>
        </ul>
      </details>
    </div>
  );
}
