// The review schedule's rules, then all of Flashcards in a real browser.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const rules = () => import('../src/data/flashcardRules.ts');
const TODAY = '2026-11-04';

test('each rating moves a card along the 1, 5, 10, 15 day steps', async () => {
  const { outcome } = await rules();
  assert.deepEqual(outcome(null, 'Again'), { stage: -1, days: 0 });
  assert.deepEqual(outcome(null, 'Hard'), { stage: -1, days: 1 });
  assert.deepEqual(outcome(null, 'Good'), { stage: 0, days: 1 });
  assert.deepEqual(outcome(null, 'Easy'), { stage: 1, days: 5 });
  assert.deepEqual(outcome({ stage: 0 }, 'Good'), { stage: 1, days: 5 });
  assert.deepEqual(outcome({ stage: 1 }, 'Good'), { stage: 2, days: 10 });
  assert.deepEqual(outcome({ stage: 2 }, 'Good'), { stage: 3, days: 15 });
  assert.deepEqual(outcome({ stage: 3 }, 'Good'), { stage: 3, days: 15 }, 'it stays at the last step');
  assert.deepEqual(outcome({ stage: 2 }, 'Easy'), { stage: 3, days: 15 });
  assert.deepEqual(outcome({ stage: 3 }, 'Hard'), { stage: 3, days: 1 });
  assert.deepEqual(outcome({ stage: 3 }, 'Again'), { stage: -1, days: 0 });
  assert.deepEqual(outcome({ stage: -1 }, 'Good'), { stage: 0, days: 1 }, 'after Again, a card starts over');
});

test('a saved answer has the right date and counts', async () => {
  const { nextProgress, addDays } = await rules();
  const first = nextProgress('c', null, 'Good', TODAY, 1000);
  assert.equal(first.dueDate, '2026-11-05');
  assert.equal(first.reviews, 1);
  assert.equal(first.lapses, 0);
  const second = nextProgress('c', first, 'Again', TODAY, 900);
  assert.equal(second.dueDate, TODAY);
  assert.equal(second.reviews, 2);
  assert.equal(second.lapses, 1);
  assert.ok(second.updatedAt > first.updatedAt, 'a device clock running behind still counts as newer');
  assert.equal(addDays('2026-12-30', 5), '2027-01-04');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02', 'across the US clock change');
});

test('due and weak follow the saved answers', async () => {
  const { isDue, isWeak, dueQueue, describeCardDue } = await rules();
  assert.equal(isDue(null, TODAY), true);
  assert.equal(isDue({ dueDate: TODAY }, TODAY), true);
  assert.equal(isDue({ dueDate: '2026-11-01' }, TODAY), true);
  assert.equal(isDue({ dueDate: '2026-11-05' }, TODAY), false);
  assert.equal(isWeak(null), false, 'a new card is not weak');
  assert.equal(isWeak({ lastRating: 'Again', lapses: 1, stage: 0 }), true);
  assert.equal(isWeak({ lastRating: 'Good', lapses: 2, stage: 0 }), true);
  assert.equal(isWeak({ lastRating: 'Good', lapses: 2, stage: 1 }), false, 'it recovers');
  assert.equal(isWeak({ lastRating: 'Hard', lapses: 0, stage: 1 }), false);
  const card = (id, createdAt) => ({ id, createdAt });
  const progress = new Map([['late', { dueDate: '2026-11-01' }], ['today', { dueDate: TODAY }], ['later', { dueDate: '2026-12-01' }]]);
  assert.deepEqual(dueQueue([card('new2', 2), card('today', 3), card('new1', 1), card('later', 4), card('late', 5)], progress, TODAY).map((entry) => entry.id), ['late', 'today', 'new1', 'new2']);
  assert.equal(describeCardDue(null, TODAY), 'New');
  assert.equal(describeCardDue({ dueDate: TODAY }, TODAY), 'Due today');
  assert.equal(describeCardDue({ dueDate: '2026-11-05' }, TODAY), 'Due tomorrow');
  assert.equal(describeCardDue({ dueDate: '2026-11-10' }, TODAY), 'Due Nov 10');
});

// ---- In a real browser, with the clock set to a known moment. ----
const URL_BASE = 'http://localhost:4182/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-cards-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
let server;
let context;
let page;
let backupFile;
const pageErrors = [];
const FRONT_ONE = 'What is the accounting equation?';
const BACK_ONE = 'Assets = Liabilities + Equity';

