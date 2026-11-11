import type { Material } from './types';

/** What Google Drive reports about a stored file. */
export interface DriveFileInfo {
  id: string;
  size?: string | number;
  sha256Checksum?: string;
}

/** Drive takes uploads in pieces that are multiples of 256 KiB. 8 MiB keeps progress smooth. */
export const CHUNK_BYTES = 8 * 1024 * 1024;

/** Files with real bytes that this device still has to put in the student's Drive. */
export function needsBackup(material: Material, hasBytesHere: boolean): boolean {
  return material.kind === 'upload' && hasBytesHere && !material.driveFileId && Boolean(material.hash);
}

/**
 * A copy counts as safely in Drive only when Drive's own checksum and size match the original.
 * Anything less, and the file is not marked as synced.
 */
export function copyMatches(info: DriveFileInfo | null | undefined, material: Pick<Material, 'hash' | 'size'>): boolean {
  if (!info?.id || !info.sha256Checksum || !material.hash) return false;
  return info.sha256Checksum.toLowerCase() === material.hash.toLowerCase() && Number(info.size) === material.size;
}

/** The next piece to send, given how many bytes Drive already has. */
export function nextRange(sent: number, total: number): { start: number; end: number; header: string } {
  const start = sent;
  const end = Math.min(total, start + CHUNK_BYTES);
  return { start, end, header: total === 0 ? 'bytes */0' : `bytes ${start}-${end - 1}/${total}` };
}

/** How many bytes Drive says it has, from the Range header of a "keep going" answer. */
export function receivedFrom(rangeHeader: string | null): number {
  const found = rangeHeader?.match(/bytes=0-(\d+)/);
  return found ? Number(found[1]) + 1 : 0;
}
