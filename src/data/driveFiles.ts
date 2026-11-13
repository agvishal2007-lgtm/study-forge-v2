import { isChildMode } from './schoolProfile';
import { GOOGLE_DRIVE_CLIENT_ID } from './cloudSetup';
import { CURRENT_DB } from './account';
import { getDb, notifyChanged } from './db';
import { readBlob, saveBlob } from './blobs';
import { hashFile } from './store';
import { copyMatches, needsBackup, nextRange, receivedFrom, type DriveFileInfo } from './driveFilesRules';
import type { Material } from './types';

/*
 * File and recording contents travel through the student's own Google Drive, in a "Study Forge"
 * folder. The drive.file permission reaches only files Study Forge itself put there, never the
 * rest of their Drive. A copy is marked as synced only after Drive's checksum matches.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const page = window as any;
const TEST_BUILD = import.meta.env.VITE_ACCOUNT_BACKEND === 'test';
const TEST_SERVER = (page.__testServer as string | undefined) ?? 'http://localhost:4199';
const API = TEST_BUILD ? `${TEST_SERVER}/drive/v3` : 'https://www.googleapis.com/drive/v3';
const UPLOAD = TEST_BUILD ? `${TEST_SERVER}/drive/upload/v3` : 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'Study Forge';
const CONNECTED_KEY = 'driveBackupOn';
const FOLDER_KEY = 'driveFolderId';

export class DriveError extends Error {
  constructor(message: string, readonly kind: 'auth' | 'offline' | 'mismatch' | 'other' | 'cancelled' = 'other') {
    super(message);
  }
}

export type DrivePhase = 'off' | 'needs-permission' | 'idle' | 'uploading' | 'waiting-recording' | 'offline' | 'error';
export interface DriveState {
  phase: DrivePhase;
  /** Files with bytes on this device that are safely in Drive, out of all such files. */
  inDrive: number;
  total: number;
  current: { name: string; sent: number; size: number } | null;
  message: string;
}

let state: DriveState = { phase: 'off', inDrive: 0, total: 0, current: null, message: '' };
const listeners = new Set<() => void>();
const setState = (patch: Partial<DriveState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};
export const getDriveState = () => state;
export function subscribeDrive(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

// ---- Permission -----------------------------------------------------------------------------

// Google's permission lasts about an hour. It's kept for this browser until then, so reloading the
// page doesn't ask again, and it's only good for the files Study Forge itself put in Drive.
const ACCESS_KEY = `${CURRENT_DB}-drive-access`;
let access: { token: string; expiresAt: number } | null = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCESS_KEY) ?? 'null');
    return saved && saved.expiresAt > Date.now() ? saved : null;
  } catch {
    return null;
  }
})();
function keepAccess(next: typeof access) {
  access = next;
  try {
    if (next) localStorage.setItem(ACCESS_KEY, JSON.stringify(next));
    else localStorage.removeItem(ACCESS_KEY);
  } catch {
    // Private browsing: it lasts until the page closes instead.
  }
}
const hasAccess = () => Boolean(access && access.expiresAt > Date.now() + 60_000);

let gsi: Promise<void> | null = null;
/** Loads Google's sign-in code ahead of the tap, because a window that opens late gets blocked. */
export function prepareDrive(): Promise<void> {
  if (isChildMode()) return Promise.reject(new DriveError('Cloud backup is unavailable in local-only mode.'));
  if (TEST_BUILD) return Promise.resolve();
  gsi ??= new Promise<void>((resolve, reject) => {
    if (page.google?.accounts?.oauth2) return resolve();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsi = null;
      reject(new DriveError("Google couldn't be reached. Check your internet connection and try again.", 'offline'));
    };
    document.head.append(script);
  });
  return gsi;
}

