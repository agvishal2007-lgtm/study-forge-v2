// The five shared work statuses, and proof that they stay readable — measured, not assumed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const rules = () => import('../src/data/statusRules.ts');

test('finished work is never called overdue, and a passed deadline outranks progress', async () => {
  const { workStatus } = await rules();
  const today = '2026-11-11';
  assert.equal(workStatus({ status: 'Completed', dueDate: '2026-01-01' }, today), 'done', 'done beats overdue');
  assert.equal(workStatus({ status: 'Submitted', dueDate: '2026-01-01' }, today), 'done');
  assert.equal(workStatus({ status: 'In Progress', dueDate: '2026-11-01' }, today), 'overdue', 'urgency beats progress');
  assert.equal(workStatus({ status: 'Not Started', dueDate: '2026-11-12' }, today), 'soon');
  assert.equal(workStatus({ status: 'Not Started', dueDate: '2026-11-11' }, today), 'soon', 'today is due soon');
  assert.equal(workStatus({ status: 'In Progress', dueDate: '2026-12-25' }, today), 'doing');
  assert.equal(workStatus({ status: 'Not Started', dueDate: '2026-12-25' }, today), 'todo');
  assert.equal(workStatus({ status: 'Not Started', dueDate: '' }, today), 'todo', 'no due date is not urgent');
});

test('the contrast maths matches the WCAG definition', async () => {
  const { contrastRatio } = await rules();
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(Math.round(contrastRatio('#ffffff', '#ffffff')), 1);
  assert.equal(Math.round(contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')), 21);
  // A known pair: mid grey on white is about 4.6:1.
  assert.ok(Math.abs(contrastRatio('#767676', '#ffffff') - 4.54) < 0.1);
});

const PORT = 4206;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let work;
const pageErrors = [];

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-contrast-'));
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

/** Reads the real colours the stylesheet gives each status, in whichever theme is set. */
const measure = (theme) => page.evaluate((mode) => {
  document.documentElement.setAttribute('data-theme', mode);
  const grid = document.createElement('div');
  grid.className = 'month-grid';
  const cell = document.createElement('div');
  cell.className = 'month-cell';
  grid.appendChild(cell);
  document.body.appendChild(grid);
  const out = {};
  for (const status of ['overdue', 'soon', 'doing', 'todo', 'done']) {
    const chip = document.createElement('span');
    chip.className = 'month-chip';
    chip.dataset.status = status;
    chip.textContent = 'Work';
    cell.appendChild(chip);
    const tag = document.createElement('span');
    tag.className = 'status-tag';
    tag.dataset.status = status;
    tag.textContent = 'Work';
    cell.appendChild(tag);
    const chipStyle = getComputedStyle(chip);
    const tagStyle = getComputedStyle(tag);
    out[status] = {
      chipText: chipStyle.color,
      chipFill: chipStyle.backgroundColor,
      stripe: chipStyle.borderLeftColor,
      tagText: tagStyle.color,
      tagFill: tagStyle.backgroundColor,
      cell: getComputedStyle(cell).backgroundColor,
    };
    chip.remove();
    tag.remove();
  }
  grid.remove();
  return out;
}, theme);

for (const theme of ['light', 'dark']) {
  test(`every status meets WCAG AA in ${theme} mode`, async () => {
    const { contrastRatio, STATUS_LABEL } = await rules();
    const measured = await measure(theme);
    const report = [];
    for (const [status, colours] of Object.entries(measured)) {
      const text = contrastRatio(colours.chipText, colours.chipFill);
      const tag = contrastRatio(colours.tagText, colours.tagFill);
      const stripe = contrastRatio(colours.stripe, colours.cell);
      report.push(`${STATUS_LABEL[status]}: text ${text.toFixed(2)}, tag ${tag.toFixed(2)}, stripe ${stripe.toFixed(2)}`);
      assert.ok(text >= 4.5, `${status} chip text is ${text.toFixed(2)}:1, needs 4.5:1`);
      assert.ok(tag >= 4.5, `${status} tag text is ${tag.toFixed(2)}:1, needs 4.5:1`);
      assert.ok(stripe >= 3, `${status} marker is ${stripe.toFixed(2)}:1 against the day, needs 3:1`);
    }
    console.log(`  ${theme}: ${report.join(' | ')}`);
  });
}

test('a not-started marker is never invisible against the day', async () => {
  const { contrastRatio } = await rules();
  for (const theme of ['light', 'dark']) {
    const measured = await measure(theme);
    const ratio = contrastRatio(measured.todo.stripe, measured.todo.cell);
    assert.ok(ratio >= 3, `grey on ${theme} is ${ratio.toFixed(2)}:1`);
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
});

test('a real overdue deadline is shown as overdue, in words as well as colour', async () => {
  await page.goto(`${URL_BASE}#/planner`);
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Late essay');
  // Due yesterday, worked out in the browser's own time, so the deadline has really passed and
  // sits in a month the calendar can show. (It used to be January 2020, which never appears in
  // the current month, so the test leaned on whichever chip happened to be first.)
  const yesterday = await page.evaluate(() => {
    const day = new Date();
    day.setDate(day.getDate() - 1);
    const pad = (value) => String(value).padStart(2, '0');
    return { iso: `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`, otherMonth: day.getMonth() !== new Date().getMonth() };
  });
  await page.getByLabel('Due date', { exact: true }).fill(yesterday.iso);
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();

  await page.goto(`${URL_BASE}#/calendar`);
  await page.getByRole('tab', { name: 'Deadline Calendar' }).click();
  // On the first of a month, yesterday is in the month before.
  if (yesterday.otherMonth) await page.getByRole('button', { name: /Previous month/ }).first().click();
  const chip = page.locator('.month-chip', { hasText: 'Late essay' });
  await chip.waitFor();
  // In colour, and with its mark, so colour is never the only signal.
  assert.equal(await chip.getAttribute('data-status'), 'overdue');
  assert.match(await chip.innerText(), /^!/);
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
