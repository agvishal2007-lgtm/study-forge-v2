// Planner date rules, then the whole Planner in a real browser.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const rules = () => import('../src/data/plannerRules.ts');
const NOW = { date: '2026-11-04', time: '14:30' };
const due = (dueDate, dueTime = '', status = 'Not Started') => ({ dueDate, dueTime, status });

test('items land in the right group', async () => {
  const { groupOf } = await rules();
  assert.equal(groupOf(due('2026-11-03'), NOW), 'overdue');
  assert.equal(groupOf(due('2026-11-04'), NOW), 'today');
  assert.equal(groupOf(due('2026-11-04', '14:00'), NOW), 'overdue', 'earlier today has passed');
  assert.equal(groupOf(due('2026-11-04', '15:00'), NOW), 'today');
  assert.equal(groupOf(due('2026-11-05'), NOW), 'tomorrow');
  assert.equal(groupOf(due('2026-11-11'), NOW), 'week');
  assert.equal(groupOf(due('2026-11-12'), NOW), 'later');
  assert.equal(groupOf(due(''), NOW), 'none');
  assert.equal(groupOf(due('not a date'), NOW), 'none');
});

test('finished work is never overdue', async () => {
  const { groupOf, describeDue } = await rules();
  for (const status of ['Submitted', 'Waiting for Grade', 'Completed']) {
    assert.equal(groupOf(due('2026-01-01', '', status), NOW), 'done');
    assert.doesNotMatch(describeDue(due('2026-01-01', '', status), NOW), /overdue/i);
  }
  for (const status of ['Not Started', 'In Progress', 'Ready to Submit']) assert.equal(groupOf(due('2026-01-01', '', status), NOW), 'overdue');
});

test('dates cross months, years, and clock changes correctly', async () => {
  const { groupOf, describeDue, isValidDate } = await rules();
  assert.equal(groupOf(due('2027-01-01'), { date: '2026-12-31', time: '10:00' }), 'tomorrow');
  assert.equal(groupOf(due('2026-03-01'), { date: '2026-02-28', time: '10:00' }), 'tomorrow');
  assert.equal(describeDue(due('2026-11-01'), { date: '2026-11-03', time: '00:00' }), '2 days overdue', 'across the US clock change');
  assert.equal(groupOf(due('2026-03-09'), { date: '2026-03-08', time: '10:00' }), 'tomorrow');
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2028-02-29'), true);
});

test('due dates read in plain words', async () => {
  const { describeDue } = await rules();
  assert.equal(describeDue(due('2026-11-04', '15:00'), NOW), 'Due today at 3:00 PM');
  assert.equal(describeDue(due('2026-11-04'), NOW), 'Due today');
  assert.equal(describeDue(due('2026-11-04', '09:05'), NOW), 'Overdue since 9:05 AM today');
  assert.equal(describeDue(due('2026-11-05', '00:30'), NOW), 'Due tomorrow at 12:30 AM');
  assert.equal(describeDue(due('2026-11-03'), NOW), '1 day overdue');
  assert.equal(describeDue(due('2026-10-31'), NOW), '4 days overdue');
  assert.match(describeDue(due('2026-11-10'), NOW), /^Due Tue, Nov 10$/);
  assert.equal(describeDue(due(''), NOW), 'No due date');
});

test('soonest comes first, and importance breaks ties', async () => {
  const { comparePlanner } = await rules();
  const item = (id, dueDate, dueTime, priority) => ({ id, dueDate, dueTime, priority, createdAt: 1 });
  const sorted = [
    item('none', '', '', 'High'),
    item('later', '2026-11-20', '', 'High'),
    item('soon-normal', '2026-11-05', '', 'Normal'),
    item('soon-high', '2026-11-05', '', 'High'),
    item('soon-timed', '2026-11-05', '09:00', 'Low'),
  ].sort(comparePlanner).map((entry) => entry.id);
  assert.deepEqual(sorted, ['soon-timed', 'soon-high', 'soon-normal', 'later', 'none']);
});

// ---- In a real browser, with the clock set to a known moment. ----
const URL_BASE = 'http://localhost:4181/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-planner-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
let server;
let context;
let page;
const pageErrors = [];
let backupFile;

async function open(profile, viewport = { width: 1280, height: 800 }) {
  await context?.close().catch(() => undefined);
  context = await chromium.launchPersistentContext(path.join(work, profile), { acceptDownloads: true, viewport, timezoneId: 'America/New_York' });
  await context.addInitScript('delete window.showSaveFilePicker;');
  page = context.pages()[0] ?? (await context.newPage());
  await page.clock.setFixedTime(new Date('2026-11-04T14:30:00-05:00'));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
}
const nav = (name) => page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
async function addItem({ name, type, course, date, time, priority, hours, details }) {
  await nav('Planner');
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  if (type) await page.getByLabel('Type').selectOption(type);
  if (course) await page.getByLabel('Course').selectOption({ label: course });
  if (date) await page.getByLabel('Due date', { exact: true }).fill(date);
  if (time) await page.getByLabel('Due time').fill(time);
  if (priority) await page.getByLabel('Priority').selectOption(priority);
  if (hours) await page.getByLabel('Estimated hours').fill(hours);
  if (details) await page.getByLabel('Details').fill(details);
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();
  await page.getByRole('link', { name, exact: true }).waitFor();
}
const groupText = (group) => page.locator(`[data-group=${group}]`).innerText();

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4181', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
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

