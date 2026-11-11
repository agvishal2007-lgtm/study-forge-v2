// Active, Archived, Trashed: nothing is destroyed without an explicit "remove for good".
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4200;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let work;
const pageErrors = [];

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-lifecycle-'));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  context = await chromium.launchPersistentContext(path.join(work, 'main'), { viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York', serviceWorkers: 'block' });
  await returningStudent(context);
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

test('a course and a topic can be made', async () => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByLabel('Course name').fill('Biology');
  await page.getByRole('button', { name: 'Create course' }).click();
  // Creating a course opens it straight away.
  await page.getByRole('heading', { name: 'Biology', level: 1 }).waitFor();
  await page.getByLabel('New topic').fill('Cells');
  await page.getByRole('button', { name: 'Add topic' }).click();
  await page.getByRole('heading', { name: 'Cells', level: 4 }).waitFor();
});

test('archiving a topic puts it away and keeps it, and it comes back', async () => {
  await page.getByRole('button', { name: 'Archive topic Cells' }).click();
  await page.getByTestId('archived-topics').waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Cells', level: 4 }).count(), 0, 'it left the working list');
  await page.getByRole('button', { name: 'Put topic Cells back in use' }).click();
  await page.getByRole('heading', { name: 'Cells', level: 4 }).waitFor();
  assert.equal(await page.getByTestId('archived-topics').count(), 0);
});

test('a topic in the bin can be restored', async () => {
  await page.getByRole('button', { name: 'Move topic Cells to the bin' }).click();
  // The offer to undo names what was binned, so the check is against the page itself.
  await page.waitForFunction(() => !document.getElementById('content').innerText.includes('Cells'));
  await page.goto(`${URL_BASE}#/bin`);
  await page.getByTestId('bin-topics').waitFor();
  await page.getByRole('button', { name: 'Restore Cells' }).click();
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('link', { name: /Biology/ }).first().click();
  await page.getByRole('heading', { name: 'Cells', level: 4 }).waitFor();
});

test('archiving a course keeps it whole and reachable, and it comes back', async () => {
  await page.getByRole('button', { name: 'Archive course' }).click();
  await page.getByTestId('archived-courses').waitFor();
  const archived = page.getByTestId('archived-courses');
  assert.match(await archived.innerText(), /Biology/);
  // It is still reachable and its topic is still inside.
  await archived.getByRole('link', { name: 'Biology' }).click();
  await page.getByRole('heading', { name: 'Cells', level: 4 }).waitFor();
  await page.getByRole('button', { name: 'Put back in use' }).click();
  await page.goto(`${URL_BASE}#/courses`);
  // Wait for the list itself to be on screen first: checking for an absent section while the page
  // is still loading passes for the wrong reason.
  await page.getByRole('link', { name: /Biology/ }).first().waitFor();
  assert.equal(await page.getByTestId('archived-courses').count(), 0, 'it is back in use');
});

test('a course in the bin is restorable, and only "remove for good" ends it', async () => {
  await page.getByRole('link', { name: /Biology/ }).first().click();
  await page.getByRole('button', { name: 'Move to bin' }).click();
  await page.getByRole('heading', { name: 'Courses', level: 1 }).waitFor();
  await page.goto(`${URL_BASE}#/bin`);
  await page.getByTestId('bin-courses').waitFor();
  await page.getByRole('button', { name: 'Restore Biology' }).click();
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('link', { name: /Biology/ }).first().waitFor();

  // Now really end it.
  await page.getByRole('link', { name: /Biology/ }).first().click();
  await page.getByRole('button', { name: 'Move to bin' }).click();
  await page.goto(`${URL_BASE}#/bin`);
  await page.getByRole('button', { name: 'Remove Biology for good' }).click();
  await page.getByRole('button', { name: 'Remove for good' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('The bin is empty'));
  await page.goto(`${URL_BASE}#/courses`);
  assert.equal(await page.getByRole('link', { name: /Biology/ }).count(), 0, 'the course is gone for good');
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
