/**
 * Reads the words in a picture of a class schedule. It runs entirely in the browser, so the picture
 * isn't sent anywhere and it costs nothing. The reader only downloads the first time it's used.
 */
const MAX_SIDE = 3200;
const SMALL_SIDE = 1600;

export class ScheduleImageError extends Error {}

/** Screenshots are often small, so they're enlarged. Huge phone photos are reduced so they don't run out of memory. */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ScheduleImageError("This picture couldn't be opened. Try a PNG or JPG. On an iPhone, take a screenshot of the photo and use that.");
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > MAX_SIDE ? MAX_SIDE / longest : longest < SMALL_SIDE ? Math.min(2, SMALL_SIDE / longest) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new ScheduleImageError("This browser couldn't read the picture.");
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  cleanForReading(context, canvas.width, canvas.height);
  return canvas;
}

/**
 * Makes the picture easier to read. Dark-mode screenshots become dark text on white, and table lines are
 * erased, because the reader mistakes them for letters and loses the rest of the row.
 */
function cleanForReading(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height);
  const { data } = image;
  const light = new Uint8ClampedArray(width * height);
  let total = 0;
  for (let at = 0; at < light.length; at++) {
    light[at] = Math.round(data[at * 4] * 0.299 + data[at * 4 + 1] * 0.587 + data[at * 4 + 2] * 0.114);
    total += light[at];
  }
  if (total / light.length < 110) for (let at = 0; at < light.length; at++) light[at] = 255 - light[at];
  const isLine = new Uint8Array(light.length);
  const DARK = 190;
  // A straight dark run this long is a table line, not part of a letter.
  const markRuns = (outer: number, inner: number, index: (o: number, i: number) => number, longest: number) => {
    for (let o = 0; o < outer; o++) {
      let start = -1;
      for (let i = 0; i <= inner; i++) {
        const dark = i < inner && light[index(o, i)] < DARK;
        if (dark && start < 0) start = i;
        if (!dark && start >= 0) {
          if (i - start >= longest) for (let j = start; j < i; j++) isLine[index(o, j)] = 1;
          start = -1;
        }
      }
    }
  };
  markRuns(height, width, (o, i) => o * width + i, Math.max(120, width * 0.12));
  markRuns(width, height, (o, i) => i * width + o, Math.max(60, height * 0.06));
  for (let at = 0; at < light.length; at++) {
    const value = isLine[at] ? 255 : light[at];
    data[at * 4] = value;
    data[at * 4 + 1] = value;
    data[at * 4 + 2] = value;
  }
  context.putImageData(image, 0, 0);
}

export async function readScheduleImage(file: Blob, onProgress: (percent: number) => void): Promise<string> {
  if (file.type && !file.type.startsWith('image/')) throw new ScheduleImageError('Choose a picture, such as a screenshot or a photo.');
  const canvas = await prepare(file);
  const folder = new URL('./ocr/', window.location.href.split(/[?#]/)[0]).href;
  const { createWorker, OEM, PSM } = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: `${folder}worker.min.js`,
      corePath: folder,
      langPath: folder,
      workerBlobURL: false,
      logger: (message) => {
        if (message.status === 'recognizing text') onProgress(Math.round(message.progress * 100));
      },
    });
    // Treating the picture as one block keeps each row of a schedule together on one line.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(canvas);
    return data.text;
  } catch (error) {
    if (error instanceof ScheduleImageError) throw error;
    throw new ScheduleImageError(navigator.onLine
      ? "The picture couldn't be read. Try a clearer one, or type your classes in."
      : "The picture reader needs internet the first time it's used. Connect, then try again.");
  } finally {
    await worker?.terminate().catch(() => undefined);
  }
}
