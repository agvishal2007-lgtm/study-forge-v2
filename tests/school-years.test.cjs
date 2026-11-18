// Looking back at past school years: what a student entered, added up honestly, and put away
// without anything being changed or lost.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = '4241';
const URL_BASE = `http://localhost:${PORT}/`;
let server; let browser; let context; let page;
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

/** A class in a named term, made the way a student would. */
async function addCourse(name, term) {
  await page.goto(`${URL_BASE}#/courses`);
  const setup = page.getByTestId('course-setup');
  if (await setup.count()) await page.getByTestId('setup-skip').click();
  await page.getByLabel('Course name').fill(name);
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name, level: 1 }).waitFor();
  if (term) {
    await page.getByRole('button', { name: 'Edit course' }).click();
    await page.getByTestId('edit-course').waitFor();
    await page.getByLabel('Semester').fill(term);
    await page.getByRole('button', { name: 'Save course' }).click();
    await page.getByText(term).first().waitFor();
  }
}

test('terms a student already had appear without anything being entered again', async () => {
  await addCourse('Financial Accounting', 'Fall 2026');
  await page.goto(`${URL_BASE}#/courses/years`);
  await page.getByRole('heading', { name: 'School years', level: 1 }).waitFor();
  // The term written on the class became a term of its own, with the class under it.
  const term = page.getByTestId('year-term').first();
  await term.waitFor();
  assert.match(await term.innerText(), /Financial Accounting/);
});

test('credits and a grade are entered here, and add up only from what was entered', async () => {
  await page.goto(`${URL_BASE}#/courses/years`);
  await page.getByTestId('year-term').first().waitFor();
  await page.getByLabel('Credits for Financial Accounting').fill('3');
  await page.getByLabel('Final grade for Financial Accounting').fill('A');
  await page.getByLabel('Final grade for Financial Accounting').blur();
  await page.waitForTimeout(400);
  await page.reload();
  await page.getByTestId('year-term').first().waitFor();
  // What was typed is still there after a reload: this is a record, not a scratch pad.
  assert.equal(await page.getByLabel('Credits for Financial Accounting').inputValue(), '3');
  assert.equal(await page.getByLabel('Final grade for Financial Accounting').inputValue(), 'A');
  assert.match(await page.getByTestId('overall-summary').innerText(), /3 credits taken, 3 earned/);
});

test('a class with no credits is flagged rather than counted as nothing', async () => {
  await addCourse('Biology', 'Fall 2026');
  await page.goto(`${URL_BASE}#/courses/years`);
  await page.getByTestId('overall-incomplete').waitFor();
  assert.match(await page.getByTestId('overall-incomplete').innerText(), /aren't the whole story/);
  // The totals still only count what was really entered.
  assert.match(await page.getByTestId('overall-summary').innerText(), /3 credits taken/);
});

test('putting a term away keeps everything in it, and changes no class', async () => {
  await page.goto(`${URL_BASE}#/courses/years`);
  const term = page.getByTestId('year-term').first();
  await term.waitFor();
  const name = await term.getAttribute('data-term');
  await page.getByTestId(`archive-${name}`).click();
  await page.waitForTimeout(400);
  assert.match(await page.getByTestId('year-term').first().innerText(), /Put away/);
  // Its classes are still listed, with what was entered intact.
  assert.equal(await page.getByLabel('Credits for Financial Accounting').inputValue(), '3');
  // And the class itself is untouched: still a normal class on the Courses page.
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('link', { name: 'Financial Accounting' }).waitFor();
  // Taking it back out works too.
  await page.goto(`${URL_BASE}#/courses/years`);
  await page.getByTestId(`archive-${name}`).click();
  await page.waitForTimeout(400);
  assert.doesNotMatch(await page.getByTestId('year-term').first().innerText(), /Put away/);
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
