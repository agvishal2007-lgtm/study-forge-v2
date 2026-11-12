/*
 * The graphing calculator's maths: the viewing window, zoom presets, tracing steps, tables, and
 * finding zeros, minimums, maximums and intersections. Pure numbers, so it can be tested directly.
 * The searches look inside the current window, the way a handheld graphing calculator does.
 */

export interface GraphWindow {
  xmin: number;
  xmax: number;
  xscl: number;
  ymin: number;
  ymax: number;
  yscl: number;
}

export const STANDARD_WINDOW: GraphWindow = { xmin: -10, xmax: 10, xscl: 1, ymin: -10, ymax: 10, yscl: 1 };

/** The graph screen's size in dots. Trace moves one dot at a time. */
export const SCREEN_DOTS = { width: 265, height: 165 };

export type ZoomKind = 'in' | 'out' | 'decimal' | 'square' | 'standard' | 'trig' | 'fit';

/** The ZOOM menu, numbered as on a handheld graphing calculator. Box zoom isn't offered. */
export const ZOOM_MENU: { key: string; kind: ZoomKind; label: string }[] = [
  { key: '2', kind: 'in', label: 'Zoom In' },
  { key: '3', kind: 'out', label: 'Zoom Out' },
  { key: '4', kind: 'decimal', label: 'ZDecimal' },
  { key: '5', kind: 'square', label: 'ZSquare' },
  { key: '6', kind: 'standard', label: 'ZStandard' },
  { key: '7', kind: 'trig', label: 'ZTrig' },
  { key: '0', kind: 'fit', label: 'ZoomFit' },
];

export type CalcKind = 'value' | 'zero' | 'minimum' | 'maximum' | 'intersect';
export const CALC_MENU: { key: string; kind: CalcKind; label: string }[] = [
  { key: '1', kind: 'value', label: 'value' },
  { key: '2', kind: 'zero', label: 'zero' },
  { key: '3', kind: 'minimum', label: 'minimum' },
  { key: '4', kind: 'maximum', label: 'maximum' },
  { key: '5', kind: 'intersect', label: 'intersect' },
];

/** How far one trace step moves: one dot across the screen. */
export const traceStep = (w: GraphWindow) => (w.xmax - w.xmin) / (SCREEN_DOTS.width - 1);

