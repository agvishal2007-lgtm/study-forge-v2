// Organizing: semesters, custom headings, renaming, reordering and breadcrumbs.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const rules = () => import('../src/data/courseRules.ts');

const topic = (id, name, heading, position) => ({ id, name, heading, position, createdAt: position, courseId: 'c', status: 'active', statusAt: 0, updatedAt: 0 });
const course = (id, name, term, position) => ({ id, name, term, position, createdAt: position, code: '', color: '#000', status: 'active', statusAt: 0, updatedAt: 0 });

test('things sort by where the student put them, falling back to when they were made', async () => {
  const { byPlace } = await rules();
  const list = [{ position: 1, createdAt: 5 }, { position: 0, createdAt: 9 }, { position: 1, createdAt: 2 }];
  assert.deepEqual([...list].sort(byPlace).map((item) => item.createdAt), [9, 2, 5]);
});

test('moving swaps with the neighbour, and does nothing at the ends', async () => {
  const { reordered } = await rules();
  const list = [topic('a', 'A', '', 0), topic('b', 'B', '', 1), topic('c', 'C', '', 2)];
  assert.deepEqual(reordered(list, 'b', 'up').map((t) => t.id), ['b', 'a', 'c']);
  assert.deepEqual(reordered(list, 'b', 'down').map((t) => t.id), ['a', 'c', 'b']);
  assert.equal(reordered(list, 'a', 'up'), null, 'the first cannot move up');
  assert.equal(reordered(list, 'c', 'down'), null, 'the last cannot move down');
  assert.equal(reordered(list, 'missing', 'up'), null);
});

test('topics group under their headings, ungrouped ones first', async () => {
  const { groupTopics } = await rules();
  const groups = groupTopics([
    topic('a', 'A', 'Chapter 2', 0),
    topic('b', 'B', '', 1),
    topic('c', 'C', 'Chapter 2', 2),
    topic('d', 'D', 'Chapter 1', 3),
  ]);
  assert.deepEqual(groups.map((group) => group.heading), ['', 'Chapter 2', 'Chapter 1'], 'ungrouped first, then first-seen order');
  assert.deepEqual(groups[1].topics.map((t) => t.id), ['a', 'c']);
});

test('courses group by semester, with independent study last', async () => {
  const { groupCourses } = await rules();
  const groups = groupCourses([
    course('a', 'A', '', 0),
    course('b', 'B', 'Spring 2027', 1),
    course('c', 'C', 'Fall 2026', 2),
    course('d', 'D', 'Fall 2026', 3),
  ]);
  assert.deepEqual(groups.map((group) => group.term), ['Fall 2026', 'Spring 2027', ''], 'no semester comes last');
  assert.deepEqual(groups[0].courses.map((c) => c.id), ['c', 'd']);
});

const PORT = 4203;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let work;
const pageErrors = [];
const order = async (testid) => (await page.getByTestId(testid).innerText()).replace(/\s+/g, ' ');

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-organize-'));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  context = await chromium.launchPersistentContext(path.join(work, 'main'), { viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York', serviceWorkers: 'block' });
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await context?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('a course can be renamed and given a code and a semester', async () => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByLabel('Course name').fill('Acconting');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Acconting', level: 1 }).waitFor();

  await page.getByRole('button', { name: 'Edit course' }).click();
  await page.getByTestId('edit-course').getByLabel('Course name').fill('Accounting');
  await page.getByTestId('edit-course').getByLabel('Course code').fill('ACC 211');
  await page.getByTestId('edit-course').getByLabel('Semester').fill('Fall 2026');
  await page.getByRole('button', { name: 'Save course' }).click();
  await page.getByRole('heading', { name: 'Accounting', level: 1 }).waitFor();
  const header = await page.locator('.course-head').innerText();
  assert.match(header, /ACC 211/);
  assert.match(header, /Fall 2026/);
});

test('there is a trail back to Courses', async () => {
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await crumbs.waitFor();
  await crumbs.getByRole('link', { name: 'Courses' }).click();
  await page.getByRole('heading', { name: 'Courses', level: 1 }).waitFor();
  await page.getByRole('link', { name: /Accounting/ }).first().click();
  await page.getByRole('heading', { name: 'Accounting', level: 1 }).waitFor();
});

test('topics sit under headings the student names', async () => {
  const add = async (name, heading) => {
    await page.getByLabel('New topic').fill(name);
    await page.getByLabel('Under heading').first().fill(heading);
    await page.getByRole('button', { name: 'Add topic' }).click();
    await page.getByRole('heading', { name, level: 4 }).waitFor();
  };
  await add('Ledgers', 'Chapter 1');
  await add('Journals', 'Chapter 1');
  await add('Trial balance', 'Chapter 2');
  const chapterOne = await order('group-Chapter 1');
  assert.match(chapterOne, /Chapter 1/);
  assert.ok(chapterOne.indexOf('Ledgers') < chapterOne.indexOf('Journals'), 'added in order');
  assert.match(await order('group-Chapter 2'), /Trial balance/);
});

test('a topic moves up and down within its heading', async () => {
  await page.getByRole('button', { name: 'Move topic Journals up' }).click();
  await page.waitForFunction(() => {
    const group = document.querySelector('[data-testid="group-Chapter 1"]');
    return group && group.innerText.indexOf('Journals') < group.innerText.indexOf('Ledgers');
  });
  const moved = await order('group-Chapter 1');
  assert.ok(moved.indexOf('Journals') < moved.indexOf('Ledgers'), 'Journals moved above Ledgers');
});

test('a topic can be renamed and moved to another heading', async () => {
  await page.getByRole('button', { name: 'Rename topic Ledgers' }).click();
  await page.getByLabel('Topic name').fill('The ledger');
  await page.locator('form').filter({ has: page.getByLabel('Topic name') }).getByLabel('Under heading').fill('Chapter 2');
  await page.getByRole('button', { name: 'Save topic' }).click();
  await page.getByRole('heading', { name: 'The ledger', level: 4 }).waitFor();
  assert.match(await order('group-Chapter 2'), /The ledger/);
  assert.doesNotMatch(await order('group-Chapter 1'), /ledger/);
});

test('courses group by semester and can be arranged within one', async () => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByLabel('Course name').fill('Biology');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Biology', level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Edit course' }).click();
  await page.getByTestId('edit-course').getByLabel('Semester').fill('Fall 2026');
  await page.getByRole('button', { name: 'Save course' }).click();

  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('heading', { name: 'Fall 2026' }).waitFor();
  await page.getByTestId('arrange-toggle').click();
  const list = page.getByTestId('arrange-Fall 2026');
  await list.waitFor();
  let text = (await list.innerText()).replace(/\s+/g, ' ');
  assert.ok(text.indexOf('Accounting') < text.indexOf('Biology'), 'Accounting starts first');
  await page.getByRole('button', { name: 'Move Biology earlier' }).click();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="arrange-Fall 2026"]');
    return el && el.innerText.indexOf('Biology') < el.innerText.indexOf('Accounting');
  });
  text = (await list.innerText()).replace(/\s+/g, ' ');
  assert.ok(text.indexOf('Biology') < text.indexOf('Accounting'), 'Biology moved earlier');
});

test('a course with no semester is kept separate', async () => {
  await page.getByTestId('arrange-toggle').click();
  await page.getByLabel('Course name').fill('Independent reading');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Independent reading', level: 1 }).waitFor();
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('heading', { name: 'No semester' }).waitFor();
  const section = page.getByRole('region', { name: 'Courses with no semester' });
  assert.match(await section.innerText(), /Independent reading/);
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
