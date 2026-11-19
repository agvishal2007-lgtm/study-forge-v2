// Looking over the names a calendar import brought in. The import itself is covered by the calendar
// tests; this covers what a student sees afterwards, which before this existed at all.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4236;
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
  return page.url().split('/courses/')[1];
};

/** Marks courses as having come from a calendar, the way an import does. */
const markAsImported = (ids) => page.evaluate(async (courseIds) => {
  await new Promise((resolve, reject) => {
    const open = indexedDB.open('study-forge');
    open.onsuccess = () => {
      const tx = open.result.transaction('studyState', 'readwrite');
      tx.objectStore('studyState').put({ id: 'import-review', value: { courseIds, at: Date.now(), explained: false }, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  });
}, ids);

test('courses from a calendar are explained where they appear, not left as a mystery', async () => {
  const bio = await addCourse('BIO-101-02');
  const acct = await addCourse('ACCT201');
  await addCourse('Financial Accounting');
  await markAsImported([bio, acct]);

  await page.goto(`${URL_BASE}#/courses`);
  const notice = page.getByTestId('import-notice');
  await notice.waitFor();
  // It says how many and why they look like that, without overstating it.
  await notice.filter({ hasText: '2 classes came from your calendar' }).waitFor();
  await notice.filter({ hasText: 'codes rather than names' }).waitFor();
  // A course the student made themselves is not counted.
  assert.ok(!(await notice.innerText()).includes('3 classes'));
});

test('the names can be fixed, and the ones that look like codes come first', async () => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByTestId('import-notice').getByRole('link', { name: 'Look over the names' }).click();
  await page.getByRole('heading', { name: 'Names from your calendar', level: 1 }).waitFor();
  // It explains that renaming survives the next refresh, which is the thing a student won't risk
  // without being told.
  await page.getByTestId('review-explanation').filter({ hasText: 'matches on the course code' }).waitFor();
  const shown = await page.getByTestId('review-list').locator('input').evaluateAll((all) => all.map((one) => one.value));
  assert.deepEqual(shown, ['BIO-101-02', 'ACCT201'], 'both imported courses should be offered, codes first');
  // Rename one, leave the other exactly as it was.
  const first = page.getByTestId('review-list').locator('input').first();
  await first.fill('Biology');
  await page.getByTestId('review-save').click();
  await page.getByRole('heading', { name: 'Courses', level: 1 }).waitFor();
  await page.getByRole('link', { name: /Biology/ }).first().waitFor();
  await page.getByRole('link', { name: /ACCT201/ }).first().waitFor();
  // Asked once: the notice is gone and the page says there is nothing waiting.
  assert.equal(await page.getByTestId('import-notice').count(), 0);
  await page.goto(`${URL_BASE}#/courses/review`);
  await page.getByTestId('review-empty').waitFor();
});

test('a student who is happy with the codes is not asked again', async () => {
  const one = await addCourse('MATH1120');
  await markAsImported([one]);
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByTestId('import-notice').waitFor();
  await page.getByTestId('import-notice-dismiss').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=import-notice]').length === 0);
  // The name is untouched — nothing was renamed for them.
  await page.getByRole('link', { name: /MATH1120/ }).first().waitFor();
  // And it stays gone after a reload, because the decision was written down.
  await page.reload();
  await page.getByRole('heading', { name: 'Courses', level: 1 }).waitFor();
  assert.equal(await page.getByTestId('import-notice').count(), 0);
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});

test('a to-do is written down in the + menu, not in the planner form', async () => {
  await page.goto(`${URL_BASE}#/`);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('heading', { name: 'Add to Study Forge' }).waitFor();
  await page.getByRole('button', { name: /^To-do/ }).click();
  // It is asked for here, rather than sending the student to the planner to fill in a form.
  const form = page.getByTestId('quick-todo');
  await form.waitFor();
  assert.equal(new URL(page.url()).hash || '#/', '#/', 'it should not navigate away');
  // Three things asked, and nothing else.
  await page.getByTestId('quick-todo-text').fill('Email Mr Harris about the lab');
  await page.getByTestId('quick-todo-due').fill('2026-12-01');
  await page.getByTestId('quick-todo-list').selectOption({ label: 'Personal' });
  await page.getByRole('button', { name: 'Add it', exact: true }).click();
  await page.getByTestId('quick-todo-saved').filter({ hasText: 'Added to Personal' }).waitFor();
  // The box clears so a second one can be written without closing anything.
  assert.equal(await page.getByTestId('quick-todo-text').inputValue(), '');

  // It is a to-do in the planner, not an assignment pretending to be one.
  await page.goto(`${URL_BASE}#/planner`);
  const row = page.getByTestId('planner-row').filter({ hasText: 'Email Mr Harris about the lab' });
  await row.waitFor();
  await row.filter({ hasText: 'To-do' }).waitFor();
});
