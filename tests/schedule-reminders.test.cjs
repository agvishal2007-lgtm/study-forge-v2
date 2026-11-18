// Block schedules in use: the school's own day names, and which classes meet today. Then
// reminders: one that has come due is shown where it can't be missed, and saying "got it" ends it.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4231;
const URL_BASE = `http://localhost:${PORT}/`;
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
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // A fixed Wednesday, so a rotation always has a day and the test never depends on the weekend.
  await page.clock.setFixedTime(new Date('2026-11-04T14:30:00-05:00'));
  await returningStudent(page);
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await browser?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
});

test('a school can name its own days, and today says which it is', async () => {
  await page.goto(`${URL_BASE}#/settings/school`);
  await page.getByTestId('block-on').check();
  await page.getByTestId('block-naming').selectOption('custom');
  const names = page.getByTestId('block-names').locator('input');
  await names.nth(0).fill('Maroon');
  await names.nth(1).fill('Gold');
  await page.getByTestId('block-today').selectOption('0');
  await page.getByTestId('block-state').filter({ hasText: 'Maroon' }).waitFor();
  // The letters are still what everything falls back to, so a half-named cycle is never blank.
  await names.nth(1).fill('');
  await page.getByTestId('block-today').selectOption('1');
  await page.getByTestId('block-state').filter({ hasText: 'B day' }).waitFor();
  await names.nth(1).fill('Gold');
  await page.getByTestId('block-today').selectOption('0');
});

test('a class that skips a day of the cycle drops off that day, and comes back on its own', async () => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByLabel('Course name').fill('Biology');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Biology', level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Edit course' }).click();
  const form = page.getByTestId('edit-course');
  // Every day starts ticked, which is what a class with nothing set up does.
  assert.equal(await form.getByTestId('meets-on').locator('input:checked').count(), 2);
  await form.getByLabel('Gold').uncheck();
  await form.getByRole('button', { name: 'Save course' }).click();
  await page.getByRole('button', { name: 'Edit course' }).waitFor();

  await page.goto(`${URL_BASE}#/`);
  assert.match(await page.getByTestId('block-day').innerText(), /Maroon day/);
  await page.getByTestId('classes-today').filter({ hasText: 'Biology' }).waitFor();
  // On the day it doesn't meet, it isn't listed — and nothing claims there are classes.
  await page.goto(`${URL_BASE}#/settings/school`);
  await page.getByTestId('block-today').selectOption('1');
  await page.goto(`${URL_BASE}#/`);
  assert.match(await page.getByTestId('block-day').innerText(), /Gold day/);
  assert.equal(await page.getByTestId('classes-today').count(), 0);
  // Put the cycle back where the rest of the run expects it.
  await page.goto(`${URL_BASE}#/settings/school`);
  await page.getByTestId('block-today').selectOption('0');
  await page.getByTestId('block-state').filter({ hasText: 'Maroon' }).waitFor();
});

test('a reminder that has come due is shown, says what it cannot do, and ends when acknowledged', async () => {
  await page.goto(`${URL_BASE}#/settings/notifications`);
  const section = page.getByTestId('reminders-section');
  // The limit is stated plainly rather than worked around.
  await section.getByTestId('reminder-limit').filter({ hasText: "can't be relied on" }).waitFor();
  await section.getByLabel('Remind me to').fill('Start the accounting homework');
  // Due an hour ago, which is also what a reminder that came due while the site was shut looks like.
  await page.getByTestId('reminder-at').fill('2026-11-04T13:30');
  await section.getByRole('button', { name: 'Add reminder' }).click();
  await section.getByText('Start the accounting homework').first().waitFor();

  const due = page.getByTestId('due-reminders');
  await due.getByText('Start the accounting homework').waitFor();
  // It is above the page rather than inside it, so it survives moving around.
  await page.goto(`${URL_BASE}#/planner`);
  await due.getByText('Start the accounting homework').waitFor();
  await due.getByRole('button', { name: 'Got it' }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=due-reminders]').length === 0);
  // And it stays gone after a reload: being shown was written down, not just hidden.
  await page.reload();
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  assert.equal(await page.getByTestId('due-reminders').count(), 0);
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
