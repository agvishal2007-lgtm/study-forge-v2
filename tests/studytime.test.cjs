// Study-time maths, then the clock and Progress display in a real browser.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const rules = () => import('../src/data/studyTimeRules.ts');

test('active seconds only count while visible and not idle, and a single step is capped', async () => {
  const { activeSeconds, IDLE_MS, MAX_STEP_MS } = await rules();
  const base = { fromMs: 0, toMs: 10_000, visible: true, lastInteractMs: 0 };
  assert.equal(activeSeconds(base), 10, 'ten seconds of active time');
  assert.equal(activeSeconds({ ...base, visible: false }), 0, 'a hidden tab counts nothing');
  assert.equal(activeSeconds({ ...base, toMs: IDLE_MS + 5_000 }), 0, 'gone idle counts nothing');
  assert.equal(activeSeconds({ ...base, toMs: MAX_STEP_MS + 60_000 }), MAX_STEP_MS / 1000, 'one step is capped');
  assert.equal(activeSeconds({ ...base, fromMs: 10_000 }), 0, 'no backwards time');
});

test('totals add up across devices, days, and courses', async () => {
  const { totalSeconds, secondsByDate, secondsByCourse, secondsOverDates } = await rules();
  const records = [
    { id: 'a', date: '2026-11-04', seconds: 600, byCourse: { bio: 600 }, updatedAt: 1 },
    { id: 'b', date: '2026-11-04', seconds: 300, byCourse: { chem: 300 }, updatedAt: 2 },
    { id: 'c', date: '2026-11-03', seconds: 1200, byCourse: { bio: 1000 }, updatedAt: 3 },
  ];
  assert.equal(totalSeconds(records), 2100);
  assert.equal(secondsByDate(records).get('2026-11-04'), 900, 'two devices on one day add up');
  assert.equal(secondsByCourse(records).get('bio'), 1600, 'one course across two days adds up');
  assert.equal(secondsByCourse(records).get('chem'), 300);
  assert.equal(secondsOverDates(secondsByDate(records), ['2026-11-04', '2026-11-03']), 2100);
  assert.equal(secondsOverDates(secondsByDate(records), ['2026-11-02']), 0, 'a quiet day adds nothing');
});

test('durations read in plain minutes and hours', async () => {
  const { formatDuration } = await rules();
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(20), '0m', 'a few seconds rounds to nothing');
  assert.equal(formatDuration(90), '2m');
  assert.equal(formatDuration(600), '10m');
  assert.equal(formatDuration(3600), '1h');
  assert.equal(formatDuration(3900), '1h 05m');
  assert.equal(formatDuration(9000), '2h 30m');
});

const PORT = 4199;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let work;
const pageErrors = [];
const nav = (name) => page.getByRole('navigation', { name: name === 'Settings' ? 'Account' : 'Main' }).getByRole('link', { name, exact: true }).click();
const tile = (id) => page.getByTestId(`progress-${id}`).locator('b').innerText();

const readSeconds = async () => page.evaluate(async () => {
  const dbs = await indexedDB.databases();
  const name = dbs.map((d) => d.name).find((n) => n && n.includes('study-forge'));
  if (!name) return -1;
  return new Promise((resolve) => {
    const open = indexedDB.open(name);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('studyTime')) { resolve(-2); return; }
      const all = db.transaction('studyTime', 'readonly').objectStore('studyTime').getAll();
      all.onsuccess = () => resolve(all.result.reduce((sum, record) => sum + (record.seconds || 0), 0));
      all.onerror = () => resolve(-3);
    };
    open.onerror = () => resolve(-4);
  });
});

const courseId = async () => page.evaluate(async () => {
  const dbs = await indexedDB.databases();
  const name = dbs.map((d) => d.name).find((n) => n && n.includes('study-forge'));
  return new Promise((resolve) => {
    const open = indexedDB.open(name);
    open.onsuccess = () => {
      const all = open.result.transaction('courses', 'readonly').objectStore('courses').getAll();
      all.onsuccess = () => resolve((all.result.find((c) => c.name === 'Biology') || {}).id || null);
      all.onerror = () => resolve(null);
    };
  });
});

