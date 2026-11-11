// Reads words inside an image and a scanned (image-only) PDF, on the device, so search can find them.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = 4197;
const URL_BASE = `http://localhost:${PORT}/`;
let server; let context; let page; let work;
const pageErrors = [];
const nav = (name) => page.getByRole('navigation', { name: name === 'Settings' ? 'Account' : 'Main' }).getByRole('link', { name, exact: true }).click();

async function addFile(name) {
  await nav('Library');
  await page.getByTestId('file-input').setInputFiles(path.join(work, name));
  await page.getByRole('link', { name, exact: true }).waitFor();
}

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-ocr-'));
  execFileSync('python3', [path.join(__dirname, 'makeScanFiles.py'), work]);
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(URL_BASE)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }
  context = await chromium.launchPersistentContext(path.join(work, 'profile'), { viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
  await page.getByLabel('Course name').waitFor();
});

after(async () => {
  await context?.close().catch(() => undefined);
  try { if (server) process.kill(-server.pid); } catch { /* stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('an image file is read so its words can be searched', async () => {
  await addFile('scan.png');
  await page.goto(`${URL_BASE}#/search`);
  await page.getByRole('heading', { name: 'Search', exact: true }).waitFor();
  // Reading a picture takes a few seconds, so give it room.
  await page.getByLabel('Search everything').fill('chloroplast');
  const hit = page.getByTestId('search-Files').getByRole('link', { name: /scan\.png/ });
  await hit.waitFor({ timeout: 90000 });
  assert.ok(await hit.count() >= 1);
});

test('a scanned PDF is read page by page', async () => {
  await addFile('scanned.pdf');
  await page.goto(`${URL_BASE}#/search`);
  await page.getByLabel('Search everything').fill('elasticity');
  await page.getByTestId('search-Files').getByRole('link', { name: /scanned\.pdf/ }).waitFor({ timeout: 90000 });
  await page.getByLabel('Search everything').fill('equilibrium');
  await page.getByTestId('search-Files').getByRole('link', { name: /scanned\.pdf/ }).waitFor({ timeout: 30000 });
});

test('a word that is not in either file is not found there', async () => {
  await page.goto(`${URL_BASE}#/search`);
  await page.getByLabel('Search everything').fill('xylophone');
  await page.getByTestId('search-empty').waitFor();
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
