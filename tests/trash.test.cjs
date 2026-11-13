// Trash: one place, apart from Courses, for everything deleted anywhere in Study Forge.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const URL_BASE = 'http://localhost:4231/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-trash-'));
let server;
let browser;
let context;
let page;
const pageErrors = [];

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4231', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await returningStudent(context);
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
});

after(async () => {
  await context?.close();
  await browser?.close();
  try { if (server) process.kill(-server.pid); } catch { /* stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

const row = (name) => page.getByTestId('trash-row').filter({ hasText: name });
const openTrash = async () => { await page.goto(`${URL_BASE}#/trash`); await page.getByRole('heading', { name: 'Trash', level: 1 }).waitFor(); };

test('Trash is its own section, not part of Courses, and the old address still leads there', async () => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('heading', { name: 'Courses', level: 1 }).waitFor();
  assert.equal(await page.locator('main').getByText(/bin/i).count(), 0, 'nothing about a bin on Courses');
  const link = page.getByTestId('nav-trash');
  assert.equal(await link.innerText(), 'Trash');
  assert.ok(await link.locator('svg').count(), 'it has an icon');
  await link.click();
  await page.getByTestId('trash-empty').waitFor();
  await page.goto(`${URL_BASE}#/bin`);
  await page.getByRole('heading', { name: 'Trash', level: 1 }).waitFor();
  assert.match(page.url(), /#\/trash$/);
  // On a phone the bottom bar stays short; Trash is reached from Settings (and the account menu when signed in).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${URL_BASE}#/settings`);
  assert.equal(await page.getByTestId('nav-trash').isVisible(), false);
  await page.getByRole('link', { name: 'Open Trash' }).click();
  await page.getByRole('heading', { name: 'Trash', level: 1 }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('a note, a deck with its cards, a planner item, a practice set and a lesson all go to the same Trash and come back whole', async () => {
  // A course with a note in it.
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByLabel('Course name').first().fill('Chemistry');
  await page.getByRole('button', { name: 'Create course' }).first().click();
  await page.goto(`${URL_BASE}#/notes`);
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Title').fill('Moles and molarity');
  await page.locator('textarea.note-body').fill('One mole is 6.022 x 10^23 things.');
  await page.getByLabel('Course').selectOption({ label: 'Chemistry' });
  await page.getByTestId('note-done').click();
  await page.locator('main').getByRole('link', { name: /Moles and molarity/ }).first().click();
  await page.getByRole('button', { name: 'Delete note' }).click();
  await page.getByRole('dialog').getByText('It goes to Trash').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete note' }).click();
  // A deck with two cards.
  await page.goto(`${URL_BASE}#/cards`);
  await page.getByLabel('New deck').fill('Elements');
  await page.getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('heading', { name: 'Elements' }).waitFor();
  for (const [front, back] of [['H', 'Hydrogen'], ['He', 'Helium']]) {
    await page.getByLabel('Front', { exact: true }).fill(front);
    await page.getByLabel('Back', { exact: true }).fill(back);
    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByTestId('card-row').filter({ hasText: back }).waitFor();
  }
  await page.getByRole('button', { name: 'Delete deck' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete deck' }).click();
  await page.getByRole('heading', { name: 'Flashcards', level: 1 }).waitFor();
  // A planner item.
  await page.goto(`${URL_BASE}#/planner/new`);
  await page.getByLabel('Name', { exact: true }).fill('Lab report');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('link', { name: 'Lab report' }).click();
  await page.getByRole('button', { name: 'Delete item' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete item' }).click();
  await page.getByRole('heading', { name: 'Planner', level: 1 }).waitFor();

  // A practice set and the sample lesson.
  await page.goto(`${URL_BASE}#/practice`);
  await page.getByLabel('New practice set').fill('Stoichiometry');
  await page.getByRole('button', { name: 'Create set' }).click();
  await page.getByRole('heading', { name: 'Stoichiometry' }).waitFor();
  await page.getByRole('button', { name: 'Delete set' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete set' }).click();
  await page.getByRole('heading', { name: 'Practice', level: 1 }).waitFor();
  await page.goto(`${URL_BASE}#/study`);
  await page.getByRole('button', { name: 'Add sample lesson' }).click();
  const lessonTitle = 'Lesson 1: How accounting keeps score';
  await page.getByRole('button', { name: 'Delete lesson' }).waitFor();
  const steps = await page.getByRole('button', { name: /^Delete (?!lesson)/ }).count();
  await page.getByRole('button', { name: 'Delete lesson' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete lesson' }).click();
  await page.getByRole('heading', { name: 'Study', exact: true }).waitFor();

  await openTrash();
  await row('Moles and molarity').getByText('Note · from Chemistry').waitFor();
  await row('Elements').getByText('Flashcard deck · from Flashcards').waitFor();
  await row('Lab report').getByText('Planner item · from Planner').waitFor();
  assert.match(await row('Elements').innerText(), /deleted \w{3} \d+, \d{4}/, 'shows when it was deleted');
  // Filter and search.
  await page.getByTestId('trash-filter').selectOption('deck');
  assert.equal(await page.getByTestId('trash-row').count(), 1);
  await page.getByTestId('trash-filter').selectOption('all');
  await page.getByLabel('Search Trash').fill('molar');
  assert.equal(await page.getByTestId('trash-row').count(), 1);
  await page.getByLabel('Search Trash').fill('');

  // Restore puts each back where it was, with everything that belonged to it.
  await page.getByRole('button', { name: 'Restore Elements' }).click();
  await page.getByTestId('trash-message').filter({ hasText: 'Restored “Elements”.' }).waitFor();
  await page.getByRole('button', { name: 'Restore Moles and molarity' }).click();
  await page.getByRole('button', { name: 'Restore Lab report' }).click();
  await row('Stoichiometry').getByText('Practice set · from Practice').waitFor();
  await page.getByRole('button', { name: 'Restore Stoichiometry' }).click();
  await row(lessonTitle).getByText('Lesson · from Sample: Accounting Basics').waitFor();
  await page.getByRole('button', { name: `Restore ${lessonTitle}` }).click();
  await page.getByTestId('trash-empty').waitFor();
  await page.goto(`${URL_BASE}#/practice`);
  await page.getByRole('link', { name: /Stoichiometry/ }).first().waitFor();
  await page.goto(`${URL_BASE}#/study`);
  await page.getByRole('link', { name: lessonTitle }).first().click();
  await page.getByRole('button', { name: 'Delete lesson' }).waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.getByRole('button', { name: /^Delete (?!lesson)/ }).count(), steps, 'every step of the lesson came back');
  await page.goto(`${URL_BASE}#/cards`);
  await page.getByRole('link', { name: /Elements/ }).first().click();
  await page.getByTestId('card-row').filter({ hasText: 'Helium' }).waitFor();
  assert.equal(await page.getByTestId('card-row').count(), 2, 'both cards came back, once each');
  await page.goto(`${URL_BASE}#/notes`);
  await page.locator('main').getByRole('link', { name: /Moles and molarity/ }).first().click();
  assert.equal(await page.locator('textarea.note-body').inputValue(), 'One mole is 6.022 x 10^23 things.');
  await page.goto(`${URL_BASE}#/planner`);
  await page.getByRole('link', { name: 'Lab report' }).waitFor();
});

test('restoring something whose course was permanently deleted brings it back without a course, never pointing at nothing', async () => {
  await page.goto(`${URL_BASE}#/notes`);
  await page.locator('main').getByRole('link', { name: /Moles and molarity/ }).first().click();
  await page.getByRole('button', { name: 'Delete note' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete note' }).click();
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('link', { name: /Chemistry/ }).first().click();
  await page.getByRole('button', { name: 'Move to Trash' }).first().click();
  await page.getByRole('heading', { name: 'Courses', level: 1 }).waitFor();
  await openTrash();
  await row('Chemistry').getByText('Course · from Courses').waitFor();
  await page.getByRole('button', { name: 'Permanently delete Chemistry' }).click();
  await page.getByRole('dialog').getByText('any flashcards stay').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Permanently delete' }).click();
  await page.getByRole('button', { name: 'Restore Moles and molarity' }).click();
  await page.getByTestId('trash-message').filter({ hasText: 'came back without a course' }).waitFor();
  await page.goto(`${URL_BASE}#/notes`);
  await page.locator('main').getByRole('link', { name: /Moles and molarity/ }).first().waitFor();
});

test('permanent deletion and Empty Trash always ask first, and Cancel keeps everything', async () => {
  await page.goto(`${URL_BASE}#/planner`);
  await page.getByRole('link', { name: 'Lab report' }).click();
  await page.getByRole('button', { name: 'Delete item' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete item' }).click();
  await page.goto(`${URL_BASE}#/cards`);
  await page.getByRole('link', { name: /Elements/ }).first().click();
  await page.getByRole('button', { name: 'Delete deck' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete deck' }).click();
  await openTrash();
  await page.getByRole('button', { name: 'Permanently delete Lab report' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await row('Lab report').waitFor();
  await page.getByRole('button', { name: 'Empty Trash' }).click();
  await page.getByRole('dialog').getByText('Permanently delete all 2 items in Trash?').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.getByTestId('trash-row').count(), 2);
  await page.getByRole('button', { name: 'Empty Trash' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Empty Trash' }).click();
  await page.getByTestId('trash-empty').waitFor();
  await page.goto(`${URL_BASE}#/cards`);
  assert.equal(await page.getByRole('link', { name: /Elements/ }).count(), 0, 'gone for good');
  // Nothing left behind: no cards of the deleted deck remain anywhere.
  const leftovers = await page.evaluate(async () => {
    const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n.startsWith('study-forge'));
    return new Promise((done) => { const r = indexedDB.open(name); r.onsuccess = () => { const q = r.result.transaction('cards').objectStore('cards').getAll(); q.onsuccess = () => done(q.result.filter((c) => c.back === 'Helium').length); }; });
  });
  assert.equal(leftovers, 0);
  assert.deepEqual(pageErrors, []);
});
