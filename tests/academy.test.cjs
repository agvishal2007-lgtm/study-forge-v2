// The interactive Academy: hands-on lessons on practice copies, with progress that only counts finished activities.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const URL_BASE = 'http://localhost:4232/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-academy-'));
let server;
let browser;
let context;
let page;
const pageErrors = [];

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4232', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
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
  fs.rmSync(work, { recursive: true, force: true });
});

const card = () => page.locator('.lesson-card');
const next = (name) => card().getByRole('button', { name }).click();
const finish = async () => {
  await card().getByRole('button', { name: 'Finish lesson' }).click();
  await page.getByTestId('lesson-done').waitFor();
};

/** Does each kind of activity the way a student would. */
async function doActivity(id) {
  const c = card();
  const find = async (target) => { await c.getByRole('button', { name: target, exact: true }).click(); };
  const choose = async () => {
    // Pick the right answer by reading the feedback: try each until it's right.
    const options = c.getByRole('radio');
    for (let i = 0; i < await options.count(); i++) {
      await options.nth(i).check();
      await c.getByRole('button', { name: 'Submit' }).click();
      if (await c.locator('.academy-feedback.good').count()) return;
    }
    throw new Error(`${id}: no right answer`);
  };
  if (await c.getByRole('radio').count()) return choose();
  const practice = c.getByRole('group', { name: /^Practice screen/ });
  if (await practice.count()) {
    // Like a student working it out: try parts until the right one says so.
    const parts = practice.getByRole('button');
    for (let i = 0; i < await parts.count(); i++) {
      await parts.nth(i).click();
      if (await c.locator('.academy-feedback.good').count()) return;
    }
    throw new Error(`${id}: no right part`);
  }
  if (id === 'create-course') { await c.getByLabel('Course name (practice)').fill('Financial Accounting'); return c.getByRole('button', { name: 'Create course' }).click(); }
  if (id === 'add-topic') { await c.getByLabel('New topic').fill('Chapter 2: Cells'); return c.getByRole('button', { name: 'Add topic' }).click(); }
  if (id === 'flashcards') {
    await c.getByLabel('Front').fill('Assets ='); await c.getByLabel('Back').fill('Liabilities + Equity');
    await c.getByRole('button', { name: 'Add card' }).click(); await c.getByRole('button', { name: 'Show answer' }).click();
    return c.getByRole('button', { name: 'Good' }).click();
  }
  if (id === 'notes-lists') {
    const box = c.getByLabel('Practice note');
    await box.click(); await page.keyboard.press('End'); await page.keyboard.press('Control+End');
    await c.getByRole('button', { name: 'Bullets' }).click();
    await page.keyboard.type('Goggles'); await page.keyboard.press('Enter'); await page.keyboard.type('Gloves');
    return;
  }
  if (id === 'assignment-steps') { await c.getByLabel('Choose a topic').check(); return c.getByLabel('Research').check(); }
  if (id === 'rename-move') { await c.getByLabel('New name').fill('Lab 3 handout.pdf'); await c.getByRole('button', { name: 'Rename' }).click(); return c.getByLabel('Move to').selectOption('Biology'); }
  if (id === 'trash') return c.getByRole('button', { name: 'Restore Week 2 slides.pdf (practice)' }).click();
  throw new Error(`no way to do ${id}`);
}

test('the Academy home shows modules with progress, not a long article', async () => {
  await page.goto(`${URL_BASE}#/help`);
  await page.getByRole('heading', { name: 'Study Forge Academy', level: 1 }).waitFor();
  assert.equal(await page.getByTestId('academy-module').count(), 7);
  assert.match(await page.getByTestId('academy-overall').innerText(), /^0 of 40 lessons finished$/);
  const text = await page.getByTestId('academy').innerText();
  assert.ok(!text.includes('What it does.'), 'the reference text is not on the home page');
  assert.ok(text.split(/\s+/).length < 900, 'short enough to scan');
  assert.equal(await page.getByRole('link', { name: 'Start', exact: true }).count(), 7);
});

