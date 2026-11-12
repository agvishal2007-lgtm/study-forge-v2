// The dashboard's wording, then the whole dashboard in a real browser.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const rules = () => import('../src/data/dashboard.ts');

test('the one-line summary says only what is true', async () => {
  const { daySummary } = await rules();
  const blank = { overdue: 0, dueSoon: 0, cardsDue: 0 };
  assert.equal(daySummary(blank), 'Nothing needs your attention right now.');
  assert.equal(daySummary({ ...blank, nextLesson: 'Accruals' }), 'Nothing is due. You could study Accruals next.');
  assert.equal(daySummary({ ...blank, overdue: 1, firstOverdue: 'Essay' }), 'You have 1 overdue item. Start with Essay.');
  assert.equal(daySummary({ ...blank, dueSoon: 2, firstDue: 'Quiz' }), 'You have 2 items due in the next 7 days. Start with Quiz.');
  assert.equal(daySummary({ ...blank, cardsDue: 1 }), 'You have 1 flashcard to review. Start with your flashcards.');
  assert.equal(daySummary({ overdue: 2, dueSoon: 3, cardsDue: 12, firstOverdue: 'Essay', firstDue: 'Quiz' }), 'You have 2 overdue items, 3 items due in the next 7 days, and 12 flashcards to review. Start with Essay.');
  assert.equal(daySummary({ ...blank, dueSoon: 1, cardsDue: 4, firstDue: 'Quiz' }), 'You have 1 item due in the next 7 days and 4 flashcards to review. Start with Quiz.');
});

test('the next step follows the type and status', async () => {
  const { nextStep } = await rules();
  const item = (type, status, estimateHours = null) => ({ type, status, estimateHours });
  assert.equal(nextStep(item('Exam', 'Not Started')), 'Start studying');
  assert.equal(nextStep(item('Quiz', 'Not Started', 2)), 'Start studying, about 2 hours');
  assert.equal(nextStep(item('Reading', 'Not Started', 1)), 'Start reading, about 1 hour');
  assert.equal(nextStep(item('Assignment', 'Not Started')), 'Get started');
  assert.equal(nextStep(item('Exam', 'In Progress')), 'Keep going');
  assert.equal(nextStep(item('Project', 'Ready to Submit', 4)), 'Submit it');
});

const URL_BASE = 'http://localhost:4183/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-dash-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
let server;
let context;
let page;
const pageErrors = [];

async function open(profile, viewport = { width: 1280, height: 800 }) {
  await context?.close().catch(() => undefined);
  context = await chromium.launchPersistentContext(path.join(work, profile), { viewport, timezoneId: 'America/New_York' });
  await returningStudent(context);
  page = context.pages()[0] ?? (await context.newPage());
  await page.clock.setFixedTime(new Date('2026-11-04T14:30:00-05:00'));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
}
const nav = (name) => page.getByRole('navigation', { name: name === 'Settings' ? 'Account' : 'Main' }).getByRole('link', { name, exact: true }).click();
const tile = async (id) => (await page.getByTestId(`tile-${id}`).locator('b').innerText()).trim();
async function addItem(name, date, type = 'Assignment', priority = 'Normal') {
  await nav('Planner');
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Type').selectOption(type);
  await page.getByLabel('Due date', { exact: true }).fill(date);
  await page.getByLabel('Priority').selectOption(priority);
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('link', { name, exact: true }).waitFor();
}

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4183', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
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

test('a brand new student still sees the welcome screen', async () => {
  await page.getByRole('heading', { name: 'Start with one course' }).waitFor();
  assert.equal(await page.getByTestId('tile-due').count(), 0);
});

test('with only a course, the dashboard is honest that nothing is due', async () => {
  await page.getByLabel('Course name').fill('Accounting');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Accounting' }).waitFor();
  await nav('Today');
  await page.getByRole('heading', { name: 'Today: Wednesday, November 4' }).waitFor();
  assert.equal(await page.getByTestId('day-summary').innerText(), 'Nothing needs your attention right now.');
  for (const id of ['due', 'overdue', 'cards', 'weak', 'lessons']) assert.equal(await tile(id), '0', id);
  assert.equal(await tile('practice'), '—', 'no accuracy is claimed before any answers');
  await page.getByText('Nothing due in the next 7 days.').waitFor();
  await page.getByText('Nothing overdue.').waitFor();
  await page.getByText('No cards yet').waitFor();
});

