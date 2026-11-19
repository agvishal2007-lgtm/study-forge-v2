// Google Classroom end to end, with Google stubbed the way the calendar tests stub it. What matters
// here is what a student sees: that nothing changes before they agree, that work they have finished
// is never reopened, and that a school-managed account is told the truth about why it was refused.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4237;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let browser;
let context;
let page;
const pageErrors = [];
let tokenBehavior = 'ok';
let workBehavior = 'ok';
let lastScope = '';

const COURSES = [
  { id: 'g1', name: 'Algebra 2', section: 'B', courseState: 'ACTIVE' },
  { id: 'g2', name: 'Chemistry', courseState: 'ACTIVE' },
  { id: 'g3', name: 'Last year', courseState: 'ARCHIVED' },
];
const WORK = {
  g1: [
    { id: 'w1', title: 'Problem set 4', workType: 'ASSIGNMENT', state: 'PUBLISHED', dueDate: { year: 2026, month: 12, day: 2 }, alternateLink: 'https://classroom.google.com/c/g1/a/w1' },
    { id: 'w2', title: 'Chapter 7 reading', workType: 'MATERIAL', state: 'PUBLISHED' },
    { id: 'w3', title: 'An old quiz', workType: 'SHORT_ANSWER_QUESTION', state: 'PUBLISHED', dueDate: { year: 2026, month: 10, day: 1 } },
    { id: 'w4', title: 'Still a draft', workType: 'ASSIGNMENT', state: 'DRAFT' },
  ],
  g2: [{ id: 'w5', title: 'Titration write-up', workType: 'ASSIGNMENT', state: 'PUBLISHED', dueDate: { year: 2026, month: 12, day: 9 } }],
};

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York' });
  await context.exposeFunction('__tokenAsked', (scope) => { lastScope = scope; return tokenBehavior; });
  await context.route('https://accounts.google.com/gsi/client', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.google = { accounts: { oauth2: {
      revoke(token, done) { window.__revoked = token; done && done(); },
      initTokenClient(config) { return { requestAccessToken: async () => {
        const behavior = await window.__tokenAsked(config.scope);
        if (behavior === 'denied') config.callback({ error: 'access_denied' });
        else config.callback({ access_token: 'fake-token', expires_in: 3600 });
      } }; },
    } } };`,
  }));
  await context.route('https://classroom.googleapis.com/v1/**', (route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-headers': 'authorization' } });
    assert.equal(route.request().headers().authorization, 'Bearer fake-token');
    if (url.pathname.endsWith('/courses')) {
      // Only classes the student is in, and only active ones, should ever be asked for.
      assert.equal(url.searchParams.get('studentId'), 'me');
      assert.equal(url.searchParams.get('courseStates'), 'ACTIVE');
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ courses: COURSES }) });
    }
    const courseId = decodeURIComponent(url.pathname.split('/courses/')[1].split('/')[0]);
    if (workBehavior === 'refused' && courseId === 'g2') return route.fulfill({ status: 403, headers, body: JSON.stringify({ error: { message: 'no' } }) });
    return route.fulfill({ status: 200, headers, body: JSON.stringify({ courseWork: WORK[courseId] ?? [] }) });
  });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await returningStudent(page);
  page.setDefaultTimeout(15000);
  await page.goto(URL_BASE);
});

after(async () => {
  await browser?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
});

test('it says what it can and cannot do, and what a school account will hit', async () => {
  await page.goto(`${URL_BASE}#/classroom`);
  await page.getByRole('heading', { name: 'Google Classroom', level: 1 }).waitFor();
  const honesty = await page.getByTestId('classroom-honesty').innerText();
  assert.match(honesty, /only.{0,10}read/i);
  assert.match(honesty, /cannot post/i);
  assert.match(honesty, /see anyone else's work/i);
  // A school-managed account is warned before it tries, not after it is refused.
  await page.getByTestId('classroom-school-note').filter({ hasText: "administrator has allowed Study Forge" }).waitFor();
});

test('only the two read-only scopes are asked for', async () => {
  await page.goto(`${URL_BASE}#/classroom`);
  await page.getByTestId('classroom-connect').click();
  await page.getByTestId('classroom-plan').waitFor();
  assert.deepEqual(lastScope.split(' ').sort(), [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  ], 'nothing beyond reading your own classes and work');
});

