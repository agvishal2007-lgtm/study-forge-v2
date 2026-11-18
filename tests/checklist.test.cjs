// The checklist: ticking a box is the save, the three ways a finished task can look, and the Done
// view. One task record throughout — a task shown in two views is never two tasks.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = '4235';
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let browser;
let context;
let page;
const pageErrors = [];

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await returningStudent(context);
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
});

after(async () => {
  await context?.close();
  await browser?.close();
  try { if (server) process.kill(-server.pid); } catch { /* stopped */ }
});

const row = (title) => page.getByTestId('planner-row').filter({ hasText: title });
const choose = (name) => page.getByTestId('tasks-section').locator('label.segment').filter({ hasText: new RegExp(`^${name}$`) }).click();
const tick = (title) => row(title).getByRole('checkbox', { name: title });

async function addTask(title, course, date) {
  await page.goto(`${URL_BASE}#/planner/new`);
  await page.getByLabel('Name', { exact: true }).fill(title);
  if (course) await page.getByLabel('Course').selectOption({ label: course });
  if (date) await page.getByLabel('Due date', { exact: true }).fill(date);
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();
  await page.getByRole('link', { name: title, exact: true }).waitFor();
}

/** One course exists, so "course work" and "personal" can be told apart. */
async function addCourse(name) {
  await page.goto(`${URL_BASE}#/courses`);
  const setup = page.getByTestId('course-setup');
  if (await setup.count()) await page.getByTestId('setup-skip').click();
  await page.getByLabel('Course name').fill(name);
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name }).waitFor();
}

test('ticking a box is the save: it holds through a reload and there is no Save button anywhere', async () => {
  await addCourse('Accounting');
  await addTask('Practice Excel');
  await addTask('Watch Excel tutorials');
  await addTask('Chapter 4 homework', 'Accounting');
  await addTask('Read chapter 5', undefined, '2030-02-01');
  await page.goto(`${URL_BASE}#/planner`);
  await tick('Practice Excel').check();
  // Nothing to confirm, submit or apply. The tick itself wrote it.
  const buttons = await page.locator('main button').allInnerTexts();
  for (const label of buttons) {
    assert.doesNotMatch(label, /^(Save progress|Save|Submit|Apply|Confirm)$/i, `no "${label}" button on the checklist`);
  }
  // It survives a full reload, and a second one, without being re-ticked.
  await page.reload();
  await page.getByTestId('planner-row').first().waitFor();
  assert.equal(await tick('Practice Excel').isChecked(), true, 'still ticked after reloading');
  assert.equal(await tick('Watch Excel tutorials').isChecked(), false, 'the other one is untouched');
  await page.goto(`${URL_BASE}#/`);
  await page.goto(`${URL_BASE}#/planner`);
  assert.equal(await tick('Practice Excel').isChecked(), true, 'still ticked after moving around');
});

test('a finished task stays readable and is never crossed out unless that is asked for', async () => {
  await page.goto(`${URL_BASE}#/planner`);
  const title = row('Practice Excel').locator('.planner-main a');
  // The default: it stays in the list, ticked, with no line through it.
  assert.equal(await title.evaluate((el) => getComputedStyle(el).textDecorationLine), 'none');
  await page.goto(`${URL_BASE}#/settings`);
  assert.equal(await page.getByTestId('tasks-section').locator('label.segment').count(), 3, 'exactly three ways, no fourth');
  await choose('Crossed out');
  await page.goto(`${URL_BASE}#/planner`);
  assert.match(await title.evaluate((el) => getComputedStyle(el).textDecorationLine), /line-through/);
  assert.equal(await tick('Practice Excel').isChecked(), true, 'a display choice never unticks anything');

  // Stepping aside takes it out of this view only; it is still ticked and still in Done.
  await page.goto(`${URL_BASE}#/settings`);
  await choose('Steps aside');
  await page.goto(`${URL_BASE}#/planner`);
  assert.equal(await row('Practice Excel').count(), 0, 'out of the active list');
  await page.getByTestId('hidden-note').waitFor();
  await page.getByRole('button', { name: "See what's done" }).click();
  assert.equal(await tick('Practice Excel').isChecked(), true, 'still ticked in Done');
  assert.equal(
    await row('Practice Excel').locator('.planner-main a').evaluate((el) => getComputedStyle(el).textDecorationLine),
    'none',
    'set-aside tasks are not crossed out in Done',
  );

  await page.goto(`${URL_BASE}#/settings`);
  await choose('Stays put');
});

