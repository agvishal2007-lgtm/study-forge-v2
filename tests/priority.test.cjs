// The one ranking engine: seven ways to order work, nothing invented, nothing urgent hidden.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const rules = () => import('../src/data/priorityRules.ts');
const TODAY = '2026-11-11';

const work = (title, extra = {}) => ({
  id: title.toLowerCase().replace(/\s+/g, '-'),
  title,
  courseId: null,
  type: 'Assignment',
  dueDate: '',
  dueTime: '',
  status: 'Not Started',
  priority: 'Normal',
  estimateHours: null,
  points: null,
  details: '',
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

const order = (ranked) => ranked.map((entry) => entry.item.title);

test('finished work is not waiting to be done', async () => {
  const { rankWork } = await rules();
  const { ranked } = rankWork([
    work('Done essay', { status: 'Completed', dueDate: '2026-11-12' }),
    work('Open essay', { dueDate: '2026-11-12' }),
  ], { mode: 'due', today: TODAY });
  assert.deepEqual(order(ranked), ['Open essay']);
});

test('earliest due date puts overdue first, then soonest', async () => {
  const { rankWork } = await rules();
  const { ranked } = rankWork([
    work('Next week', { dueDate: '2026-11-18' }),
    work('Late', { dueDate: '2026-11-05' }),
    work('Tomorrow', { dueDate: '2026-11-12' }),
    work('No date'),
  ], { mode: 'due', today: TODAY });
  assert.deepEqual(order(ranked), ['Late', 'Tomorrow', 'Next week', 'No date']);
});

test('highest raw points ranks by points, and never guesses a blank', async () => {
  const { rankWork } = await rules();
  const { ranked } = rankWork([
    work('Small quiz', { points: 10 }),
    work('Big exam', { points: 200 }),
    work('Unknown worth'),
  ], { mode: 'points', today: TODAY });
  assert.deepEqual(order(ranked).slice(0, 2), ['Big exam', 'Small quiz']);
  const blank = ranked.find((entry) => entry.item.title === 'Unknown worth');
  assert.ok(blank.missing.includes('points'), 'a blank is reported as missing');
  assert.match(blank.factors.find((f) => f.name === 'Points').detail, /Not entered/);
});

test('grade impact is never faked from raw points', async () => {
  const { rankWork } = await rules();
  const { ranked } = rankWork([work('Worth a lot', { points: 500, dueDate: '2026-12-01' })], { mode: 'impact', today: TODAY });
  assert.ok(ranked[0].missing.includes('grade impact'), 'it says the data is missing');
  const impact = ranked[0].factors.find((factor) => factor.name === 'Grade impact');
  assert.match(impact.detail, /Needs grading categories/, 'it explains why rather than inventing a number');
  assert.equal(impact.value, 0, 'and contributes nothing');
});

test('grade impact is real once the syllabus weights exist', async () => {
  const { rankWork } = await rules();
  const categories = [
    { id: 'exams', courseId: 'c', name: 'Exams', weight: 60, position: 0, createdAt: 0, updatedAt: 0 },
    { id: 'hw', courseId: 'c', name: 'Homework', weight: 10, position: 1, createdAt: 0, updatedAt: 0 },
  ];
  const items = [
    work('Midterm', { points: 100, categoryId: 'exams', dueDate: '2026-12-01' }),
    // Worth far more points, but in a category that barely counts.
    work('Homework pile', { points: 400, categoryId: 'hw', dueDate: '2026-12-01' }),
  ];
  const { ranked } = rankWork(items, { mode: 'impact', today: TODAY, categories });
  assert.deepEqual(order(ranked), ['Midterm', 'Homework pile'], 'weight beats raw points');
  const midterm = ranked[0].factors.find((factor) => factor.name === 'Grade impact');
  assert.match(midterm.detail, /60% of the final grade/);
  assert.equal(ranked[0].missing.includes('grade impact'), false);

  // By raw points alone the order flips, which is exactly why the two are kept apart.
  const byPoints = rankWork(items, { mode: 'points', today: TODAY, categories });
  assert.deepEqual(order(byPoints.ranked), ['Homework pile', 'Midterm']);
});

test('quickest to finish prefers short work', async () => {
  const { rankWork } = await rules();
  const { ranked } = rankWork([
    work('Long project', { estimateHours: 10 }),
    work('Short reading', { estimateHours: 1 }),
  ], { mode: 'quickest', today: TODAY });
  assert.deepEqual(order(ranked), ['Short reading', 'Long project']);
});

test('most important to me follows the priority the student set', async () => {
  const { rankWork } = await rules();
  const { ranked } = rankWork([
    work('Low thing', { priority: 'Low' }),
    work('High thing', { priority: 'High' }),
    work('Normal thing', { priority: 'Normal' }),
  ], { mode: 'personal', today: TODAY });
  assert.deepEqual(order(ranked), ['High thing', 'Normal thing', 'Low thing']);
});

test('custom weighting changes the order, and the weights are what change it', async () => {
  const { rankWork } = await rules();
  const items = [
    work('Heavy and far', { points: 100, dueDate: '2026-12-20', estimateHours: 10 }),
    work('Light and near', { points: 5, dueDate: '2026-11-12', estimateHours: 1 }),
  ];
  const byPoints = rankWork(items, { mode: 'custom', today: TODAY, weights: { urgency: 0, points: 10, impact: 0, effort: 0, importance: 0 } });
  assert.deepEqual(order(byPoints.ranked), ['Heavy and far', 'Light and near']);
  const byUrgency = rankWork(items, { mode: 'custom', today: TODAY, weights: { urgency: 10, points: 0, impact: 0, effort: 0, importance: 0 } });
  assert.deepEqual(order(byUrgency.ranked), ['Light and near', 'Heavy and far']);
});

test('balanced uses every factor rather than any single one', async () => {
  const { rankWork } = await rules();
  const { ranked } = rankWork([
    work('Huge but ages away', { points: 1000, dueDate: '2027-05-01', estimateHours: 40, priority: 'Low' }),
    work('Due tomorrow, worth a bit', { points: 50, dueDate: '2026-11-12', estimateHours: 2, priority: 'High' }),
  ], { mode: 'balanced', today: TODAY });
  assert.equal(order(ranked)[0], 'Due tomorrow, worth a bit');
  assert.ok(ranked[0].factors.length >= 4, 'the reasons are shown');
});

test('a student can pin work to the top in any mode', async () => {
  const { rankWork } = await rules();
  const items = [work('Late', { dueDate: '2026-11-01' }), work('Chosen', { dueDate: '2027-01-01' })];
  const { ranked } = rankWork(items, { mode: 'due', today: TODAY, pinned: ['chosen'] });
  assert.deepEqual(order(ranked), ['Chosen', 'Late']);
});

test('overdue and due-soon work stays in view whatever the mode', async () => {
  const { rankWork } = await rules();
  const items = [
    work('Late', { dueDate: '2026-11-01' }),
    work('Due soon', { dueDate: '2026-11-12' }),
    work('Far off, worth everything', { points: 9999, dueDate: '2027-01-01' }),
  ];
  for (const mode of ['due', 'points', 'impact', 'quickest', 'personal', 'balanced', 'custom']) {
    const { urgent } = rankWork(items, { mode, today: TODAY });
    assert.deepEqual(urgent.map((item) => item.title), ['Late', 'Due soon'], `${mode} keeps urgent work visible`);
  }
});

test('every mode returns every piece of waiting work', async () => {
  const { rankWork, PRIORITY_MODES } = await rules();
  const items = [work('A', { dueDate: '2026-11-12' }), work('B', { points: 3 }), work('C', { estimateHours: 2 })];
  for (const mode of PRIORITY_MODES) {
    const { ranked } = rankWork(items, { mode, today: TODAY });
    assert.equal(ranked.length, 3, `${mode} drops nothing`);
  }
});

/* ---- The same engine, driven through the Planner in a real browser. ---- */

const { before, after } = require('node:test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4207;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let workDir;
const pageErrors = [];

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-priority-'));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  context = await chromium.launchPersistentContext(path.join(workDir, 'main'), { viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York', serviceWorkers: 'block' });
  await returningStudent(context);
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await context?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(workDir, { recursive: true, force: true });
});

