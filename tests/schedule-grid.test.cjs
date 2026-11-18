// The daily schedule grid and special days, driven the way a student would: nothing preset, blocks
// and names and times they state themselves, and a day that doesn't run like the others.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4232;
const URL_BASE = `http://localhost:${PORT}/`;
const TODAY = '2026-11-04'; // A Wednesday, so a rotation always has a day.
let server;
let browser;
let page;
const pageErrors = [];

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.clock.setFixedTime(new Date(`${TODAY}T14:30:00-05:00`));
  await returningStudent(page);
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await browser?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
});

const addCourse = async (name) => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByLabel('Course name').fill(name);
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name, level: 1 }).waitFor();
};

test('the schedule starts with a question, not a template', async () => {
  await addCourse('Biology');
  await addCourse('Chemistry');
  await addCourse('English');
  // A rotation of four days, so a class can sit in a different block on each.
  await page.goto(`${URL_BASE}#/settings/school`);
  await page.getByTestId('block-on').check();
  await page.getByTestId('block-length').selectOption('4');
  await page.getByTestId('block-today').selectOption('0');

  await page.goto(`${URL_BASE}#/courses/schedule`);
  // Nothing is assumed: there is no grid until the student says how long their day is.
  await page.getByTestId('timetable-setup').waitFor();
  assert.equal(await page.getByTestId('timetable').count(), 0, 'a grid appeared before being asked for');
  await page.getByTestId('setup-blocks').fill('3');
  await page.getByRole('button', { name: 'Start my schedule' }).click();
  const grid = page.getByTestId('timetable');
  await grid.waitFor();
  // Three blocks, four days, and every slot empty.
  assert.equal(await grid.locator('tbody tr').count(), 3);
  assert.equal(await grid.locator('thead th').count(), 5, 'a Block column plus one per day');
  assert.equal(await grid.locator('tbody select').evaluateAll((all) => all.every((one) => one.value === '')), true);
});

test('blocks take any name and any length, and the length is worked out not assumed', async () => {
  await page.goto(`${URL_BASE}#/courses/schedule`);
  await page.getByTestId('period-name-0').fill('Homeroom');
  await page.getByTestId('period-name-1').fill('Block 2');
  await page.getByTestId('period-name-2').fill('Lunch');
  // Thirty minutes, then two hours: no length is standard, so both are fine.
  await page.getByTestId('start-0').fill('08:10');
  await page.getByTestId('end-0').fill('08:40');
  await page.getByTestId('length-0').filter({ hasText: '30 min' }).waitFor();
  await page.getByTestId('start-1').fill('09:00');
  await page.getByTestId('end-1').fill('11:00');
  await page.getByTestId('length-1').filter({ hasText: '2 hr' }).waitFor();
  // A block with no times at all is allowed and shows no length.
  assert.equal(await page.getByTestId('length-2').count(), 0);
  // The names survive a reload, because typing is the save.
  await page.reload();
  await page.getByTestId('timetable').waitFor();
  assert.equal(await page.getByTestId('period-name-0').inputValue(), 'Homeroom');
  assert.equal(await page.getByTestId('start-0').inputValue(), '08:10');
});

test('a class can move one block along each day and drop on the day it rotates off', async () => {
  await page.goto(`${URL_BASE}#/courses/schedule`);
  const cell = (day, period) => page.getByTestId('timetable').locator('tbody tr').nth(period).locator('td').nth(day);
  await cell(0, 0).locator('select').selectOption({ label: 'Biology' });
  await cell(0, 1).locator('select').selectOption({ label: 'Chemistry' });
  await cell(0, 2).locator('select').selectOption({ label: 'English' });
  // Offered, not applied for them: one tap makes the next day the same order shifted along.
  await page.getByTestId('shift-1').click();
  await page.getByTestId('timetable-notice').waitFor();
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('[data-testid=timetable] tbody tr');
    return rows[0]?.querySelectorAll('td select')[1]?.selectedOptions[0]?.textContent === 'English';
  });
  const dayTwo = await page.getByTestId('timetable').locator('tbody tr').evaluateAll((rows) =>
    rows.map((row) => row.querySelectorAll('td select')[1].selectedOptions[0].textContent),
  );
  assert.deepEqual(dayTwo, ['English', 'Biology', 'Chemistry'], 'the day should be the previous one shifted along');
  // Day D is left alone, which is what a class rotating off looks like.
  const dayFour = await page.getByTestId('timetable').locator('tbody tr').evaluateAll((rows) =>
    rows.map((row) => row.querySelectorAll('td select')[3].value),
  );
  assert.deepEqual(dayFour, ['', '', ''], 'the fourth day should still be empty');
  // Which days each class meets is read off the grid rather than kept beside it.
  await page.getByTestId('course-days').filter({ hasText: 'Biology — A, B' }).waitFor();
});

test('today reads the real day: its blocks, in order, with the times given', async () => {
  await page.goto(`${URL_BASE}#/`);
  await page.getByTestId('block-day').filter({ hasText: 'A day' }).waitFor();
  const line = await page.getByTestId('schedule-today').innerText();
  assert.match(line, /Homeroom: Biology \(08:10\)/);
  assert.match(line, /Block 2: Chemistry/);
  assert.match(line, /Lunch: English/);
  // The order is the order of the day, not the order the classes were made.
  assert.ok(line.indexOf('Homeroom') < line.indexOf('Block 2'), 'blocks should read in order');
});

test('a special day is whatever the school calls it, and says what it does', async () => {
  await page.goto(`${URL_BASE}#/courses/schedule`);
  await page.getByTestId('special-date').fill(TODAY);
  await page.getByTestId('special-name').fill('Assembly');
  await page.getByTestId('special-effect').selectOption('some-classes');
  await page.getByRole('button', { name: 'Add this day' }).click();
  await page.getByTestId('special-list').waitFor();
  // Marked as running only some blocks, with none chosen yet, means none — not all.
  await page.getByTestId('special-list').filter({ hasText: 'no blocks marked as happening yet' }).waitFor();
  await page.getByRole('checkbox', { name: `Homeroom on ${TODAY}` }).check();
  await page.getByTestId('special-list').filter({ hasText: 'Assembly — only Homeroom.' }).waitFor();

  // Today now reads the assembly, and only the block that still happens.
  await page.goto(`${URL_BASE}#/`);
  await page.getByTestId('special-today').filter({ hasText: 'Assembly — only Homeroom.' }).waitFor();
  const line = await page.getByTestId('schedule-today').innerText();
  assert.match(line, /Homeroom: Biology/);
  assert.ok(!line.includes('Chemistry'), 'a block that is not happening should not be listed');
});

test('a day the school did not count does not move the rotation along', async () => {
  // The cycle is anchored so that today is an A day; tomorrow would be B.
  await page.goto(`${URL_BASE}#/courses/schedule`);
  const stop = page.getByRole('checkbox', { name: `The cycle still moves on ${TODAY}` });
  await stop.waitFor();
  assert.equal(await stop.isChecked(), true, 'it should start by carrying on, since schools differ');
  await stop.uncheck();
  // Today keeps the letter it had; what changes is every school day after it, which is the point.
  await page.goto(`${URL_BASE}#/settings/school`);
  await page.getByTestId('block-state').filter({ hasText: 'A day' }).waitFor();
  // Settings and Today must never disagree about what day it is.
  await page.goto(`${URL_BASE}#/`);
  await page.getByTestId('block-day').filter({ hasText: 'A day' }).waitFor();
  await page.goto(`${URL_BASE}#/courses/schedule`);
  await page.getByTestId('special-cycle-note').filter({ hasText: "don't agree" }).waitFor();
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
