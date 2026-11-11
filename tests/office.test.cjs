// Opens real Word, Excel, and PowerPoint files in the viewer, with and without internet.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const URL_BASE = 'http://localhost:4186/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-office-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
let server;
let context;
let page;
const pageErrors = [];
const nav = (name) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click();
async function open(name, content) {
  await nav('Library');
  await page.getByTestId('file-input').setInputFiles(content ? { name, mimeType: 'application/octet-stream', buffer: Buffer.from(content) } : path.join(work, name));
  await page.getByRole('link', { name, exact: true }).click();
  await page.getByRole('heading', { name, exact: true }).waitFor();
}

before(async () => {
  execFileSync('python3', [path.join(__dirname, 'makeOfficeFiles.py'), work]);
  server = spawn('npx', ['vite', 'preview', '--port', '4186', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  context = await chromium.launchPersistentContext(path.join(work, 'profile'), { viewport: { width: 1280, height: 800 } });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
  await page.getByLabel('Course name').waitFor();
});

after(async () => {
  await context?.close().catch(() => undefined);
  try { if (server) process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('a Word document reads in the app, and nothing in it can run', async () => {
  await open('notes.docx');
  const view = page.getByTestId('word-view');
  await view.getByText('Accruals chapter').waitFor();
  await view.getByText('Cell one').waitFor();
  await view.getByText('onerror=window.__hacked=1').waitFor();
  assert.equal(await view.locator('img, script, iframe').count(), 0, 'text that looks like code stays text');
  const good = view.getByRole('link', { name: 'Good link' });
  assert.equal(await good.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(await good.getAttribute('target'), '_blank');
  const bad = await view.getByText('Bad link').evaluate((node) => node.closest('a')?.getAttribute('href') ?? '');
  assert.doesNotMatch(bad, /javascript/i);
  assert.equal(await page.evaluate(() => window.__hacked), undefined);
  await page.getByText('Reading view').waitFor();
  await page.getByRole('link', { name: 'Download' }).waitFor();
  await page.screenshot({ path: path.join(shots, 'viewer-word.png') });
});

test('a spreadsheet shows each sheet in a table', async () => {
  await open('grades.xlsx');
  const table = page.getByTestId('sheet-view');
  await table.getByText('Dana').waitFor();
  assert.match(await table.innerText(), /Name\s+Score[\s\S]*91\.5/);
  await page.getByRole('button', { name: 'Budget' }).click();
  await table.getByText('Books').waitFor();
  assert.equal(await table.getByText('Dana').count(), 0);
  await page.screenshot({ path: path.join(shots, 'viewer-excel.png') });
});

test('a very long sheet says it stopped early', async () => {
  await open('long.xlsx');
  await page.getByTestId('sheet-limit').getByText('first 2,000 of 2,501 rows').waitFor();
  assert.equal(await page.getByTestId('sheet-view').locator('tr').count(), 2000);
});

test('a PowerPoint shows slides in order, with pictures and notes, and skips risky pictures', async () => {
  await open('lecture.pptx');
  const slides = page.getByTestId('slide');
  await slides.first().waitFor();
  assert.equal(await slides.count(), 2);
  const first = await slides.nth(0).innerText();
  assert.match(first, /Slide 1 of 2[\s\S]*First in order continued[\s\S]*Body words continued/);
  assert.match(first, /Speaker notes[\s\S]*Say this out loud/);
  assert.match(await slides.nth(1).innerText(), /Second in order/);
  assert.equal(await slides.nth(0).locator('img').count(), 1, 'the drawing that could hold a script is left out');
  await slides.nth(0).locator('img').evaluate((image) => image.decode());
  assert.equal(await page.evaluate(() => window.__hacked), undefined);
  await page.screenshot({ path: path.join(shots, 'viewer-powerpoint.png') });
});

test('a damaged file and older formats explain themselves and keep the download', async () => {
  await open('broken.docx', 'this is not really a document');
  await page.getByTestId('viewer-fallback').getByText("couldn't display").waitFor();
  await page.getByTestId('viewer-fallback').getByRole('link', { name: 'Download broken.docx' }).waitFor();
  await open('broken.pptx', 'nor is this');
  await page.getByTestId('viewer-fallback').waitFor();
  await open('broken.xlsx', 'or this');
  await page.getByTestId('viewer-fallback').waitFor();
  await open('old.doc', 'older word file');
  await page.getByTestId('viewer-fallback').getByText('older .doc file').waitFor();
  await open('old.ppt', 'older slides');
  await page.getByTestId('viewer-fallback').getByText('PowerPoint as .pptx').waitFor();
});

test('all three open with no internet', async () => {
  await page.getByRole('navigation', { name: 'Main' }).first().waitFor();
  await page.waitForFunction(() => navigator.serviceWorker.ready.then((ready) => !!ready.active));
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.goto(URL_BASE);
  await nav('Library');
  await page.getByRole('link', { name: 'notes.docx', exact: true }).click();
  await page.getByTestId('word-view').getByText('Accruals chapter').waitFor();
  await nav('Library');
  await page.getByRole('link', { name: 'grades.xlsx', exact: true }).click();
  await page.getByTestId('sheet-view').getByText('Dana').waitFor();
  await nav('Library');
  await page.getByRole('link', { name: 'lecture.pptx', exact: true }).click();
  await page.getByTestId('slide').first().waitFor();
  await context.setOffline(false);
});

test('they fit a phone', async () => {
  await page.setViewportSize({ width: 360, height: 700 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await page.getByTestId('slide').first().waitFor();
  assert.ok((await overflow()) <= 0);
  await nav('Library');
  await page.getByRole('link', { name: 'grades.xlsx', exact: true }).click();
  await page.getByTestId('sheet-view').getByText('Dana').waitFor();
  assert.ok((await overflow()) <= 0);
  await page.screenshot({ path: path.join(shots, 'phone-viewer-excel.png') });
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
