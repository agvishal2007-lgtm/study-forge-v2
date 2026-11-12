/*
 * Study Forge's own scientific and graphing calculator, built on math.js (Apache-2.0). It works the
 * way a school calculator does: log is base 10, ln is natural, trig follows Degrees or Radians,
 * and Ans is the last answer. Everything runs on the device. No DOM here, so it can be tested.
 */
import { all, create } from 'mathjs';

export type AngleMode = 'deg' | 'rad';
export type ShowAs = 'decimal' | 'fraction';

export interface CalcResult {
  expression: string;
  /** The answer as the student sees it. */
  answer: string;
  /** The raw value, kept for Ans. */
  value: unknown;
  /** The work and answer as an equation for a note. */
  tex: string;
}

/** Turns calculator symbols into what math.js reads. */
export function normalize(input: string): string {
  return input
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√\(/g, 'sqrt(')
    .replace(/√(\d+(\.\d+)?|[a-z]+)/gi, 'sqrt($1)')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/\bAns\b/g, 'ans')
    .trim();
}

const TRIG = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot'] as const;
const INVERSE = ['asin', 'acos', 'atan', 'asec', 'acsc', 'acot'] as const;

function makeMath(mode: AngleMode) {
  const math = create(all);
  const base = create(all);
  const toRad = (x: unknown) => (mode === 'deg' && typeof x === 'number' ? (x * Math.PI) / 180 : x);
  const fromRad = (x: unknown) => (mode === 'deg' && typeof x === 'number' ? (x * 180) / Math.PI : x);
  const extra: Record<string, unknown> = {
    // School calculators: log is base 10 unless a base is given, ln is natural.
    log: (x: number, b?: number) => (b === undefined ? base.log10(x) : base.log(x, b)),
    ln: (x: number) => base.log(x),
  };
  for (const name of TRIG) extra[name] = (x: unknown) => (base[name] as (v: unknown) => unknown)(toRad(x));
  for (const name of INVERSE) extra[name] = (x: unknown) => fromRad((base[name] as (v: unknown) => unknown)(x));
  math.import(extra, { override: true });
  const evaluate = math.evaluate.bind(math);
  const parse = math.parse.bind(math);
  // Following math.js's security advice, an expression can't import code or make new units.
  const refuse = () => { throw new Error('That isn’t available in the calculator.'); };
  math.import({ import: refuse, createUnit: refuse, reviver: refuse, evaluate: refuse, parse: refuse, simplify: refuse, derivative: refuse, resolve: refuse, compile: refuse }, { override: true });
  return { math, evaluate, parse };
}

/** Plain-words messages for the common mistakes. */
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Undefined symbol (\w+)/.test(message)) return `“${message.match(/Undefined symbol (\w+)/)![1]}” isn’t a number or function the calculator knows.`;
  if (/Unexpected end of expression|Parenthesis \) expected/.test(message)) return 'Something is missing at the end. Check the brackets.';
  if (/Unexpected/.test(message)) return 'Something is in the wrong place. Check the signs and brackets.';
  if (/isn’t available/.test(message)) return message;
  return 'That couldn’t be worked out. Check the expression.';
}

export class Calculator {
  private tools: ReturnType<typeof makeMath>;
  private scope = new Map<string, unknown>();
  mode: AngleMode;
  showAs: ShowAs = 'decimal';

  constructor(mode: AngleMode = 'deg') {
    this.mode = mode;
    this.tools = makeMath(mode);
    this.scope.set('ans', 0);
  }

  setMode(mode: AngleMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.tools = makeMath(mode);
  }