test('the tiles and lists match what was saved', async () => {
  await addItem('Late essay', '2026-11-01');
  await addItem('Midterm', '2026-11-05', 'Exam', 'High');
  await addItem('Project draft', '2026-11-09', 'Project');
  await addItem('Final paper', '2026-12-20');
  await nav('Flashcards');
  await page.getByLabel('New deck').fill('Terms');
  await page.getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('heading', { name: 'Terms' }).waitFor();
  for (const [front, back] of [['One', '1'], ['Two', '2'], ['Three', '3']]) {
    await page.getByLabel('Front', { exact: true }).fill(front);
    await page.getByLabel('Back', { exact: true }).fill(back);
    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByTestId('card-row').filter({ hasText: front }).waitFor();
  }
  await nav('Today');
  await page.getByTestId('day-summary').waitFor();
  assert.equal(await page.getByTestId('day-summary').innerText(), 'You have 1 overdue item, 2 items due in the next 7 days, and 3 flashcards to review. Start with Late essay.');
  assert.equal(await tile('due'), '2');
  assert.equal(await tile('overdue'), '1');
  assert.equal(await tile('cards'), '3');
  assert.equal(await tile('weak'), '0');
  const due = await page.getByTestId('due-soon').innerText();
  assert.match(due, /Tomorrow[\s\S]*Midterm[\s\S]*Start studying[\s\S]*High/);
  assert.match(due, /Project draft[\s\S]*Get started/);
  assert.doesNotMatch(due, /Final paper|Late essay/);
  assert.match(await page.getByTestId('overdue').innerText(), /3 days overdue[\s\S]*Late essay/);
  assert.match(await page.getByTestId('today-cards').innerText(), /Terms[\s\S]*3 due/);
  await page.screenshot({ path: path.join(shots, 'dashboard-top.png') });
  await page.locator('main').evaluate((main) => { main.scrollTop = main.scrollHeight; });
  await page.screenshot({ path: path.join(shots, 'dashboard-bottom.png') });
});

test('Start studying picks the most useful thing and says why', async () => {
  await nav('Today');
  const start = page.getByTestId('start-studying');
  await start.waitFor();
  // Something is overdue, so that comes first, ahead of the due flashcards.
  assert.match(await start.getByRole('link').innerText(), /Start studying: Start Late essay/);
  assert.match(await page.getByTestId('start-reason').innerText(), /overdue, and first in your order/);
  await start.getByRole('link').click();
  await page.waitForFunction(() => location.hash.startsWith('#/planner/'));
  assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'Late essay');
  await nav('Today');
});