test('un-ticking from Done puts the task back in the list, and it is the same one task', async () => {
  await page.goto(`${URL_BASE}#/planner?show=done`);
  await page.getByTestId('show-filter').selectOption('done');
  await tick('Practice Excel').uncheck();
  // It leaves Done at once, with no screen to visit to confirm it.
  await row('Practice Excel').waitFor({ state: 'detached' });
  await page.getByTestId('show-filter').selectOption('todo');
  assert.equal(await tick('Practice Excel').isChecked(), false, 'back among the work to do');
  // One record: the detail page agrees, and there is only ever one row for it.
  await page.getByTestId('show-filter').selectOption('all');
  assert.equal(await row('Practice Excel').count(), 1, 'one task, not a copy per view');
  await page.getByRole('link', { name: 'Practice Excel', exact: true }).click();
  await page.getByTestId('assignment-steps').waitFor();
  const status = page.locator('label').filter({ hasText: /^Status/ }).locator('select');
  assert.equal(await status.inputValue(), 'Not Started');
});

test('the checklist shows no score: no fractions, no percentages, no progress bar', async () => {
  // A task with steps is where a count would show up if one did.
  await page.goto(`${URL_BASE}#/planner`);
  await page.getByRole('link', { name: 'Read chapter 5', exact: true }).click();
  await page.getByTestId('assignment-steps').waitFor();
  await page.getByRole('button', { name: 'Add suggested steps' }).click();
  await page.getByTestId('step-progress').waitFor();
  const stepWords = await page.getByTestId('step-progress').innerText();
  assert.doesNotMatch(stepWords, /\d+\s*(of|\/)\s*\d+/, 'no "2 of 6"');
  assert.doesNotMatch(stepWords, /%/, 'no percentage');
  await page.goto(`${URL_BASE}#/planner`);
  const listWords = await page.locator('main').innerText();
  assert.doesNotMatch(listWords, /\d+\s*\/\s*\d+/, 'nothing like 8/18 on the checklist');
  assert.doesNotMatch(listWords, /\d+%\s*(completed|done)/i, 'no "44% completed"');
  assert.doesNotMatch(listWords, /\bDone \(\d+\)/, 'the Done heading is not a score');
  assert.equal(await page.locator('main progress, main .progress-bar').count(), 0, 'no progress bar');
  // The step ticks still work and still save themselves.
  await page.getByRole('link', { name: 'Read chapter 5', exact: true }).click();
  await page.getByTestId('assignment-steps').waitFor();
  const step = page.locator('.step-row').first().getByRole('checkbox');
  await step.check();
  // Wait for the tick to be written, not for a guessed moment.
  await page.locator('[data-testid=assignment-steps][data-saving=false]').waitFor();
  await page.reload();
  assert.equal(await page.locator('.step-row').first().getByRole('checkbox').isChecked(), true, 'a ticked step holds');
});

test('course work and personal tasks live together and can be told apart', async () => {
  await page.goto(`${URL_BASE}#/planner`);
  await page.getByTestId('kind-filter').selectOption('personal');
  // Both were added without a course, so both are personal.
  assert.ok(await row('Practice Excel').count(), 'personal tasks need no course');
  assert.equal(await row('Chapter 4 homework').count(), 0, 'course work is not personal');
  await page.getByTestId('kind-filter').selectOption('course');
  assert.ok(await row('Chapter 4 homework').count(), 'course work is listed on its own');
  assert.equal(await row('Practice Excel').count(), 0);
  await page.getByTestId('kind-filter').selectOption('all');
  assert.ok(await row('Practice Excel').count());
  assert.ok(await row('Chapter 4 homework').count());
});

test('rapid ticking settles on what was asked for, and keyboard works', async () => {
  await page.goto(`${URL_BASE}#/planner`);
  const box = tick('Practice Excel');
  for (let i = 0; i < 6; i++) await box.click();
  await page.waitForTimeout(400);
  assert.equal(await box.isChecked(), false, 'six taps end where they started');
  // The box is a real control, so Space works and the state is announced, not just coloured.
  await box.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  assert.equal(await box.isChecked(), true);
  await page.reload();
  assert.equal(await tick('Practice Excel').isChecked(), true, 'the keyboard tick saved too');
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