export function zoomWindow(w: GraphWindow, kind: ZoomKind, angle: 'deg' | 'rad', fns: ((x: number) => number)[] = [], factor = 4): GraphWindow {
  const cx = (w.xmin + w.xmax) / 2;
  const cy = (w.ymin + w.ymax) / 2;
  switch (kind) {
    case 'in':
    case 'out': {
      const f = kind === 'in' ? 1 / factor : factor;
      const hx = ((w.xmax - w.xmin) / 2) * f;
      const hy = ((w.ymax - w.ymin) / 2) * f;
      return { ...w, xmin: cx - hx, xmax: cx + hx, ymin: cy - hy, ymax: cy + hy };
    }
    case 'decimal':
      // Each dot is a tidy 0.1 across.
      return { xmin: -13.2, xmax: 13.2, xscl: 1, ymin: -8.2, ymax: 8.2, yscl: 1 };
    case 'square': {
      // Same distance per dot both ways, so circles look round.
      const perDotY = (w.ymax - w.ymin) / (SCREEN_DOTS.height - 1);
      const half = (perDotY * (SCREEN_DOTS.width - 1)) / 2;
      return { ...w, xmin: cx - half, xmax: cx + half };
    }
    case 'standard':
      return { ...STANDARD_WINDOW };
    case 'trig':
      return angle === 'deg'
        ? { xmin: -352.5, xmax: 352.5, xscl: 90, ymin: -4, ymax: 4, yscl: 1 }
        : { xmin: (-47 * Math.PI) / 24, xmax: (47 * Math.PI) / 24, xscl: Math.PI / 2, ymin: -4, ymax: 4, yscl: 1 };
    case 'fit': {
      // Keeps the x range and fits y to every line shown.
      let lo = Infinity;
      let hi = -Infinity;
      for (const fn of fns) {
        for (let i = 0; i < SCREEN_DOTS.width; i++) {
          const y = safe(fn, w.xmin + i * traceStep(w));
          if (Number.isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
        }
      }
      if (!Number.isFinite(lo)) return w;
      if (lo === hi) { lo -= 1; hi += 1; }
      return { ...w, ymin: lo, ymax: hi };
    }
  }
}

export function safe(fn: (x: number) => number, x: number): number {
  try {
    const y = fn(x);
    return typeof y === 'number' ? y : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

/** Checks a window someone typed in. */
export function windowProblem(w: GraphWindow): string | null {
  if (![w.xmin, w.xmax, w.xscl, w.ymin, w.ymax, w.yscl].every(Number.isFinite)) return 'Every window setting needs a number.';
  if (w.xmin >= w.xmax) return 'Xmin must be less than Xmax.';
  if (w.ymin >= w.ymax) return 'Ymin must be less than Ymax.';
  if (w.xscl < 0 || w.yscl < 0) return 'Xscl and Yscl can’t be negative.';
  return null;
}

const bisect = (fn: (x: number) => number, a: number, b: number) => {
  let fa = safe(fn, a);
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2;
    const fm = safe(fn, m);
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
};

const tidy = (x: number, scale: number) => {
  // Removes floating-point dust, like 1.9999999999 for 2.
  const rounded = Number(x.toPrecision(10));
  return Math.abs(rounded - x) < scale * 1e-9 ? rounded : x;
};

/**
 * Every place the line crosses zero inside [a, b]. A jump across zero (like tan at 90°, or 1/x at
 * 0) is a break in the line, not a zero, so it's left out.
 */
export function findZeros(fn: (x: number) => number, a: number, b: number, samples = 800): number[] {
  const zeros: number[] = [];
  const step = (b - a) / samples;
  let px = a;
  let py = safe(fn, a);
  if (py === 0) zeros.push(a);
  for (let i = 1; i <= samples; i++) {
    const x = a + i * step;
    const y = safe(fn, x);
    if (Number.isFinite(y) && Number.isFinite(py)) {
      if (y === 0) zeros.push(x);
      else if (py !== 0 && Math.sign(y) !== Math.sign(py)) {
        const root = bisect(fn, px, x);
        const check = Math.abs(safe(fn, root));
        // A real zero gets close to 0; a break between huge values doesn't.
        if (check < 1e-6 * Math.max(1, Math.abs(py), Math.abs(y)) || check < 1e-9) zeros.push(tidy(root, b - a));
      }
    }
    px = x;
    py = y;
  }
  return zeros.filter((z, i) => i === 0 || Math.abs(z - zeros[i - 1]) > step / 2);
}

const golden = (fn: (x: number) => number, a: number, b: number, kind: 'min' | 'max') => {
  const g = (Math.sqrt(5) - 1) / 2;
  const f = (x: number) => (kind === 'min' ? safe(fn, x) : -safe(fn, x));
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  for (let i = 0; i < 100; i++) {
    if (f(c) < f(d)) b = d; else a = c;
    c = b - g * (b - a);
    d = a + g * (b - a);
  }
  return (a + b) / 2;
};

/** Turning points inside [a, b]: where the line stops falling and rises (minimum), or the reverse. */
export function findExtrema(fn: (x: number) => number, a: number, b: number, kind: 'minimum' | 'maximum', samples = 800): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const step = (b - a) / samples;
  const ys = Array.from({ length: samples + 1 }, (_, i) => safe(fn, a + i * step));
  for (let i = 1; i < samples; i++) {
    const [l, m, r] = [ys[i - 1], ys[i], ys[i + 1]];
    if (![l, m, r].every(Number.isFinite)) continue;
    const turn = kind === 'minimum' ? m <= l && m < r : m >= l && m > r;
    if (!turn) continue;
    // A turning point can only be pinned down to about a millionth of the window, so it's rounded
    // to that, which also turns 0.00000001 into the 0 it really is.
    const q = (b - a) * 1e-8;
    const x = Math.round(golden(fn, a + (i - 1) * step, a + (i + 1) * step, kind === 'minimum' ? 'min' : 'max') / q) * q + 0;
    const y = safe(fn, x);
    if (Number.isFinite(y)) out.push({ x: tidy(x, b - a), y: tidy(y, 1) });
  }
  return out;
}

/** Where two lines meet inside [a, b]. */
export function findIntersections(f: (x: number) => number, g: (x: number) => number, a: number, b: number): { x: number; y: number }[] {
  return findZeros((x) => safe(f, x) - safe(g, x), a, b).map((x) => ({ x, y: safe(f, x) }));
}

/** The result closest to where the cursor is, which is the one the student is looking at. */
export function nearest<T extends { x: number }>(items: T[], x: number): T | null {
  return items.reduce<T | null>((best, item) => (best === null || Math.abs(item.x - x) < Math.abs(best.x - x) ? item : best), null);
}

/** Rows for the TABLE screen. */
export function tableRows(fns: ((x: number) => number)[], start: number, step: number, rows: number): { x: number; ys: (number | null)[] }[] {
  return Array.from({ length: rows }, (_, i) => {
    const x = Number((start + i * step).toPrecision(12));
    return { x, ys: fns.map((fn) => { const y = safe(fn, x); return Number.isFinite(y) ? y : null; }) };
  });
}

/** Numbers the way a calculator screen shows them: up to 10 significant digits, no trailing zeros. */
export function screenNumber(value: number, digits: 'float' | number = 'float'): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? 'undefined' : value > 0 ? '∞' : '-∞';
  if (value === 0) return '0';
  if (digits !== 'float') return value.toFixed(digits);
  const abs = Math.abs(value);
  if (abs >= 1e10 || abs < 1e-3) {
    const [mantissa, exponent] = value.toExponential(9).split('e');
    return `${String(Number(mantissa))}E${Number(exponent)}`;
  }
  return String(Number(value.toPrecision(10)));
}

/** Pixel positions for drawing. */
export const toScreen = (w: GraphWindow, width: number, height: number) => ({
  px: (x: number) => ((x - w.xmin) / (w.xmax - w.xmin)) * (width - 1),
  py: (y: number) => (height - 1) - ((y - w.ymin) / (w.ymax - w.ymin)) * (height - 1),
});
