import { DROPBOX_APP_KEY, GOOGLE_DRIVE_CLIENT_ID, GOOGLE_PICKER_API_KEY, GOOGLE_PROJECT_NUMBER } from './cloudSetup';

export type CloudSource = 'drive' | 'dropbox';
export const CLOUD_LABEL: Record<CloudSource, string> = { drive: 'Google Drive', dropbox: 'Dropbox' };

export interface CloudResult {
  files: File[];
  /** Names of chosen files that couldn't be copied. */
  failed: string[];
}

export class CloudError extends Error {
  code: 'cancelled' | 'failed';

  constructor(code: 'cancelled' | 'failed', message = '') {
    super(message);
    this.code = code;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const TEST_BUILD = import.meta.env.VITE_ACCOUNT_BACKEND === 'test';
const page = window as any;

export function cloudSources(): CloudSource[] {
  if (TEST_BUILD) return ['drive', 'dropbox'];
  return [...(GOOGLE_DRIVE_CLIENT_ID ? ['drive' as const] : []), ...(DROPBOX_APP_KEY ? ['dropbox' as const] : [])];
}

function loadScript(src: string, attributes: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value));
    script.onload = () => resolve();
    script.onerror = () => reject(new CloudError('failed', "That service couldn't be reached. Check your internet connection and try again."));
    document.head.append(script);
  });
}

const prepared = new Map<CloudSource, Promise<void>>();

/** Loads a service's code ahead of the tap, because a window that opens late gets blocked. */
export function prepareCloud(source: CloudSource): Promise<void> {
  if (TEST_BUILD) return Promise.resolve();
  let ready = prepared.get(source);
  if (!ready) {
    ready = source === 'drive'
      ? Promise.all([
        loadScript('https://accounts.google.com/gsi/client'),
        loadScript('https://apis.google.com/js/api.js').then(() => new Promise<void>((resolve, reject) => {
          page.gapi.load('picker', { callback: resolve, onerror: () => reject(new CloudError('failed', "Google Drive couldn't load.")) });
        })),
      ]).then(() => undefined)
      : loadScript('https://www.dropbox.com/static/api/2/dropins.js', { id: 'dropboxjs', 'data-app-key': DROPBOX_APP_KEY });
    ready.catch(() => prepared.delete(source));
    prepared.set(source, ready);
  }
  return ready;
}

/** Google's own documents have no file to copy, so they're saved as PDFs. */
async function downloadDriveFile(doc: any, token: string): Promise<File> {
  const native = String(doc.mimeType).startsWith('application/vnd.google-apps.');
  const id = encodeURIComponent(doc.id);
  const url = native
    ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=application/pdf`
    : `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(String(response.status));
  const blob = await response.blob();
  const name = native && !/\.pdf$/i.test(doc.name) ? `${doc.name}.pdf` : doc.name;
  return new File([blob], name, { type: native ? 'application/pdf' : doc.mimeType || blob.type });
}

function pickFromDrive(hint?: string): Promise<CloudResult> {
  return new Promise((resolve, reject) => {
    const client = page.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      // This scope only reaches files the student picks, never the rest of their Drive.
      scope: 'https://www.googleapis.com/auth/drive.file',
      hint,
      callback: (answer: any) => {
        if (answer.error || !answer.access_token) {
          reject(new CloudError('failed', "Google Drive didn't give access. Try again."));
          return;
        }
        const token: string = answer.access_token;
        const { picker } = page.google;
        new picker.PickerBuilder()
          .addView(new picker.DocsView().setIncludeFolders(true))
          .enableFeature(picker.Feature.MULTISELECT_ENABLED)
          .setOAuthToken(token)
          .setDeveloperKey(GOOGLE_PICKER_API_KEY)
          .setAppId(GOOGLE_PROJECT_NUMBER)
          .setOrigin(window.location.origin)
          .setCallback(async (data: any) => {
            if (data.action === picker.Action.CANCEL) reject(new CloudError('cancelled'));
            if (data.action !== picker.Action.PICKED) return;
            const files: File[] = [];
            const failed: string[] = [];
            for (const doc of data.docs) {
              try {
                files.push(await downloadDriveFile(doc, token));
              } catch {
                failed.push(doc.name);
              }
            }
            resolve({ files, failed });
          })
          .build()
          .setVisible(true);
      },
      error_callback: (problem: any) => reject(problem?.type === 'popup_closed'
        ? new CloudError('cancelled')
        : new CloudError('failed', problem?.type === 'popup_failed_to_open' ? 'Your browser blocked the window. Allow pop-ups for this site, then try again.' : "Google Drive didn't give access. Try again.")),
    });
    client.requestAccessToken();
  });
}

function pickFromDropbox(): Promise<CloudResult> {
  return new Promise((resolve, reject) => {
    page.Dropbox.choose({
      linkType: 'direct',
      multiselect: true,
      folderselect: false,
      cancel: () => reject(new CloudError('cancelled')),
      success: async (chosen: any[]) => {
        const files: File[] = [];
        const failed: string[] = [];
        for (const item of chosen) {
          try {
            const response = await fetch(item.link);
            if (!response.ok) throw new Error(String(response.status));
            const blob = await response.blob();
            files.push(new File([blob], item.name, { type: blob.type }));
          } catch {
            failed.push(item.name);
          }
        }
        resolve({ files, failed });
      },
    });
  });
}

/** Must be called directly from the tap, after prepareCloud has finished. */
export function pickFromCloud(source: CloudSource, hint?: string): Promise<CloudResult> {
  if (TEST_BUILD) {
    const fake = page.__testCloudPick;
    if (typeof fake === 'string') return Promise.reject(new CloudError(fake === 'cancelled' ? 'cancelled' : 'failed', fake === 'cancelled' ? '' : fake));
    const names: string[] = fake?.files ?? [];
    return Promise.resolve({ files: names.map((name) => new File([`${source} copy of ${name}`], name, { type: 'text/plain' })), failed: fake?.failed ?? [] });
  }
  return source === 'drive' ? pickFromDrive(hint) : pickFromDropbox();
}
