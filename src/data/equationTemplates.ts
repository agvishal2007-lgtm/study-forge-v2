/*
 * The Equation menu: many kinds of equations, written the usual LaTeX way. In each template the
 * part between ¦ marks is selected after it goes in, so the student just types over it.
 * No DOM here, so it can be tested directly.
 */
import type { FormatEdit } from './noteFormat.ts';

export interface EquationTemplate {
  label: string;
  tex: string;
}
export interface EquationGroup {
  name: string;
  items: EquationTemplate[];
}

export const EQUATION_GROUPS: EquationGroup[] = [
  {
    name: 'Basics',
    items: [
      { label: 'Blank equation', tex: '¦x¦' },
      { label: 'Fraction', tex: '\\frac{¦a¦}{b}' },
      { label: 'Power', tex: 'x^{¦2¦}' },
      { label: 'Subscript', tex: 'x_{¦1¦}' },
      { label: 'Square root', tex: '\\sqrt{¦x¦}' },
      { label: 'Root of any order', tex: '\\sqrt[¦n¦]{x}' },
      { label: 'Absolute value', tex: '\\left|¦x¦\\right|' },
      { label: 'Brackets that grow', tex: '\\left(¦x¦\\right)' },
    ],
  },
  {
    name: 'Algebra',
    items: [
      { label: 'Function', tex: 'f(x) = ¦x^2 + 1¦' },
      { label: 'Quadratic formula', tex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
      { label: 'System of equations', tex: '\\begin{cases} ¦2x + y = 5¦ \\\\ x - y = 1 \\end{cases}' },
      { label: 'Matrix 2 × 2', tex: '\\begin{pmatrix} ¦a¦ & b \\\\ c & d \\end{pmatrix}' },
      { label: 'Matrix 3 × 3', tex: '\\begin{pmatrix} ¦a¦ & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}' },
      { label: 'Logarithm', tex: '\\log_{¦b¦}(x)' },
      { label: 'Natural log', tex: '\\ln(¦x¦)' },
      { label: 'Inequality', tex: '¦a¦ \\le b' },
    ],
  },
  {
    name: 'Calculus',
    items: [
      { label: 'Limit', tex: '\\lim_{x \\to ¦a¦} f(x)' },
      { label: 'Derivative', tex: '\\frac{d}{dx}\\left(¦f(x)¦\\right)' },
      { label: 'Partial derivative', tex: '\\frac{\\partial f}{\\partial ¦x¦}' },
      { label: 'Integral', tex: '\\int ¦f(x)¦ \\, dx' },
      { label: 'Definite integral', tex: '\\int_{¦a¦}^{b} f(x) \\, dx' },
      { label: 'Sum', tex: '\\sum_{i=¦1¦}^{n} a_i' },
      { label: 'Product', tex: '\\prod_{i=¦1¦}^{n} a_i' },
    ],
  },
  {
    name: 'Trig and geometry',
    items: [
      { label: 'Sine', tex: '\\sin(¦\\theta¦)' },
      { label: 'Degrees', tex: '¦45¦^\\circ' },
      { label: 'Pythagorean theorem', tex: 'a^2 + b^2 = c^2' },
      { label: 'Trig identity', tex: '\\sin^2\\theta + \\cos^2\\theta = 1' },
      { label: 'Vector', tex: '\\vec{¦v¦}' },
      { label: 'Area of a circle', tex: 'A = \\pi r^2' },
    ],
  },
  {
    name: 'Statistics',
    items: [
      { label: 'Mean', tex: '\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i' },
      { label: 'Standard deviation', tex: '\\sigma = \\sqrt{\\frac{1}{N}\\sum_{i=1}^{N} (x_i - \\mu)^2}' },
      { label: 'Probability', tex: 'P(¦A¦ \\mid B)' },
      { label: 'Combinations', tex: '\\binom{¦n¦}{k}' },
    ],
  },
  {
    name: 'Science and money',
    items: [
      { label: 'Chemical formula', tex: '\\mathrm{¦H_2O¦}' },
      { label: 'Reaction', tex: '\\mathrm{¦2H_2 + O_2¦} \\rightarrow \\mathrm{2H_2O}' },
      { label: 'Equilibrium', tex: '\\mathrm{¦A + B¦} \\rightleftharpoons \\mathrm{C}' },
      { label: 'Compound interest', tex: 'A = P\\left(1 + \\frac{r}{n}\\right)^{nt}' },
      { label: 'Accounting equation', tex: '\\text{Assets} = \\text{Liabilities} + \\text{Equity}' },
    ],
  },
  {
    name: 'Symbols',
    items: [
      ['Plus or minus', '\\pm'], ['Times', '\\times'], ['Divide', '\\div'], ['Not equal', '\\ne'],
      ['Less or equal', '\\le'], ['Greater or equal', '\\ge'], ['About equal', '\\approx'], ['Infinity', '\\infty'],
      ['Arrow', '\\to'], ['Pi', '\\pi'], ['Theta', '\\theta'], ['Alpha', '\\alpha'], ['Beta', '\\beta'],
      ['Delta', '\\Delta'], ['Mu', '\\mu'], ['Sigma', '\\sigma'], ['Element of', '\\in'], ['Therefore', '\\therefore'],
    ].map(([label, tex]) => ({ label, tex })),
  },
];

/** Where the equations sit in a line, so a template can go inside one that's already there. */
function insideEquation(text: string, at: number): boolean {
  const lineStart = text.lastIndexOf('\n', at - 1) + 1;
  const before = text.slice(lineStart, at);
  // An odd number of $ before the cursor on this line means it's inside $...$.
  return ((before.match(/\$/g) ?? []).length % 2) === 1;
}

/** Where a finished equation can go in: at the cursor, or just after the equation the cursor is in. */
export function equationInsertPoint(text: string, at: number): number {
  if (!insideEquation(text, at)) return at;
  const close = text.indexOf('$', at);
  const lineEnd = text.indexOf('\n', at);
  return close !== -1 && (lineEnd === -1 || close < lineEnd) ? close + 1 : at;
}

/**
 * The edit for choosing a template. Chosen text goes into the template's first blank. Inside an
 * existing equation it goes in as is; anywhere else it's wrapped in $...$ so it draws.
 */
export function templateEdit(text: string, start: number, end: number, template: string): FormatEdit {
  const first = template.indexOf('¦');
  const second = first === -1 ? -1 : template.indexOf('¦', first + 1);
  const chosen = text.slice(start, end);
  let body = template;
  let selStart: number;
  let selEnd: number;
  if (first !== -1 && second !== -1) {
    const slot = chosen && !chosen.includes('\n') ? chosen : template.slice(first + 1, second);
    body = template.slice(0, first) + slot + template.slice(second + 1);
    selStart = first;
    selEnd = first + slot.length;
  } else {
    selStart = selEnd = template.length;
  }
  const wrap = !insideEquation(text, start);
  const insert = wrap ? `$${body}$` : body;
  const offset = start + (wrap ? 1 : 0);
  return { from: start, to: end, insert, selectionStart: offset + selStart, selectionEnd: offset + selEnd };
}