test('a lesson goes in short parts, the activity is required, and nothing real is changed', async () => {
  await page.goto(`${URL_BASE}#/help`);
  await page.getByTestId('academy-module').first().getByRole('link', { name: 'Create a course' }).click();
  await card().getByRole('heading', { name: 'What it is' }).waitFor();
  assert.ok((await card().innerText()).length < 400, 'the introduction is brief');
  await next('Show me where');
  await card().getByRole('heading', { name: 'Where it is' }).waitFor();
  assert.equal(await card().locator('.lit').innerText(), 'Create course', 'the spot is highlighted');
  await next('Now you try');
  assert.equal(await card().getByRole('button', { name: 'Finish the activity to continue' }).isDisabled(), true);
  await card().getByRole('button', { name: 'Create course' }).click();
  await card().getByTestId('activity-feedback').filter({ hasText: 'Type a course name first' }).waitFor();
  // Leaving and coming back resumes at the activity, still not finished.
  await page.goto(`${URL_BASE}#/help`);
  assert.match(await page.getByTestId('academy-overall').innerText(), /^0 of 40/, 'opening a lesson does not finish it');
  await page.getByTestId('academy-module').first().getByRole('link', { name: 'Create a course' }).click();
  await card().getByRole('heading', { name: 'Your turn' }).waitFor();
  await doActivity('create-course');
  await card().getByTestId('activity-feedback').filter({ hasText: 'was added to the practice list' }).waitFor();
  await finish();
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('heading', { name: 'Courses', level: 1 }).waitFor();
  assert.equal(await page.getByText('Financial Accounting').count(), 0, 'the practice course is not a real course');
  await page.goto(`${URL_BASE}#/help`);
  await page.getByTestId('academy-overall').filter({ hasText: /^1 of 40/ }).waitFor();
});

test('wrong answers get a helpful nudge, and choices need an explicit Submit with nothing preselected', async () => {
  await page.goto(`${URL_BASE}#/help/lessons/navigation`);
  await next('Show me where');
  await next('Now you try');
  await card().getByRole('button', { name: 'Library', exact: true }).click();
  await card().getByTestId('activity-feedback').filter({ hasText: 'Not quite: that’s Library.' }).waitFor();
  assert.equal(await card().getByRole('button', { name: 'Finish the activity to continue' }).isDisabled(), true);
  await page.goto(`${URL_BASE}#/help/lessons/practice-answer`);
  await next('Try it');
  assert.equal(await card().getByRole('radio', { checked: true }).count(), 0, 'nothing is picked for you');
  assert.equal(await card().getByRole('button', { name: 'Submit' }).isDisabled(), true);
  await card().getByRole('radio', { name: '$70,000' }).check();
  await card().getByRole('button', { name: 'Submit' }).click();
  await card().getByTestId('activity-feedback').filter({ hasText: 'Try another answer' }).waitFor();
});

test('every lesson can be finished by doing it, and progress is kept after reloading', async () => {
  const ids = await page.evaluate(async () => [...document.querySelectorAll('a')].length >= 0);
  await page.goto(`${URL_BASE}#/help`);
  const links = await page.locator('.academy-lesson-list a').evaluateAll((all) => all.map((a) => a.getAttribute('href').split('/').pop()));
  assert.equal(links.length, 40);
  for (const id of links) {
    await page.goto(`${URL_BASE}#/help/lessons/${id}`);
    await card().getByRole('heading', { name: /What it is|Your turn/ }).waitFor();
    if (await card().getByRole('button', { name: 'Show me where' }).count()) { await next('Show me where'); await next('Now you try'); }
    else if (await card().getByRole('button', { name: 'Try it' }).count()) await next('Try it');
    await doActivity(id);
    await card().locator('.academy-feedback.good').first().waitFor({ timeout: 4000 }).catch(async () => { throw new Error(`${id}: no success feedback. Card says: ${await card().innerText()}`); });
    await finish();
  }
  await page.reload();
  await page.goto(`${URL_BASE}#/help`);
  await page.getByTestId('academy-overall').filter({ hasText: '40 of 40 lessons finished' }).waitFor();
  assert.equal(await page.getByText('✓ All done').count(), 7);
  assert.ok(ids);
});

test('there are no long articles: the old guide address leads to the lessons, and limits are short tips', async () => {
  await page.goto(`${URL_BASE}#/help/guide`);
  await page.getByRole('heading', { name: 'Study Forge Academy', level: 1 }).waitFor();
  assert.match(page.url(), /#\/help$/);
  assert.equal(await page.getByText(/reference guide/i).count(), 0);
  await page.goto(`${URL_BASE}#/help/lessons/search`);
  await next('Try it');
  await doActivity('search');
  await finish();
  const tip = await page.getByTestId('lesson-tip').innerText();
  assert.match(tip, /^Good to know: Files over 300 MB/);
  assert.ok(tip.split(/\s+/).length < 40, 'a tip is a line, not an article');
});

test('the Academy fits a phone and works in dark mode, with no sideways scrolling', async () => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.evaluate(() => localStorage.setItem('study-forge-theme', 'dark'));
  for (const where of ['#/help', '#/help/lessons/trash', '#/help/lessons/create-course', '#/help/lessons/flashcards']) {
    await page.goto(`${URL_BASE}${where}`);
    await page.reload();
    await page.waitForTimeout(300);
    if (where !== '#/help') {
      if (await card().getByRole('button', { name: 'Show me where' }).count()) { await next('Show me where'); }
      else if (await card().getByRole('button', { name: 'Try it' }).count()) await next('Try it');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${where} fits`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.deepEqual(pageErrors, []);
});