async function open(profile, viewport = { width: 1280, height: 800 }, when = '2026-11-04T10:00:00-05:00') {
  await context?.close().catch(() => undefined);
  context = await chromium.launchPersistentContext(path.join(work, profile), { acceptDownloads: true, viewport, timezoneId: 'America/New_York' });
  await context.addInitScript('delete window.showSaveFilePicker;');
  page = context.pages()[0] ?? (await context.newPage());
  await page.clock.setFixedTime(new Date(when));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
}
const nav = (name) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click();
const front = () => page.getByLabel('Front', { exact: true });
const back = () => page.getByLabel('Back', { exact: true });
let tick = 0;
async function addCard(question, answer) {
  // The test's clock stands still, so move it on to give each card its own creation time.
  tick += 1;
  await page.clock.setFixedTime(new Date(Date.UTC(2026, 10, 4, 15, 0, tick)));
  await front().fill(question);
  await back().fill(answer);
  await page.getByRole('button', { name: 'Add card' }).click();
  await page.getByTestId('card-row').filter({ hasText: question }).waitFor();
}
const rating = (name) => page.getByRole('group', { name: 'How well did you remember it?' }).getByRole('button', { name: new RegExp(`^${name}`) });
const reveal = () => page.getByRole('button', { name: 'Reveal answer' }).click();

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4182', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await open('main');
});

after(async () => {
  await context?.close().catch(() => undefined);
  try { if (server) process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('a deck and cards can be made, and empty ones are refused', async () => {
  await page.getByLabel('Course name').fill('Accounting');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Accounting' }).waitFor();
  await nav('Flashcards');
  await page.getByText('No decks yet').waitFor();
  await page.getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('alert').getByText('Enter a name').waitFor();
  await page.getByLabel('New deck').fill('Chapter 1');
  await page.getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('heading', { name: 'Chapter 1' }).waitFor();
  await front().fill('Only a front');
  await page.getByRole('button', { name: 'Add card' }).click();
  await page.getByRole('alert').getByText('needs both a front and a back').waitFor();
  assert.equal(await front().inputValue(), 'Only a front', 'nothing typed is lost');
  await back().fill(BACK_ONE);
  await front().fill(FRONT_ONE);
  await page.getByRole('button', { name: 'Add card' }).click();
  await page.getByTestId('card-row').filter({ hasText: FRONT_ONE }).waitFor();
  assert.equal(await front().inputValue(), '', 'ready for the next card');
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'TEXTAREA', 'the cursor returns to the front');
  await addCard('Second question\nwith two lines', 'Second answer');
  await addCard('Third question', 'Third answer');
  await page.screenshot({ path: path.join(shots, 'deck.png'), fullPage: true });
  assert.match(await page.getByTestId('card-row').first().innerText(), /New/);
});

test('a deck can be filed under a course', async () => {
  await page.getByRole('button', { name: 'Edit deck' }).click();
  await page.getByLabel('Course').selectOption({ label: 'Accounting' });
  await page.getByRole('button', { name: 'Save deck' }).click();
  await page.getByRole('button', { name: 'Save deck' }).waitFor({ state: 'detached' });
  await nav('Courses');
  await page.getByRole('link', { name: /Accounting/ }).click();
  await page.getByRole('link', { name: 'Flashcards for this course' }).click();
  await page.getByTestId('deck-row').getByText('3 cards, 3 due').waitFor();
  assert.match(await page.getByTestId('deck-row').innerText(), /Accounting/);
  await page.getByLabel('Show').selectOption({ label: 'No course' });
  await page.getByText('No decks for this course').waitFor();
  await page.getByLabel('Show').selectOption('');
});

test('Today counts what is due, and the answer stays hidden until revealed', async () => {
  await nav('Today');
  await page.getByTestId('today-cards').getByRole('link', { name: 'Review 3 flashcards' }).click();
  await page.getByTestId('card-front').getByText(FRONT_ONE).waitFor();
  assert.equal(await page.getByTestId('card-back').count(), 0);
  assert.doesNotMatch(await page.content(), /Assets = Liabilities/, 'the answer is not in the page at all');
  assert.equal(await rating('Good').count(), 0, 'there is nothing to rate yet');
  await page.screenshot({ path: path.join(shots, 'review-front.png') });
  await reveal();
  await page.getByTestId('card-back').getByText(BACK_ONE).waitFor();
  assert.match(await rating('Again').innerText(), /Today/);
  assert.match(await rating('Hard').innerText(), /1 day/);
  assert.match(await rating('Good').innerText(), /1 day/);
  assert.match(await rating('Easy').innerText(), /5 days/);
  await page.screenshot({ path: path.join(shots, 'review-back.png') });
});

test('Good moves on and saves, and a reload resumes with what is left', async () => {
  await rating('Good').click();
  await page.getByTestId('card-front').getByText('Second question').waitFor();
  assert.equal(await page.getByTestId('card-back').count(), 0, 'the next answer starts hidden');
  await page.reload();
  await page.getByTestId('card-front').getByText('Second question').waitFor();
  assert.match(await page.getByTestId('review-left').innerText(), /^2 left in Chapter 1/);
});

test('Again brings a card back this session and marks it weak', async () => {
  await reveal();
  await rating('Again').click();
  await page.getByTestId('card-front').getByText('Third question').waitFor();
  assert.match(await page.getByTestId('review-left').innerText(), /^2 left/, 'it went to the back of the line');
  await reveal();
  await rating('Easy').click();
  await page.getByTestId('card-front').getByText('Second question').waitFor();
  await reveal();
  await rating('Again').click();
  await page.getByTestId('card-back').waitFor({ state: 'detached' });
  await page.getByTestId('card-front').getByText('Second question').waitFor();
});

test('keys work, and a fast double press counts once', async () => {
  await page.keyboard.press('1');
  assert.equal(await page.getByTestId('card-back').count(), 0, 'number keys do nothing before the answer shows');
  await page.keyboard.press('Space');
  await page.getByTestId('card-back').waitFor();
  await page.keyboard.press('3');
  await page.keyboard.press('3');
  await page.getByRole('heading', { name: 'All done' }).waitFor();
  assert.match(await page.getByTestId('review-summary').innerText(), /You answered 4 times: 2 Again, 0 Hard, 1 Good, 1 Easy/);
  const stored = await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('study-forge');
    open.onsuccess = () => {
      const read = open.result.transaction('cardProgress').objectStore('cardProgress').getAll();
      read.onsuccess = () => { open.result.close(); resolve(read.result); };
    };
  }));
  assert.deepEqual(stored.map((entry) => entry.reviews).sort(), [1, 1, 3], 'every answer counted exactly once');
  await page.getByRole('link', { name: 'Back to Flashcards' }).click();
});

