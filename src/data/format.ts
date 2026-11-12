import type { Material, MaterialKind } from './types';
import { formatWhen } from './dateFormat.ts';

const extension = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const TEXT = ['txt', 'md', 'markdown', 'csv', 'json', 'html', 'htm', 'rtf'];
/** Program and data files are shown as text to read. Nothing in them is ever run. */
const CODE = ['py', 'js', 'mjs', 'ts', 'tsx', 'jsx', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt',
  'r', 'm', 'sql', 'sh', 'ps1', 'css', 'scss', 'xml', 'yaml', 'yml', 'toml', 'ini', 'tex', 'bib', 'log', 'tsv', 'ipynb'];
export const OPENDOC = ['odt', 'ods', 'odp'];
const AUDIO = ['mp3', 'wav', 'm4a', 'ogg', 'oga', 'weba'];
const VIDEO = ['mp4', 'mov', 'webm', 'm4v'];
const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

export function kindOf(material: Pick<Material, 'name' | 'mimeType'>): MaterialKind {
  const ext = extension(material.name);
  if (material.mimeType.startsWith('audio/')) return 'audio';
  if (ext === 'pdf' || material.mimeType === 'application/pdf') return 'pdf';
  if (IMAGE.includes(ext)) return 'image';
  if (AUDIO.includes(ext)) return 'audio';
  if (VIDEO.includes(ext)) return 'video';
  if (TEXT.includes(ext)) return 'text';
  if (CODE.includes(ext)) return 'code';
  if (ext === 'docx') return 'word';
  if (ext === 'xlsx') return 'sheet';
  if (ext === 'pptx') return 'slides';
  if (OPENDOC.includes(ext)) return 'opendoc';
  if (ext === 'epub') return 'ebook';
  return 'other';
}

export const KIND_LABEL: Record<MaterialKind, string> = {
  pdf: 'PDF',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  text: 'Text',
  code: 'Code or data',
  word: 'Word document',
  sheet: 'Excel spreadsheet',
  slides: 'PowerPoint',
  opendoc: 'OpenDocument',
  ebook: 'EPUB book',
  other: 'File',
};

/** Older Office formats that can't be read in a browser, with what to do instead. */
export function olderOfficeAdvice(name: string): string {
  const ext = extension(name);
  const newer: Record<string, string> = { doc: 'Word as .docx', xls: 'Excel as .xlsx', ppt: 'PowerPoint as .pptx' };
  return newer[ext] ? `This is an older .${ext} file, which can't be shown here. Save it from ${newer[ext]} and add that copy to read it right here, or download this one.` : '';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

export const formatDate = (time: number) =>
  formatWhen(time, { month: 'short', day: 'numeric', year: 'numeric' });
