// Prompt 10: every kind of file a student might bring, checked for real. For each one: is it
// accepted, are its bytes stored exactly, does it open inside Study Forge (and how), and does the
// download give back the identical file. The results are written to verification/file-matrix.json.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4226;
const URL_BASE = `http://localhost:${PORT}/`;
const DIR = path.join(__dirname, 'fixtures', 'matrix');
const EXTRA = ['chapter.odt', 'grades.ods', 'slides.odp', 'reader.epub', 'biology.py'].map((name) => path.join(__dirname, 'fixtures', name));
const FILES = [...fs.readdirSync(DIR).map((name) => path.join(DIR, name)), ...EXTRA].sort();
let server;
let context;
let page;
let work;
const pageErrors = [];
const results = [];

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-matrix-'));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  context = await chromium.launchPersistentContext(path.join(work, 'profile'), { viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  await returningStudent(context);
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('dialog', (dialog) => { pageErrors.push(`a dialog opened: ${dialog.message()}`); void dialog.dismiss(); });
  await page.goto(`${URL_BASE}#/library`);
  await page.getByTestId('file-input').first().setInputFiles(FILES);
  await page.waitForFunction((count) => document.querySelectorAll('.save-panel li[data-phase=saved], .save-panel li[data-phase=duplicate]').length >= count, FILES.length, { timeout: 120000 });
});

after(async () => {
  fs.mkdirSync(path.join(__dirname, '..', 'verification'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'verification', 'file-matrix.json'), `${JSON.stringify(results, null, 2)}\n`);
  await context?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

/** What the viewer is showing for this file, in plain words. */
async function howShown() {
  const checks = [
    ['pdf-canvas', 'PDF pages'],
    ['word-view', 'document reading view'],
    ['sheet-view', 'spreadsheet with tabs'],
    ['slides-view', 'slides with notes'],
    ['audio-player', 'audio player'],
    ['video-player', 'video player'],
    ['opendoc-view', 'reading view'],
    ['archive-view', 'list of files inside'],
  ];
  for (const [id, label] of checks) if (await page.getByTestId(id).count()) return label;
  if (await page.locator('.text-view').count()) return 'text';
  if (await page.locator('.pdf-stage img').count()) return 'image';
  if (await page.locator('[data-testid=viewer-fallback]').count()) return null;
  return 'reading view';
}

test('every format is accepted, stored byte for byte, opened where possible, and downloads unchanged', { timeout: 600000 }, async () => {
  for (const file of FILES) {
    const name = path.basename(file);
    const original = fs.readFileSync(file);
    await page.goto(`${URL_BASE}#/library`);
    await page.getByRole('link', { name, exact: true }).click();
    await page.waitForFunction(() => !/Opening file/.test(document.querySelector('main')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    // Stored bytes, read straight from the device's storage.
    const id = decodeURIComponent(new URL(page.url()).hash.split('/files/')[1].split('?')[0]);
    const storedHash = await page.evaluate(async (materialId) => {
      const root = await navigator.storage.getDirectory();
      for await (const [, handle] of root.entries()) {
        if (handle.kind !== 'directory') continue;
        try {
          const file = await (await handle.getFileHandle(materialId)).getFile();
          const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
          return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        } catch { /* not in this folder */ }
      }
      return null;
    }, id);
    const shown = await howShown();
    const fallbackText = shown ? '' : (await page.getByTestId('viewer-fallback').innerText()).split('\n')[0];
    // Downloading gives back the original.
    const link = page.locator('a[download]').first();
    let downloadSame = false;
    if (await link.count()) {
      const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
      const saved = path.join(work, `dl-${name}`);
      await download.saveAs(saved);
      downloadSame = sha(fs.readFileSync(saved)) === sha(original);
    }
    results.push({ file: name, accepted: true, storedExactly: storedHash === sha(original), viewedInside: shown, ifNot: fallbackText || undefined, download: downloadSame });
  }
  for (const row of results) {
    assert.equal(row.storedExactly, true, `${row.file}: stored bytes differ from the original`);
    assert.equal(row.download, true, `${row.file}: download is not the original`);
  }
  // The common academic formats must open inside, not just download.
  const mustOpen = ['reading.pdf', 'notes.docx', 'grades.xlsx', 'lecture.pptx', 'chapter.odt', 'grades.ods', 'slides.odp', 'reader.epub', 'plain.txt', 'data.csv', 'photo.png', 'photo.jpg', 'lecture.mp3', 'lecture.wav', 'clip.mp4', 'clip.webm', 'biology.py', 'analysis.ipynb'];
  for (const name of [...mustOpen, 'diagram.svg', 'essay.rtf', 'project.zip', 'clip.mkv', 'lecture.flac', 'photo.webp']) {
    assert.ok(results.find((row) => row.file === name)?.viewedInside, `${name} should open inside Study Forge`);
  }
});

test('an RTF essay shows its words, not its formatting codes', async () => {
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'essay.rtf', exact: true }).click();
  const text = await page.locator('.text-view').innerText();
  assert.match(text, /MATRIX-RTF An essay draft\./);
  assert.doesNotMatch(text, /\\rtf1|\\b /);
});

test('a zip lists what is inside without unpacking anything', async () => {
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'project.zip', exact: true }).click();
  await page.getByTestId('archive-view').getByText('a.txt').waitFor();
});

test('a picture with a script in it never runs the script', () => {
  assert.deepEqual(pageErrors.filter((message) => /dialog/.test(message)), []);
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
