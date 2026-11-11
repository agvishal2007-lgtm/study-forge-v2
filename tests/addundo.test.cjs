// Smart Add starts anything from where the student already is; Undo puts the last change back,
// but never on top of work done since.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

const rules = () => import('../src/data/smartAddRules.ts');
const course = (id, extra = {}) => ({ id, name: id, code: '', color: '', term: '', position: 0, status: 'active', statusAt: 0, createdAt: 0, updatedAt: 0, ...extra });
const topic = (id, courseId, extra = {}) => ({ id, courseId, name: id, heading: '', position: 0, status: 'active', statusAt: 0, createdAt: 0, updatedAt: 0, ...extra });

test('the screen the student is on decides where the new thing goes', async () => {
  const { suggestPlace, courseFromPath } = await rules();
  const courses = [course('bio'), course('chem')];
  assert.equal(courseFromPath('/courses/bio'), 'bio');
  assert.equal(courseFromPath('/planner'), null);
  // The address wins over whatever was used last.
  assert.deepEqual(
    suggestPlace({ pathname: '/courses/bio', remembered: { courseId: 'chem', topicId: null }, courses, topics: [] }),
    { courseId: 'bio', topicId: null },
  );
  // Away from a course, the last place used is offered instead.
  assert.deepEqual(
    suggestPlace({ pathname: '/planner', remembered: { courseId: 'chem', topicId: null }, courses, topics: [] }),
    { courseId: 'chem', topicId: null },
  );
  // Nothing is suggested when there is nothing to suggest.
  assert.deepEqual(suggestPlace({ pathname: '/', remembered: null, courses, topics: [] }), { courseId: null, topicId: null });
});

test('a course that is gone, binned or put away is never suggested', async () => {
  const { suggestPlace } = await rules();
  const courses = [course('bio', { status: 'trashed' }), course('old', { status: 'archived' })];
  assert.equal(suggestPlace({ pathname: '/courses/bio', remembered: null, courses, topics: [] }).courseId, null);
  assert.equal(suggestPlace({ pathname: '/', remembered: { courseId: 'old', topicId: null }, courses, topics: [] }).courseId, null);
  assert.equal(suggestPlace({ pathname: '/', remembered: { courseId: 'missing', topicId: null }, courses, topics: [] }).courseId, null);
});

test('a topic is only carried over while it still belongs to the course', async () => {
  const { suggestPlace } = await rules();
  const courses = [course('bio'), course('chem')];
  const topics = [topic('cells', 'bio'), topic('acids', 'chem'), topic('gone', 'bio', { status: 'trashed' })];
  const at = (remembered, pathname = '/courses/bio') => suggestPlace({ pathname, remembered, courses, topics });
  assert.equal(at({ courseId: 'bio', topicId: 'cells' }).topicId, 'cells');
  // The topic belongs to another course, so it is dropped rather than silently moved.
  assert.equal(at({ courseId: 'bio', topicId: 'acids' }).topicId, null);
  assert.equal(at({ courseId: 'bio', topicId: 'gone' }).topicId, null);
});

test('each kind is made where it is already made, carrying the place with it', async () => {
  const { destination } = await rules();
  const place = { courseId: 'bio', topicId: 'cells' };
  assert.equal(destination('deck', place), '/cards?course=bio');
  assert.equal(destination('questions', place), '/practice?course=bio');
  assert.equal(destination('recording', place), '/record?course=bio&topic=cells');
  assert.equal(destination('topic', place), '/courses/bio');
  assert.equal(destination('course', place), '/courses');
  // A topic has nowhere to go without a course.
  assert.equal(destination('topic', { courseId: null, topicId: null }), null);
  // These are made in the dialog itself, so they need no address.
  for (const kind of ['file', 'link', 'note']) assert.equal(destination(kind, place), null);
});

const PORT = 4214;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let browser;
let page;
const pageErrors = [];

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await browser?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
});

const addCourse = async (name) => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByLabel('Course name').fill(name);
  await page.getByRole('button', { name: 'Create course' }).click();
  // Creating a course opens it, which is also where Smart Add should pick it up from.
  await page.getByRole('heading', { name, level: 1 }).waitFor();
};

test('Smart Add is reachable from every screen and suggests the course being looked at', async () => {
  await addCourse('Biology');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('heading', { name: 'Add to Study Forge' }).waitFor();
  // The course being looked at is already chosen, and the student can change it.
  await page.waitForFunction(() => document.querySelector('.add-place select').selectedOptions[0].textContent === 'Biology');
  for (const kind of ['File', 'Link', 'Note', 'Flashcards', 'Question set', 'Recording', 'Topic', 'Course']) {
    await page.getByRole('button', { name: new RegExp(`^${kind}`) }).first().waitFor();
  }
  // Saving a link reuses the same importer the Library uses, not a second form of its own.
  await page.getByRole('button', { name: /^Link/ }).click();
  await page.getByRole('heading', { name: 'Add a link' }).waitFor();
  await page.getByRole('button', { name: 'Add something else' }).click();
  // A kind that is made on another screen takes the course along.
  await page.getByRole('button', { name: /^Flashcards/ }).click();
  await page.waitForFunction(() => location.hash.startsWith('#/cards?course='));
  assert.equal(await page.getByRole('heading', { name: 'Add to Study Forge' }).count(), 0, 'the dialog stayed open after moving on');
});

test('a rename can be undone, and the bar says what it would put back', async () => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('link', { name: /Biology/ }).first().click();
  await page.getByRole('button', { name: 'Edit course' }).click();
  await page.getByTestId('edit-course').getByLabel('Course name').fill('Bio 101');
  await page.getByRole('button', { name: 'Save course' }).click();
  await page.getByRole('heading', { name: 'Bio 101', level: 1 }).waitFor();
  const bar = page.locator('.undo-bar');
  await bar.getByText('Renamed Biology to Bio 101').waitFor();
  await bar.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('heading', { name: 'Biology', level: 1 }).waitFor();
  await page.getByText('Undone: renamed Biology to Bio 101.').waitFor();
});

test('putting a course in the bin can be undone, and so can taking it out', async () => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('link', { name: /Biology/ }).first().click();
  await page.getByRole('button', { name: 'Move to bin' }).click();
  await page.getByRole('heading', { name: 'Courses', level: 1 }).waitFor();
  await page.locator('.undo-bar').getByText('Moved Biology to the bin').waitFor();
  await page.locator('.undo-bar').getByRole('button', { name: 'Undo' }).click();
  await page.getByText('Undone: moved Biology to the bin.').waitFor();
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('link', { name: /Biology/ }).first().waitFor();
});

test('undo refuses when the thing is gone, and says so instead of half-working', async () => {
  await addCourse('Chemistry');
  await page.getByRole('button', { name: 'Move to bin' }).click();
  await page.getByRole('heading', { name: 'Courses', level: 1 }).waitFor();
  // Removed for good, which is deliberately not undoable.
  await page.goto(`${URL_BASE}#/bin`);
  await page.getByRole('button', { name: 'Remove Chemistry for good' }).click();
  await page.getByRole('button', { name: 'Remove for good' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('The bin is empty'));
  // The offer to undo binning it is still on screen, and must not pretend to work.
  await page.locator('.undo-bar').getByRole('button', { name: 'Undo' }).click();
  await page.getByText(/can't be undone/).waitFor();
  await page.getByText(/Nothing was altered/).waitFor();
  await page.goto(`${URL_BASE}#/courses`);
  assert.equal(await page.getByRole('link', { name: /Chemistry/ }).count(), 0);
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
