// Device permissions belong to the browser. Study Forge asks once and is honest about the rest.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

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
  await returningStudent(context);
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

test('the Notifications status is the control: tapping it asks the browser and then reads Allowed', async () => {
  await open(false);
  // A browser that hasn't been asked yet, and says yes when it is.
  await page.addInitScript(() => {
    let asked = 0;
    window.__asked = () => asked;
    window.Notification = { permission: 'default', requestPermission: async () => { asked += 1; window.Notification.permission = 'granted'; return 'granted'; } };
  });
  await page.goto(`${URL_BASE}#/settings`);
  await page.reload();
  const control = page.getByTestId('notification-control');
  await control.waitFor();
  assert.equal(await control.getAttribute('data-state'), 'prompt');
  assert.match(await control.innerText(), /Not yet enabled/);
  assert.equal(await page.evaluate(() => window.__asked()), 0, 'nothing is asked until the student taps');
  // One control, not a status with a second button beside it.
  assert.equal(await page.getByTestId('permission-notifications').getByRole('button').count(), 1);
  await control.click();
  await page.locator('[data-testid=notification-control][data-state=granted]').waitFor();
  assert.match(await control.innerText(), /Allowed/);
  assert.equal(await page.evaluate(() => window.__asked()), 1);
});

test('a blocked Notifications status explains how to unblock, and never asks again', async () => {
  await open(false);
  await page.addInitScript(() => {
    window.__asked = 0;
    window.Notification = { permission: 'denied', requestPermission: async () => { window.__asked += 1; return 'denied'; } };
  });
  await page.goto(`${URL_BASE}#/settings`);
  await page.reload();
  const control = page.getByTestId('notification-control');
  await control.waitFor();
  assert.match(await control.innerText(), /Blocked/);
  await control.click();
  assert.match(await page.getByTestId('notification-help').innerText(), /address bar/);
  assert.equal(await page.evaluate(() => window.__asked), 0, 'a blocked browser is not asked again');
  // The student turns it on in the browser and comes back: the same control now reads Allowed.
  await page.evaluate(() => { window.Notification.permission = 'granted'; window.dispatchEvent(new Event('focus')); });
  await page.locator('[data-testid=notification-control][data-state=granted]').waitFor();
  // Works on a phone too.
  await page.setViewportSize({ width: 390, height: 844 });
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  assert.ok(box.height >= 36 && box.x >= 0 && box.x + box.width <= 390);
});

test('on an iPhone tab, the Notifications status explains the Home Screen step instead of a dead end', async () => {
  const browser = await chromium.launch();
  const phone = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 } });
  const tab = await phone.newPage();
  try {
  await tab.addInitScript(() => { delete window.Notification; localStorage.setItem('study-forge-seen-welcome', '1'); });
  await tab.goto(`${URL_BASE}#/settings`);
  await tab.reload();
  const control = tab.getByTestId('notification-control');
  await control.waitFor();
  assert.match(await control.innerText(), /Add to Home Screen first/);
  await tab.getByTestId('permission-notifications').getByText(/tap Share, then Add to Home Screen/).waitFor();
  } finally {
    await browser.close();
  }
});

test('in Arc, a blocked Notifications status gives Arc\'s own steps, and Allowed offers a test', async () => {
  await open(false);
  await page.addInitScript(() => {
    // Arc adds its palette to every page; that's how it's recognised.
    document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--arc-palette-title', '#123456'));
    window.Notification = function Notification() { window.__shown = (window.__shown ?? 0) + 1; };
    window.Notification.permission = 'denied';
    window.Notification.requestPermission = async () => 'denied';
  });
  await page.goto(`${URL_BASE}#/settings`);
  await page.reload();
  await page.getByTestId('notification-control').click();
  assert.match(await page.getByTestId('notification-help').innerText(), /In Arc[\s\S]*arc:\/\/settings\/content\/notifications/);
  // Once the student allows it in Arc and comes back, a test notification checks it really shows.
  await page.evaluate(() => { window.Notification.permission = 'granted'; window.dispatchEvent(new Event('focus')); });
  await page.getByTestId('notification-test').click();
  assert.equal(await page.evaluate(() => window.__shown), 1);
  await page.getByText(/A test was sent/).waitFor();
});

test('nothing threw', () => {
  assert.deepEqual(pageErrors, []);
});
