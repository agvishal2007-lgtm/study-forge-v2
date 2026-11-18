// School level and the first-term setup: the words change, the first term is created, and the
// levels meant for younger students keep everything on the device.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const URL_BASE = 'http://localhost:4233/';
const PORT = '4233';
let server;
let browser;
const pageErrors = [];

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { cwd: require('path').join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  try { if (server) process.kill(-server.pid); } catch { /* stopped */ }
});

/** Each test gets a fresh student, so nothing one test chooses leaks into the next. */
async function fresh(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await returningStudent(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { context, page };
}
const level = (page, name) => page.getByRole('radio', { name: new RegExp(name) });

test('a student with nothing is set up in three steps, and their classes land in their first term', async () => {
  const { context, page } = await fresh();
  try {
    await page.goto(`${URL_BASE}#/courses`);
    const setup = page.getByTestId('course-setup');
    await setup.waitFor();
    assert.match(await page.getByTestId('setup-step').innerText(), /Step 1 of 3/);

    await level(page, 'High school').check();
    // The choice isn't committed until the end, so the page behind keeps its old words for now.
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Courses');
    assert.equal(await page.getByTestId('device-only-note').count(), 0, 'high school has accounts');
    await page.getByTestId('setup-next').click();

    assert.match(await page.getByTestId('setup-step').innerText(), /Step 2 of 3 · Semester/);
    const suggested = await page.getByTestId('term-name').inputValue();
    assert.ok(suggested.length > 3, 'a name is suggested rather than left blank');
    await page.getByTestId('term-name').fill('Spring 2027');
    await page.getByTestId('setup-next').click();

    // The setup itself previews the words the student picked.
    assert.match(await page.getByTestId('setup-step').innerText(), /Step 3 of 3 · Classes/);
    assert.match(await page.locator('.setup-classes legend').innerText(), /Which classes are you taking in Spring 2027/);
    await page.getByRole('checkbox', { name: 'Algebra' }).check();
    await page.getByRole('checkbox', { name: 'Biology' }).check();
    await page.getByTestId('own-classes').fill('Band\nRobotics');
    await page.getByTestId('setup-finish').click();
    await setup.waitFor({ state: 'detached' });

    // Finishing commits the level, so the whole app changes its words.
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Classes');
    // The classes are ordinary course records, grouped under the term the student named.
    const group = page.locator('.course-group').filter({ hasText: 'Spring 2027' });
    await group.getByRole('heading', { name: 'Spring 2027' }).waitFor();
    for (const name of ['Algebra', 'Biology', 'Band', 'Robotics']) {
      await group.getByText(name, { exact: true }).waitFor();
    }
    // All four arrived as one action, so one Undo takes back the whole batch.
    assert.match(await page.locator('.undo-bar').innerText(), /Added 4 classes/);

    // Setup is finished, so reloading goes straight to the classes.
    await page.reload();
    await page.getByRole('heading', { name: 'Classes', level: 1 }).waitFor();
    assert.equal(await page.getByTestId('course-setup').count(), 0, 'nobody is set up twice');
  } finally { await context.close(); }
});

test('Skip changes nothing, is never asked again, and setup can be reopened', async () => {
  const { context, page } = await fresh();
  try {
    await page.goto(`${URL_BASE}#/courses`);
    await page.getByTestId('course-setup').waitFor();
    await page.getByTestId('setup-skip').click();
    await page.getByTestId('course-setup').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.course-group').count(), 0, 'skipping creates nothing');
    assert.equal(await page.getByRole('heading', { name: 'Courses', level: 1 }).count(), 1, 'the words stay as they were');

    await page.reload();
    await page.getByRole('heading', { name: 'Courses', level: 1 }).waitFor();
    assert.equal(await page.getByTestId('course-setup').count(), 0, 'skipping is remembered');

    await page.getByTestId('reopen-setup').click();
    await page.getByTestId('course-setup').waitFor();
  } finally { await context.close(); }
});

test('middle school keeps everything on the device: no sign-in anywhere, and the sign-in address explains why', async () => {
  const { context, page } = await fresh();
  try {
    await page.goto(`${URL_BASE}#/courses`);
    await page.getByTestId('course-setup').waitFor();
    await level(page, 'Middle school').check();
    await page.getByTestId('device-only-note').waitFor();
    assert.match(await page.getByTestId('device-only-note').innerText(), /never asks your age/);
    await page.getByTestId('setup-skip').click();

    // The way in is gone rather than leading somewhere that refuses.
    assert.equal(await page.getByRole('link', { name: 'Log In / Sign Up' }).count(), 0, 'no sign-in button');
    await page.goto(`${URL_BASE}#/auth`);
    await page.getByTestId('no-accounts-here').waitFor();
    await page.getByRole('heading', { name: 'Study Forge is on this device only' }).waitFor();

    await page.goto(`${URL_BASE}#/settings`);
    await page.getByTestId('settings-device-only').waitFor();
    assert.equal(await page.getByTestId('school-level').inputValue(), 'middle');
    // Nothing can reach an account from here, even if something tried.
    const refused = await page.evaluate(async () => {
      try { await (await import('/src/data/sync.ts')).loadBackend(); return 'opened'; } catch (error) { return error.message; }
    }).catch(() => 'not reachable in a build');
    assert.ok(refused !== 'opened', 'no account backend loads on a device-only level');

    // Moving back to College brings syncing and the sign-in button back.
    await page.getByTestId('school-level').selectOption('college');
    assert.equal(await page.getByTestId('settings-device-only').count(), 0);
    await page.goto(`${URL_BASE}#/courses`);
    await page.getByRole('link', { name: 'Log In / Sign Up' }).waitFor();
  } finally { await context.close(); }
});

test('elementary school gets the simpler app, in its own words', async () => {
  const { context, page } = await fresh({ width: 1280, height: 900 });
  try {
    await page.goto(`${URL_BASE}#/courses`);
    await page.getByTestId('course-setup').waitFor();
    await level(page, 'Elementary school').check();
    await page.getByTestId('setup-next').click();
    // One school year, so there is nothing to choose about terms.
    assert.match(await page.getByTestId('setup-step').innerText(), /School year/);
    assert.equal(await page.getByRole('radio', { name: /Trimesters/ }).count(), 0, 'no term kinds to pick');
    assert.match(await page.getByTestId('term-name').inputValue(), /school year/);
    await page.getByTestId('setup-next').click();
    await page.getByRole('checkbox', { name: 'Reading' }).check();
    await page.getByTestId('setup-finish').click();
    await page.getByTestId('course-setup').waitFor({ state: 'detached' });

    assert.equal(await page.getByRole('heading', { name: 'Classes', level: 1 }).count(), 1);
    assert.equal(await page.getByTestId('new-semester').count(), 0, 'no semester button for the youngest');
    const nav = page.getByRole('navigation', { name: 'Main' });
    assert.equal(await nav.getByRole('link', { name: 'Exam Hall' }).count(), 0, 'Exam Hall is not in the menu');
    await nav.getByRole('link', { name: 'Flashcards' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'My templates' }).count(), 0, 'saved templates are hidden');

    // Grades read in plain words at this level.
    await page.getByText('Reading', { exact: true }).click();
    await page.getByRole('heading', { name: 'How this class is going' }).waitFor();
  } finally { await context.close(); }
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
