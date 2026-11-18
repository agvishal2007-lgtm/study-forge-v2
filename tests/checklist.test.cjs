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

test("the student's own sections group the one list, and a finished task stays in its section", async () => {
  // A list like a real morning: two sections the student made up, plus one loose task.
  await page.goto(`${URL_BASE}#/planner/new`);
  await page.getByLabel('Name', { exact: true }).fill('Brush my teeth');
  await page.getByLabel('Section (optional)').fill('Morning routine');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('link', { name: 'Brush my teeth', exact: true }).waitFor();
  await page.goto(`${URL_BASE}#/planner/new`);
  await page.getByLabel('Name', { exact: true }).fill('Eat lunch');
  await page.getByLabel('Section (optional)').fill('Wellness');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('link', { name: 'Eat lunch', exact: true }).waitFor();

  await page.getByLabel('Group by').selectOption('section');
  const headings = await page.locator('.planner-group h2').allInnerTexts();
  assert.ok(headings.some((text) => text.startsWith('Morning routine')), `sections missing from ${headings.join(' | ')}`);
  assert.ok(headings.some((text) => text.startsWith('Wellness')), `sections missing from ${headings.join(' | ')}`);
  // Ticking one off leaves it exactly where it was, readable and in its own section.
  await tick('Brush my teeth').check();
  await page.waitForTimeout(300);
  const morning = page.locator('[data-section="Morning routine"]');
  await morning.getByRole('link', { name: 'Brush my teeth', exact: true }).waitFor();
  assert.equal(await morning.locator('.struck').count(), 0, 'a ticked task is not crossed out');
  assert.equal(await tick('Brush my teeth').isChecked(), true);
  // The choice is remembered, and the section with it.
  await page.reload();
  await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Group by').inputValue(), 'section', 'how it is grouped is remembered');
  await page.locator('[data-section="Morning routine"]').getByRole('link', { name: 'Brush my teeth', exact: true }).waitFor();
  // Back to dates, and the same one task is still there and still ticked. Nothing was copied.
  await page.getByLabel('Group by').selectOption('due');
  assert.equal(await page.getByRole('link', { name: 'Brush my teeth', exact: true }).count(), 1, 'one record, not two');
  assert.equal(await tick('Brush my teeth').isChecked(), true);
  await tick('Brush my teeth').uncheck();
  await page.waitForTimeout(300);
});

test('a goal you can measure shows in plain words, and beating it is never a shortfall', async () => {
  await page.goto(`${URL_BASE}#/planner/new`);
  await page.getByLabel('Name', { exact: true }).fill('Use the walking pad');
  await page.getByLabel('Goal', { exact: true }).fill('15');
  await page.getByLabel('In what').fill('minutes');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('link', { name: 'Use the walking pad', exact: true }).waitFor();
  const goal = row('Use the walking pad').getByTestId('row-goal');
  assert.equal((await goal.innerText()).trim(), '15 minutes goal');

  // Recording more than the goal still just reads as done.
  await page.getByRole('link', { name: 'Use the walking pad', exact: true }).click();
  await page.getByLabel('What you did so far').fill('30');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('link', { name: 'Use the walking pad', exact: true }).waitFor();
  const words = (await row('Use the walking pad').getByTestId('row-goal').innerText()).trim();
  assert.equal(words, '15 minutes goal, 30 done');
  assert.doesNotMatch(words, /%|short|behind/i, 'nothing discouraging and no percentage');

  // A goal is optional: a plain task says nothing about goals at all.
  await addTask('Plain task with no goal');
  assert.equal(await row('Plain task with no goal').getByTestId('row-goal').count(), 0);
  // And what was recorded survives a reload.
  await page.reload();
  await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();
  assert.equal((await row('Use the walking pad').getByTestId('row-goal').innerText()).trim(), '15 minutes goal, 30 done');
});

test('the floating list opens from the top, follows you about, and stays until closed', async () => {
  // An earlier test in this file switched finished tasks to "Steps aside", and a pref persists.
  // The panel is right to hide a ticked task under that setting, so this test states the setting it
  // actually means to check: the default, where a finished task stays put.
  await page.goto(`${URL_BASE}#/settings`);
  await choose('Stays put');
  await addTask('Read chapter 9');
  const panel = page.getByTestId('todo-panel');
  assert.equal(await panel.count(), 0, 'it waits to be asked for');
  await page.getByTestId('todo-toggle').click();
  await panel.waitFor();
  await panel.getByText('Read chapter 9').waitFor();

  // It stays put while working somewhere else entirely, which is the whole point of it.
  await page.goto(`${URL_BASE}#/notes`);
  await page.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
  await page.getByTestId('todo-panel').getByText('Read chapter 9').waitFor();
  // Even after a reload, because it was left open.
  await page.reload();
  await page.getByTestId('todo-panel').waitFor();

  // Ticking it off in the panel is the same one task, not a copy.
  await page.getByTestId('todo-panel').getByRole('checkbox', { name: 'Read chapter 9' }).check();
  await page.waitForTimeout(300);
  await page.goto(`${URL_BASE}#/planner`);
  await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();
  assert.equal(await tick('Read chapter 9').isChecked(), true, 'the Planner shows the same task ticked');
  assert.equal(await page.getByRole('link', { name: 'Read chapter 9', exact: true }).count(), 1, 'one task, not two');

  // Closing it means closed, and it stays closed.
  await page.getByTestId('todo-close').click();
  assert.equal(await page.getByTestId('todo-panel').count(), 0);
  await page.reload();
  await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();
  assert.equal(await page.getByTestId('todo-panel').count(), 0, 'it stays closed');
  await tick('Read chapter 9').uncheck();
  await page.waitForTimeout(300);
});

test('a task added in a list belongs to that list', async () => {
  await page.goto(`${URL_BASE}#/planner`);
  // Opened only if the previous test left it closed, so a failure there can't cascade into here.
  if ((await page.getByTestId('todo-panel').count()) === 0) await page.getByTestId('todo-toggle').click();
  const panel = page.getByTestId('todo-panel');
  await panel.waitFor();
  // Personal is always there as somewhere to start.
  await panel.getByTestId('todo-list-name').waitFor();
  await panel.getByPlaceholder(/^Add to /).fill('Buy a notebook');
  await panel.getByRole('button', { name: 'Add', exact: true }).click();
  await panel.getByText('Buy a notebook').waitFor();
  // It is a real task in the Planner, not something only the panel knows about.
  await page.reload();
  await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Buy a notebook', exact: true }).waitFor();
  await page.getByTestId('todo-close').click();
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