const addWork = async ({ name, date, points, hours, priority }) => {
  await page.goto(`${URL_BASE}#/planner`);
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  if (date) await page.getByLabel('Due date', { exact: true }).fill(date);
  if (points) await page.getByLabel('Points it is worth (optional)').fill(points);
  if (hours) await page.getByLabel('Estimated hours (optional)').fill(hours);
  if (priority) await page.getByLabel('Priority').selectOption(priority);
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();
};

const dateIn = (days) => {
  const when = new Date();
  when.setDate(when.getDate() + days);
  return when.toISOString().slice(0, 10);
};

const firstRanked = async () => (await page.locator('.ranked-list > li').first().innerText()).split('\n')[0];

test('work can be added with points and an estimate', async () => {
  await addWork({ name: 'Late reading', date: dateIn(-4), points: '5', hours: '1' });
  await addWork({ name: 'Final exam', date: dateIn(30), points: '300', hours: '12', priority: 'High' });
  await addWork({ name: 'Quick worksheet', date: dateIn(20), points: '20', hours: '1' });
  await page.goto(`${URL_BASE}#/planner`);
  await page.getByRole('link', { name: 'Final exam' }).first().waitFor();
});

test('highest raw points puts the exam first', async () => {
  await page.getByTestId('priority-mode').selectOption('points');
  await page.getByTestId('ranked').waitFor();
  assert.match(await firstRanked(), /Final exam/);
});

