// Prompt 6: reading inside Study Forge, notes beside a file, acting on many things at once,
// reading preferences, and recent activity.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4219;
const URL_BASE = `http://localhost:${PORT}/`;
const FIXTURES = path.join(__dirname, 'fixtures');
let server;
let browser;
let context;
let page;
const pageErrors = [];

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await returningStudent(context);
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await browser?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
});

const upload = async (files) => {
  await page.goto(`${URL_BASE}#/library`);
  await page.getByTestId('file-input').first().setInputFiles(files);
  for (const file of files) await page.getByRole('link', { name: typeof file === 'string' ? path.basename(file) : file.name }).waitFor();
  // The saving card sits over the corner of the page until it is cleared.
  await page.getByRole('button', { name: 'Clear finished' }).click().catch(() => {});
};
const open = async (name) => {
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name }).first().click();
  await page.locator('.stage').waitFor();
};

/* ---- Viewers ---- */

test('OpenDocument, EPUB and code files open inside, as reading views', async () => {
  await upload(['chapter.odt', 'grades.ods', 'slides.odp', 'reader.epub', 'biology.py'].map((name) => path.join(FIXTURES, name)));

  await open('chapter.odt');
  await page.locator('.doc-view').getByText('Cells are the basic unit of life.').waitFor();
  await page.locator('.doc-view').getByRole('heading', { name: 'Chapter 1: The Cell' }).waitFor();
  // It says what it is, rather than pretending to be the original layout.
  await page.getByText(/A reading view/).waitFor();

  await open('grades.ods');
  await page.locator('.sheet').getByText('Quiz 1').waitFor();
  await page.getByRole('button', { name: 'Schedule' }).click();
  await page.locator('.sheet').getByText('Membranes').waitFor();

  await open('slides.odp');
  // LibreOffice stores the space in this name as _20_; the student sees the real title.
  await page.locator('.slide-card').getByRole('heading', { name: 'Intro to Cells' }).waitFor();

  await open('biology.py');
  await page.locator('.text-view').getByText('Split one cell into two.', { exact: false }).waitFor();
});

test('a book opens chapter by chapter and remembers where the student got to', async () => {
  await open('reader.epub');
  await page.locator('.chapter-bar').waitFor();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('.doc-view').getByText('Cells are the basic unit of life.').waitFor();
  const at = await page.locator('.chapter-bar select').inputValue();
  await page.reload();
  await page.locator('.chapter-bar').waitFor();
  assert.equal(await page.locator('.chapter-bar select').inputValue(), at, 'the chapter was not kept');
});

test('nothing inside a document is ever put on the page as markup', async () => {
  // A document whose text looks like a script must show as words, not run.
  const content = '<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:p>&lt;img src=x onerror="window.ranScript=1"&gt;</text:p></office:text></office:body></office:document-content>';
  const { downloadZip } = await import('client-zip');
  const zip = Buffer.from(await downloadZip([{ name: 'mimetype', input: 'application/vnd.oasis.opendocument.text' }, { name: 'content.xml', input: content }]).arrayBuffer());
  await upload([{ name: 'tricky.odt', mimeType: 'application/vnd.oasis.opendocument.text', buffer: zip }]);
  await open('tricky.odt');
  await page.locator('.doc-view').getByText('onerror', { exact: false }).waitFor();
  assert.equal(await page.locator('.doc-view img').count(), 0);
  assert.equal(await page.evaluate(() => window.ranScript), undefined);
});

test('search reads inside the new formats', async () => {
  await page.goto(`${URL_BASE}#/search`);
  await page.getByRole('searchbox').first().fill('phospholipid');
  for (const name of ['chapter.odt', 'slides.odp', 'reader.epub']) await page.locator('#content').getByText(name).first().waitFor();
});

/* ---- Notes beside a file ---- */

test('a note can be written beside the file, and the pair survives a reload', async () => {
  await open('chapter.odt');
  await page.getByRole('button', { name: 'Write notes beside this' }).click();
  const beside = page.getByRole('complementary', { name: 'Notes beside this file' });
  await beside.getByLabel('Title').fill('Cell notes');
  await beside.getByLabel('Your note').fill('Nucleus holds DNA.');
  await beside.getByTestId('save-status').filter({ hasText: /^Saved$/ }).waitFor();
  // The file is still on screen beside it.
  await page.locator('.stage .doc-view').waitFor();
  await page.reload();
  await beside.getByLabel('Title').waitFor();
  assert.equal(await beside.getByLabel('Title').inputValue(), 'Cell notes');
  assert.equal(await beside.getByLabel('Your note').inputValue(), 'Nucleus holds DNA.');
});

