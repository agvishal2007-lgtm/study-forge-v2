// Note formatting and search rules, then both in a real browser.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const format = () => import('../src/data/noteFormat.ts');
const search = () => import('../src/data/searchRules.ts');

test('notes read their marks, and plain notes stay as they are', async () => {
  const { parseNote, parseInline } = await format();
  assert.deepEqual(parseInline('a **b** *c*'), [{ text: 'a ' }, { text: 'b', bold: true }, { text: ' ' }, { text: 'c', italic: true }]);
  assert.deepEqual(parseInline('2 * 3 * 4'), [{ text: '2 * 3 * 4' }], 'a math star is not formatting');
  assert.deepEqual(parseInline('5*x and y*'), [{ text: '5' }, { text: 'x and y', italic: true }]);
  const blocks = parseNote('# Title\n## Sub\ntext\nmore\n\n- a\n- b\n1. one\n2. two\n- [ ] todo\n- [x] done');
  assert.deepEqual(blocks.map((block) => block.type), ['heading', 'heading', 'paragraph', 'bullets', 'numbers', 'checks']);
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[2].lines.length, 2);
  assert.equal(blocks[3].items.length, 2);
  assert.deepEqual(blocks[5].items.map((item) => item.done), [false, true]);
  assert.deepEqual(parseNote('#hashtag'), [{ type: 'paragraph', lines: [[{ text: '#hashtag' }]] }]);
  assert.deepEqual(parseNote(''), []);
  assert.equal(JSON.stringify(parseNote('<script>alert(1)</script>')).includes('<script>'), true, 'it stays as words');
});

test('toolbar edits wrap and unwrap the selection', async () => {
  const { formatEdit, applyEdit } = await format();
  const run = (text, start, end, kind) => applyEdit(text, formatEdit(text, start, end, kind));
  assert.equal(run('hello world', 6, 11, 'bold'), 'hello **world**');
  assert.equal(run('hello **world**', 8, 13, 'bold'), 'hello world', 'pressing again takes it off');
  assert.equal(run('hello world', 0, 5, 'italic'), '*hello* world');
  assert.equal(run('hi', 2, 2, 'bold'), 'hi****');
  assert.equal(run('one\ntwo', 0, 7, 'bullet'), '- one\n- two');
  assert.equal(run('- one\n- two', 0, 11, 'bullet'), 'one\ntwo');
  assert.equal(run('one\ntwo', 0, 7, 'number'), '1. one\n2. two');
  assert.equal(run('one', 1, 1, 'check'), '- [ ] one');
  assert.equal(run('first\nsecond', 7, 7, 'heading'), 'first\n## second', 'only the current line changes');
  assert.equal(run('- one', 2, 2, 'number'), '1. one', 'it switches list types');
});

test('search needs every word, ignoring capitals and accents', async () => {
  const { matches, searchTerms, highlight, snippet, runSearch } = await search();
  assert.deepEqual(searchTerms('  Café  cafe  '), ['cafe']);
  assert.equal(matches('The CAFÉ menu', ['cafe', 'menu']), true);
  assert.equal(matches('The cafe', ['cafe', 'menu']), false);
  assert.equal(matches('anything', []), false);
  assert.deepEqual(highlight('A Café', ['cafe']), [{ text: 'A ', match: false }, { text: 'Café', match: true }]);
  assert.match(snippet(`${'x '.repeat(200)}needle ${'y '.repeat(200)}`, ['needle']), /^….*needle.*…$/);
  assert.equal(snippet('  short   text ', ['short']), 'short text');
  const results = runSearch([
    { group: 'Files', title: 'Other', body: 'cell biology', to: '/a' },
    { group: 'Notes', title: 'Plain', body: 'about cell walls', to: '/b' },
    { group: 'Notes', title: 'Cell notes', body: '', to: '/c' },
    { group: 'Planner', title: 'Nothing here', body: '', to: '/d' },
  ], 'cell');
  assert.deepEqual(results.map((entry) => entry.group), ['Notes', 'Files']);
  assert.deepEqual(results[0].hits.map((hit) => hit.to), ['/c', '/b'], 'title matches come first');
  assert.deepEqual(runSearch([{ group: 'Notes', title: 'a', body: '', to: '/' }], '   '), []);
});

