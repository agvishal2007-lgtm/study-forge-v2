// Streak rules, then the Progress page in a real browser.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const rules = () => import('../src/data/progressRules.ts');

test('streaks count days in a row, and today not being done yet does not end one', async () => {
  const { streaksFrom } = await rules();
  const days = (...list) => new Set(list);
  assert.deepEqual(streaksFrom(days(), '2026-11-04'), { current: 0, longest: 0, studiedToday: false });
  assert.deepEqual(streaksFrom(days('2026-11-04'), '2026-11-04'), { current: 1, longest: 1, studiedToday: true });
  assert.deepEqual(streaksFrom(days('2026-11-02', '2026-11-03'), '2026-11-04'), { current: 2, longest: 2, studiedToday: false });
  assert.deepEqual(streaksFrom(days('2026-11-01', '2026-11-02'), '2026-11-04'), { current: 0, longest: 2, studiedToday: false }, 'a missed day ends it');
  assert.equal(streaksFrom(days('2026-10-31', '2026-11-01', '2026-11-03', '2026-11-04'), '2026-11-04').longest, 2);
  assert.equal(streaksFrom(days('2026-12-31', '2027-01-01'), '2027-01-01').current, 2, 'across a new year');
  assert.equal(streaksFrom(days('2026-03-07', '2026-03-08', '2026-03-09'), '2026-03-09').current, 3, 'across the clock change');
  assert.equal(streaksFrom(days('2026-11-05'), '2026-11-04').current, 0, 'a date ahead of today is ignored');
});

test('activity weeks end with this week and days from every device add up', async () => {
  const { activityWeeks, totalsByDay, lastDays } = await rules();
  const weeks = activityWeeks('2026-11-04', 12);
  assert.equal(weeks.length, 12);
  assert.deepEqual(weeks.at(-1), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', null, null, null]);
  assert.equal(weeks[0][0], '2026-08-16');
  const totals = totalsByDay([{ date: '2026-11-04', cards: 2, lessons: 1 }, { date: '2026-11-04', cards: 3, lessons: 0 }]);
  assert.deepEqual(totals.get('2026-11-04'), { cards: 5, lessons: 1 });
  assert.deepEqual(lastDays('2026-11-01', 2), ['2026-11-01', '2026-10-31']);
});

const PORT = 4190;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let work;
const pageErrors = [];
const nav = (name) => page.getByRole('navigation', { name: name === 'Settings' ? 'Account' : 'Main' }).getByRole('link', { name, exact: true }).click();
const tile = (id) => page.getByTestId(`progress-${id}`).locator('b').innerText();

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-progress-'));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  context = await chromium.launchPersistentContext(path.join(work, 'main'), { viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York', serviceWorkers: 'block' });
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-04T14:30:00-05:00'));
  await page.goto(URL_BASE);
});

after(async () => {
  await context?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('with nothing saved, Progress claims nothing', async () => {
  await nav('Progress');
  await page.getByRole('heading', { name: 'Progress', exact: true }).waitFor();
  assert.match(await page.getByTestId('streak-summary').innerText(), /to start your streak/);
  assert.equal(await tile('current'), '0');
  assert.equal(await page.locator('[data-on="true"]').count(), 0);
});

test('reviewing cards counts today, and the numbers follow the work', async () => {
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
  await nav('Progress');
  await page.getByTestId('progress-current').waitFor();
  assert.equal(await tile('current'), '1');
  assert.equal(await tile('cards'), '1');
  assert.match(await page.getByTestId('streak-summary').innerText(), /You've studied today/);
  assert.equal(await page.locator('[data-today="true"]').getAttribute('data-on'), 'true');
});

test('yesterday and the day before make a streak, and a new day keeps it open', async () => {
  await page.clock.setFixedTime(new Date('2026-11-05T14:30:00-05:00'));
  await page.goto(`${URL_BASE}#/progress`);
  await page.reload();
  await page.getByTestId('progress-current').waitFor();
  assert.match(await page.getByTestId('streak-summary').innerText(), /Study today to keep it going/);
  assert.equal(await tile('current'), '1');
  await page.clock.setFixedTime(new Date('2026-11-07T14:30:00-05:00'));
  await page.reload();
  await page.getByTestId('progress-current').waitFor();
  assert.equal(await tile('current'), '0');
  assert.equal(await tile('longest'), '1');
  assert.match(await page.getByTestId('streak-summary').innerText(), /start a new streak/);
});

test('the course table shows what is known, and dashes for what is not', async () => {
  const row = page.getByTestId('course-progress').getByRole('row', { name: /Biology/ });
  await row.waitFor();
  assert.ok((await row.innerText()).includes('—'));
});

test('Today shows the streak tile', async () => {
  await page.goto(URL_BASE);
  await page.getByTestId('tile-streak').waitFor();
});

test('it fits a phone', async () => {
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto(`${URL_BASE}#/progress`);
  await page.getByTestId('activity').waitFor();
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main');
    return Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth);
  });
  assert.ok(overflow <= 0, `sideways overflow of ${overflow}px`);
  await page.screenshot({ path: path.join(__dirname, '..', 'test-output', 'phone-progress.png') });
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
