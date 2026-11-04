import { readBlob } from './blobs';
import { getDb } from './db';
import { kindOf } from './format';
import type { FileText, Material } from './types';

/**
 * Reads the words inside files so they can be searched. This all happens on the device. Nothing is
 * sent anywhere, and because it can be rebuilt, it's left out of backups and saving online.
 */
const MAX_FILE_BYTES = 300 * 1024 * 1024;
const MAX_TEXT_BYTES = 8 * 1024 * 1024;

async function readPdf(blob: Blob): Promise<string[]> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim());
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

async function readWord(blob: Blob): Promise<string[]> {
  const { default: mammoth } = await import('mammoth/mammoth.browser');
  const { value } = await mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() });
  return [value];
}

async function readSheet(blob: Blob): Promise<string[]> {
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = (await readXlsxFile(blob)) as unknown as { sheet: string; data: unknown[][] }[];
  return [sheets.map((sheet) => `${sheet.sheet} ${sheet.data.map((row) => row.filter((cell) => cell !== null).join(' ')).join(' ')}`).join(' ')];
}

async function readSlides(blob: Blob): Promise<string[]> {
  const { readPresentation } = await import('./pptxReader');
  return (await readPresentation(blob)).map((slide) => [slide.title, ...slide.paragraphs, ...slide.notes].join(' '));
}

async function readWords(material: Material): Promise<FileText> {
  const base = { materialId: material.id, pages: [] as string[] };
  const kind = kindOf(material);
  if (!['pdf', 'text', 'word', 'sheet', 'slides'].includes(kind)) return { ...base, status: 'unsupported' };
  if (material.size > MAX_FILE_BYTES) return { ...base, status: 'too-large' };
  const blob = await readBlob(material.id);
  if (!blob) return { ...base, status: 'failed' };
  try {
    let pages: string[];
    if (kind === 'pdf') pages = await readPdf(blob);
    else if (kind === 'word') pages = await readWord(blob);
    else if (kind === 'sheet') pages = await readSheet(blob);
    else if (kind === 'slides') pages = await readSlides(blob);
    else pages = [await blob.slice(0, MAX_TEXT_BYTES).text()];
    // A scanned PDF is pictures of pages, so it has no words to read.
    return pages.some((page) => page.trim()) ? { ...base, status: 'ok', pages } : { ...base, status: 'no-text' };
  } catch {
    return { ...base, status: 'failed' };
  }
}

export const listFileText = async (): Promise<FileText[]> => (await getDb()).getAll('fileText');

/** Reads any files not read yet, one at a time, and reports after each. */
export async function readNewFiles(materials: Material[], isActive: () => boolean, onProgress: (done: number, total: number) => void): Promise<void> {
  const db = await getDb();
  const known = new Set(await db.getAllKeys('fileText'));
  const waiting = materials.filter((material) => !known.has(material.id));
  for (let index = 0; index < waiting.length && isActive(); index++) {
    onProgress(index, waiting.length);
    await db.put('fileText', await readWords(waiting[index]));
    // Gives the page a moment to respond between files.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  onProgress(waiting.length, waiting.length);
}
