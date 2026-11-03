import type { Material, MaterialKind } from './types';

const extension = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const TEXT = ['txt', 'md', 'markdown', 'csv', 'json', 'html', 'htm', 'rtf'];
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
  return 'other';
}

export const KIND_LABEL: Record<MaterialKind, string> = {
  pdf: 'PDF',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  text: 'Text',
  other: 'File',
};

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
  new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
