// One student, one semester, end to end: the pieces built separately have to work together.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4209;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let workDir;
const pageErrors = [];

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-journey-'));
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

const openCourse = async () => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('link', { name: /Financial Accounting/ }).first().click();
  await page.getByRole('heading', { name: 'Financial Accounting', level: 1 }).waitFor();
};

const dateIn = (days) => {
  const when = new Date();
  when.setDate(when.getDate() + days);
  return when.toISOString().slice(0, 10);
};

test('a student sets up a course for the semester', async () => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByLabel('Course name').fill('Financial Accounting');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Financial Accounting', level: 1 }).waitFor();

  await page.getByRole('button', { name: 'Edit course' }).click();
  await page.getByTestId('edit-course').getByLabel('Course code').fill('ACC 211');
  await page.getByTestId('edit-course').getByLabel('Semester').fill('Fall 2026');
  await page.getByRole('button', { name: 'Save course' }).click();
  await page.waitForFunction(() => document.querySelector('.course-head').innerText.includes('ACC 211'));

  // The trail back up is there.
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Courses' }).waitFor();
});

test('they copy the grading categories off the syllabus', async () => {
  await page.getByLabel('Category', { exact: true }).fill('Exams');
  await page.getByLabel('Weight %').fill('70');
  await page.getByRole('button', { name: 'Add category' }).click();
  await page.getByRole('row', { name: /Exams/ }).waitFor();
  await page.getByLabel('Category', { exact: true }).fill('Homework');
  await page.getByLabel('Weight %').fill('30');
  await page.getByRole('button', { name: 'Add category' }).click();
  await page.getByRole('row', { name: /Homework/ }).waitFor();
  assert.equal(await page.getByTestId('weights-warning').count(), 0, 'the weights add up');
});

test('they organise the course into chapters and save a reading', async () => {
  await page.getByLabel('New topic').fill('The accounting equation');
  await page.getByLabel('Under heading').first().fill('Chapter 1');
  await page.getByRole('button', { name: 'Add topic' }).click();
  await page.getByRole('heading', { name: 'The accounting equation', level: 4 }).waitFor();
  await page.getByTestId('group-Chapter 1').waitFor();

  const details = page.locator('details.link-adder').first();
  if (!(await details.evaluate((element) => element.open))) await details.locator('summary').click();
  await page.getByTestId('save-link').first().getByLabel('Web address').fill('https://www.jstor.org/stable/777');
  await page.getByTestId('save-link').first().getByLabel('Name it (optional)').fill('Ledgers paper');
  await page.getByRole('button', { name: 'Save link' }).first().click();
  await page.getByRole('status').first().waitFor();
});

test('they add a midterm, with what it is worth and the mark they got', async () => {
  const add = async (name, days, points, earned, category) => {
    await page.goto(`${URL_BASE}#/planner`);
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Course').selectOption({ label: 'Financial Accounting' });
    await page.getByLabel('Due date', { exact: true }).fill(dateIn(days));
    await page.getByLabel('Points it is worth (optional)').fill(points);
    if (earned) await page.getByLabel('Marks you got (optional)').fill(earned);
    if (category) await page.getByLabel('Grading category').selectOption({ label: category });
    await page.getByRole('button', { name: 'Save item' }).click();
    await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();
  };
  await add('Midterm', -7, '100', '90', 'Exams (70%)');
  await add('Final exam', 30, '100', '', 'Exams (70%)');
  await add('Problem set 4', 2, '400', '', 'Homework (30%)');
});

test('the course grade counts only what was marked', async () => {
  await openCourse();
  await page.getByTestId('grade-now').waitFor();
  const grade = await page.getByTestId('grade-now').innerText();
  assert.match(grade, /90%/, 'the unmarked final is not a zero');
  assert.match(grade, /70% of the course/);
});

test('the deadline shows on the calendar as work you can see', async () => {
  await page.goto(`${URL_BASE}#/calendar`);
  await page.getByRole('tab', { name: 'Deadline Calendar' }).click();
  await page.locator('.month-chip[data-status]').first().waitFor();
  const statuses = await page.locator('.month-chip[data-status]').evaluateAll((chips) => chips.map((chip) => chip.dataset.status));
  assert.ok(statuses.includes('soon'), 'the problem set reads as due soon');
});

test('ranking by grade impact beats ranking by raw points', async () => {
  await page.goto(`${URL_BASE}#/planner`);
  await page.getByTestId('priority-mode').selectOption('points');
  await page.getByTestId('ranked').waitFor();
  const byPoints = await page.getByTestId('ranked').innerText();
  assert.ok(byPoints.indexOf('Problem set 4') < byPoints.indexOf('Final exam'), '400 points leads on raw points');

  await page.getByTestId('priority-mode').selectOption('impact');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="ranked"]');
    return el && el.innerText.indexOf('Final exam') < el.innerText.indexOf('Problem set 4');
  });
  const byImpact = await page.getByTestId('ranked').innerText();
  assert.match(byImpact, /% of the final grade/, 'the impact is spelled out');
  // 400 points of homework carries 30% of the grade; half the exam category carries 35%.
  assert.ok(byImpact.indexOf('Final exam') < byImpact.indexOf('Problem set 4'), 'the exam matters more to the grade');
});

test('the overdue midterm stays in view whatever the order', async () => {
  await page.getByTestId('needs-now').waitFor();
  assert.match(await page.getByTestId('needs-now').innerText(), /Midterm/);
});

test('a reading can be binned and brought back without losing it', async () => {
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'Ledgers paper' }).click();
  await page.getByRole('button', { name: 'Move to bin' }).click();
  await page.goto(`${URL_BASE}#/bin`);
  await page.getByTestId('bin-files').waitFor();
  await page.getByRole('button', { name: 'Restore Ledgers paper' }).click();
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'Ledgers paper' }).waitFor();
});

test('the finished course can be archived and still found', async () => {
  await openCourse();
  await page.getByRole('button', { name: 'Archive course' }).click();
  await page.getByTestId('archived-courses').waitFor();
  // Still searchable after archiving.
  await page.goto(`${URL_BASE}#/search`);
  await page.getByRole('searchbox').fill('Ledgers');
  await page.getByTestId('search-Files').waitFor();
  assert.match(await page.getByTestId('search-Files').innerText(), /Ledgers paper/);

  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('button', { name: 'Put Financial Accounting back in use' }).click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="archived-courses"]'));
});

test('nothing threw at any point in the journey', () => {
  assert.deepEqual(pageErrors, []);
});
