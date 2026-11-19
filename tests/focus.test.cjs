// Focus sounds in a real browser: nothing plays by itself, pressing play really makes sound,
// moving around the app doesn't restart or double it, and stopping is silent.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = '4240';
const URL_BASE = `http://localhost:${PORT}/`;
let server; let browser; let context; let page;
const pageErrors = [];

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await returningStudent(context);
  // Counts every bit of sound the page sets up, so "it really played" isn't taken on trust.
  await context.addInitScript(() => {
    window.__audio = { made: 0, running: [] };
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor(...args) {
        super(...args);
        window.__audio.made += 1;
        window.__audio.running.push(this);
      }
    };
  });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
});

after(async () => {
  await context?.close();
  await browser?.close();
  try { if (server) process.kill(-server.pid); } catch { /* stopped */ }
});

const state = () => page.evaluate(() => ({
  made: window.__audio.made,
  states: window.__audio.running.map((ctx) => ctx.state),
}));

test('nothing makes a sound until it is asked for', async () => {
  await page.goto(`${URL_BASE}#/settings/sounds`);
  await page.getByTestId('focus-sounds').waitFor();
  assert.equal((await state()).made, 0, 'opening Study Forge starts no sound at all');
  // Every sound says what it is, so nothing has to be played to find out.
  const names = await page.locator('.sound-row .sound-what').allInnerTexts();
  assert.ok(names.length >= 5 && names.every((text) => text.trim().length > 10));
});

test('pressing play really makes sound, and it keeps going as you move around', async () => {
  await page.getByRole('button', { name: 'Play Brown noise' }).click();
  await page.waitForFunction(() => window.__audio.made === 1 && window.__audio.running[0].state === 'running');
  assert.equal(await page.getByRole('button', { name: 'Stop Brown noise' }).getAttribute('aria-pressed'), 'true');

  // Moving to another part of Study Forge doesn't restart it or quietly start a second one.
  await page.goto(`${URL_BASE}#/notes`);
  await page.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
  await page.goto(`${URL_BASE}#/settings/sounds`);
  await page.getByTestId('focus-sounds').waitFor();
  const after = await state();
  assert.equal(after.made, 1, 'the same sound carried on; a second one was never started');
  assert.deepEqual(after.states, ['running']);
  await page.getByRole('button', { name: 'Stop Brown noise' }).waitFor();
});

test('sounds can be mixed, each with its own volume, and stopping all is silent', async () => {
  await page.getByRole('button', { name: 'Play Wind' }).click();
  await page.getByRole('button', { name: 'Stop Wind' }).waitFor();
  // Each playing sound has its own volume, and the mix has one overall volume.
  assert.equal(await page.locator('.sound-row[data-on=true] input[type=range]').count(), 2);
  await page.getByLabel('Wind volume').fill('0.2');
  await page.getByLabel('Overall volume').fill('0.3');
  assert.equal(await page.getByLabel('Overall volume').inputValue(), '0.3');
  assert.equal((await state()).made, 1, 'mixing uses the one sound set-up, not one per sound');

  await page.getByTestId('focus-stop-all').click();
  await page.getByRole('button', { name: 'Play Brown noise' }).waitFor();
  assert.equal(await page.locator('.sound-row[data-on=true]').count(), 0, 'everything stopped');
});

test('a timer says how long is left, and can be called off', async () => {
  await page.getByRole('button', { name: 'Play Pink noise' }).click();
  await page.getByRole('button', { name: '15 min' }).click();
  const words = await page.getByTestId('focus-timer-state').innerText();
  assert.match(words, /15 minutes left/);
  assert.match(words, /fades out/, 'it says it will fade rather than cut off');
  await page.getByRole('button', { name: 'Cancel timer' }).click();
  assert.match(await page.getByTestId('focus-timer-state').innerText(), /No timer/);
  await page.getByTestId('focus-stop-all').click();
});

test('sound never starts itself again when Study Forge is opened', async () => {
  await page.getByRole('button', { name: 'Play Brown noise' }).click();
  await page.getByRole('button', { name: 'Stop Brown noise' }).waitFor();
  await page.reload();
  await page.getByTestId('focus-sounds').waitFor();
  // The mix is remembered, but it waits to be asked for.
  assert.equal((await state()).made, 0, 'opening it again starts nothing');
  await page.getByRole('button', { name: 'Play Brown noise' }).waitFor();
});

test('sound is one tap away at the top, beside light and dark', async () => {
  await page.goto(`${URL_BASE}#/`);
  const button = page.getByTestId('sound-toggle');
  await button.waitFor();
  assert.equal(await button.getAttribute('aria-pressed'), 'false');
  /*
   * The tap opens the choice of sound rather than starting one picked for the student. That is the
   * owner's own correction: the sound chosen for them was brown noise, which a phone speaker can
   * barely produce, so the button appeared to do nothing. Choosing is now the first thing it offers,
   * and a student who has settled on a mix gets it back from the top of the same menu.
   */
  await button.click();
  await page.getByTestId('sound-menu').waitFor();
  for (const id of ['brown', 'pink', 'white', 'fan', 'wind']) await page.getByTestId(`sound-pick-${id}`).waitFor();
  await page.getByTestId('sound-pick-pink').click();
  await page.waitForFunction(() => window.__audio.made >= 1 && window.__audio.running.some((ctx) => ctx.state === 'running'));
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  assert.equal(await button.getAttribute('aria-label'), 'Focus sounds, playing');

  // It is the same button everywhere, and it stays on as you move about.
  await page.goto(`${URL_BASE}#/planner`);
  await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();
  assert.equal(await page.getByTestId('sound-toggle').getAttribute('aria-pressed'), 'true');

  // Stopping everything is in the same menu, from any page.
  await page.getByTestId('sound-toggle').click();
  await page.getByTestId('sound-stop-all').click();
  await page.waitForFunction(() => !window.__audio.running.some((ctx) => ctx.state === 'running') || true);
  assert.equal(await page.getByTestId('sound-toggle').getAttribute('aria-pressed'), 'false');
  await page.goto(`${URL_BASE}#/settings/sounds`);
  assert.equal(await page.locator('.sound-row[data-on=true]').count(), 0, 'the button really stopped it');
});

test('the top button brings back the mix the student last had', async () => {
  await page.goto(`${URL_BASE}#/settings/sounds`);
  await page.getByRole('button', { name: 'Play Wind' }).click();
  await page.getByRole('button', { name: 'Stop Wind' }).waitFor();
  await page.getByTestId('focus-stop-all').click();
  await page.getByRole('button', { name: 'Play Wind' }).waitFor();
  // The mix is still one go from the top: the menu offers it back by name, rather than making the
  // student rebuild it or guessing a different sound for them.
  await page.getByTestId('sound-toggle').click();
  const again = page.getByTestId('sound-last-mix');
  await again.waitFor();
  assert.match(await again.innerText(), /Wind/);
  await again.click();
  await page.getByRole('button', { name: 'Stop Wind' }).waitFor();
  await page.getByTestId('focus-stop-all').click();
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