const seedTime = async (date, seconds, course) => page.evaluate(async ({ date, seconds, course }) => {
  const dbs = await indexedDB.databases();
  const name = dbs.map((d) => d.name).find((n) => n && n.includes('study-forge'));
  return new Promise((resolve) => {
    const open = indexedDB.open(name);
    open.onsuccess = () => {
      const tx = open.result.transaction('studyTime', 'readwrite');
      tx.objectStore('studyTime').put({ id: `${date}_seed`, date, seconds, byCourse: course ? { [course]: seconds } : {}, updatedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    };
  });
}, { date, seconds, course });

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-studytime-'));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  context = await chromium.launchPersistentContext(path.join(work, 'main'), { viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York', serviceWorkers: 'block' });
  await returningStudent(context);
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.clock.install({ time: new Date('2026-11-05T14:30:00-05:00') });
  await page.goto(URL_BASE);
});

after(async () => {
  await context?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('studying a surface accrues active time', async () => {
  // A course, a deck, and a card, then review it so the review screen (which runs the clock) is open.
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByLabel('Course name').fill('Biology');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Biology' }).waitFor();
  await nav('Flashcards');
  await page.getByLabel('New deck').fill('Cells');
  await page.getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('heading', { name: 'Cells' }).waitFor();
  await page.getByLabel('Front', { exact: true }).fill('Cell');
  await page.getByLabel('Back', { exact: true }).fill('Unit of life');
  await page.getByRole('button', { name: 'Add card' }).click();
  await page.getByText('Unit of life').first().waitFor();
  await page.goto(`${URL_BASE}#/cards/review`);
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByRole('group', { name: 'How well did you remember it?' }).getByRole('button', { name: /^Good/ }).click();

  // Move the clock forward with the review screen open; the clock credits active seconds as it fires.
  await page.clock.runFor(100_000);
  let seconds = 0;
  for (let attempt = 0; attempt < 30 && seconds < 60; attempt++) {
    seconds = await readSeconds();
    if (seconds < 60) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(seconds >= 60, `expected at least a minute of study time, got ${seconds}s`);
});

test('Progress and Today show study time', async () => {
  await nav('Progress');
  await page.getByTestId('study-time').waitFor();
  assert.notEqual(await tile('time-today'), '0m', 'today shows real study time');
  assert.match(await tile('time-week'), /m|h/);
  // Today's bar is filled.
  assert.ok((await page.getByTestId('study-time').locator('[data-on="true"]').count()) >= 1);
  await page.goto(URL_BASE);
  await page.getByTestId('tile-time-today').waitFor();
  assert.notEqual(await page.getByTestId('tile-time-today').locator('b').innerText(), '0m');
});

test('earlier days and course time add in', async () => {
  const bio = await courseId();
  assert.ok(bio, 'found the Biology course');
  await seedTime('2026-11-03', 1800, bio); // 30 minutes earlier this week, tied to Biology
  await page.goto(`${URL_BASE}#/progress`);
  await page.reload();
  await page.getByTestId('study-time').waitFor();
  // Two days now have time, so at least two bars are filled.
  assert.ok((await page.getByTestId('study-time').locator('[data-on="true"]').count()) >= 2);
  const row = page.getByTestId('course-progress').getByRole('row', { name: /Biology/ });
  assert.match(await row.innerText(), /30m/, 'the course shows its study time');
});

test('it fits a phone', async () => {
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto(`${URL_BASE}#/progress`);
  await page.getByTestId('study-time').waitFor();
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main');
    return Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth);
  });
  assert.ok(overflow <= 0, `sideways overflow of ${overflow}px`);
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