test('a finished deck shows the right dates, and weak cards can be practiced', async () => {
  await page.getByTestId('nothing-due').waitFor();
  await page.getByRole('link', { name: 'Chapter 1', exact: true }).click();
  await page.getByTestId('card-row').first().waitFor();
  const rows = await page.getByTestId('card-row').allInnerTexts();
  assert.match(rows[0], /Due tomorrow/);
  assert.match(rows[1], /Due tomorrow, weak/, 'pressed Again twice and not recovered');
  assert.match(rows[2], /Due Nov 9/);
  await page.getByRole('link', { name: 'Practice weak cards' }).click();
  await page.getByText("This doesn't change your schedule").waitFor();
  await page.getByTestId('card-front').getByText('Second question').waitFor();
  await reveal();
  await rating('Easy').click();
  await page.getByText("Practice doesn't change your schedule").waitFor();
  await page.getByRole('link', { name: 'Back to deck' }).click();
  await page.getByTestId('card-row').first().waitFor();
  assert.match((await page.getByTestId('card-row').allInnerTexts())[1], /Due tomorrow, weak/, 'practice changed nothing');
});

test('editing a card keeps its schedule, and deleting asks first', async () => {
  await page.getByRole('button', { name: `Edit ${FRONT_ONE}` }).click();
  await page.locator('.card-row, .planner-row').first().getByLabel('Back').fill('A = L + E');
  await page.getByRole('button', { name: 'Save card' }).click();
  const first = page.getByTestId('card-row').first();
  await first.getByText('A = L + E').waitFor();
  assert.match(await first.innerText(), /Due tomorrow/);
  await page.getByRole('button', { name: 'Delete Third question' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.getByTestId('card-row').count(), 3);
  await page.getByRole('button', { name: 'Delete Third question' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete card' }).click();
  await page.getByTestId('card-row').filter({ hasText: 'Third question' }).waitFor({ state: 'detached' });
});

test('cards come back on the right day, and a backup restores them with their schedule', async () => {
  await nav('Settings');
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create backup' }).click()]);
  await page.getByTestId('backup-result').waitFor();
  backupFile = path.join(work, 'cards-backup.zip');
  await file.saveAs(backupFile);
  await page.clock.setFixedTime(new Date('2026-11-05T10:00:00-05:00'));
  await nav('Flashcards');
  await page.getByRole('link', { name: 'Review 2 cards due' }).waitFor();
  await open('fresh');
  await nav('Settings');
  await page.getByTestId('restore-input').setInputFiles(backupFile);
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await page.getByTestId('restore-report').getByText('2 flashcards').waitFor();
  await nav('Flashcards');
  await page.getByTestId('deck-row').getByText('2 cards, 0 due').waitFor();
  await page.getByTestId('deck-row').getByText('Accounting').waitFor();
  await nav('Settings');
  await page.getByTestId('restore-input').setInputFiles(backupFile);
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await page.getByTestId('restore-report').getByText('0 flashcards').waitFor();
});

test('deleting a course keeps its deck, and deleting a deck removes its cards', async () => {
  await nav('Courses');
  await page.getByRole('link', { name: /Accounting/ }).click();
  await page.getByRole('button', { name: 'Move to bin' }).click();
  await page.getByRole('heading', { name: 'Courses', exact: true }).waitFor();
  await page.goto(`${URL_BASE}#/bin`);
  await page.getByTestId('bin-courses').waitFor();
  await page.getByRole('button', { name: /for good$/ }).first().click();
  await page.getByRole('dialog').getByText('any flashcards stay').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove for good' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('The bin is empty'));
  await nav('Flashcards');
  await page.getByRole('link', { name: 'Chapter 1', exact: true }).click();
  await page.getByRole('button', { name: 'Delete deck' }).click();
  await page.getByRole('dialog').getByText('its 2 cards').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete deck' }).click();
  await page.getByText('No decks yet').waitFor();
  const left = await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('study-forge');
    open.onsuccess = () => {
      const tx = open.result.transaction(['cards', 'cardProgress']);
      const cards = tx.objectStore('cards').count();
      const progress = tx.objectStore('cardProgress').count();
      tx.oncomplete = () => { open.result.close(); resolve([cards.result, progress.result]); };
    };
  }));
  assert.deepEqual(left, [0, 0]);
});

