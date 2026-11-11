import { readPart } from './pptxReader';
import { readZipEntries, type ZipEntry } from './zipReader';

/**
 * Reading views for OpenDocument (LibreOffice and Google Docs exports) and EPUB books. Only the
 * words and table cells are taken out and shown as plain text: no styles, scripts or embedded
 * content from the file are ever put on the page, so nothing inside a file can run.
 */
export type Block = { kind: 'heading'; level: number; text: string } | { kind: 'para'; text: string };
export interface Sheet { name: string; rows: string[][]; truncated: boolean }
export interface Slide { title: string; paragraphs: string[] }
export interface Chapter { title: string; blocks: Block[] }

export type OpenDocContent =
  | { kind: 'odt'; blocks: Block[] }
  | { kind: 'ods'; sheets: Sheet[] }
  | { kind: 'odp'; slides: Slide[] }
  | { kind: 'epub'; title: string; chapters: Chapter[] };

const MAX_ROWS = 2000;
const MAX_CHAPTERS = 300;
const TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
const TABLE_NS = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';
const DRAW_NS = 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0';

async function readText(entries: Map<string, ZipEntry>, name: string): Promise<string | null> {
  const entry = entries.get(name);
  return entry ? (await readPart(entry)).text() : null;
}

function parseXml(source: string, type: DOMParserSupportedType = 'application/xml'): Document {
  const doc = new DOMParser().parseFromString(source, type);
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Part of this file is damaged and can\'t be read.');
  return doc;
}

/** The words of an element, with OpenDocument's spacing and line-break marks honoured. */
function wordsOf(node: Node): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) out += child.textContent ?? '';
    else if (child instanceof Element) {
      if (child.namespaceURI === TEXT_NS && child.localName === 's') out += ' '.repeat(Number(child.getAttributeNS(TEXT_NS, 'c') ?? 1) || 1);
      else if (child.namespaceURI === TEXT_NS && child.localName === 'tab') out += '\t';
      else if (child.namespaceURI === TEXT_NS && child.localName === 'line-break') out += '\n';
      else out += wordsOf(child);
    }
  });
  return out;
}

function textBlocks(root: Element): Block[] {
  const blocks: Block[] = [];
  const walk = (element: Element) => {
    for (const child of Array.from(element.children)) {
      if (child.namespaceURI === TEXT_NS && child.localName === 'h') {
        const text = wordsOf(child).trim();
        if (text) blocks.push({ kind: 'heading', level: Number(child.getAttributeNS(TEXT_NS, 'outline-level')) || 1, text });
      } else if (child.namespaceURI === TEXT_NS && child.localName === 'p') {
        const text = wordsOf(child).trim();
        if (text) blocks.push({ kind: 'para', text });
      } else if (child.namespaceURI === TABLE_NS && child.localName === 'table') {
        for (const row of rowsOf(child, 200)) if (row.some(Boolean)) blocks.push({ kind: 'para', text: row.filter(Boolean).join(' · ') });
      } else walk(child);
    }
  };
  walk(root);
  return blocks;
}

function rowsOf(table: Element, limit: number): string[][] {
  const rows: string[][] = [];
  for (const row of Array.from(table.getElementsByTagNameNS(TABLE_NS, 'table-row'))) {
    // A spreadsheet can repeat an empty row a million times to reach the bottom; stop at real content.
    const repeat = Math.min(Number(row.getAttributeNS(TABLE_NS, 'number-rows-repeated')) || 1, 50);
    const cells: string[] = [];
    for (const cell of Array.from(row.children)) {
      if (cell.namespaceURI !== TABLE_NS || !['table-cell', 'covered-table-cell'].includes(cell.localName)) continue;
      const span = Math.min(Number(cell.getAttributeNS(TABLE_NS, 'number-columns-repeated')) || 1, 50);
      const value = Array.from(cell.getElementsByTagNameNS(TEXT_NS, 'p')).map(wordsOf).join('\n');
      for (let i = 0; i < span; i++) cells.push(value);
    }
    while (cells.length && !cells[cells.length - 1]) cells.pop();
    for (let i = 0; i < repeat && rows.length < limit; i++) rows.push(cells);
    if (rows.length >= limit) break;
  }
  while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
  return rows;
}

