import { readZipEntries, type ZipEntry } from './zipReader';

/**
 * Pulls the words and pictures out of a PowerPoint file so it can be read in the app.
 * It's a reading view, not a copy of the slide design.
 */
export interface SlideContent {
  title: string;
  paragraphs: string[];
  images: Blob[];
  notes: string[];
}

const MAX_PART_BYTES = 64 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };

/** Reads one part of the file, stopping if a tiny part unpacks into something enormous. */
async function readPart(entry: ZipEntry): Promise<Blob> {
  const raw = await entry.blob();
  if (entry.method === 0) return raw;
  if (entry.method !== 8) throw new Error('This file uses a format that can\'t be read here.');
  const reader = raw.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: BlobPart[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_PART_BYTES) {
      await reader.cancel();
      throw new Error('This file is too large to show here.');
    }
    chunks.push(value);
  }
  return new Blob(chunks);
}

async function readXml(entries: Map<string, ZipEntry>, name: string): Promise<Document | null> {
  const entry = entries.get(name);
  if (!entry) return null;
  const parsed = new DOMParser().parseFromString(await (await readPart(entry)).text(), 'application/xml');
  return parsed.getElementsByTagName('parsererror').length > 0 ? null : parsed;
}

const byLocalName = (root: Document | Element, name: string) => [...root.getElementsByTagNameNS('*', name)];
const paragraphsOf = (root: Element | Document) => byLocalName(root, 'p')
  .map((paragraph) => byLocalName(paragraph, 't').map((text) => text.textContent ?? '').join('').trim())
  .filter(Boolean);

function relationships(xml: Document | null): Map<string, string> {
  return new Map((xml ? byLocalName(xml, 'Relationship') : []).map((entry) => [entry.getAttribute('Id') ?? '', entry.getAttribute('Target') ?? '']));
}

/** Turns a link inside the file, such as ../media/a.png, into the part's full name. */
function resolve(folder: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = folder.split('/');
  for (const piece of target.split('/')) {
    if (piece === '..') parts.pop();
    else if (piece !== '.') parts.push(piece);
  }
  return parts.join('/');
}

async function slideOrder(entries: Map<string, ZipEntry>): Promise<string[]> {
  const presentation = await readXml(entries, 'ppt/presentation.xml');
  const links = relationships(await readXml(entries, 'ppt/_rels/presentation.xml.rels'));
  const ordered = (presentation ? byLocalName(presentation, 'sldId') : [])
    .map((slide) => links.get(slide.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? ''))
    .filter((target): target is string => !!target)
    .map((target) => resolve('ppt', target));
  if (ordered.length > 0) return ordered;
  const number = (name: string) => Number(name.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
  return [...entries.keys()].filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => number(a) - number(b));
}

export async function readPresentation(file: Blob): Promise<SlideContent[]> {
  const entries = await readZipEntries(file);
  const names = await slideOrder(entries);
  if (names.length === 0) throw new Error('No slides were found in this file.');
  const slides: SlideContent[] = [];
  for (const name of names) {
    const xml = await readXml(entries, name);
    if (!xml) continue;
    const folder = name.slice(0, name.lastIndexOf('/'));
    const links = relationships(await readXml(entries, `${folder}/_rels/${name.slice(folder.length + 1)}.rels`));

    let title = '';
    const body: string[] = [];
    for (const shape of byLocalName(xml, 'sp')) {
      const placeholder = byLocalName(shape, 'ph')[0]?.getAttribute('type') ?? '';
      const text = paragraphsOf(shape);
      if (!title && (placeholder === 'title' || placeholder === 'ctrTitle')) title = text.join(' ');
      else body.push(...text);
    }

    const images: Blob[] = [];
    for (const picture of byLocalName(xml, 'blip')) {
      const target = links.get(picture.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ?? '');
      if (!target) continue;
      const part = resolve(folder, target);
      const type = IMAGE_TYPES[part.split('.').pop()?.toLowerCase() ?? ''];
      const entry = entries.get(part);
      // Only plain picture types are shown. Others, such as drawings that can hold scripts, are skipped.
      if (type && entry) images.push(new Blob([await readPart(entry)], { type }));
    }

    const notesTarget = [...links.values()].find((target) => target.includes('notesSlide'));
    const notesXml = notesTarget ? await readXml(entries, resolve(folder, notesTarget)) : null;
    const notes = notesXml
      ? byLocalName(notesXml, 'sp')
        .filter((shape) => byLocalName(shape, 'ph')[0]?.getAttribute('type') === 'body')
        .flatMap(paragraphsOf)
      : [];
    slides.push({ title, paragraphs: body, images, notes });
  }
  return slides;
}
