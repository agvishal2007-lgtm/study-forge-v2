// One resource, many places. Nothing is copied, and taking it out of one place keeps it everywhere else.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = 4205;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let work;
const pageErrors = [];

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-resources-'));
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

const makeCourse = async (name) => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByLabel('Course name').fill(name);
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name, level: 1 }).waitFor();
};

const openCourse = async (name) => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('link', { name: new RegExp(name) }).first().click();
  await page.getByRole('heading', { name, level: 1 }).waitFor();
};

test('two courses and a shared reading', async () => {
  await makeCourse('Accounting');
  await makeCourse('Economics');
  await openCourse('Accounting');
  const details = page.locator('details.link-adder');
  if (!(await details.evaluate((element) => element.open))) await details.locator('summary').click();
  await page.getByTestId('save-link').getByLabel('Web address').fill('https://www.jstor.org/stable/555');
  await page.getByTestId('save-link').getByLabel('Name it (optional)').fill('Shared reading');
  await page.getByRole('button', { name: 'Save link' }).click();
  await page.getByRole('status').waitFor();
  await page.reload();
  await page.getByRole('link', { name: 'Shared reading' }).waitFor();
});

test('the same resource can be added to a second course without copying it', async () => {
  await page.getByRole('link', { name: 'Shared reading' }).click();
  await page.getByTestId('also-in').waitFor();
  assert.match(await page.getByTestId('also-in').innerText(), /Only where it is filed above/);
  await page.getByLabel('Add it to').selectOption({ label: 'Economics' });
  await page.getByLabel('Topic (optional)').selectOption('__course__');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="also-in"]');
    return el && el.innerText.includes('Economics');
  });

  // It is in both courses now, and there is still only one of it in the Library.
  await openCourse('Economics');
  await page.getByRole('link', { name: 'Shared reading' }).waitFor();
  await openCourse('Accounting');
  await page.getByRole('link', { name: 'Shared reading' }).waitFor();
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'Shared reading' }).waitFor();
  assert.equal(await page.locator('.files li', { hasText: 'Shared reading' }).count(), 1, 'one record, not a copy');
});

test('taking it out of one course keeps it in the other, and never deletes it', async () => {
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'Shared reading' }).click();
  await page.getByRole('button', { name: 'Take it out of Economics' }).click();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="also-in"]');
    return el && el.innerText.includes('Only where it is filed above');
  });

  await openCourse('Economics');
  await page.getByRole('heading', { name: 'Topics' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Shared reading' }).count(), 0, 'gone from the second course');
  await openCourse('Accounting');
  await page.getByRole('link', { name: 'Shared reading' }).waitFor();
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'Shared reading' }).waitFor();
  assert.equal(await page.locator('.files li', { hasText: 'Shared reading' }).count(), 1, 'the resource itself survived');
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
