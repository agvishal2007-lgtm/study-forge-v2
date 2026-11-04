// Notes tests, in a real browser.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const URL_BASE = 'http://localhost:4176/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-notes-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
const pdf = path.join(work, 'chapter.txt');
fs.writeFileSync(pdf, 'Chapter one text\n');
let server;
let context;
let page;
const pageErrors = [];

const nav = (name) => page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
const status = () => page.getByTestId('save-status');
const newNote = async () => {
  await page.getByRole('button', { name: /New note/ }).first().click();
  await page.locator('textarea.note-body').waitFor();
};

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4176', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  context = await chromium.launchPersistentContext(path.join(work, 'p'), { viewport: { width: 1280, height: 800 } });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await context?.close().catch(() => undefined);
  if (server) process.kill(-server.pid);
  fs.rmSync(work, { recursive: true, force: true });
});

test('a blank note leaves nothing behind', async () => {
  await nav('Notes');
  await newNote();
  await page.waitForTimeout(800);
  await nav('Notes');
  await page.getByText('No notes yet').waitFor();
});

test('a note saves itself and survives closing the browser', async () => {
  await newNote();
  await page.getByLabel('Title').fill('Accounting equation');
  await page.locator('textarea.note-body').fill('Assets = Liabilities + Equity\nLine two');
  await status().getByText('Saved').waitFor();
  await page.screenshot({ path: path.join(shots, 'note-editor.png') });
  await context.close();
  context = await chromium.launchPersistentContext(path.join(work, 'p'), { viewport: { width: 1280, height: 800 } });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
  await page.getByRole('link', { name: 'Accounting equation' }).click();
  assert.equal(await page.locator('textarea.note-body').inputValue(), 'Assets = Liabilities + Equity\nLine two');
});

test('leaving right after typing still saves', async () => {
  await page.locator('textarea.note-body').fill('Typed then left at once');
  await nav('Library');
  await page.getByRole('heading', { name: 'Library' }).waitFor();
  await nav('Notes');
  await page.getByRole('link', { name: 'Accounting equation' }).click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Typed then left at once');
});

test('reloading right after typing still saves', async () => {
  await page.locator('textarea.note-body').fill('Assets = Liabilities + Equity');
  await status().getByText('Saved').waitFor();
  await page.locator('textarea.note-body').fill('Typed then reloaded');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await status().getByText('Saved').waitFor();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Typed then reloaded');
});

test('notes can be searched by their contents', async () => {
  await nav('Notes');
  await newNote();
  await page.locator('textarea.note-body').fill('Mitochondria are the powerhouse');
  await status().getByText('Saved').waitFor();
  await nav('Notes');
  await page.getByLabel('Search your notes').fill('POWERHOUSE');
  await page.getByRole('link', { name: 'Mitochondria are the powerhouse' }).waitFor();
  assert.equal(await page.locator('.files li').count(), 1);
  await page.getByLabel('Search your notes').fill('nothing like this');
  await page.getByText('No notes match that search').waitFor();
});

test('notes file under a course, a topic, and a file', async () => {
  await nav('Courses');
  await page.getByLabel('Course name').fill('Biology');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Biology' }).waitFor();
  await page.getByLabel('New topic').fill('Cells');
  await page.getByRole('button', { name: 'Add topic' }).click();
  await page.getByRole('heading', { name: 'Cells' }).waitFor();

  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Title').fill('Course note');
  await status().getByText('Saved').waitFor();
  await page.goBack();
  await page.locator('section', { has: page.getByRole('heading', { name: 'Notes' }) }).getByRole('link', { name: 'Course note' }).waitFor();

  await page.getByRole('button', { name: 'New note for this topic' }).click();
  await page.getByLabel('Title').fill('Topic note');
  await status().getByText('Saved').waitFor();
  assert.notEqual(await page.getByLabel('Topic').inputValue(), '');
  await page.goBack();
  await page.locator('.topic').getByRole('link', { name: 'Topic note' }).waitFor();

  await page.getByTestId('file-input').first().setInputFiles(pdf);
  await page.locator('.save-panel').getByText('Saved', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Clear finished' }).click();
  await page.getByRole('link', { name: 'chapter.txt' }).click();
  await page.getByRole('heading', { name: 'Notes on this file' }).waitFor();
  await page.locator('.file-notes').getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Title').fill('Note about the file');
  await status().getByText('Saved').waitFor();
  await page.getByRole('link', { name: 'chapter.txt' }).click();
  await page.locator('.file-notes').getByRole('link', { name: 'Note about the file' }).waitFor();
  await page.screenshot({ path: path.join(shots, 'file-with-note.png') });
});

test('moving a note to another course sticks', async () => {
  await nav('Notes');
  await page.getByRole('link', { name: 'Accounting equation' }).click();
  await page.getByLabel('Course').selectOption({ label: 'Biology' });
  await status().getByText('Saved').waitFor();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('select option:checked')?.textContent === 'Biology');
});