test('nothing is changed until the student has seen what would change', async () => {
  const plan = page.getByTestId('classroom-plan');
  await plan.waitFor();
  // The section is kept, so two classes of the same subject stay apart.
  await plan.filter({ hasText: 'Algebra 2 (B)' }).waitFor();
  const work = await page.getByTestId('classroom-work').innerText();
  assert.match(work, /Problem set 4.*due 2026-12-02/s);
  assert.match(work, /Chapter 7 reading.*no due date in Classroom/s);
  assert.match(work, /Titration write-up/);
  // Everything left out says why.
  const skipped = await page.getByTestId('classroom-skipped').innerText();
  assert.match(skipped, /An old quiz.*due before today/s);
  assert.match(skipped, /Still a draft.*not published/s);
  // And the planner is still untouched at this point.
  await page.goto(`${URL_BASE}#/planner`);
  assert.equal(await page.getByTestId('planner-row').filter({ hasText: 'Problem set 4' }).count(), 0);
});

test('bringing it in adds the classes and the work, and says what it did', async () => {
  await page.goto(`${URL_BASE}#/classroom`);
  await page.getByTestId('classroom-look').click();
  await page.getByTestId('classroom-plan').waitFor();
  await page.getByTestId('classroom-apply').click();
  const report = page.getByTestId('classroom-report');
  await report.waitFor();
  const said = await report.innerText();
  assert.match(said, /2 classes added/);
  assert.match(said, /3 assignments added/);
  assert.match(said, /2 things were left out/);

  // The work is in the planner, as the right kinds.
  await page.goto(`${URL_BASE}#/planner`);
  await page.getByTestId('planner-row').filter({ hasText: 'Problem set 4' }).waitFor();
  await page.getByTestId('planner-row').filter({ hasText: 'Chapter 7 reading' }).waitFor();
  // And the classes are there, named from Classroom rather than a code.
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('link', { name: /Algebra 2 \(B\)/ }).first().waitFor();
  await page.getByRole('link', { name: /Chemistry/ }).first().waitFor();
  // New classes go through the same review step a calendar import uses.
  await page.getByTestId('import-notice').waitFor();
});

test('a second import never reopens work the student has already finished', async () => {
  // Finish one, and rename a class, which is the thing a student will not risk without being sure.
  await page.goto(`${URL_BASE}#/planner`);
  const row = page.getByTestId('planner-row').filter({ hasText: 'Problem set 4' });
  await row.locator('input[type=checkbox]').first().check();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=planner-row]')]
    .some((one) => one.textContent.includes('Problem set 4') && one.dataset.done === 'true'));

  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('link', { name: /Algebra 2 \(B\)/ }).first().click();
  await page.getByRole('button', { name: 'Edit course' }).click();
  await page.getByTestId('edit-course').getByLabel('Course name').fill('Algebra, period B');
  await page.getByRole('button', { name: 'Save course' }).click();
  await page.getByRole('heading', { name: 'Algebra, period B', level: 1 }).waitFor();

  // Import again.
  await page.goto(`${URL_BASE}#/classroom`);
  await page.getByTestId('classroom-look').click();
  await page.getByTestId('classroom-plan').waitFor();
  // No new classes: they are matched by their Classroom id, not by name.
  assert.equal(await page.getByTestId('classroom-plan').innerText().then((text) => /new class/.test(text)), false);
  await page.getByTestId('classroom-apply').click();
  await page.getByTestId('classroom-report').waitFor();

  // The finished work is still finished, and the renamed class kept its name.
  await page.goto(`${URL_BASE}#/planner`);
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=planner-row]')]
    .some((one) => one.textContent.includes('Problem set 4') && one.dataset.done === 'true'));
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('link', { name: /Algebra, period B/ }).first().waitFor();
  assert.equal(await page.getByRole('link', { name: /Algebra 2 \(B\)/ }).count(), 0, 'the import overwrote the name');
});

test('a class that will not share its work costs only that class', async () => {
  workBehavior = 'refused';
  try {
    await page.goto(`${URL_BASE}#/classroom`);
    await page.getByTestId('classroom-look').click();
    await page.getByTestId('classroom-plan').waitFor();
    // Said plainly, and whose decision it is.
    await page.getByTestId('classroom-refused').filter({ hasText: 'Chemistry' }).waitFor();
    await page.getByTestId('classroom-refused').filter({ hasText: 'school' }).waitFor();
    // The other class still came through.
    await page.getByTestId('classroom-work').filter({ hasText: 'Problem set 4' }).waitFor();
  } finally {
    workBehavior = 'ok';
  }
});

test('a refused account is told it is the school, not them', async () => {
  tokenBehavior = 'denied';
  try {
    await page.goto(`${URL_BASE}#/classroom`);
    await page.getByTestId('classroom-disconnect').click();
    await page.getByTestId('classroom-connect').click();
    await page.getByRole('alert').filter({ hasText: 'your school has to allow Study Forge' }).waitFor();
    await page.getByRole('alert').filter({ hasText: 'Nothing is wrong with your sign-in' }).waitFor();
  } finally {
    tokenBehavior = 'ok';
  }
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