test('the empty planner explains itself, and the form checks before saving', async () => {
  await page.getByLabel('Course name').fill('Accounting');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Accounting' }).waitFor();
  await nav('Planner');
  await page.getByText('Add your first assignment or exam').waitFor();
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByTestId('planner-problems').getByText('Enter a name').waitFor();
  await page.getByLabel('Name', { exact: true }).fill('Bad');
  await page.getByLabel('Due time').fill('10:00');
  await page.getByLabel('Estimated hours').fill('lots');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByTestId('planner-problems').getByText('Add a due date to go with the time').waitFor();
  await page.getByTestId('planner-problems').getByText('Enter estimated hours').waitFor();
  await page.getByRole('link', { name: 'Cancel' }).click();
  await page.getByText('Add your first assignment or exam').waitFor();
});

test('items sort into the right groups, in plain words', async () => {
  await addItem({ name: 'Late essay', date: '2026-11-02', course: 'Accounting' });
  await addItem({ name: 'Morning quiz', type: 'Quiz', date: '2026-11-04', time: '09:00' });
  await addItem({ name: 'Evening reading', type: 'Reading', date: '2026-11-04', time: '20:00' });
  await addItem({ name: 'Midterm', type: 'Exam', date: '2026-11-05', course: 'Accounting', priority: 'High', hours: '6', details: 'Chapters 1 to 4' });
  await addItem({ name: 'Group project', type: 'Project', date: '2026-11-09', course: 'Accounting' });
  await addItem({ name: 'Final paper', date: '2026-12-10' });
  await addItem({ name: 'Read ahead', type: 'Reading' });
  assert.match(await groupText('overdue'), /Late essay[\s\S]*2 days overdue[\s\S]*Morning quiz[\s\S]*Overdue since 9:00 AM today/);
  assert.match(await groupText('today'), /Evening reading[\s\S]*Due today at 8:00 PM/);
  const tomorrow = await groupText('tomorrow');
  assert.match(tomorrow, /Midterm[\s\S]*Due tomorrow/);
  assert.match(tomorrow, /Exam, Accounting, High priority, About 6 hours/);
  assert.match(await groupText('week'), /Group project/);
  assert.match(await groupText('later'), /Final paper/);
  assert.match(await groupText('none'), /Read ahead[\s\S]*No due date/);
  await page.screenshot({ path: path.join(shots, 'planner.png'), fullPage: true });
});

test('Today shows what is due soon, most urgent first, and leaves out the rest', async () => {
  await nav('Today');
  const due = page.getByTestId('due-soon');
  await due.waitFor();
  const text = await due.innerText();
  assert.ok(text.indexOf('Evening reading') >= 0 && text.indexOf('Evening reading') < text.indexOf('Midterm') && text.indexOf('Midterm') < text.indexOf('Group project'));
  assert.doesNotMatch(text, /Final paper|Read ahead|Late essay/);
  const overdue = await page.getByTestId('overdue').innerText();
  assert.ok(overdue.indexOf('Late essay') >= 0 && overdue.indexOf('Late essay') < overdue.indexOf('Morning quiz'));
  await page.screenshot({ path: path.join(shots, 'today-planner.png') });
});

test('marking something done works from Today, is saved, and can be undone', async () => {
  await page.getByRole('button', { name: 'Mark Late essay done' }).click();
  await page.getByTestId('overdue').getByRole('link', { name: 'Late essay' }).waitFor({ state: 'detached' });
  await page.reload();
  await page.getByTestId('overdue').waitFor();
  assert.doesNotMatch(await page.getByTestId('overdue').innerText(), /Late essay/);
  await nav('Planner');
  assert.match(await groupText('done'), /Late essay[\s\S]*Was due/);
  assert.doesNotMatch(await groupText('overdue'), /Late essay/);
  await page.getByLabel('Status of Late essay').selectOption('In Progress');
  await page.locator('[data-group=overdue]', { hasText: 'Late essay' }).waitFor();
  await page.getByLabel('Status of Late essay').selectOption('Submitted');
  await page.locator('[data-group=done]', { hasText: 'Late essay' }).waitFor();
});