test('quickest to finish puts a short task first', async () => {
  await page.getByTestId('priority-mode').selectOption('quickest');
  await page.getByTestId('ranked').waitFor();
  assert.doesNotMatch(await firstRanked(), /Final exam/);
});

test('the reasons behind a ranking are shown', async () => {
  const why = await page.locator('.ranked-why').first().innerText();
  assert.match(why, /Urgency:/);
  assert.match(why, /Points:/);
  assert.match(why, /Time needed:/);
  assert.match(why, /Importance to you:/);
});

test('overdue work stays in view in every mode', async () => {
  for (const mode of ['points', 'quickest', 'personal', 'balanced', 'impact', 'custom']) {
    await page.getByTestId('priority-mode').selectOption(mode);
    await page.getByTestId('needs-now').waitFor();
    assert.match(await page.getByTestId('needs-now').innerText(), /Late reading/, `${mode} keeps it visible`);
  }
});

test('grade impact says what is missing instead of faking it', async () => {
  await page.getByTestId('priority-mode').selectOption('impact');
  await page.getByTestId('impact-notice').waitFor();
  const notice = await page.getByTestId('impact-notice').innerText();
  assert.match(notice, /grading categories/);
  assert.match(notice, /not the same thing/);
});

test('a student can set their own weighting', async () => {
  await page.getByTestId('priority-mode').selectOption('custom');
  await page.getByTestId('weights').waitFor();
  await page.getByLabel('Points it is worth').fill('10');
  await page.getByLabel('How soon it is due').fill('0');
  await page.waitForFunction(() => {
    const first = document.querySelector('.ranked-list > li');
    return first && first.innerText.includes('Final exam');
  });
  assert.match(await firstRanked(), /Final exam/, 'weighting points heavily lifts the exam');
});

test('pinning overrides the order, and the choice is remembered', async () => {
  await page.getByRole('button', { name: 'Pin Quick worksheet to the top' }).click();
  await page.waitForFunction(() => {
    const first = document.querySelector('.ranked-list > li');
    return first && first.innerText.includes('Quick worksheet');
  });
  await page.reload();
  await page.getByTestId('ranked').waitFor();
  assert.equal(await page.getByTestId('priority-mode').inputValue(), 'custom', 'the mode is remembered');
  assert.match(await firstRanked(), /Quick worksheet/, 'the pin is remembered');
});

test("Today's Plan follows the same saved order, not a second one", async () => {
  await addWork({ name: 'Small check-in', date: dateIn(3), points: '5', hours: '1' });
  await addWork({ name: 'Big midterm', date: dateIn(5), points: '250', hours: '6' });

  await page.goto(`${URL_BASE}#/planner`);
  await page.getByTestId('priority-mode').selectOption('points');
  await page.goto(URL_BASE);
  await page.getByTestId('today-order').waitFor();
  assert.match(await page.getByTestId('today-order').innerText(), /Highest raw points/);
  const byPoints = await page.getByTestId('due-soon').innerText();
  assert.ok(byPoints.indexOf('Big midterm') < byPoints.indexOf('Small check-in'), 'the heavier one comes first');

  // Change the order in the Planner; Today follows it.
  await page.goto(`${URL_BASE}#/planner`);
  await page.getByTestId('priority-mode').selectOption('quickest');
  await page.goto(URL_BASE);
  await page.getByTestId('today-order').waitFor();
  assert.match(await page.getByTestId('today-order').innerText(), /Quickest to finish/);
  const byQuickest = await page.getByTestId('due-soon').innerText();
  assert.ok(byQuickest.indexOf('Small check-in') < byQuickest.indexOf('Big midterm'), 'the quicker one comes first');
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