test('on a phone the file and the note take turns, and each keeps its place', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  const beside = page.getByRole('complementary', { name: 'Notes beside this file' });
  assert.equal(await page.locator('.stage').isVisible(), true);
  assert.equal(await beside.isVisible(), false);
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  assert.equal(await beside.isVisible(), true);
  assert.equal(await page.locator('.stage').isVisible(), false);
  assert.equal(await beside.getByLabel('Your note').inputValue(), 'Nucleus holds DNA.');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  await page.setViewportSize({ width: 1280, height: 900 });
});

/* ---- Many at once ---- */

test('several files can be pinned and moved at once, and pinned ones lead', async () => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByLabel('Course name').fill('Biology');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Biology', level: 1 }).waitFor();
  await page.goto(`${URL_BASE}#/library`);
  await page.getByLabel('Select grades.ods').check();
  await page.getByLabel('Select slides.odp').check();
  await page.getByText('2 selected').waitFor();
  await page.getByRole('button', { name: 'Pin', exact: true }).click();
  await page.locator('.notice').getByText('Pinned 2 items.').waitFor();
  const first = await page.locator('.files li .row-main a').allInnerTexts();
  assert.deepEqual(first.slice(0, 2).map((name) => name.startsWith('Pinned')), [true, true]);

  await page.getByLabel('Select biology.py').check();
  await page.getByLabel('Move to course').selectOption({ label: 'Biology' });
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await page.locator('.notice').getByText('Moved 1 item to Biology.').waitFor();
});

test('select all means only what the search shows, and says so', async () => {
  await page.getByLabel('Find a file or link').fill('.od');
  await page.getByText('Select all 4 matching your search').waitFor();
  await page.locator('.bulk-all input').check();
  await page.getByText('All 4 matching your search selected').waitFor();
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByLabel('Find a file or link').fill('');
});

test('binning many asks first, names them, and one Undo brings them all back', async () => {
  const before = await page.locator('.files li').count();
  await page.locator('.bulk-all input').check();
  await page.getByRole('button', { name: 'Move to Trash' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('chapter.odt').waitFor();
  await dialog.getByRole('button', { name: `Move ${before} to Trash` }).click();
  await page.waitForFunction(() => document.querySelectorAll('.files li').length === 0);
  await page.locator('.undo-bar').getByText(`Moved ${before} items to Trash.`).waitFor();
  await page.locator('.undo-bar').getByRole('button', { name: 'Undo' }).click();
  await page.waitForFunction((count) => document.querySelectorAll('.files li').length === count, before);
  // The pins came back with them.
  assert.equal((await page.locator('.files li .row-main a').allInnerTexts()).filter((name) => name.startsWith('Pinned')).length, 2);
});

test('putting away keeps files whole and gives a way back', async () => {
  await page.getByLabel('Select reader.epub').check();
  await page.getByRole('button', { name: 'Put away' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Put away 1' }).click();
  await page.getByText('Put away (1)').click();
  await page.getByRole('button', { name: 'Put back reader.epub' }).click();
  await page.getByRole('link', { name: 'reader.epub' }).waitFor();
});

/* ---- Reading preferences and recent activity ---- */

test('text size, motion and spacing are remembered without being asked twice', async () => {
  await page.goto(`${URL_BASE}#/settings`);
  await page.getByRole('radio', { name: 'Larger' }).check({ force: true });
  await page.getByRole('radio', { name: 'Reduce motion' }).check({ force: true });
  await page.getByRole('radio', { name: 'Compact' }).check({ force: true });
  await page.reload();
  await page.getByRole('heading', { name: 'Settings', level: 1 }).waitFor();
  const root = await page.evaluate(() => ({ ...document.documentElement.dataset, size: getComputedStyle(document.documentElement).fontSize }));
  assert.equal(root.text, 'larger');
  assert.equal(root.motion, 'reduce');
  assert.equal(root.density, 'compact');
  assert.equal(root.size, '20px');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.button')).transitionDuration), '0s');
  await page.getByRole('radio', { name: 'Standard' }).check({ force: true });
  await page.getByRole('radio', { name: 'Follow my device' }).check({ force: true });
  await page.getByRole('radio', { name: 'Comfortable' }).check({ force: true });
});

test('recent activity shows what changed and what was put back, from the same records Undo keeps', async () => {
  await page.goto(`${URL_BASE}#/`);
  const activity = page.getByTestId('recent-activity');
  await activity.getByText(/^Undone: moved \d+ items to Trash$/).waitFor();
  await activity.getByText('Pinned 2 items').waitFor();
  await page.reload();
  await activity.getByText('Pinned 2 items').waitFor();
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