const URL_BASE = 'http://localhost:4188/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-search-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
let server;
let context;
let page;
const pageErrors = [];
const nav = (name) => page.locator('.nav-links').getByRole('link', { name, exact: true }).click();
const body = () => page.locator('textarea.note-body');
const searchFor = async (words) => {
  await page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: 'Search' }).click();
  await page.getByLabel('Search everything').fill(words);
};

before(async () => {
  execFileSync('python3', [path.join(__dirname, 'makeOfficeFiles.py'), work]);
  server = spawn('npx', ['vite', 'preview', '--port', '4188', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  context = await chromium.launchPersistentContext(path.join(work, 'profile'), { viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
  await page.getByLabel('Course name').waitFor();
});

after(async () => {
  await context?.close().catch(() => undefined);
  try { if (server) process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('a note can be formatted with the toolbar and keys, and it saves', async () => {
  await nav('Notes');
  await page.getByRole('button', { name: 'New note' }).first().click();
  await page.getByLabel('Title').fill('Biology review');
  await body().fill('Mitochondria notes');
  await body().evaluate((box) => box.setSelectionRange(0, 12));
  await page.getByRole('button', { name: 'Bold' }).click();
  assert.equal(await body().inputValue(), '**Mitochondria** notes');
  await page.keyboard.press('ControlOrMeta+z');
  assert.equal(await body().inputValue(), 'Mitochondria notes', 'Undo works');
  await page.getByRole('button', { name: 'Bold' }).click();
  await body().evaluate((box) => box.setSelectionRange(box.value.length, box.value.length));
  await page.keyboard.type('\nline one\nline two');
  await body().evaluate((box) => { const at = box.value.indexOf('line one'); box.setSelectionRange(at, box.value.length); });
  await page.getByRole('button', { name: 'Bullet list' }).click();
  await body().evaluate((box) => box.setSelectionRange(box.value.length, box.value.length));
  await page.keyboard.type('\n\nword');
  await body().evaluate((box) => box.setSelectionRange(box.value.length - 4, box.value.length));
  await page.keyboard.press('ControlOrMeta+i');
  assert.match(await body().inputValue(), /\*\*Mitochondria\*\* notes\n- line one\n- line two\n\n\*word\*$/);
  await body().evaluate((box) => box.setSelectionRange(box.value.length, box.value.length));
  await page.keyboard.type('\n<img src=x onerror=window.__hacked=1>');
  await page.getByTestId('save-status').getByText(/saved/i).waitFor();
  await page.screenshot({ path: path.join(shots, 'note-write.png') });
});

test('Preview shows the formatting, and nothing in a note can run', async () => {
  await page.getByRole('button', { name: 'Preview' }).click();
  const view = page.getByTestId('note-view');
  assert.equal(await view.locator('strong').innerText(), 'Mitochondria');
  assert.equal(await view.locator('em').innerText(), 'word');
  assert.equal(await view.locator('ul li').count(), 2);
  await view.getByText('<img src=x onerror=window.__hacked=1>').waitFor();
  assert.equal(await view.locator('img').count(), 0);
  assert.equal(await page.evaluate(() => window.__hacked), undefined);
  assert.equal(await body().isVisible(), false);
  await page.screenshot({ path: path.join(shots, 'note-preview.png') });
  await page.getByRole('button', { name: 'Write' }).click();
  assert.equal(await body().isVisible(), true);
  await page.reload();
  assert.match(await body().inputValue(), /\*\*Mitochondria\*\*/, 'it was saved');
});

test('search finds notes, flashcards, practice, and the planner, and highlights the words', async () => {
  await nav('Flashcards');
  await page.getByLabel('New deck').fill('Cell parts');
  await page.getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('heading', { name: 'Cell parts' }).waitFor();
  await page.getByLabel('Front', { exact: true }).fill('What powers the cell?');
  await page.getByLabel('Back', { exact: true }).fill('The Mitochondria');
  await page.getByRole('button', { name: 'Add card' }).click();
  await page.getByTestId('card-row').waitFor();
  await nav('Planner');
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Mitochondria quiz');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('link', { name: 'Mitochondria quiz' }).waitFor();
  await nav('Practice');
  await page.getByLabel('New practice set').fill('Biology set');
  await page.getByRole('button', { name: 'Create set' }).click();
  await page.getByRole('heading', { name: 'Biology set' }).waitFor();
  await page.getByLabel('Question', { exact: true }).fill('Name the powerhouse');
  await page.getByLabel('Answer choices').fill('Mitochondria\nNucleus');
  await page.getByLabel('Correct answer').selectOption({ label: 'Mitochondria' });
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByTestId('question-row').waitFor();

  await searchFor('mitochondria');
  await page.getByTestId('search-Notes').getByRole('link', { name: 'Biology review' }).waitFor();
  await page.getByTestId('search-Flashcards').getByRole('link', { name: 'What powers the cell?' }).waitFor();
  await page.getByTestId('search-Planner').getByRole('link', { name: 'Mitochondria quiz' }).waitFor();
  await page.getByTestId('search-Practice').getByRole('link', { name: 'Name the powerhouse' }).waitFor();
  assert.ok((await page.locator('mark').count()) >= 3);
  await page.screenshot({ path: path.join(shots, 'search-results.png') });
  await page.getByLabel('Search everything').fill('zzzznothing');
  await page.getByTestId('search-empty').waitFor();
  await page.getByLabel('Search everything').fill('quiz MITOCHONDRIA');
  await page.getByTestId('search-Planner').waitFor();
  assert.equal(await page.getByTestId('search-Notes').count(), 0, 'every word has to match');
  await page.waitForTimeout(400);
  await page.reload();
  assert.equal(await page.getByLabel('Search everything').inputValue(), 'quiz MITOCHONDRIA', 'the search stays through a reload');
  await page.getByTestId('search-Planner').getByRole('link', { name: 'Mitochondria quiz' }).click();
  await page.getByRole('heading', { name: 'Edit item' }).waitFor();
});

test('search reads inside PDFs, Word, Excel, and PowerPoint, and opens the right PDF page', async () => {
  await nav('Library');
  const input = page.getByTestId('file-input');
  await input.setInputFiles(['biology.pdf', 'scanned.pdf', 'notes.docx', 'grades.xlsx', 'lecture.pptx'].map((name) => path.join(work, name)));
  await page.getByRole('link', { name: 'lecture.pptx', exact: true }).waitFor();
  await searchFor('photosynthesis');
  const files = page.getByTestId('search-Files');
  await files.getByText('Page 2').waitFor({ timeout: 30000 });
  await files.locator('mark').first().waitFor();
  await page.getByTestId('search-scanned').getByText('1 PDF has no readable words').waitFor();
  for (const [word, name] of [['accruals', 'notes.docx'], ['dana', 'grades.xlsx'], ['out loud', 'lecture.pptx']]) {
    await page.getByLabel('Search everything').fill(word);
    await page.getByTestId('search-Files').getByRole('link', { name }).first().waitFor();
  }
  await page.getByLabel('Search everything').fill('scanned');
  await page.getByTestId('search-Files').getByRole('link', { name: 'scanned.pdf' }).waitFor();
  await page.getByLabel('Search everything').fill('respiration energy');
  await page.getByTestId('search-Files').getByText('Page 3').waitFor();
  await page.getByTestId('search-Files').getByRole('link', { name: 'biology.pdf' }).click();
  await page.locator('canvas[data-rendered-page="3"]').waitFor({ state: 'attached' });
});

test('deleting a file removes it from search', async () => {
  await searchFor('photosynthesis');
  await page.getByTestId('search-Files').getByRole('link', { name: 'biology.pdf' }).click();
  await page.getByRole('button', { name: 'Delete file' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete file' }).click();
  await page.getByRole('heading', { name: 'Library' }).waitFor();
  await searchFor('photosynthesis');
  await page.getByTestId('search-empty').waitFor();
});

test('it fits a phone, and the top bar keeps every control', async () => {
  await page.setViewportSize({ width: 360, height: 700 });
  const overflow = () => page.evaluate(() => {
    const main = document.querySelector('main');
    return Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth);
  });
  await page.getByLabel('Search everything').fill('mitochondria');
  await page.getByTestId('search-Notes').waitFor();
  assert.ok((await overflow()) <= 0);
  await page.screenshot({ path: path.join(shots, 'phone-search.png') });
  for (const name of ['Search', 'Settings', 'Sign in', 'Sign up']) {
    const box = await page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name, exact: true }).boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 360 && box.y < 60, `${name} is in the top row`);
  }
  await page.getByTestId('search-Notes').getByRole('link', { name: 'Biology review' }).click();
  await body().waitFor();
  assert.ok((await overflow()) <= 0);
  await page.screenshot({ path: path.join(shots, 'phone-note.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
