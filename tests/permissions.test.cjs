// Device permissions belong to the browser. Study Forge asks once and is honest about the rest.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const rules = () => import('../src/data/permissions.ts');

test('the wording always points at the browser, never at a setting here', async () => {
  const { describeAccess, ACCESS_LABEL } = await rules();
  assert.match(describeAccess('denied', 'microphone'), /browser'?s site settings/);
  assert.match(describeAccess('denied', 'microphone'), /can't ask again/);
  assert.match(describeAccess('granted', 'microphone'), /won't be asked again/);
  assert.match(describeAccess('prompt', 'microphone'), /will ask the first time/);
  assert.match(describeAccess('unknown', 'microphone'), /won't tell a site/);
  assert.equal(ACCESS_LABEL.denied, 'Blocked');
});

const PORT = 4212;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let workDir;
const pageErrors = [];

const open = async (granted) => {
  if (context) await context.close();
  workDir = workDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-perm-'));
  const profile = fs.mkdtempSync(path.join(workDir, 'p-'));
  context = await chromium.launchPersistentContext(profile, { viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  if (granted) await context.grantPermissions(['microphone'], { origin: URL_BASE.replace(/\/$/, '') });
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
};

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-perm-'));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  await open(false);
});

after(async () => {
  await context?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('Settings shows what the browser has decided, in one place', async () => {
  await page.goto(`${URL_BASE}#/settings`);
  await page.getByTestId('permissions').waitFor();
  const section = await page.getByTestId('permissions').innerText();
  assert.match(section, /belong to your browser/);
  assert.match(section, /can't grant or revoke anything from here/);
  assert.match(section, /Microphone/);
  assert.match(section, /Camera/);
  assert.match(section, /Notifications/);
  // Honest about what is actually used.
  assert.match(section, /Nothing yet/);
  assert.match(section, /choose the window or tab every time/);
});

test('a granted microphone reads as allowed, without anything being asked', async () => {
  await open(true);
  await page.goto(`${URL_BASE}#/settings`);
  await page.getByTestId('permission-microphone').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="permission-microphone"]').innerText.includes('Allowed'));
  const row = await page.getByTestId('permission-microphone').innerText();
  assert.match(row, /Allowed/);
  assert.match(row, /won't be asked again/);
});

test('a blocked microphone is explained before recording, not after it fails', async () => {
  await open(false);
  await context.clearPermissions();
  // Deny the microphone outright, the way a student who clicked Block would have it.
  await page.addInitScript(() => {
    navigator.permissions.query = async () => ({ state: 'denied', addEventListener() {}, removeEventListener() {} });
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('should never be called'); };
  });
  await page.goto(`${URL_BASE}#/record`);
  await page.reload(); // An init script only applies to a fresh document, and a hash change isn't one.
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('alert').waitFor();
  const message = await page.getByRole('alert').innerText();
  assert.match(message, /blocking the microphone/);
  assert.match(message, /can't ask again/);
});

test('account recovery has its own address, and the old one still works', async () => {
  await page.goto(`${URL_BASE}#/account-recovery`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  const recovery = await page.getByRole('heading', { level: 1 }).innerText();
  await page.goto(`${URL_BASE}#/forgot-email`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), recovery, 'the old address still lands here');
  // It must never list who has an account.
  assert.doesNotMatch(await page.getByRole('main').innerText(), /@[a-z]+\.(com|edu)\b/i);
});

test('nothing threw', () => {
  assert.deepEqual(pageErrors, []);
});