test('the next 7 days list each deadline once, on its day, with a status in words', async () => {
  // A study block reserved for the midterm must not count as a second thing to do.
  await page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('study-forge');
    request.onsuccess = async () => {
      const db = request.result;
      const items = await new Promise((done) => { const get = db.transaction('plannerItems').objectStore('plannerItems').getAll(); get.onsuccess = () => done(get.result); });
      const midterm = items.find((item) => item.title === 'Midterm');
      const tx = db.transaction('calendarEvents', 'readwrite');
      const base = { courseId: null, location: '', whatToDo: '', priority: 'Normal', completed: false, seriesId: '', source: 'manual', sourceCalendar: '', hidden: false, createdAt: 1, updatedAt: 1 };
      tx.objectStore('calendarEvents').put({ ...base, id: 'review', title: 'Review for midterm', kind: 'Study block', date: '2026-11-05', startTime: '10:00', endTime: '11:30', plannerItemId: midterm.id });
      tx.objectStore('calendarEvents').put({ ...base, id: 'missed', title: 'Read chapter 4', kind: 'Study block', date: '2026-11-03', startTime: '16:00', endTime: '17:00', plannerItemId: null });
      tx.objectStore('calendarEvents').put({ ...base, id: 'lecture', title: 'Lecture', kind: 'Class', date: '2026-11-02', startTime: '09:00', endTime: '10:00', plannerItemId: null });
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await page.reload();
  await nav('Today');
  const week = page.getByTestId('week-workload');
  await week.waitFor();
  const days = week.getByTestId('week-day');
  assert.equal(await days.count(), 7);
  assert.equal(await days.first().getAttribute('data-date'), '2026-11-04');
  const thursday = week.locator('[data-testid=week-day][data-date="2026-11-05"]');
  assert.equal(await thursday.getByTestId('week-deadline').count(), 1);
  const midterm = await thursday.getByTestId('week-deadline').innerText();
  assert.match(midterm, /Due soon[\s\S]*Midterm[\s\S]*Study time reserved 10:00 AM to 11:30 AM/);
  assert.equal(await thursday.locator('.week-event').count(), 0, 'the reserved block is not listed twice');
  assert.match(await week.locator('[data-testid=week-day][data-date="2026-11-09"]').innerText(), /Project draft/);
  assert.match(await page.getByTestId('week-totals').innerText(), /^2 deadlines[\s\S]*1 hour 30 minutes of study blocks planned|^2 deadlines[\s\S]*1h 30m of study blocks planned|^2 deadlines/);
  assert.doesNotMatch(await week.innerText(), /Late essay|Final paper/, 'overdue and far-off work are not in the week');
});

test('a missed study block of the student\'s own can move, and deadlines never do', async () => {
  const missed = page.getByTestId('missed-study');
  await missed.waitFor();
  assert.match(await missed.innerText(), /Read chapter 4/);
  assert.doesNotMatch(await missed.innerText(), /Lecture|Midterm/);
  await missed.getByRole('button', { name: 'Move Read chapter 4 to tomorrow' }).click();
  await missed.waitFor({ state: 'detached' });
  assert.match(await page.locator('[data-testid=week-day][data-date="2026-11-05"]').innerText(), /Read chapter 4/);
});

test('the last 7 days say exactly what they count, from saved records only', async () => {
  const look = page.getByTestId('week-look');
  await look.waitFor();
  assert.match(await page.getByTestId('bar-deadlines').innerText(), /Deadlines from the last 7 days[\s\S]*0 of 1 done/);
  assert.match(await page.getByTestId('bar-cards').innerText(), /Flashcards today[\s\S]*0 of 3 cards reviewed/);
  assert.match(await page.getByTestId('bar-days').innerText(), /0 of 7 days/);
  assert.match(await look.innerText(), /not the same as mastery/);
  const bar = page.getByTestId('bar-deadlines').getByRole('progressbar');
  assert.equal(await bar.getAttribute('aria-label'), 'Deadlines from the last 7 days: 0 of 1 done');
});

test('the numbers change when the work changes, and every tile goes somewhere useful', async () => {
  await page.getByRole('button', { name: 'Mark Midterm done' }).click();
  await page.getByTestId('due-soon').getByRole('link', { name: 'Midterm' }).waitFor({ state: 'detached' });
  assert.equal(await tile('due'), '1');
  await page.getByTestId('tile-cards').click();
  await page.getByRole('heading', { name: 'Review' }).waitFor();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByRole('group', { name: 'How well did you remember it?' }).getByRole('button', { name: /^Again/ }).click();
  await page.getByTestId('card-back').waitFor({ state: 'detached' });
  await nav('Today');
  await page.getByTestId('tile-weak').waitFor();
  assert.equal(await tile('weak'), '1');
  assert.equal(await tile('cards'), '3', 'a card pressed Again is still due today');
  await page.getByTestId('tile-overdue').click();
  await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();
  await nav('Today');
  await page.getByRole('link', { name: 'Add a deadline' }).click();
  await page.getByRole('heading', { name: 'Add item' }).waitFor();
  await page.getByRole('link', { name: 'Cancel' }).click();
});

test('the dashboard explains what its numbers mean', async () => {
  await nav('Today');
  const text = await page.getByTestId('what-this-counts').innerText();
  assert.match(text, /never makes up assignments or dates/);
  for (const words of ['Due and overdue', 'Flashcards due', 'Weak cards', 'Lessons to review']) assert.ok(text.includes(words), words);
});

test('a lesson that needs review is counted, and study next still shows', async () => {
  await nav('Study');
  await page.getByRole('button', { name: /sample lesson/i }).click();
  await nav('Today');
  await page.getByTestId('next-up').getByRole('link').nth(1).waitFor();
  assert.equal(await tile('lessons'), '0', 'a lesson only counts once answers say it needs review');
});

test('it fits a phone, with the numbers side by side', async () => {
  await context.close();
  context = await chromium.launchPersistentContext(path.join(work, 'main'), { viewport: { width: 360, height: 700 }, timezoneId: 'America/New_York' });
  await returningStudent(context);
  page = context.pages()[0] ?? (await context.newPage());
  await page.clock.setFixedTime(new Date('2026-11-04T14:30:00-05:00'));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
  await page.getByTestId('tile-due').waitFor();
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main');
    return Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth);
  });
  assert.ok(overflow <= 0, `sideways overflow of ${overflow}px`);
  const first = await page.getByTestId('tile-due').boundingBox();
  const second = await page.getByTestId('tile-overdue').boundingBox();
  assert.equal(first.y, second.y);
  await page.screenshot({ path: path.join(shots, 'phone-dashboard.png') });
  const button = await page.getByRole('button', { name: 'Mark Project draft done' }).boundingBox();
  assert.ok(button.x + button.width <= 360);
  await page.getByRole('button', { name: 'Mark Project draft done' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, 'phone-dashboard-due.png') });
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