test('edits in two tabs never silently overwrite each other', async () => {
  const url = page.url();
  const other = await context.newPage();
  await other.goto(url);
  await other.locator('textarea.note-body').fill('From the other tab');
  await other.getByTestId('save-status').getByText('Saved').waitFor();

  await page.locator('textarea.note-body').fill('From this tab');
  await page.getByTestId('note-conflict').waitFor();
  await page.screenshot({ path: path.join(shots, 'note-conflict.png') });
  assert.equal(await page.locator('textarea.note-body').inputValue(), 'From this tab', 'text stays on screen');

  await page.getByRole('button', { name: 'Use the other version' }).click();
  assert.equal(await page.locator('textarea.note-body').inputValue(), 'From the other tab');

  await other.reload();
  await other.locator('textarea.note-body').fill('Other tab again');
  await other.getByTestId('save-status').getByText('Saved').waitFor();
  await page.locator('textarea.note-body').fill('This tab wins');
  await page.getByTestId('note-conflict').waitFor();
  await page.getByRole('button', { name: "Keep what's on this screen" }).click();
  await status().getByText('Saved').waitFor();
  await other.reload();
  await other.waitForFunction(() => document.querySelector('textarea')?.value === 'This tab wins');

  // Walking away from a conflict keeps both versions.
  await other.locator('textarea.note-body').fill('Other tab final');
  await other.getByTestId('save-status').getByText('Saved').waitFor();
  await page.locator('textarea.note-body').fill('Walked away version');
  await page.getByTestId('note-conflict').waitFor();
  await nav('Notes');
  await page.getByRole('link', { name: /\(copy\)/ }).click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Walked away version');
  await other.close();
});

test('a failed save says so, keeps the text, and can be retried', async () => {
  await nav('Notes');
  await page.getByRole('link', { name: /Mitochondria/ }).click();
  await page.evaluate(() => {
    window.__put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = () => { throw new DOMException('disk trouble', 'UnknownError'); };
  });
  await page.locator('textarea.note-body').fill('Do not lose me');
  await page.getByText("This note isn't saved").waitFor();
  assert.equal(await page.locator('textarea.note-body').inputValue(), 'Do not lose me');
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.__put; });
  await page.getByRole('button', { name: 'Try saving again' }).click();
  await status().getByText('Saved').waitFor();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Do not lose me');
});

test('deleting asks first, and deleting a course or file keeps its notes', async () => {
  await page.getByRole('button', { name: 'Delete note' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.locator('textarea.note-body').inputValue(), 'Do not lose me');
  await page.getByRole('button', { name: 'Delete note' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete note' }).click();
  await page.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Topic note' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Do not lose me' }).count(), 0);

  await nav('Library');
  await page.getByRole('link', { name: 'chapter.txt' }).click();
  await page.getByRole('button', { name: 'Delete file' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete file' }).click();
  await page.getByRole('heading', { name: 'Biology' }).waitFor();
  await page.getByRole('button', { name: 'Delete course' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete course' }).click();
  await page.getByRole('heading', { name: 'Courses', exact: true }).waitFor();
  await nav('Notes');
  for (const name of ['Note about the file', 'Topic note', 'Course note']) await page.getByRole('link', { name }).waitFor();
  await page.getByRole('link', { name: 'Note about the file' }).click();
  await page.locator('textarea.note-body').waitFor();
  assert.equal(await page.getByLabel('Course').inputValue(), '');
});

test('phone layout keeps all six destinations with no sideways scrolling', async () => {
  await page.setViewportSize({ width: 360, height: 700 });
  for (const name of ['Today', 'Courses', 'Library', 'Notes', 'Record', 'Settings']) {
    await nav(name);
    await page.waitForTimeout(100);
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main');
      const nav = document.querySelector('nav');
      return Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth, nav.scrollWidth - nav.clientWidth);
    });
    assert.ok(overflow <= 0, `${name} overflows by ${overflow}px`);
  }
  await page.screenshot({ path: path.join(shots, 'phone-settings-backup.png') });
  await nav('Notes');
  await page.getByRole('button', { name: 'New note' }).click();
  await page.locator('textarea.note-body').waitFor();
  await page.screenshot({ path: path.join(shots, 'phone-note.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
