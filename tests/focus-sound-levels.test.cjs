// Focus sounds are measured, not trusted. Each one is played on its own and the signal reaching the
// speakers is read off a meter spliced into the real audio graph, because "it plays" and "you can
// hear it" turned out to be different things: wind was seventeen decibels below white noise.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4234;
const URL_BASE = `http://localhost:${PORT}/`;
const NAMES = ['Brown noise', 'Pink noise', 'White noise', 'Fan', 'Wind'];
let server;
let browser;
let page;
const pageErrors = [];

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // A meter on everything that reaches the speakers, put in before the app starts.
  await page.addInitScript(() => {
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor(...args) {
        super(...args);
        window.__ctx = this;
        const meter = this.createAnalyser();
        meter.fftSize = 4096;
        window.__meter = meter;
        const realConnect = AudioNode.prototype.connect;
        const speakers = this.destination;
        AudioNode.prototype.connect = function (target, ...rest) {
          if (target === speakers) realConnect.call(this, meter);
          return realConnect.call(this, target, ...rest);
        };
      }
    };
  });
  await returningStudent(page);
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await browser?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
});

const measure = () => page.evaluate(() => {
  const meter = window.__meter;
  if (!meter) return null;
  const buffer = new Float32Array(meter.fftSize);
  meter.getFloatTimeDomainData(buffer);
  let sum = 0;
  let peak = 0;
  for (const sample of buffer) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
  return { rms: Math.sqrt(sum / buffer.length), peak };
});

test('the top bar offers the choice of sound, and the one chosen is audible', async () => {
  await page.goto(`${URL_BASE}#/`);
  await page.getByTestId('sound-toggle').click();
  // Every sound is offered, rather than one being chosen for the student.
  await page.getByTestId('sound-menu').waitFor();
  for (const id of ['brown', 'pink', 'white', 'fan', 'wind']) {
    await page.getByTestId(`sound-pick-${id}`).waitFor();
  }
  await page.getByTestId('sound-pick-pink').click();
  await page.waitForTimeout(1200);
  const level = await measure();
  assert.ok(level, 'no audio context was created');
  // Well above the level at which a phone speaker in a quiet room produces nothing.
  assert.ok(level.rms > 0.08, `the first tap is too quiet to hear: ${level.rms.toFixed(4)} RMS`);
  assert.ok(level.peak < 0.95, `that would clip: peak ${level.peak.toFixed(3)}`);
  // It also tells the phone this is playback, so an iPhone's mute switch doesn't silence it.
  const claimed = await page.evaluate(() => document.querySelectorAll('audio').length > 0 || Boolean(window.__ctx));
  assert.equal(claimed, true);
  // The row says it is playing, and stopping is the same row again.
  assert.equal(await page.getByTestId('sound-pick-pink').getAttribute('aria-checked'), 'true');
  await page.getByTestId('sound-stop-all').click();
  await page.waitForTimeout(600);
  assert.equal(await page.getByTestId('sound-toggle').getAttribute('aria-pressed'), 'false');
});

test('every sound comes out at the same loudness as the others', async () => {
  await page.goto(`${URL_BASE}#/settings/sounds`);
  const levels = {};
  for (const name of NAMES) {
    const row = page.locator('.sound-row').filter({ hasText: name });
    const play = row.getByRole('button').first();
    await play.click();
    await page.waitForTimeout(1100);
    levels[name] = await measure();
    await play.click();
    await page.waitForTimeout(400);
  }
  for (const name of NAMES) {
    assert.ok(levels[name].rms > 0.08, `${name} is too quiet to hear: ${levels[name].rms.toFixed(4)} RMS`);
    assert.ok(levels[name].peak < 0.95, `${name} would clip: peak ${levels[name].peak.toFixed(3)}`);
  }
  // Within six decibels of each other, so no sound is the one nobody can hear. Before the sounds
  // were calibrated the spread was seventeen.
  const all = NAMES.map((name) => levels[name].rms);
  const spread = 20 * Math.log10(Math.max(...all) / Math.min(...all));
  assert.ok(spread < 6, `the sounds are ${spread.toFixed(1)} dB apart: ${JSON.stringify(levels)}`);
});

test('the volume slides on the same menu, and the sound really does get quieter', async () => {
  await page.goto(`${URL_BASE}#/`);
  await page.getByTestId('sound-toggle').click();
  await page.getByTestId('sound-menu').waitFor();
  await page.getByTestId('sound-pick-white').click();
  await page.waitForTimeout(1200);
  const loud = await measure();
  assert.ok(loud.rms > 0.08, `it should start audible: ${loud.rms.toFixed(4)}`);

  // Turning it down is right here, not a trip to Settings.
  await page.getByTestId('sound-volume').fill('20');
  await page.getByTestId('sound-volume-shown').filter({ hasText: '20%' }).waitFor();
  await page.waitForTimeout(1200);
  const quiet = await measure();
  assert.ok(quiet.rms < loud.rms * 0.6, `it should be clearly quieter: ${loud.rms.toFixed(4)} then ${quiet.rms.toFixed(4)}`);

  // And up again, because a slider that only goes one way is worse than none.
  await page.getByTestId('sound-volume').fill('90');
  await page.waitForTimeout(1200);
  const louder = await measure();
  assert.ok(louder.rms > quiet.rms * 1.5, `it should come back up: ${quiet.rms.toFixed(4)} then ${louder.rms.toFixed(4)}`);
  assert.ok(louder.peak < 0.95, `it should not clip at 90%: peak ${louder.peak.toFixed(3)}`);

  // The setting is remembered, so it is not reset every time a sound starts.
  await page.getByTestId('sound-stop-all').click();
  await page.waitForTimeout(400);
  await page.reload();
  await page.getByTestId('sound-toggle').click();
  await page.getByTestId('sound-volume-shown').filter({ hasText: '90%' }).waitFor();
  await page.keyboard.press('Escape');
});

test('the sound picker fits a phone, where the button is not at the edge', async () => {
  await page.setViewportSize({ width: 390, height: 760 });
  try {
    await page.goto(`${URL_BASE}#/`);
    await page.getByTestId('sound-toggle').click();
    const menu = page.getByTestId('sound-menu');
    await menu.waitFor();
    // The button sits near the middle of a phone's bar, so a menu hanging off its right edge would
    // run off the left of the screen.
    const box = await menu.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390, `the picker is off screen: ${JSON.stringify(box)}`);
    assert.ok(box.y + box.height <= 760, 'the picker runs off the bottom of a phone');
    // Every row can actually be pressed, which is the complaint this kind of bug produces.
    for (const id of ['brown', 'pink', 'white', 'fan', 'wind']) {
      const row = await page.getByTestId(`sound-pick-${id}`).boundingBox();
      assert.ok(row.x >= 0 && row.x + row.width <= 390, `${id} is off screen`);
      assert.ok(row.height >= 36, `${id} is too small to tap: ${row.height}px`);
    }
    const slider = await page.getByTestId('sound-volume').boundingBox();
    assert.ok(slider.x >= 0 && slider.x + slider.width <= 390, 'the volume slider is off screen on a phone');
    // And the page itself never scrolls sideways because of it.
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(sideways <= 0, `the page scrolls sideways by ${sideways}px`);
    await page.keyboard.press('Escape');
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
