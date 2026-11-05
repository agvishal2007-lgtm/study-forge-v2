/**
 * Reads the words in a picture, entirely on the device. One reader is kept alive and reused across
 * pages, then let go when idle to free memory. The reader's files load the first time it's used and
 * are then cached, so it works offline afterward. Shared by the schedule reader and file search.
 */
export const OCR_BLOCK = 6; // one block of text, best for a pasted schedule
export const OCR_AUTO = 3; // let it find columns and blocks, best for a document page

export class OcrError extends Error {}

/* eslint-disable @typescript-eslint/no-explicit-any */
let workerPromise: Promise<any> | null = null;
let pending = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

async function build(): Promise<any> {
  const folder = new URL('./ocr/', window.location.href.split(/[?#]/)[0]).href;
  const { createWorker, OEM } = await import('tesseract.js');
  return createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: `${folder}worker.min.js`,
    corePath: folder,
    langPath: folder,
    workerBlobURL: false,
  });
}

function releaseSoon() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const held = workerPromise;
    workerPromise = null;
    void held?.then((worker) => worker.terminate()).catch(() => undefined);
  }, 15000);
}

/** Reads one picture (a canvas or image). onProgress reports 0 to 100 for this picture. */
export async function readPicture(source: CanvasImageSource | HTMLCanvasElement, options: { mode?: number; onProgress?: (percent: number) => void } = {}): Promise<string> {
  clearTimeout(idleTimer);
  pending += 1;
  try {
    if (!workerPromise) workerPromise = build();
    let worker: any;
    try {
      worker = await workerPromise;
    } catch (error) {
      workerPromise = null;
      throw new OcrError(navigator.onLine ? "The reader couldn't start." : "The reader needs internet the first time it's used.");
    }
    await worker.setParameters({ tessedit_pageseg_mode: options.mode ?? OCR_AUTO, preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(source, {}, { text: true }, {
      logger: options.onProgress ? (message: any) => { if (message.status === 'recognizing text') options.onProgress?.(Math.round(message.progress * 100)); } : undefined,
    });
    return data.text as string;
  } finally {
    pending -= 1;
    if (pending === 0) releaseSoon();
  }
}