test('the planner can be filtered by course, and a course links to its items', async () => {
  await page.getByLabel('Show').selectOption({ label: 'Accounting' });
  await page.getByRole('link', { name: 'Midterm', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Final paper', exact: true }).count(), 0);
  await page.getByLabel('Show').selectOption({ label: 'No course' });
  await page.getByRole('link', { name: 'Final paper', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Midterm', exact: true }).count(), 0);
  await nav('Courses');
  await page.getByRole('link', { name: /Accounting/ }).click();
  await page.getByRole('link', { name: 'Assignments and exams for this course' }).click();
  await page.getByRole('link', { name: 'Midterm', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Final paper', exact: true }).count(), 0);
});

test('editing keeps what was entered, and an unchanged date never shifts', async () => {
  await page.getByRole('link', { name: 'Midterm', exact: true }).click();
  assert.equal(await page.getByLabel('Due date', { exact: true }).inputValue(), '2026-11-05');
  assert.equal(await page.getByLabel('Details').inputValue(), 'Chapters 1 to 4');
  assert.equal(await page.getByLabel('Estimated hours').inputValue(), '6');
  await page.getByLabel('Name', { exact: true }).fill('Midterm exam');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('link', { name: 'Midterm exam', exact: true }).click();
  assert.equal(await page.getByLabel('Due date', { exact: true }).inputValue(), '2026-11-05');
  await page.getByRole('link', { name: 'Cancel' }).click();
});

test('deleting asks first, and deleting a course keeps its items', async () => {
  await page.getByLabel('Show').selectOption('');
  await page.getByRole('link', { name: 'Read ahead', exact: true }).click();
  await page.getByRole('button', { name: 'Delete item' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Delete item' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete item' }).click();
  await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Final paper', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Read ahead', exact: true }).count(), 0);
  await nav('Settings');
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create backup' }).click()]);
  await page.getByTestId('backup-result').waitFor();
  backupFile = path.join(work, 'planner-backup.zip');
  await file.saveAs(backupFile);
  await nav('Courses');
  await page.getByRole('link', { name: /Accounting/ }).click();
  await page.getByRole('button', { name: 'Delete course' }).click();
  await page.getByRole('dialog').getByText('any assignments stay in Planner').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete course' }).click();
  await page.getByRole('heading', { name: 'Courses', exact: true }).waitFor();
  await nav('Planner');
  await page.getByRole('link', { name: 'Midterm exam', exact: true }).waitFor();
});

test('a backup restores the planner into a fresh browser, with the same dates', async () => {
  await open('fresh');
  await nav('Settings');
  await page.getByTestId('restore-input').setInputFiles(backupFile);
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await page.getByTestId('restore-report').getByText('6 planner items').waitFor();
  await nav('Planner');
  await page.locator('[data-group=tomorrow]', { hasText: 'Midterm exam' }).waitFor();
  await page.getByRole('link', { name: 'Midterm exam', exact: true }).click();
  assert.equal(await page.getByLabel('Due date', { exact: true }).inputValue(), '2026-11-05');
  assert.equal(await page.getByLabel('Course').locator('option:checked').textContent(), 'Accounting');
  await nav('Settings');
  await page.getByTestId('restore-input').setInputFiles(backupFile);
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await page.getByTestId('restore-report').getByText('0 planner items').waitFor();
});

test('someone already using the site keeps everything when the Planner arrives', async () => {
  await context.close();
  context = await chromium.launchPersistentContext(path.join(work, 'older-student'), { viewport: { width: 1280, height: 800 } });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(`${URL_BASE}blank.html`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' }));
  await page.goto(`${URL_BASE}blank.html`);
  // Build the database exactly as the previous version of the site left it.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('study-forge', 6);
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
      request.transaction.objectStore('courses').put({ id: 'old-course', name: 'Older Course', code: '', color: '#7DD3FC', createdAt: 1000 });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { request.result.close(); resolve(); };
  }));
  await page.goto(URL_BASE);
  await page.getByRole('heading', { name: /^Today:/ }).waitFor();
  await nav('Courses');
  await page.getByRole('link', { name: /Older Course/ }).waitFor();
  await addItem({ name: 'First item after updating', course: 'Older Course', date: '2030-01-15' });
  await page.reload();
  await page.getByRole('link', { name: 'First item after updating', exact: true }).waitFor();
  await nav('Courses');
  await page.getByRole('link', { name: /Older Course/ }).waitFor();
});

test('it works on a phone with every destination in reach', async () => {
  await open('phone', { width: 360, height: 700 });
  await addItem({ name: 'A long assignment name that needs to wrap properly on a small phone screen', date: '2026-11-05', priority: 'High' });
  const overflow = () => page.evaluate(() => {
    const main = document.querySelector('main');
    const nav = document.querySelector('nav');
    return Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth, nav.scrollWidth - nav.clientWidth);
  });
  assert.ok((await overflow()) <= 0);
  await page.screenshot({ path: path.join(shots, 'phone-planner.png') });
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByLabel('Name', { exact: true }).waitFor();
  assert.ok((await overflow()) <= 0);
  await page.screenshot({ path: path.join(shots, 'phone-planner-form.png'), fullPage: true });
  await page.getByRole('link', { name: 'Cancel' }).click();
  for (const name of ['Today', 'Courses', 'Library', 'Planner', 'Flashcards', 'Practice', 'Study', 'Notes', 'Record', 'Settings']) {
    await nav(name);
    await page.waitForTimeout(80);
    assert.ok((await overflow()) <= 0, `${name} overflows`);
  }
  await nav('Today');
  await page.screenshot({ path: path.join(shots, 'phone-today-planner.png') });
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
