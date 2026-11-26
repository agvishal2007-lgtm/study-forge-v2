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
  page.on('pageerror', (error) => pageErrors.push(`${error.message}${error.stack ? `\n${error.stack}` : ''}`));
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

/*
 * Automatic cleanup. A student's existing Trash is the thing most easily lost here, so this starts
 * from the promise that was made before this setting existed — nothing goes until you say so — and
 * only then checks that choosing a time really works.
 */
const age = (name, days) => page.evaluate(async ({ name, days }) => {
  const dbName = (await indexedDB.databases()).map((one) => one.name).find((one) => one && one.startsWith('study-forge'));
  const db = await new Promise((done) => { const ask = indexedDB.open(dbName); ask.onsuccess = () => done(ask.result); });
  const rows = await new Promise((done) => { const ask = db.transaction('studyState').objectStore('studyState').getAll(); ask.onsuccess = () => done(ask.result); });
  const found = rows.find((row) => row.id.startsWith('trash-') && row.value && row.value.name === name);
  if (!found) return false;
  found.value.deletedAt -= days * 24 * 60 * 60 * 1000;
  await new Promise((done) => { const ask = db.transaction('studyState', 'readwrite').objectStore('studyState').put(found); ask.onsuccess = () => done(); });
  db.close();
  return true;
}, { name, days });

