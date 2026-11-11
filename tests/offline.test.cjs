// Turns the network off in a real browser and checks that Study Forge keeps working.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const URL_BASE = 'http://localhost:4185/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-offline-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
// A private copy of the site, because one test publishes a pretend new version.
const site = path.join(work, 'site');
fs.cpSync(path.join(__dirname, '..', 'dist'), site, { recursive: true });
let server;
let context;
let page;
const pageErrors = [];
const nav = (name) => page.getByRole('navigation', { name: name === 'Settings' ? 'Account' : 'Main' }).getByRole('link', { name, exact: true }).click();

const PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
165
%%EOF`;

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4185', '--strictPort', '--outDir', site], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  context = await chromium.launchPersistentContext(path.join(work, 'profile'), { viewport: { width: 1280, height: 800 } });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await context?.close().catch(() => undefined);
  try { if (server) process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('the worker lists every file and leaves out itself', () => {
  const worker = fs.readFileSync(path.join(site, 'sw.js'), 'utf8');
  assert.doesNotMatch(worker, /__VERSION__|__FILES__/);
  const files = JSON.parse(worker.match(/const FILES = (\[.*\]);/)[1]);
  for (const wanted of ['./index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png']) assert.ok(files.includes(wanted), wanted);
  assert.ok(files.some((file) => file.includes('pdf.worker')), 'PDFs can be read offline');
  assert.ok(files.some((file) => file.endsWith('.woff2')), 'the fonts are included');
  assert.ok(!files.includes('./sw.js'));
  for (const file of files) assert.ok(fs.existsSync(path.join(site, file)), file);
});

test('the site can be installed', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './', 'it works from the site\'s folder on GitHub Pages');
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ['192x192', '512x512']);
});

test('Settings says when the site is ready for offline use', async () => {
  await page.getByLabel('Course name').fill('Offline course');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Offline course' }).waitFor();
  await nav('Settings');
  await page.getByTestId('offline-status').getByText('opens without internet').waitFor();
  await page.getByTestId('install-help').or(page.getByRole('button', { name: 'Install Study Forge' })).first().waitFor();
  await page.screenshot({ path: path.join(shots, 'settings-offline.png'), fullPage: true });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
});

test('with no internet, the site opens, reloads on an inner screen, and says it is offline', async () => {
  await context.setOffline(true);
  await page.getByTestId('offline-notice').waitFor();
  await page.reload();
  await page.getByTestId('offline-notice').waitFor();
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await page.goto(`${URL_BASE}#/planner`);
  await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();
  await page.screenshot({ path: path.join(shots, 'offline-planner.png') });
});

test('work saves with no internet and is still there afterward', async () => {
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Written offline');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('link', { name: 'Written offline' }).waitFor();
  await nav('Flashcards');
  await page.getByLabel('New deck').fill('Offline deck');
  await page.getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('heading', { name: 'Offline deck' }).waitFor();
  await page.getByLabel('Front', { exact: true }).fill('Question');
  await page.getByLabel('Back', { exact: true }).fill('Answer');
  await page.getByRole('button', { name: 'Add card' }).click();
  await page.getByTestId('card-row').waitFor();
  await page.getByRole('link', { name: 'Review 1 due' }).click();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByRole('group', { name: 'How well did you remember it?' }).getByRole('button', { name: /^Good/ }).click();
  await page.getByRole('heading', { name: 'All done' }).waitFor();
  await nav('Practice');
  await page.getByRole('heading', { name: 'Practice', exact: true }).waitFor();
  await nav('Study');
  await page.getByRole('heading', { name: 'Study', exact: true }).first().waitFor();
  await nav('Today');
  await page.getByTestId('day-summary').waitFor();
  await page.reload();
  await page.getByTestId('overdue').waitFor();
  assert.ok(await page.getByTestId('tile-due').isVisible());
  await nav('Planner');
  await page.getByRole('link', { name: 'Written offline' }).waitFor();
});

test('a PDF added offline opens offline, which needs its reader to be saved too', async () => {
  await nav('Library');
  await page.getByTestId('file-input').setInputFiles({ name: 'offline.pdf', mimeType: 'application/pdf', buffer: Buffer.from(PDF) });
  await page.getByRole('link', { name: 'offline.pdf' }).click();
  await page.locator('canvas').first().waitFor();
});

test('signing in with no internet explains why it can\'t', async () => {
  await page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email').fill('dana@school.edu');
  await page.getByLabel('Password', { exact: true }).fill('long enough now');
  await page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByTestId('auth-problems').getByText("can't reach the internet").waitFor();
});

test('reconnecting clears the notice', async () => {
  await context.setOffline(false);
  await page.getByTestId('offline-notice').waitFor({ state: 'detached' });
});

test('a new version waits for the student, and refreshing keeps their work', async () => {
  fs.appendFileSync(path.join(site, 'sw.js'), '\n// pretend new version\n');
  await page.goto(`${URL_BASE}#/planner`);
  await page.reload();
  const notice = page.getByTestId('update-notice');
  await notice.waitFor({ timeout: 20000 });
  await page.getByRole('link', { name: 'Written offline' }).waitFor();
  await page.screenshot({ path: path.join(shots, 'update-notice.png') });
  await page.getByRole('button', { name: 'Refresh now' }).click();
  await notice.waitFor({ state: 'detached' });
  await page.getByRole('link', { name: 'Written offline' }).waitFor();
  assert.equal(await page.evaluate(() => caches.keys().then((names) => names.filter((name) => name.startsWith('study-forge-')).length)), 1, 'the old copy is cleaned up');
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
