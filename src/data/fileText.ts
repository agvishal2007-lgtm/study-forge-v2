import { readBlob } from './blobs';
import { OCR_AUTO, OcrError, readPicture } from './ocr';
import { getDb } from './db';
import { kindOf } from './format';
import type { FileText, Material } from './types';

/**
 * Reads the words inside files so they can be searched. This all happens on the device. Nothing is
 * sent anywhere, and because it can be rebuilt, it's left out of backups and saving online.
 */
const MAX_FILE_BYTES = 300 * 1024 * 1024;
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
// Reading a picture is slow, so a scanned file reads this many pages at most.
const MAX_OCR_PAGES = 50;
// A page with fewer real words than this is treated as scanned, and its picture is read.
const MIN_PAGE_CHARS = 12;
const OCR_SIDE = 2000;

async function readPdf(blob: Blob): Promise<string[]> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  let ocrBudget = MAX_OCR_PAGES;
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim();
      // A page with no real text is a picture of a page, so read its words with the picture reader.
      if (text.length < MIN_PAGE_CHARS && ocrBudget > 0) {
        try {
          pages.push((await ocrPdfPage(page)).trim() || text);
          ocrBudget -= 1;
        } catch {
          pages.push(text);
        }
      } else {
        pages.push(text);
      }
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Draws one PDF page and reads the words in it. */
async function ocrPdfPage(page: any): Promise<string> {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, OCR_SIDE / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale: Math.max(1, scale) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new OcrError('No canvas.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport, intent: 'print' }).promise;
  return readPicture(canvas, { mode: OCR_AUTO });
}

/** Reads the words in an image file. */
async function readImage(blob: Blob): Promise<string[]> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return [];
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > OCR_SIDE ? OCR_SIDE / longest : longest < 1000 ? Math.min(2, 1000 / longest) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) return [];
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return [(await readPicture(canvas, { mode: OCR_AUTO })).trim()];
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
  if (!['pdf', 'text', 'word', 'sheet', 'slides', 'image'].includes(kind)) return { ...base, status: 'unsupported' };
  if (material.size > (kind === 'image' ? MAX_IMAGE_BYTES : MAX_FILE_BYTES)) return { ...base, status: 'too-large' };
  const blob = await readBlob(material.id);
  if (!blob) return { ...base, status: 'failed' };
  try {
    let pages: string[];
    if (kind === 'pdf') pages = await readPdf(blob);
    else if (kind === 'word') pages = await readWord(blob);
    else if (kind === 'sheet') pages = await readSheet(blob);
    else if (kind === 'slides') pages = await readSlides(blob);
    else if (kind === 'image') pages = await readImage(blob);
    else pages = [await blob.slice(0, MAX_TEXT_BYTES).text()];
    // Still nothing after reading any pictures means there were no words to find.
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
  // A saved link has no bytes to read, so it is never scanned for words.
  const waiting = materials.filter((material) => material.kind !== 'link' && !known.has(material.id));
  for (let index = 0; index < waiting.length && isActive(); index++) {
    onProgress(index, waiting.length);
    await db.put('fileText', await readWords(waiting[index]));
    // Gives the page a moment to respond between files.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  onProgress(waiting.length, waiting.length);
}