/** Must be called directly from a tap. */
function askDrive(hint?: string): Promise<void> {
  if (hasAccess()) return Promise.resolve();
  if (TEST_BUILD) {
    if (page.__testDriveRefuses) return Promise.reject(new DriveError("Google Drive wasn't connected.", 'auth'));
    keepAccess({ token: 'test-drive-token', expiresAt: Date.now() + 3600_000 });
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const client = page.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      scope: SCOPE,
      hint,
      callback: (answer: any) => {
        if (answer.error || !answer.access_token) {
          reject(new DriveError(answer.error === 'access_denied'
            ? "Google Drive wasn't connected. If your school manages this account, it may block apps Google hasn't verified yet. Your files are still safe on this device."
            : "Google Drive didn't give access. Try again.", 'auth'));
          return;
        }
        keepAccess({ token: answer.access_token, expiresAt: Date.now() + (Number(answer.expires_in) || 3600) * 1000 });
        resolve();
      },
      error_callback: (problem: any) => reject(new DriveError(problem?.type === 'popup_closed'
        ? 'Google Drive was not connected.'
        : problem?.type === 'popup_failed_to_open' ? 'Your browser blocked the window. Allow pop-ups for this site, then try again.' : "Google Drive didn't give access. Try again.", problem?.type === 'popup_closed' ? 'cancelled' : 'auth')),
    });
    client.requestAccessToken();
  });
}

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  if (!hasAccess()) {
    setState({ phase: 'needs-permission' });
    throw new DriveError('Google Drive needs your permission again to continue.', 'auth');
  }
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${access?.token}`, ...(init.headers ?? {}) } });
  } catch {
    throw new DriveError("Google Drive couldn't be reached. Your files are safe on this device and will go up when you're back online.", 'offline');
  }
  if (response.status === 401) {
    keepAccess(null);
    setState({ phase: 'needs-permission' });
    throw new DriveError('Google Drive needs your permission again to continue.', 'auth');
  }
  if (response.status === 403 && /storageQuota/i.test(await response.clone().text())) {
    throw new DriveError('Your Google Drive is full, so files can\'t go up. They are safe on this device. Free up Drive space and they will continue.');
  }
  return response;
}

// ---- Setup ----------------------------------------------------------------------------------

export const isDriveBackupOn = async () => Boolean(await (await getDb()).get('meta', CONNECTED_KEY));

/** Turns on Drive backup from a tap, then starts sending files. */
export async function turnOnDriveBackup(hint?: string): Promise<void> {
  if (isChildMode()) throw new DriveError('Cloud backup is unavailable in local-only mode.');
  await askDrive(hint);
  await (await getDb()).put('meta', true, CONNECTED_KEY);
  setState({ phase: 'idle', message: '' });
  void backUpFiles();
}

/** From a tap, when Google's permission ran out. */
export async function reconnectDrive(hint?: string): Promise<void> {
  if (isChildMode()) throw new DriveError('Cloud backup is unavailable in local-only mode.');
  await askDrive(hint);
  setState({ phase: 'idle', message: '' });
  void backUpFiles();
}

/** Stops sending files from this device. Copies already in Drive stay there. */
export async function turnOffDriveBackup(): Promise<void> {
  await (await getDb()).delete('meta', CONNECTED_KEY);
  if (access && !TEST_BUILD) page.google?.accounts?.oauth2?.revoke?.(access.token, () => undefined);
  keepAccess(null);
  setState({ phase: 'off', current: null, message: '' });
}

async function folderId(): Promise<string> {
  const db = await getDb();
  const saved = (await db.get('meta', FOLDER_KEY)) as string | undefined;
  if (saved) return saved;
  // drive.file only sees folders Study Forge made, so this finds ours, not a folder of theirs.
  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await (await call(`${API}/files?q=${q}&fields=files(id)&spaces=drive`)).json();
  let id: string | undefined = found.files?.[0]?.id;
  if (!id) {
    const made = await call(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!made.ok) throw new DriveError(`Google Drive had a problem (${made.status}). It will try again.`);
    id = (await made.json()).id as string;
  }
  await db.put('meta', id, FOLDER_KEY);
  return id;
}

// ---- Uploading ------------------------------------------------------------------------------

async function recordingInProgress(): Promise<boolean> {
  if (!navigator.locks?.query) return false;
  const { held = [] } = await navigator.locks.query();
  return held.some((lock) => lock.name?.startsWith('study-forge-recording-'));
}

/** Sends one file in pieces, then checks Drive's checksum before trusting the copy. An upload cut
 *  off part-way (closed tab, lost connection) picks up where Drive says it got to, not from zero. */
async function upload(material: Material, blob: Blob, parent: string, signal: AbortSignal): Promise<DriveFileInfo> {
  const db = await getDb();
  const sessionKey = `driveSession-${material.id}`;
  let session: string | null = null;
  let sent = 0;
  const saved = (await db.get('meta', sessionKey)) as { url: string; size: number } | undefined;
  if (saved && saved.size === blob.size) {
    // Ask Drive how much of the earlier attempt arrived.
    const status = await call(saved.url, { method: 'PUT', headers: { 'Content-Range': `bytes */${blob.size}` } }).catch(() => null);
    if (status?.status === 308) {
      session = saved.url;
      sent = receivedFrom(status.headers.get('Range'));
    } else if (status && status.ok) {
      await db.delete('meta', sessionKey);
      return (await status.json()) as DriveFileInfo;
    }
  }
  if (!session) {
    const start = await call(`${UPLOAD}/files?uploadType=resumable&fields=id,size,sha256Checksum`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': material.mimeType || 'application/octet-stream', 'X-Upload-Content-Length': String(blob.size) },
      body: JSON.stringify({ name: material.name, parents: [parent], appProperties: { studyForgeId: material.id, sha256: material.hash } }),
    });
    session = start.headers.get('Location');
    if (!start.ok || !session) throw new DriveError(`Google Drive had a problem starting the upload (${start.status}). It will try again.`);
    await db.put('meta', { url: session, size: blob.size }, sessionKey);
  }
  setState({ current: { name: material.name, sent, size: blob.size } });
  for (;;) {
    if (signal.aborted) throw new DriveError('Stopped.', 'cancelled');
    const range = nextRange(sent, blob.size);
    const response = await call(session, { method: 'PUT', headers: { 'Content-Range': range.header }, body: blob.slice(range.start, range.end) });
    if (response.status === 308) {
      sent = receivedFrom(response.headers.get('Range'));
      setState({ current: { name: material.name, sent, size: blob.size } });
      continue;
    }
    if (response.status === 404 || response.status === 410) {
      // Drive forgot the upload (they expire after about a week). Start again cleanly next time.
      await db.delete('meta', sessionKey);
      throw new DriveError('Google Drive lost track of an earlier upload, so it will start that file again.');
    }
    if (!response.ok) throw new DriveError(`Google Drive had a problem during the upload (${response.status}). It will try again.`);
    await db.delete('meta', sessionKey);
    setState({ current: { name: material.name, sent: blob.size, size: blob.size } });
    let info = (await response.json()) as DriveFileInfo;
    // Drive sometimes adds the checksum a moment later, so ask once more before giving up.
    if (!info.sha256Checksum) info = await (await call(`${API}/files/${info.id}?fields=id,size,sha256Checksum`)).json();
    return info;
  }
}

/** Records where the verified copy is. The record syncs, so other devices can fetch it. */
async function markInDrive(id: string, driveFileId: string): Promise<void> {
  const db = await getDb();
  const material = await db.get('materials', id);
  if (!material) return;
  await db.put('materials', { ...material, driveFileId });
  notifyChanged();
}

async function count(): Promise<{ inDrive: number; total: number; waiting: Material[] }> {
  const all = (await (await getDb()).getAll('materials')).filter((material) => material.kind === 'upload' && material.hash);
  const waiting: Material[] = [];
  let inDrive = 0;
  for (const material of all) {
    if (material.driveFileId) inDrive += 1;
    else if (needsBackup(material, Boolean(await readBlob(material.id)))) waiting.push(material);
  }
  return { inDrive, total: inDrive + waiting.length, waiting };
}

let running: Promise<void> | null = null;
let stopper: AbortController | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

/** Sends every file this device has that isn't in Drive yet, one at a time. Safe to call often. */
export function backUpFiles(): Promise<void> {
  running ??= (async () => {
    try {
      if (!(await isDriveBackupOn())) return setState({ phase: 'off' });
      const { inDrive, total, waiting } = await count();
      setState({ inDrive, total });
      if (waiting.length === 0) return setState({ phase: hasAccess() ? 'idle' : state.phase === 'needs-permission' ? 'needs-permission' : 'idle', current: null });
      if (!hasAccess()) return setState({ phase: 'needs-permission', current: null });
      const parent = await folderId();
      stopper = new AbortController();
      let done = inDrive;
      for (const material of waiting) {
        // Never compete with a recording for the connection or the disk.
        if (await recordingInProgress()) {
          setState({ phase: 'waiting-recording', current: null });
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => void backUpFiles(), 30_000);
          return;
        }
        const blob = await readBlob(material.id);
        if (!blob) continue;
        setState({ phase: 'uploading', current: { name: material.name, sent: 0, size: blob.size }, message: '' });
        const info = await upload(material, blob, parent, stopper.signal);
        if (!copyMatches(info, material)) {
          throw new DriveError(`${material.name} didn't arrive in Google Drive intact, so it isn't marked as synced. It will try again.`, 'mismatch');
        }
        await markInDrive(material.id, info.id);
        done += 1;
        setState({ inDrive: done });
      }
      setState({ phase: 'idle', current: null, message: '' });
    } catch (error) {
      const problem = error as DriveError;
      if (problem.kind === 'cancelled') return setState({ phase: 'idle', current: null });
      setState({ phase: problem.kind === 'auth' ? 'needs-permission' : problem.kind === 'offline' ? 'offline' : 'error', current: null, message: problem.message });
      if (problem.kind !== 'auth') {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => void backUpFiles(), problem.kind === 'offline' ? 60_000 : 30_000);
      }
    } finally {
      running = null;
      stopper = null;
    }
  })();
  return running;
}

/** Called when recording starts, so an upload in progress steps aside. It resumes afterwards. */
export function pauseForRecording(): void {
  stopper?.abort();
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void backUpFiles(), 30_000);
}

// ---- Downloading ----------------------------------------------------------------------------

export const canFetchFromDrive = (material: Material) => Boolean(material.driveFileId);
export const driveReady = hasAccess;

/**
 * Brings a file's contents to this device from Drive, and keeps them only if the checksum matches
 * the original. Must start from a tap when Google's permission isn't already here.
 */
export async function fetchFromDrive(material: Material, onProgress: (received: number) => void, signal: AbortSignal, hint?: string): Promise<void> {
  if (!material.driveFileId) throw new DriveError("This file isn't in Google Drive yet. It goes up from the device where it was added, once Drive backup is on there.");
  await askDrive(hint);
  const response = await call(`${API}/files/${material.driveFileId}?alt=media`, { signal });
  if (response.status === 404) throw new DriveError("This file isn't in your Google Drive any more. If you removed it from Drive, the device where it was added may still have it.");
  if (!response.ok || !response.body) throw new DriveError(`Google Drive had a problem (${response.status}). Try again in a moment.`);
  const reader = response.body.getReader();
  const pieces: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pieces.push(value);
    received += value.byteLength;
    onProgress(received);
  }
  const file = new File(pieces as BlobPart[], material.name, { type: material.mimeType });
  const hash = await hashFile(file, signal, () => undefined);
  if (hash !== material.hash || file.size !== material.size) {
    throw new DriveError("The copy in Google Drive doesn't match the original, so it wasn't saved here. Try again, or open it on the device where it was added.", 'mismatch');
  }
  await saveBlob(material.id, file, signal, () => undefined);
  notifyChanged();
}
