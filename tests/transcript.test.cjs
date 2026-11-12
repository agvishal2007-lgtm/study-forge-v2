// Making a transcript on the device (with the speech model stubbed), then finding it in search.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4198;
const URL_BASE = `http://localhost:${PORT}/`;
let server; let context; let page; let work;
const pageErrors = [];
// A timed transcript is read beside the notes at moments; the panel keeps its controls.
const transcriptWords = (pattern) => page.getByTestId('transcript-view').getByText(pattern).first();
const nav = (name) => page.getByRole('navigation', { name: name === 'Settings' ? 'Account' : 'Main' }).getByRole('link', { name, exact: true }).click();

// A tiny, valid silent WAV so the browser treats it as real audio.
function silentWav(file) {
  const rate = 8000; const samples = rate / 10; const dataLen = samples * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
  fs.writeFileSync(file, buf);
}

async function addAudio() {
  await nav('Library');
  await page.getByTestId('file-input').setInputFiles(path.join(work, 'lecture.wav'));
  await page.getByRole('link', { name: 'lecture.wav', exact: true }).click();
  await page.getByRole('heading', { name: 'lecture.wav', exact: true }).waitFor();
}

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-transcript-'));
  silentWav(path.join(work, 'lecture.wav'));
  // Uses the test build, where the speech model is stubbed.
  server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-account', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(URL_BASE)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }
  context = await chromium.launchPersistentContext(path.join(work, 'profile'), { viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', acceptDownloads: true });
  await returningStudent(context);
  await context.addInitScript('delete window.showSaveFilePicker;');
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
  await page.getByLabel('Course name').waitFor();
});

after(async () => {
  await context?.close().catch(() => undefined);
  try { if (server) process.kill(-server.pid); } catch { /* stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('a recording can be turned into a transcript, which is then searchable', async () => {
  await addAudio();
  await page.evaluate(() => { window.__testTranscript = 'Today we covered how photosynthesis happens in the chloroplast.'; });
  await page.getByTestId('make-transcript').click();
  await page.getByTestId('transcript-text').waitFor();
  await transcriptWords(/photosynthesis happens in the chloroplast/).waitFor();
  // It survives a reload (it was saved).
  await page.reload();
  await page.getByTestId('transcript-text').waitFor();
  await transcriptWords(/chloroplast/).waitFor();

  await page.goto(`${URL_BASE}#/search`);
  await page.getByLabel('Search everything').fill('chloroplast');
  const hit = page.getByTestId('search-Files').getByRole('link', { name: 'lecture.wav' });
  await hit.first().waitFor();
  await page.getByText('Transcript').first().waitFor();
});

test('a transcript problem is shown and nothing is saved', async () => {
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'lecture.wav', exact: true }).click();
  await page.getByTestId('transcript-text').waitFor();
  // Remove the existing one first.
  await page.getByRole('button', { name: 'Delete transcript' }).click();
  await page.getByRole('button', { name: 'Delete transcript' }).nth(1).click();
  await page.getByTestId('make-transcript').waitFor();
  await page.evaluate(() => { window.__testTranscript = 'ERROR:The recording could not be read.'; });
  await page.getByTestId('make-transcript').click();
  await page.getByTestId('transcript-problem').getByText('The recording could not be read.').waitFor();
  assert.equal(await page.getByTestId('transcript-text').count(), 0);
});

test('a transcript is kept in a backup and comes back on restore', async () => {
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'lecture.wav', exact: true }).click();
  await page.evaluate(() => { window.__testTranscript = 'Elasticity measures how demand responds to price.'; });
  await page.getByTestId('make-transcript').click();
  await page.getByTestId('transcript-text').waitFor();
  await transcriptWords(/Elasticity/).waitFor();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => { await page.goto(`${URL_BASE}#/settings`); await page.getByRole('button', { name: 'Create backup' }).click(); })(),
  ]);
  const backup = path.join(work, 'backup.zip');
  await download.saveAs(backup);
  const second = await chromium.launchPersistentContext(path.join(work, 'fresh'), { viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', acceptDownloads: true });
  await returningStudent(second);
  await second.addInitScript('delete window.showSaveFilePicker;');
  const fresh = second.pages()[0] ?? (await second.newPage());
  await fresh.goto(`${URL_BASE}#/settings`);
  await fresh.getByTestId('restore-input').setInputFiles(backup);
  await fresh.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await fresh.getByTestId('restore-report').waitFor();
  await fresh.goto(`${URL_BASE}#/search`);
  await fresh.getByLabel('Search everything').fill('elasticity');
  await fresh.getByTestId('search-Files').getByText('Transcript').first().waitFor();
  await second.close();
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