  /** Writes a value the way it should read, as a decimal or, when it's tidy, a fraction. */
  format(value: unknown): string {
    const { math } = this.tools;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return Number.isNaN(value) ? 'Not a number' : value > 0 ? '∞' : '-∞';
      if (this.showAs === 'fraction' && !Number.isInteger(value)) {
        const fraction = math.fraction(value) as { n: bigint | number; d: bigint | number; s: bigint | number };
        if (Number(fraction.d) <= 10000) return math.format(fraction, { fraction: 'ratio' });
      }
      return math.format(value, { precision: 12 });
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'function') return 'Function saved';
    return math.format(value, { precision: 12 });
  }

  /** Works out one line, saving the answer as Ans. Throws a plain-words Error when it can't. */
  run(input: string): CalcResult {
    const expression = normalize(input);
    if (!expression) throw new Error('Type something to work out first.');
    let value: unknown;
    try {
      value = this.tools.evaluate(expression, this.scope);
    } catch (error) {
      throw new Error(friendlyError(error));
    }
    if (value && typeof value === 'object' && 'entries' in (value as object) && Array.isArray((value as { entries: unknown[] }).entries)) {
      // Several lines separated by ; give a set of answers: keep the last one.
      const entries = (value as { entries: unknown[] }).entries;
      value = entries[entries.length - 1];
    }
    if (typeof value !== 'function') this.scope.set('ans', value);
    const answer = this.format(value);
    const work = this.texOf(expression);
    const unit = this.mode === 'deg' && /(?<![a-z])(a?(sin|cos|tan|sec|csc|cot))\(/i.test(expression) ? '\\;\\text{(degrees)}' : '';
    const tex = typeof value === 'function' ? work : `${work} = ${this.texOf(answer)}${unit}`;
    return { expression: input.trim(), answer, value, tex };
  }

  /** A graph line as an equation for a note, like y = x^{2}. */
  lineTex(line: string): string {
    return `y = ${this.texOf(normalize(line).replace(/^(y|f\s*\(\s*x\s*\))\s*=\s*/i, ''))}`;
  }

  /** An expression as an equation. log means base 10 here, as on a school calculator. */
  private texOf(expression: string): string {
    if (expression === '∞' || expression === '-∞') return expression.replace('∞', '\\infty');
    try {
      return this.tools.parse(expression).toTex({ parenthesis: 'auto', implicit: 'hide' })
        .replace(/\\ln\\left\(/g, '\\log_{10}\\left(')
        .replace(/\\mathrm\{ln\}/g, '\\ln')
        .replace(/\s*\bans\b/g, '\\mathrm{Ans}')
        .replace(/([{(])\s+/g, '$1')
        .trim();
    } catch {
      return `\\text{${expression.replace(/[{}\\$]/g, '')}}`;
    }
  }

  /**
   * A y = … line for the graph, as a function of x. "y =" or "f(x) =" in front is fine.
   * Returns null with a reason when it can't be graphed.
   */
  graph(input: string): { fn: (x: number) => number } | { error: string } {
    const expression = normalize(input).replace(/^(y|f\s*\(\s*x\s*\))\s*=\s*/i, '');
    if (!expression) return { error: 'Type a line to graph, like y = x^2.' };
    try {
      const node = this.tools.parse(expression);
      const code = node.compile();
      const scope = new Map(this.scope);
      const fn = (x: number) => {
        scope.set('x', x);
        const y = code.evaluate(scope);
        return typeof y === 'number' ? y : Number.NaN;
      };
      fn(0.5);
      return { fn };
    } catch (error) {
      return { error: friendlyError(error) };
    }
  }
}

export interface Viewport { xMin: number; xMax: number; yMin: number; yMax: number }
export const STANDARD_VIEW: Viewport = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

/** Zooms around the middle: a factor under 1 zooms in. */
export function zoom(view: Viewport, factor: number): Viewport {
  const cx = (view.xMin + view.xMax) / 2;
  const cy = (view.yMin + view.yMax) / 2;
  const hx = ((view.xMax - view.xMin) / 2) * factor;
  const hy = ((view.yMax - view.yMin) / 2) * factor;
  return { xMin: cx - hx, xMax: cx + hx, yMin: cy - hy, yMax: cy + hy };
}

/** Moves the view by a share of its width or height. */
export function pan(view: Viewport, dx: number, dy: number): Viewport {
  const w = (view.xMax - view.xMin) * dx;
  const h = (view.yMax - view.yMin) * dy;
  return { xMin: view.xMin + w, xMax: view.xMax + w, yMin: view.yMin + h, yMax: view.yMax + h };
}

/**
 * Points to draw across the view, broken where the line jumps off the screen (like tan at 90°),
 * so the graph never draws a false vertical line.
 */
export function plotSegments(fn: (x: number) => number, view: Viewport, samples: number): { x: number; y: number }[][] {
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  const height = view.yMax - view.yMin;
  let lastY: number | null = null;
  for (let i = 0; i <= samples; i++) {
    const x = view.xMin + ((view.xMax - view.xMin) * i) / samples;
    let y: number;
    try { y = fn(x); } catch { y = Number.NaN; }
    const jump = lastY !== null && Math.abs(y - lastY) > height * 2;
    if (!Number.isFinite(y) || jump) {
      if (current.length > 1) segments.push(current);
      current = Number.isFinite(y) ? [{ x, y }] : [];
      lastY = Number.isFinite(y) ? y : null;
      continue;
    }
    current.push({ x, y });
    lastY = y;
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

/** Tidy steps for grid lines: 1, 2 or 5 times a power of ten, about 10 across the view. */
export function gridStep(span: number): number {
  const raw = span / 10;
  const power = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / power;
  return (scaled < 1.5 ? 1 : scaled < 3.5 ? 2 : scaled < 7.5 ? 5 : 10) * power;
}

/** A small table of values for the graph, so it can be read without seeing it. */
export function valueTable(fn: (x: number) => number, view: Viewport, rows = 11): { x: number; y: number | null }[] {
  const step = gridStep(view.xMax - view.xMin);
  const middle = Math.round((view.xMin + view.xMax) / 2 / step) * step;
  const start = middle - Math.floor(rows / 2) * step;
  return Array.from({ length: rows }, (_, i) => {
    const x = Number((start + i * step).toPrecision(12));
    let y: number | null;
    try { y = fn(x); } catch { y = null; }
    return { x, y: y !== null && Number.isFinite(y) ? Number(y.toPrecision(6)) : null };
  });
}