const trashANote = async (title) => {
  await page.goto(`${URL_BASE}#/notes`);
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Title').fill(title);
  await page.locator('textarea.note-body').fill('Something worth keeping until I say otherwise.');
  await page.getByTestId('note-done').click();
  await page.locator('main').getByRole('link', { name: new RegExp(title) }).first().click();
  await page.getByRole('button', { name: 'Delete note' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete note' }).click();
};

test('an existing Trash is never emptied by this update, and only a choice changes that', async () => {
  await trashANote('Older than a month');
  await openTrash();
  await page.getByTestId('trash-policy').getByText('Things here stay until you delete them.').waitFor();

  // Old enough for every policy there is, and still here, because nothing has been chosen.
  assert.equal(await age('Older than a month', 40), true, 'the note was found in Trash to age');
  await page.goto(URL_BASE);
  await openTrash();
  await row('Older than a month').waitFor();

  // Choosing a shorter time says exactly what would go, and Cancel really keeps it.
  await page.goto(`${URL_BASE}#/settings/account`);
  await page.getByTestId('setting-retention').getByRole('radio', { name: '7 days' }).click();
  const asking = page.getByRole('dialog');
  await asking.getByText('Older than a month').waitFor();
  await asking.getByRole('button', { name: 'Cancel' }).click();
  await openTrash();
  await row('Older than a month').waitFor();
  await page.getByTestId('trash-policy').getByText('Things here stay until you delete them.').waitFor();

  // And saying yes deletes it, on opening, which is what the wording promises.
  await page.goto(`${URL_BASE}#/settings/account`);
  await page.getByTestId('setting-retention').getByRole('radio', { name: '7 days' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete them and save this' }).click();
  await page.goto(URL_BASE);
  await openTrash();
  /*
   * Waited for rather than asserted at once: the sweep runs when the browser is idle, so that it
   * never competes with the app opening. Checking the instant the page appears would be a race, and
   * a test that wins a race by luck is worse than no test.
   */
  await row('Older than a month').waitFor({ state: 'detached', timeout: 20000 });
  assert.equal(await row('Older than a month').count(), 0, 'it was deleted on opening');
  await page.getByTestId('trash-policy').getByText('Things here are deleted 7 days after you put them in Trash.').waitFor();
});

test('every radio is a circle, and a setting link goes to the setting', async () => {
  /*
   * Two things the owner reported from his phone, both worth a test because both come back easily.
   *
   * The ovals: `input` is given width 100% near the top of the stylesheet, which is right for a
   * text box and wrong for a radio — a stretched one is not a circle but a long oval, as wide as
   * the words beside it. One container had been patched for this on its own, which is exactly how
   * a new section inherited the bug.
   *
   * The scroll: Settings is long on a phone, and landing at the top to hunt for the thing you
   * tapped is its own small chore.
   */
  /*
   * At a phone's size, which is where this was reported and the only size where it can be shown:
   * on a tall desktop window Settings is short enough that the section is already as far up the
   * page as it can go, so scrolling to it changes nothing and the test could not tell the
   * difference. 359px with and without, measured.
   */
  await page.setViewportSize({ width: 393, height: 852 });
  await openTrash();
  await page.getByRole('link', { name: 'Change this' }).click();
  await page.getByTestId('setting-retention').waitFor();

  const shapes = await page.locator('[data-testid=setting-retention] input[type=radio]').evaluateAll(
    (boxes) => boxes.map((box) => { const at = box.getBoundingClientRect(); return { w: Math.round(at.width), h: Math.round(at.height) }; }),
  );
  assert.ok(shapes.length >= 6, `all six choices are there, saw ${shapes.length}`);
  for (const shape of shapes) {
    assert.equal(shape.w, shape.h, `a radio is a circle, not a ${shape.w}x${shape.h} oval`);
  }
  assert.equal(new Set(shapes.map((shape) => shape.w)).size, 1, 'and they are all the same size as each other');

  /*
   * Arriving at the setting rather than at the top of Settings. Measured against the same page
   * opened without the link, because "359px down" means nothing on its own — on a tall window
   * there may not be enough page left below the section to bring it to the very top, and the
   * question that matters is whether asking for it moved anything.
   */
  const seen = await page.evaluate(() => {
    const target = document.getElementById('trash-keep');
    const top = target.getBoundingClientRect().top;
    return { onScreen: top >= 0 && top < innerHeight, focused: document.activeElement === target };
  });
  assert.equal(seen.onScreen, true, 'the setting is on the screen when you arrive');
  /*
   * Focus is the assertion that carries the weight. It is what a keyboard and a screen reader
   * follow, and it is what the browser scrolls to — so if focus lands here, the jump happened.
   *
   * Measuring the scroll in pixels was tried and dropped: how far the page can scroll depends on
   * how much is on it, and this profile is signed out with almost nothing, so the section sits
   * 70px down whether or not it is asked for. A test that passes because the page is too short to
   * scroll is not testing anything. The scroll itself was checked by hand on a full account.
   */
  assert.equal(seen.focused, true, 'and focus moved to it, which is what a keyboard follows');
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('restoring stops the clock, and trashing it again starts the time over', async () => {
  await page.goto(`${URL_BASE}#/settings/account`);
  await page.getByTestId('setting-retention').getByRole('radio', { name: '30 days' }).click();
  await page.getByTestId('retention-effect').getByText('30 days').waitFor();

  await trashANote('Nearly due');
  assert.equal(await age('Nearly due', 29), true);
  await openTrash();
  await row('Nearly due').getByText('deleted tomorrow').waitFor();

  // Restored, so nothing is pending any more.
  await page.getByRole('button', { name: 'Restore Nearly due' }).click();
  await page.goto(`${URL_BASE}#/notes`);
  await page.locator('main').getByRole('link', { name: /Nearly due/ }).first().waitFor();

  // Deleted again: a fresh 30 days, not the day it had left before.
  await page.locator('main').getByRole('link', { name: /Nearly due/ }).first().click();
  await page.getByRole('button', { name: 'Delete note' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete note' }).click();
  await openTrash();
  await row('Nearly due').getByText('deleted in 30 days').waitFor();

  // Put back the way it was found, so nothing after this inherits a policy it didn't ask for.
  await page.goto(`${URL_BASE}#/settings/account`);
  await page.getByTestId('setting-retention').getByRole('radio', { name: 'Never — I’ll delete things myself' }).click();
  assert.deepEqual(pageErrors, []);
});