test('someone already using the site keeps everything when Flashcards arrive', async () => {
  await context.close();
  context = await chromium.launchPersistentContext(path.join(work, 'older-student'), { viewport: { width: 1280, height: 800 } });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(`${URL_BASE}blank.html`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' }));
  await page.goto(`${URL_BASE}blank.html`);
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('study-forge', 7);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('courses', { keyPath: 'id' });
      db.createObjectStore('topics', { keyPath: 'id' }).createIndex('courseId', 'courseId');
      const materials = db.createObjectStore('materials', { keyPath: 'id' });
      materials.createIndex('hash', 'hash');
      materials.createIndex('createdAt', 'createdAt');
      db.createObjectStore('blobs');
      db.createObjectStore('recordings', { keyPath: 'id' });
      db.createObjectStore('recordingChunks');
      db.createObjectStore('notes', { keyPath: 'id' });
      db.createObjectStore('meta');
      db.createObjectStore('lessons', { keyPath: 'id' });
      db.createObjectStore('checkpoints', { keyPath: 'id' }).createIndex('lessonId', 'lessonId');
      db.createObjectStore('checkpointProgress', { keyPath: 'checkpointId' });
      db.createObjectStore('syncMeta');
      db.createObjectStore('plannerItems', { keyPath: 'id' });
      const tx = request.transaction;
      tx.objectStore('courses').put({ id: 'old-course', name: 'Older Course', code: '', color: '#7DD3FC', createdAt: 1000 });
      tx.objectStore('plannerItems').put({ id: 'old-item', title: 'Older item', courseId: 'old-course', type: 'Exam', dueDate: '2030-01-15', dueTime: '', status: 'Not Started', priority: 'Normal', estimateHours: null, details: '', createdAt: 1000, updatedAt: 1000 });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { request.result.close(); resolve(); };
  }));
  await page.goto(URL_BASE);
  await page.getByRole('heading', { name: /^Today:/ }).waitFor();
  await nav('Planner');
  await page.getByRole('link', { name: 'Older item', exact: true }).waitFor();
  await nav('Flashcards');
  await page.getByLabel('New deck').fill('First deck after updating');
  await page.getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('heading', { name: 'First deck after updating' }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'First deck after updating' }).waitFor();
});

test('it works on a phone, with every destination in reach', async () => {
  await open('phone', { width: 360, height: 700 });
  const overflow = () => page.evaluate(() => {
    const main = document.querySelector('main');
    const nav = document.querySelector('nav');
    return Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth, nav.scrollWidth - nav.clientWidth);
  });
  await nav('Flashcards');
  await page.screenshot({ path: path.join(shots, 'phone-cards.png') });
  await page.getByLabel('New deck').fill('Phone deck');
  await page.getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('heading', { name: 'Phone deck' }).waitFor();
  await addCard('A really long question '.repeat(12), 'Answer_with_a_very_long_word_that_has_no_spaces_'.repeat(4));
  assert.ok((await overflow()) <= 0);
  await page.getByRole('link', { name: 'Review 1 due' }).click();
  await reveal();
  await rating('Good').waitFor();
  assert.ok((await overflow()) <= 0);
  await page.screenshot({ path: path.join(shots, 'phone-review.png'), fullPage: true });
  for (const name of ['Again', 'Hard', 'Good', 'Easy']) {
    const box = await rating(name).boundingBox();
    assert.ok(box.height >= 44, `${name} is big enough to tap`);
  }
  const links = await page.getByRole('navigation', { name: 'Main' }).getByRole('link').all();
  for (const link of links) {
    await link.scrollIntoViewIfNeeded();
    const box = await link.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 360, 'every section button can be slid onto the screen');
  }
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
