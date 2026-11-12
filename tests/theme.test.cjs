// The look: one two-way sun/moon button at the top, and the automatic options only in Settings.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4223;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let work;
const pageErrors = [];
const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
const toggle = () => page.getByTestId('theme-toggle');
const radio = (name) => page.getByRole('radio', { name, exact: true });
// The radios are visually hidden behind their labels, so a student taps the label.
const choose = (name) => page.locator('label.segment').filter({ hasText: new RegExp(`^${name}$`) }).click();

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-theme-'));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  context = await chromium.launchPersistentContext(path.join(work, 'main'), { viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', timezoneId: 'America/New_York', colorScheme: 'light' });
  await returningStudent(context);
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // Noon in New York on 11 November 2026: the sun is up (it sets about 4:43 pm).
  await page.clock.install({ time: new Date('2026-11-11T12:00:00-05:00') });
  await page.goto(`${URL_BASE}#/notes`);
});

after(async () => {
  await context?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('sunrise and sunset are worked out correctly, with no lookup', async () => {
  const { sunMinutesUtc, sunDay, isDarkAt, nextChangeMs, suggestPlace, resolveLook } = await import('../src/data/sunRules.ts');
  // New York, 11 Nov 2026: about 6:37 am and 4:43 pm Eastern (11:37 and 21:43 UTC).
  const ny = sunMinutesUtc(2026, 11, 11, 40.71, -74.01);
  assert.ok(Math.abs(ny.rise - (11 * 60 + 37)) <= 4, `sunrise ${ny.rise}`);
  assert.ok(Math.abs(ny.set - (21 * 60 + 43)) <= 4, `sunset ${ny.set}`);
  // Midsummer is much longer than midwinter, so the schedule moves through the year.
  const june = sunMinutesUtc(2026, 6, 21, 40.71, -74.01);
  assert.ok(june.set - june.rise > ny.set - ny.rise + 240);
  // Far north: no sunrise in December, no sunset in June.
  assert.equal(sunMinutesUtc(2026, 12, 21, 78, 15).always, 'dark');
  assert.equal(sunMinutesUtc(2026, 6, 21, 78, 15).always, 'light');
  const sun = { riseMs: 1000, setMs: 5000 };
  assert.deepEqual([isDarkAt(500, sun), isDarkAt(1000, sun), isDarkAt(4999, sun), isDarkAt(5000, sun)], [true, false, false, true]);
  assert.equal(nextChangeMs(500, sun), 1000);
  assert.equal(nextChangeMs(2000, sun), 5000);
  assert.ok(sunDay(new Date(2026, 10, 11, 12), { lat: 40.71, lon: -74.01 }).riseMs > 0);
  assert.equal(suggestPlace('America/Chicago', -360).name, 'Chicago');
  const guess = suggestPlace('Some/Unknown', -300);
  assert.ok(guess.lon < -70 && guess.lon > -80, `falls back to a city at about the same clock time, got ${guess.name}`);
  // Light and Dark are just that. Under an automatic choice, the button's override wins.
  assert.equal(resolveLook('light', 'dark', true, true), 'light');
  assert.equal(resolveLook('system', null, true, false), 'dark');
  assert.equal(resolveLook('sun', null, true, false), 'light');
  assert.equal(resolveLook('sun', 'dark', false, false), 'dark');
});

test('the moon switches to dark and the sun switches back, in one tap, without going anywhere', async () => {
  assert.equal(await theme(), 'light');
  assert.equal(await toggle().getAttribute('data-shows'), 'moon');
  assert.equal(await toggle().getAttribute('aria-label'), 'Switch to Dark Mode');
  const where = page.url();
  await toggle().click();
  assert.equal(await theme(), 'dark');
  assert.equal(await toggle().getAttribute('data-shows'), 'sun');
  assert.equal(await toggle().getAttribute('aria-label'), 'Switch to Light Mode');
  assert.equal(page.url(), where, 'it never opens Settings');
  assert.equal(await page.getByRole('menu').count(), 0);
  // Many taps only ever give light or dark, never an automatic mode.
  const seen = new Set();
  for (let tap = 0; tap < 5; tap++) {
    await toggle().click();
    seen.add(`${await theme()}:${await page.evaluate(() => localStorage.getItem('study-forge-theme'))}`);
  }
  assert.deepEqual([...seen].sort(), ['dark:dark', 'light:light']);
  assert.equal(await page.getByTestId('theme-toggle').count(), 1, 'one button');
});

test('Settings offers Light, Dark, Match Device and Sunrise/Sunset in one place', async () => {
  await page.goto(`${URL_BASE}#/settings`);
  for (const name of ['Light', 'Dark', 'Match Device', 'Sunrise/Sunset']) assert.equal(await radio(name).count(), 1, name);
  assert.equal(await page.getByRole('heading', { name: 'Appearance' }).count(), 1);
});

test('Match Device follows the device, and the button overrides it until Settings is used again', async () => {
  await choose('Match Device');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  // Manual override: dark while the device is light.
  await toggle().click();
  assert.equal(await theme(), 'dark');
  assert.equal(await radio('Match Device').isChecked(), true, 'the preference itself is unchanged');
  await page.getByTestId('theme-override').getByText(/Match Device is paused/).waitFor();
  // The device changing doesn't undo what the student chose.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(200);
  assert.equal(await theme(), 'dark');
  await page.reload();
  assert.equal(await theme(), 'dark', 'the override survives a reload');
  await page.getByTestId('theme-override').getByRole('button', { name: 'Go back to Match Device' }).click();
  assert.equal(await theme(), 'light');
  assert.equal(await page.getByTestId('theme-override').count(), 0);
});

test('Sunrise/Sunset is light by day and turns dark at sunset by itself', async () => {
  await choose('Sunrise/Sunset');
  assert.equal(await theme(), 'light', 'noon is daytime');
  const times = await page.getByTestId('sun-times').innerText();
  assert.match(times, /Today in New York: light from 6:3\d AM, dark from 4:4\d PM/);
  assert.match(times, /your location was never asked for/);
  // Five hours later it's past sunset.
  await page.clock.fastForward('05:00:00');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  // A different city changes the schedule: it's still daytime in Los Angeles.
  await page.getByLabel('City for sunrise and sunset').selectOption('Los Angeles');
  assert.equal(await theme(), 'light');
  await page.getByLabel('City for sunrise and sunset').selectOption('New York');
  assert.equal(await theme(), 'dark');
});

test('the button overrides Sunrise/Sunset too, and it does not change back unexpectedly', async () => {
  await toggle().click();
  assert.equal(await theme(), 'light', 'light in the evening, because the student chose it');
  await page.getByTestId('theme-override').getByText(/Sunrise\/Sunset is paused/).waitFor();
  await page.clock.fastForward('14:00:00'); // through the night and past the next sunrise
  assert.equal(await theme(), 'light');
  await toggle().click();
  assert.equal(await theme(), 'dark');
  await page.clock.fastForward('12:00:00');
  assert.equal(await theme(), 'dark', 'still what the student chose');
  assert.equal(await radio('Sunrise/Sunset').isChecked(), true);
  // Picking the preference again returns to the schedule.
  await page.getByTestId('theme-override').getByRole('button', { name: 'Go back to Sunrise/Sunset' }).click();
  assert.equal(await page.getByTestId('theme-override').count(), 0);
});

test('the right look is applied before the app loads, so nothing flashes', async () => {
  await choose('Dark');
  // With the app's own code held back, only the first lines of the page can have set the look.
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.reload();
  assert.equal(await theme(), 'dark');
  await page.evaluate(() => { localStorage.setItem('study-forge-theme', 'sun'); localStorage.setItem('study-forge-theme-override', 'light'); });
  await page.reload();
  assert.equal(await theme(), 'light', 'an override is honoured on the first paint too');
  await page.evaluate(() => {
    localStorage.removeItem('study-forge-theme-override');
    const now = Date.now();
    // Sunrise 8 hours ago, sunset 2 hours ago: it is night.
    localStorage.setItem('study-forge-theme-sun', JSON.stringify({ rise: now - 8 * 3600000, set: now - 2 * 3600000, always: null }));
  });
  await page.reload();
  assert.equal(await theme(), 'dark');
  await page.unroute('**/assets/*.js');
});

test('the look is the same on every page, including signing in, and works on a phone', async () => {
  await page.evaluate(() => { localStorage.setItem('study-forge-theme', 'dark'); localStorage.removeItem('study-forge-theme-override'); });
  const dark = [];
  for (const route of ['', 'courses', 'cards', 'practice', 'planner', 'calendar', 'library', 'record', 'settings', 'auth', 'welcome']) {
    await page.goto(`${URL_BASE}#/${route}`);
    await page.reload();
    await page.locator('h1, h2').first().waitFor();
    const colour = await page.evaluate(() => getComputedStyle(document.body).backgroundColor.match(/\d+/g).slice(0, 3).map(Number));
    dark.push([route, colour.reduce((sum, part) => sum + part, 0) < 200]);
  }
  assert.deepEqual(dark.filter(([, isDark]) => !isDark), [], 'every page is dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${URL_BASE}#/notes`);
  await toggle().waitFor();
  const box = await toggle().boundingBox();
  assert.ok(box.width >= 40 && box.height >= 40 && box.x >= 0 && box.x + box.width <= 390, 'the button is on screen and large enough to tap');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'no sideways scroll');
  await toggle().click();
  assert.equal(await theme(), 'light');
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