async function readOpenDocument(entries: Map<string, ZipEntry>, ext: string): Promise<OpenDocContent> {
  const source = await readText(entries, 'content.xml');
  if (!source) throw new Error('This doesn\'t look like an OpenDocument file.');
  const doc = parseXml(source);
  if (ext === 'ods') {
    const sheets = Array.from(doc.getElementsByTagNameNS(TABLE_NS, 'table')).map((table) => {
      const rows = rowsOf(table, MAX_ROWS + 1);
      return { name: table.getAttributeNS(TABLE_NS, 'name') || 'Sheet', rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
    });
    return { kind: 'ods', sheets };
  }
  if (ext === 'odp') {
    const slides = Array.from(doc.getElementsByTagNameNS(DRAW_NS, 'page')).map((page, index) => {
      const paragraphs = Array.from(page.getElementsByTagNameNS(TEXT_NS, 'p')).map((p) => wordsOf(p).trim()).filter(Boolean);
      // LibreOffice writes characters such as spaces in names as _20_; turn them back.
      const raw = page.getAttributeNS(DRAW_NS, 'name') ?? '';
      const name = raw.replace(/_([0-9A-Fa-f]{2,4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      // Untitled slides are called page1, page2 internally; show them by number instead.
      return { title: name && !/^page\d+$/i.test(name) ? name : `Slide ${index + 1}`, paragraphs };
    });
    return { kind: 'odp', slides };
  }
  return { kind: 'odt', blocks: textBlocks(doc.documentElement) };
}

/** Resolves a path inside the book relative to the file that mentions it. */
const resolve = (base: string, href: string) => {
  const parts = base.split('/').slice(0, -1);
  for (const piece of decodeURIComponent(href.split('#')[0]).split('/')) {
    if (piece === '..') parts.pop();
    else if (piece && piece !== '.') parts.push(piece);
  }
  return parts.join('/');
};

async function readEpub(entries: Map<string, ZipEntry>): Promise<OpenDocContent> {
  const container = await readText(entries, 'META-INF/container.xml');
  const opfPath = container ? parseXml(container).getElementsByTagName('rootfile')[0]?.getAttribute('full-path') : null;
  const opfSource = opfPath ? await readText(entries, opfPath) : null;
  if (!opfPath || !opfSource) throw new Error('This doesn\'t look like an EPUB book.');
  const opf = parseXml(opfSource);
  const title = opf.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() || 'Untitled book';
  const manifest = new Map(Array.from(opf.getElementsByTagNameNS('*', 'item')).map((item) => [item.getAttribute('id'), item.getAttribute('href') ?? '']));
  const chapters: Chapter[] = [];
  for (const ref of Array.from(opf.getElementsByTagNameNS('*', 'itemref')).slice(0, MAX_CHAPTERS)) {
    const href = manifest.get(ref.getAttribute('idref'));
    if (!href) continue;
    const source = await readText(entries, resolve(opfPath, href));
    if (!source) continue;
    let page: Document;
    try { page = parseXml(source, 'application/xhtml+xml'); } catch { page = parseXml(source, 'text/html'); }
    const blocks: Block[] = [];
    for (const element of Array.from(page.body?.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre') ?? [])) {
      // Only the innermost text-bearing elements, so a paragraph inside a list item isn't doubled.
      if (element.querySelector('p,li,h1,h2,h3,h4,h5,h6')) continue;
      const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const level = /^h[1-6]$/i.test(element.tagName) ? Number(element.tagName[1]) : 0;
      blocks.push(level ? { kind: 'heading', level, text } : { kind: 'para', text });
    }
    if (!blocks.length) continue;
    const first = blocks.find((block) => block.kind === 'heading');
    chapters.push({ title: first?.text ?? `Section ${chapters.length + 1}`, blocks });
  }
  return { kind: 'epub', title, chapters };
}

export async function readOpenDoc(file: Blob, name: string): Promise<OpenDocContent> {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const entries = await readZipEntries(file);
  return ext === 'epub' ? readEpub(entries) : readOpenDocument(entries, ext);
}

/** The words, as pages of plain text, for search. */
export function searchablePages(content: OpenDocContent): string[] {
  const join = (blocks: Block[]) => blocks.map((block) => block.text).join('\n');
  if (content.kind === 'odt') return [join(content.blocks)];
  if (content.kind === 'ods') return content.sheets.map((sheet) => `${sheet.name}\n${sheet.rows.map((row) => row.join('\t')).join('\n')}`);
  if (content.kind === 'odp') return content.slides.map((slide) => [slide.title, ...slide.paragraphs].join('\n'));
  return content.chapters.map((chapter) => join(chapter.blocks));
}
