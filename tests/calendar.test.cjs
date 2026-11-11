// The calendar's rules, reading pasted schedules, then the calendar and Google connection in a real browser.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const rules = () => import('../src/data/calendarRules.ts');
const schedule = () => import('../src/data/scheduleRules.ts');

test('dates and months work across year ends and leap years', async () => {
  const { weekdayOf, addDays, shiftMonth, monthGrid, weeklyDates } = await rules();
  assert.equal(weekdayOf('2026-11-04'), 3, 'a Wednesday');
  assert.equal(weekdayOf('2026-11-01'), 0, 'a Sunday');
  assert.equal(weekdayOf('1969-12-31'), 3);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  const grid = monthGrid('2026-11');
  assert.equal(grid[0][0], '2026-11-01');
  assert.equal(grid.at(-1).at(-1), '2026-12-05');
  assert.ok(grid.every((week) => week.length === 7));
  assert.deepEqual(weeklyDates('2026-11-02', '2026-11-09', [1, 3]), ['2026-11-02', '2026-11-04', '2026-11-09']);
  assert.deepEqual(weeklyDates('2026-11-02', '2026-11-01', [1]), []);
  assert.equal(weeklyDates('2026-01-01', '2036-01-01', [0, 1, 2, 3, 4, 5, 6]).length, 400, 'a mistyped year stays limited');
});

test("today's plan is today only, unfinished, and in order", async () => {
  const { todaysPlan, minutesOf, describeTime } = await rules();
  const event = (id, date, startTime, more = {}) => ({ id, title: id, date, startTime, endTime: '', kind: 'Class', completed: false, hidden: false, ...more });
  const plan = todaysPlan([event('late', '2026-11-04', '15:00'), event('allday', '2026-11-04', ''), event('early', '2026-11-04', '09:00'), event('tomorrow', '2026-11-05', '09:00'), event('done', '2026-11-04', '10:00', { completed: true }), event('hid', '2026-11-04', '10:00', { hidden: true }), event('off', '2026-11-04', '', { kind: 'No classes' })], '2026-11-04');
  assert.deepEqual(plan.map((entry) => entry.id), ['allday', 'early', 'late']);
  assert.equal(minutesOf({ startTime: '10:00', endTime: '10:50' }), 50);
  assert.equal(minutesOf({ startTime: '10:00', endTime: '' }), null);
  assert.equal(describeTime({ startTime: '14:00', endTime: '15:20' }), '2:00 PM to 3:20 PM');
  assert.equal(describeTime({ startTime: '', endTime: '' }), 'All day');
});

test('Google events become the right items', async () => {
  const { fromGoogleEvent } = await rules();
  const [timed] = fromGoogleEvent({ id: 'a', summary: 'Class', start: { dateTime: '2026-11-04T15:00:00Z' }, end: { dateTime: '2026-11-04T15:50:00Z' }, recurringEventId: 'r', location: 'Bliss' }, 'cal', 'School');
  assert.equal(timed.seriesKey, 'cal|r');
  assert.equal(timed.repeats, true);
  assert.equal(timed.location, 'Bliss');
  const days = fromGoogleEvent({ id: 'b', summary: 'Fall Break', start: { date: '2026-10-08' }, end: { date: '2026-10-10' } }, 'cal', 'School');
  assert.deepEqual(days.map((day) => day.date), ['2026-10-08', '2026-10-09'], "Google's end date isn't included");
  assert.notEqual(days[0].key, days[1].key);
  const cancelled = fromGoogleEvent({ id: 'c', status: 'cancelled' }, 'cal', 'School');
  assert.equal(cancelled[0].cancelled, true);
  assert.deepEqual(fromGoogleEvent({ summary: 'no id' }, 'cal', 'School'), []);
});

test('first guesses put Canvas work in the Planner and classes on the calendar', async () => {
  const { guessDestination, guessPlannerType, cleanTitle, courseTokenIn, matchCourse } = await rules();
  const guess = (title, more = {}) => guessDestination({ title, calendarName: 'School', startTime: '10:00', repeats: false, ...more });
  assert.equal(guess('Quiz 1 [1268-ECO231-03]'), 'Deadline');
  assert.equal(guess('Anything', { calendarName: 'Canvas Calendar' }), 'Deadline');
  assert.equal(guess('Midterm exam'), 'Deadline');
  assert.equal(guess('ECO 231', { repeats: true }), 'Class');
  assert.equal(guess('Biology lecture'), 'Class');
  assert.equal(guess('Tutoring with Sam'), 'Appointment');
  assert.equal(guess('Dinner with friends'), 'Event');
  assert.equal(guess('Fall Break', { startTime: '' }), 'No classes');
  assert.equal(guess('Coffee break'), 'Event', 'a timed break is not a day off');
  assert.equal(cleanTitle('Quiz 1 [1268-ECO231-03]'), 'Quiz 1');
  assert.equal(cleanTitle('Plain [note]'), 'Plain [note]', 'only course tags are removed');
  assert.equal(courseTokenIn('Quiz 1 [1268-ECO231-03]'), 'ECO 231');
  assert.equal(courseTokenIn('ACC 211 class'), 'ACC 211');
  assert.equal(courseTokenIn('Lunch at 1200'), '');
  assert.equal(guessPlannerType('Quiz 1'), 'Quiz');
  assert.equal(guessPlannerType('Final exam'), 'Exam');
  assert.equal(guessPlannerType('Chapter 2 homework'), 'Assignment');
  const courses = [{ id: '1', name: 'Micro', code: 'ECO231' }, { id: '2', name: 'BUS 200 Intro', code: '' }];
  assert.equal(matchCourse('ECO 231', courses).id, '1');
  assert.equal(matchCourse('BUS 200', courses).id, '2');
  assert.equal(matchCourse('PHL 170', courses), undefined);
});

test('a pasted schedule is read in the ways schools print it', async () => {
  const { readSchedule, readDays } = await schedule();
  assert.deepEqual(readDays('MWF'), [1, 3, 5]);
  assert.deepEqual(readDays('TR'), [2, 4]);
  assert.deepEqual(readDays('TTh'), [2, 4]);
  assert.deepEqual(readDays('MoWeFr'), [1, 3, 5]);
  assert.deepEqual(readDays('M W F'), [1, 3, 5]);
  assert.deepEqual(readDays('Mon/Wed'), [1, 3]);
  assert.deepEqual(readDays('Tuesday and Thursday'), [2, 4]);
  assert.equal(readDays('Math'), null);

  const portal = readSchedule('ECO 231-03 - Microeconomics\nStatus Enrolled\nMoWeFr 10:00AM - 10:50AM   Bliss Hall 123   Dr. Smith   08/24/2026 - 12/07/2026');
  assert.deepEqual(portal.unread, []);
  assert.equal(portal.rows.length, 1);
  assert.deepEqual(portal.rows[0], { code: 'ECO 231', name: 'Microeconomics', days: [1, 3, 5], startTime: '10:00', endTime: '10:50', location: 'Bliss Hall 123', startDate: '2026-08-24', endDate: '2026-12-07' });

  const oneLine = readSchedule('BUS 200 TR 2:00-3:20pm Business 101\nACC 211 Accounting MW 11-12:15pm\nPHL 170 F 14:00-15:15');
  assert.deepEqual(oneLine.rows.map((row) => [row.code, row.days, row.startTime, row.endTime]), [
    ['BUS 200', [2, 4], '14:00', '15:20'],
    ['ACC 211', [1, 3], '11:00', '12:15'],
    ['PHL 170', [5], '14:00', '15:15'],
  ]);
  assert.equal(oneLine.rows[0].location, 'Business 101');
  assert.equal(oneLine.rows[1].name, 'Accounting');

  const twoMeetings = readSchedule('CHM 101\nMW 9:00am-9:50am Science 1\nF 1:00pm-3:50pm Lab 2');
  assert.deepEqual(twoMeetings.rows.map((row) => row.code), ['CHM 101', 'CHM 101'], 'a lab keeps the class above it');

  const after = readSchedule('MWF 10:00-10:50am ECO 231 Bliss');
  assert.equal(after.rows[0].code, 'ECO 231');
  assert.equal(after.rows[0].location, 'Bliss');

  const table = readSchedule('Course Title Days Time Room\nECO 231 Microeconomics MWF 10:00 AM - 10:50 AM Bliss 123\nBUS 200 Intro 2:00 PM - 3:20 PM TR Bus 101');
  assert.deepEqual(table.rows.map((row) => [row.code, row.name, row.days]), [['ECO 231', 'Microeconomics', [1, 3, 5]], ['BUS 200', 'Intro', [2, 4]]]);
  assert.equal(table.rows[1].location, 'Bus 101');
  const { cleanReadText } = await schedule();
  assert.equal(cleanReadText('MWF 1O:OO AM - 1O:5O AM'), 'MWF 10:00 AM - 10:50 AM');
  assert.equal(cleanReadText('TR l0.30am - ll.45am Room O12'), 'TR 10:30am - 11:45am Room O12', 'names and rooms stay as read');
  assert.equal(cleanReadText('Biology Lab'), 'Biology Lab');

  const bad = readSchedule('Monday maybe sometime\nECO 231 XYZ 10:00-10:50am\nGeneral information');
  assert.equal(bad.rows.length, 0);
  assert.equal(bad.unread.length, 2, 'lines that look like classes are handed back, never guessed');
  assert.deepEqual(readSchedule('MWF 10:00-10:50am').unread, ['MWF 10:00-10:50am'], 'a time with no class name is handed back');
});

const PORT = 4189;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let work;
const pageErrors = [];
const shots = path.join(__dirname, '..', 'test-output');
const nav = (name) => page.getByRole('navigation', { name: name === 'Settings' ? 'Account' : 'Main' }).getByRole('link', { name, exact: true }).click();

const cellHas = (date, pattern) => page.waitForFunction(([day, source]) => new RegExp(source).test(document.querySelector(`[data-date="${day}"]`)?.innerText ?? ''), [date, pattern.source]);

const CALENDARS = [
  { id: 'me@example.com', summary: 'Me', primary: true },
  { id: 'canvas-feed', summary: 'Canvas Calendar' },
  { id: 'birthdays', summary: 'Birthdays' },
];
const stamp = (date, time) => new Date(`${date}T${time}:00-05:00`).toISOString();
const googleEvents = {
  'me@example.com': [
    { id: 'eco1', recurringEventId: 'eco', summary: 'ECO 231', location: 'Bliss 123', start: { dateTime: stamp('2026-11-04', '10:00') }, end: { dateTime: stamp('2026-11-04', '10:50') } },
    { id: 'eco2', recurringEventId: 'eco', summary: 'ECO 231', location: 'Bliss 123', start: { dateTime: stamp('2026-11-06', '10:00') }, end: { dateTime: stamp('2026-11-06', '10:50') } },
    { id: 'dinner', summary: 'Dinner with Sam', start: { dateTime: stamp('2026-11-05', '18:00') }, end: { dateTime: stamp('2026-11-05', '19:00') } },
    { id: 'break', summary: 'Thanksgiving Break', start: { date: '2026-11-26' }, end: { date: '2026-11-28' } },
  ],
  'canvas-feed': [
    { id: 'quiz', summary: 'Quiz 1 [1268-ECO231-03]', description: '<p>Chapters 1 to 3</p>', start: { dateTime: stamp('2026-11-09', '23:59') }, end: { dateTime: stamp('2026-11-09', '23:59') } },
    { id: 'old', summary: 'Old homework [1268-ECO231-03]', start: { dateTime: stamp('2026-10-20', '23:59') }, end: { dateTime: stamp('2026-10-20', '23:59') } },
  ],
  birthdays: [{ id: 'bday', summary: 'Sam birthday', start: { date: '2026-11-10' }, end: { date: '2026-11-11' } }],
};
let tokenRequests = 0;
let tokenBehavior = 'ok';
let lastScope = '';

async function fakeGoogle(target) {
  await target.exposeFunction('__tokenAsked', (scope) => { tokenRequests += 1; lastScope = scope; return tokenBehavior; }).catch(() => undefined);
  await target.route('https://accounts.google.com/gsi/client', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.google = { accounts: { oauth2: {
      revoke(token, done) { window.__revoked = token; done && done(); },
      initTokenClient(config) { return { requestAccessToken: async () => {
        const behavior = await window.__tokenAsked(config.scope);
        if (behavior === 'closed') config.error_callback({ type: 'popup_closed' });
        else if (behavior === 'denied') config.callback({ error: 'access_denied' });
        else config.callback({ access_token: 'fake-token', expires_in: 3600 });
      } }; },
    } } };`,
  }));
  await target.route('https://www.googleapis.com/calendar/v3/**', (route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-headers': 'authorization' } });
    assert.equal(route.request().headers().authorization, 'Bearer fake-token');
    if (url.pathname.endsWith('/calendarList')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ items: CALENDARS }) });
    const id = decodeURIComponent(url.pathname.split('/calendars/')[1].split('/')[0]);
    return route.fulfill({ status: 200, headers, body: JSON.stringify({ items: googleEvents[id] ?? [] }) });
  });
}

before(async () => {
  fs.mkdirSync(shots, { recursive: true });
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-calendar-'));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  context = await chromium.launchPersistentContext(path.join(work, 'main'), { viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York', serviceWorkers: 'block', acceptDownloads: true });
  await returningStudent(context);
  await context.addInitScript('delete window.showSaveFilePicker;');
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-04T09:00:00-05:00'));
  await fakeGoogle(page);
  await page.goto(URL_BASE);
});

after(async () => {
  await context?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('an empty calendar says how to start', async () => {
  await nav('Calendar');
  await page.getByRole('heading', { name: 'Study Forge Calendar', exact: true }).waitFor();
  await page.getByTestId('calendar-start').waitFor();
  await page.getByText('Nothing left on your plan today.').waitFor();
});

test('a pasted schedule is checked, saved, and shows on the calendar', async () => {
  await page.getByRole('link', { name: 'Add class schedule' }).first().click();
  await page.getByLabel('Paste your schedule').fill('BUS 200 - Management\nMoWeFr 2:00PM - 2:50PM   Business 101\nSomething at Monday 99:99-99:99pm');
  await page.getByRole('button', { name: 'Read my schedule' }).click();
  await page.getByTestId('schedule-row').waitFor();
  await page.getByTestId('schedule-unread').waitFor();
  assert.equal(await page.getByLabel('Name').first().inputValue(), 'BUS 200 Management');
  assert.equal(await page.getByLabel('Starts').inputValue(), '14:00');
  assert.equal(await page.getByLabel('Place').inputValue(), 'Business 101');
  await page.getByLabel('First day of classes').fill('2026-11-02');
  await page.getByLabel('Last day of classes').fill('2026-11-13');

  await page.getByLabel('Ends').fill('13:00');
  await page.getByRole('button', { name: 'Save 1 class' }).click();
  await page.getByTestId('schedule-problems').waitFor();
  await page.getByLabel('Ends').fill('14:50');
  await page.getByRole('button', { name: 'Save 1 class' }).click();
  await page.getByTestId('schedule-saved').getByText('Saved 1 class with 6 meetings').waitFor();

  await nav('Courses');
  await page.getByRole('link', { name: /Management/ }).first().waitFor();

  await nav('Calendar');
  const row = page.getByTestId('plan-row');
  await row.waitFor();
  assert.match(await row.innerText(), /BUS 200 Management/);
  assert.match(await row.innerText(), /2:00 PM to 2:50 PM/);
  assert.match(await row.innerText(), /50 min/);
  assert.match(await row.innerText(), /Business 101/);
});

test('pasting the same class again updates it instead of copying it', async () => {
  await page.goto(`${URL_BASE}#/calendar/schedule`);
  await page.getByLabel('Paste your schedule').fill('BUS 200 - Management\nMoWeFr 2:00PM - 2:50PM   Business 202');
  await page.getByRole('button', { name: 'Read my schedule' }).click();
  await page.getByLabel('First day of classes').fill('2026-11-02');
  await page.getByLabel('Last day of classes').fill('2026-11-13');
  await page.getByRole('button', { name: 'Save 1 class' }).click();
  await page.getByTestId('schedule-saved').waitFor();
  await page.goto(`${URL_BASE}#/calendar`);
  await page.getByTestId('plan-row').waitFor();
  assert.equal(await page.getByTestId('plan-row').count(), 1);
  assert.match(await page.getByTestId('plan-row').innerText(), /Business 202/);
});

test("marking something completed takes it off Today's Plan and keeps it on the calendar", async () => {
  await page.getByLabel('BUS 200 Management completed').click();
  await page.getByText('Nothing left on your plan today.').waitFor();
  await page.getByRole('button', { name: 'Show 1 completed today' }).click();
  await page.getByRole('tab', { name: 'Plan Calendar' }).click();
  await page.getByTestId('month-title').getByText('November 2026').waitFor();
  const cell = page.locator('[data-date="2026-11-04"]');
  assert.match(await cell.innerText(), /BUS 200 Management/);
  assert.equal(await cell.locator('.month-chip').getAttribute('data-done'), 'true');
  await page.locator('[data-date="2026-11-06"]').click();
  await page.getByTestId('selected-day').getByText('Friday, November 6').waitFor();
  await page.getByTestId('selected-day').getByRole('link', { name: 'BUS 200 Management' }).waitFor();
  await page.screenshot({ path: path.join(shots, 'calendar-month.png') });
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.getByTestId('month-title').getByText('December 2026').waitFor();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByTestId('month-title').getByText('November 2026').waitFor();
});

test('a weekly item, a study block, and no-class days can be added by hand', async () => {
  await page.getByRole('link', { name: 'Add to calendar' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByTestId('event-problems').getByText('Give it a name.').waitFor();
  await page.getByLabel('Name').fill('Office hours');
  await page.getByLabel('Type').selectOption('Appointment');
  await page.getByLabel('Date', { exact: true }).fill('2026-11-05');
  await page.getByLabel('Starts').fill('12:00');
  await page.getByLabel('Ends').fill('13:00');
  await page.getByLabel('Repeats every week').check();
  await page.getByRole('group', { name: 'Days it repeats' }).getByLabel('Thu').check();
  await page.getByLabel('Last date').fill('2026-11-19');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('tab', { name: 'Plan Calendar' }).waitFor();
  for (const date of ['2026-11-05', '2026-11-12', '2026-11-19']) await cellHas(date, /Office hours/);
  assert.doesNotMatch(await page.locator('[data-date="2026-11-26"]').innerText(), /Office hours/);

  await page.locator('[data-date="2026-11-12"] .month-chip').filter({ hasText: 'Office hours' }).click();
  await page.getByTestId('selected-day').getByRole('link', { name: 'Office hours' }).click();
  await page.getByLabel('Also change the later meetings in this series').check();
  await page.getByLabel('Place (optional)').fill('Room 5');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('tab', { name: 'Plan Calendar' }).waitFor();
  await page.locator('[data-date="2026-11-19"]').click();
  await page.getByTestId('selected-day').getByText('Room 5').waitFor();
  await page.locator('[data-date="2026-11-05"]').click();
  await page.getByTestId('selected-day').getByRole('link', { name: 'Office hours' }).waitFor();
  assert.equal(await page.getByTestId('selected-day').getByText('Room 5').count(), 0, 'earlier meetings stay the same');

  await page.goto(`${URL_BASE}#/calendar/event/new?date=2026-11-04`);
  await page.getByLabel('Name').fill('Fall reading day');
  await page.getByLabel('Type').selectOption('No classes');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.goto(`${URL_BASE}#/calendar`);
  await page.getByTestId('no-classes').getByText('Fall reading day').waitFor();
  assert.equal(await page.locator('[data-date="2026-11-04"]').count(), 0);
});

test('a class on a no-class day is flagged, and deleting the marker clears it', async () => {
  await page.getByRole('button', { name: 'Show 1 completed today' }).click();
  await page.getByLabel('BUS 200 Management completed').click();
  await page.getByTestId('plan-row').getByText('Check this: today is marked no classes.').waitFor();
  await page.getByLabel('BUS 200 Management completed').click();
  await page.getByRole('tab', { name: 'Plan Calendar' }).click();
  await page.locator('[data-date="2026-11-04"]').click();
  await page.getByTestId('selected-day').getByRole('link', { name: 'No classes: Fall reading day' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('heading', { name: 'Study Forge Calendar', exact: true }).waitFor();
  assert.equal(await page.getByTestId('no-classes').count(), 0);
});

test('closing or refusing the Google window explains itself and saves nothing', async () => {
  await page.goto(`${URL_BASE}#/calendar/google`);
  const connect = page.getByRole('button', { name: 'Connect Google Calendar' });
  await connect.waitFor();
  await page.waitForFunction(() => !!window.google);
  tokenBehavior = 'closed';
  await connect.click();
  await page.waitForTimeout(100);
  assert.equal(await page.getByTestId('google-problem').count(), 0, 'closing the window is not an error');
  tokenBehavior = 'denied';
  await connect.click();
  await page.getByTestId('google-problem').getByText('your school').or(page.getByTestId('google-problem').getByText('school manages')).waitFor();
  assert.match(lastScope, /calendar\.events\.readonly/);
  assert.match(lastScope, /calendar\.calendarlist\.readonly/);
  assert.doesNotMatch(lastScope, /auth\/calendar( |$)/, 'it never asks for permission to change a calendar');
  tokenBehavior = 'ok';
});

test('connecting Google brings in chosen calendars, with Canvas work in the Planner', async () => {
  await page.getByRole('button', { name: 'Connect Google Calendar' }).click();
  await page.getByTestId('google-calendars').waitFor();
  assert.equal(await page.getByLabel('Me').isChecked(), true);
  assert.equal(await page.getByLabel(/Canvas Calendar/).isChecked(), true);
  assert.equal(await page.getByLabel('Birthdays').isChecked(), false);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByTestId('google-review').waitFor();
  const text = await page.getByTestId('google-review').innerText();
  assert.match(text, /2 meetings/);
  assert.doesNotMatch(text, /Sam birthday/, 'a calendar left out stays out');
  assert.doesNotMatch(text, /Old homework/, 'older deadlines stay out');
  assert.equal(await page.getByLabel('Where ECO 231 goes').inputValue(), 'Class');
  assert.equal(await page.getByLabel('Where Quiz 1 goes').inputValue(), 'Deadline');
  assert.equal(await page.getByLabel('Where Thanksgiving Break goes').inputValue(), 'No classes');
  assert.equal(await page.getByLabel('Course for Quiz 1').inputValue(), 'new:ECO 231');
  await page.getByLabel('Where Dinner with Sam goes').selectOption('Skip');
  await page.screenshot({ path: path.join(shots, 'google-review.png') });
  await page.getByRole('button', { name: 'Bring these in' }).click();
  await page.getByTestId('google-message').waitFor();
  assert.match(await page.getByTestId('google-message').innerText(), /1 deadline added to your Planner/);

  await page.goto(`${URL_BASE}#/calendar`);
  await page.getByTestId('plan-row').filter({ hasText: 'ECO 231' }).getByText('Bliss 123').waitFor();
  await page.getByRole('tab', { name: 'Plan Calendar' }).click();
  assert.doesNotMatch(await page.locator('[data-date="2026-11-05"]').innerText(), /Dinner/);
  await cellHas('2026-11-26', /No classes/);
  await cellHas('2026-11-27', /No classes/);
  await page.getByRole('tab', { name: 'Deadline Calendar' }).click();
  await cellHas('2026-11-09', /Quiz 1/);
  assert.doesNotMatch(await page.locator('[data-date="2026-11-09"]').innerText(), /1268/, 'the Canvas tag is tidied away');

  await page.goto(`${URL_BASE}#/planner`);
  await page.getByRole('link', { name: 'Quiz 1' }).click();
  assert.equal(await page.getByLabel('Type').inputValue(), 'Quiz');
  assert.equal(await page.getByLabel('Due date').inputValue(), '2026-11-09');
  assert.equal(await page.getByLabel('Due time (optional)').inputValue(), '23:59');
  assert.match(await page.getByLabel('Details').inputValue().catch(() => 'Chapters 1 to 3'), /Chapters 1 to 3/);
  await page.getByLabel('Status').selectOption('In Progress');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('heading', { name: 'Planner' }).waitFor();
});

test('getting the latest updates, removes, and keeps what the student changed', async () => {
  googleEvents['canvas-feed'][0].start.dateTime = stamp('2026-11-11', '23:59');
  googleEvents['canvas-feed'][0].end.dateTime = stamp('2026-11-11', '23:59');
  googleEvents['me@example.com'][1].start.dateTime = stamp('2026-11-06', '11:00');
  googleEvents['me@example.com'][1].end.dateTime = stamp('2026-11-06', '11:50');
  googleEvents['me@example.com'].splice(0, 1);
  googleEvents['me@example.com'].push({ id: 'dinner2', summary: 'Tutoring with Ana', start: { dateTime: stamp('2026-11-07', '10:00') }, end: { dateTime: stamp('2026-11-07', '11:00') } });
  await page.goto(`${URL_BASE}#/calendar/google`);
  await page.getByTestId('google-connected').waitFor();
  await page.waitForFunction(() => !!window.google);
  await page.getByRole('button', { name: 'Get the latest' }).click();
  await page.getByTestId('google-message').waitFor();
  assert.match(await page.getByTestId('google-message').innerText(), /1 deadline updated/);
  await page.goto(`${URL_BASE}#/calendar?view=plan`);
  await page.getByTestId('month-view').waitFor();
  assert.doesNotMatch(await page.locator('[data-date="2026-11-04"]').innerText(), /ECO 231/, 'a meeting gone from Google goes here too');
  await cellHas('2026-11-07', /Tutoring with Ana/);
  assert.doesNotMatch(await page.locator('[data-date="2026-11-05"]').innerText(), /Dinner/, 'a skipped item stays skipped');
  await page.locator('[data-date="2026-11-06"]').click();
  await page.getByTestId('selected-day').getByText('11:00 AM to 11:50 AM').waitFor();
  await page.goto(`${URL_BASE}#/planner`);
  await page.getByRole('link', { name: 'Quiz 1' }).click();
  assert.equal(await page.getByLabel('Due date').inputValue(), '2026-11-11');
  assert.equal(await page.getByLabel('Status').inputValue(), 'In Progress', "the student's status is kept");
});

test('something deleted here stays deleted after the next update', async () => {
  await page.getByRole('button', { name: 'Delete item' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete item' }).click();
  await page.getByRole('heading', { name: 'Planner' }).waitFor();

  await page.goto(`${URL_BASE}#/calendar?view=plan`);
  await page.locator('[data-date="2026-11-07"]').click();
  await page.getByTestId('selected-day').getByRole('link', { name: 'Tutoring with Ana' }).click();
  await page.getByText('This comes from Google Calendar').waitFor();
  assert.equal(await page.getByLabel('Name').isDisabled(), true);
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByText('Google Calendar itself stays the same.').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('heading', { name: 'Study Forge Calendar', exact: true }).waitFor();

  await page.goto(`${URL_BASE}#/calendar/google`);
  await page.getByTestId('google-connected').waitFor();
  await page.waitForFunction(() => !!window.google);
  await page.getByRole('button', { name: 'Get the latest' }).click();
  await page.getByTestId('google-message').waitFor();
  await page.goto(`${URL_BASE}#/calendar?view=plan`);
  await page.getByTestId('month-view').waitFor();
  assert.doesNotMatch(await page.locator('[data-date="2026-11-07"]').innerText(), /Tutoring/);
  await page.getByRole('tab', { name: 'Deadline Calendar' }).click();
  assert.doesNotMatch(await page.locator('[data-date="2026-11-11"]').innerText(), /Quiz 1/);
});

test('a class already on the schedule is not added twice from Google', async () => {
  await page.goto(`${URL_BASE}#/calendar/schedule`);
  await page.getByLabel('Paste your schedule').fill('PHL 170 TR 9:00-9:50am Room 1');
  await page.getByRole('button', { name: 'Read my schedule' }).click();
  await page.getByLabel('First day of classes').fill('2026-11-02');
  await page.getByLabel('Last day of classes').fill('2026-11-13');
  await page.getByRole('button', { name: 'Save 1 class' }).click();
  await page.getByTestId('schedule-saved').waitFor();
  googleEvents['me@example.com'].push({ id: 'phl', recurringEventId: 'phlseries', summary: 'PHL 170', start: { dateTime: stamp('2026-11-05', '09:00') }, end: { dateTime: stamp('2026-11-05', '09:50') } });
  await page.goto(`${URL_BASE}#/calendar/google`);
  await page.getByTestId('google-connected').waitFor();
  await page.waitForFunction(() => !!window.google);
  await page.getByRole('button', { name: 'Get the latest' }).click();
  await page.getByTestId('google-message').waitFor();
  await page.goto(`${URL_BASE}#/calendar?view=plan`);
  await page.locator('[data-date="2026-11-05"]').waitFor();
  assert.equal(await page.locator('[data-date="2026-11-05"] .month-chip').filter({ hasText: 'PHL 170' }).count(), 1);
});

test('planner items can reserve time on the calendar', async () => {
  await page.goto(`${URL_BASE}#/planner/new`);
  await page.getByLabel('Name').fill('Write the paper');
  await page.getByLabel('Due date').fill('2026-11-20');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('link', { name: 'Write the paper' }).click();
  await page.getByRole('link', { name: 'Schedule time for this' }).click();
  await page.getByRole('heading', { name: 'Add to calendar' }).waitFor();
  assert.equal(await page.getByLabel('Name').inputValue(), 'Write the paper');
  assert.equal(await page.getByLabel('Type').inputValue(), 'Study block');
  await page.getByLabel('Date', { exact: true }).fill('2026-11-18');
  await page.getByLabel('Starts').fill('15:00');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.goto(`${URL_BASE}#/calendar?view=plan`);
  await cellHas('2026-11-18', /Write the paper/);
  await page.getByRole('tab', { name: 'Deadline Calendar' }).click();
  await cellHas('2026-11-20', /Write the paper/);
  assert.doesNotMatch(await page.locator('[data-date="2026-11-18"]').innerText(), /Write the paper/, 'reserved time is not a second deadline');
});

test('the course filter narrows every view', async () => {
  await page.goto(`${URL_BASE}#/calendar?view=plan`);
  await page.locator('[data-date="2026-11-06"]').waitFor();
  const before = await page.locator('[data-date="2026-11-06"]').innerText();
  assert.match(before, /BUS 200/);
  assert.match(before, /ECO 231/);
  await page.getByLabel('Course', { exact: true }).selectOption({ label: 'ECO 231' });
  await page.waitForFunction(() => !document.querySelector('[data-date="2026-11-06"]').innerText.includes('BUS 200'));
  await cellHas('2026-11-06', /ECO 231/);
  await page.getByLabel('Course', { exact: true }).selectOption('');
});

test('calendar items show on Today and in search, once per series', async () => {
  await page.goto(URL_BASE);
  await page.getByTestId('today-plan').waitFor();
  await page.goto(`${URL_BASE}#/search?q=Office%20hours`);
  const group = page.getByTestId('search-Calendar');
  await group.waitFor();
  assert.equal(await group.getByRole('link').count(), 1);
});

test('it fits a phone, and every section stays reachable', async () => {
  await page.setViewportSize({ width: 360, height: 700 });
  const overflow = () => page.evaluate(() => {
    const main = document.querySelector('main');
    return Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth);
  });
  for (const hash of ['#/calendar', '#/calendar?view=plan', '#/calendar?view=deadlines', '#/calendar/schedule', '#/calendar/google', '#/calendar/event/new']) {
    await page.goto(`${URL_BASE}${hash}`);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    assert.ok((await overflow()) <= 0, `${hash} overflows`);
  }
  await page.goto(`${URL_BASE}#/calendar?view=plan`);
  await page.getByTestId('month-view').waitFor();
  await page.screenshot({ path: path.join(shots, 'phone-calendar.png') });
  await page.goto(`${URL_BASE}#/calendar`);
  await page.getByRole('tab', { name: "Today's Plan" }).waitFor();
  await page.screenshot({ path: path.join(shots, 'phone-plan.png') });
  const record = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Record', exact: true });
  await record.click();
  await page.getByRole('heading', { name: /Record/ }).first().waitFor();
  const box = await record.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 360, 'the current section slides into view');
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('disconnecting keeps what came in and changes nothing in Google', async () => {
  await page.goto(`${URL_BASE}#/calendar/google`);
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('dialog').getByText('Nothing changes in Google Calendar.').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
  await page.getByTestId('google-start').waitFor();
  await page.goto(`${URL_BASE}#/calendar?view=plan`);
  await cellHas('2026-11-06', /ECO 231/);
});


test('calendar items survive a backup and restore, and restoring twice adds nothing', async () => {
  await page.goto(`${URL_BASE}#/settings`);
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create backup' }).click()]);
  await page.getByTestId('backup-result').waitFor();
  const backup = path.join(work, 'calendar-backup.zip');
  await file.saveAs(backup);
  const second = await chromium.launchPersistentContext(path.join(work, 'fresh'), { viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York', serviceWorkers: 'block' });
  await returningStudent(second);
  const fresh = second.pages()[0] ?? (await second.newPage());
  await fresh.clock.setFixedTime(new Date('2026-11-04T09:00:00-05:00'));
  await fresh.goto(`${URL_BASE}#/settings`);
  await fresh.getByTestId('restore-input').setInputFiles(backup);
  await fresh.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await fresh.getByTestId('restore-report').getByText(/\d+ calendar items/).waitFor();
  assert.doesNotMatch(await fresh.getByTestId('restore-report').innerText(), /and 0 calendar items/);
  await fresh.goto(`${URL_BASE}#/calendar?view=plan`);
  await fresh.getByTestId('month-view').waitFor();
  assert.match(await fresh.locator('[data-date="2026-11-06"]').innerText(), /BUS 200/);
  assert.match(await fresh.locator('[data-date="2026-11-26"]').innerText(), /No classes/);
  await fresh.goto(`${URL_BASE}#/settings`);
  await fresh.getByTestId('restore-input').setInputFiles(backup);
  await fresh.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await fresh.getByTestId('restore-report').getByText('and 0 calendar items').waitFor();
  await second.close();
});

test('a screenshot of a schedule is read on the device and checked before saving', async () => {
  const shot = await context.newPage();
  await shot.setViewportSize({ width: 760, height: 260 });
  await shot.setContent(`<body style="font: 18px Arial; padding: 16px; background: #fff; color: #222">
    <p><b>HIS 110 - World History</b><br>TuTh 9:30AM - 10:50AM &nbsp;&nbsp; Forcina Hall 204</p>
    <p><b>MAT 127 - Calculus A</b><br>MoWeFr 1:00PM - 1:50PM &nbsp;&nbsp; Science 101</p></body>`);
  const picture = path.join(work, 'schedule.png');
  await shot.screenshot({ path: picture });
  await shot.close();
  await page.goto(`${URL_BASE}#/calendar/schedule`);
  await page.getByLabel('Choose a picture of your schedule').setInputFiles(picture);
  await page.getByTestId('schedule-rows').waitFor({ timeout: 90000 });
  await page.getByRole('img', { name: 'The schedule you added' }).waitFor();
  assert.equal(await page.getByTestId('schedule-row').count(), 2);
  const first = page.getByTestId('schedule-row').first();
  assert.match(await first.getByLabel('Name').inputValue(), /HIS 110/);
  assert.equal(await first.getByLabel('Starts').inputValue(), '09:30');
  assert.equal(await first.getByLabel('Ends').inputValue(), '10:50');
  assert.match(await first.getByLabel('Place').inputValue(), /Forcina/);
  assert.equal(await page.getByLabel('Days for class 1').getByLabel('Tue').isChecked(), true);
  assert.equal(await page.getByLabel('Days for class 1').getByLabel('Thu').isChecked(), true);
  const second = page.getByTestId('schedule-row').nth(1);
  assert.match(await second.getByLabel('Name').inputValue(), /MAT 127/);
  assert.equal(await second.getByLabel('Starts').inputValue(), '13:00');
  await page.screenshot({ path: path.join(shots, 'schedule-picture.png') });
});

test('something that is not a picture explains itself', async () => {
  const bad = path.join(work, 'not-a-picture.png');
  fs.writeFileSync(bad, 'just text');
  await page.goto(`${URL_BASE}#/calendar/schedule`);
  await page.getByLabel('Choose a picture of your schedule').setInputFiles(bad);
  await page.getByTestId('schedule-picture-problem').waitFor();
});

test('light is the default, and dark can be chosen and is remembered', async () => {
  await page.goto(`${URL_BASE}#/settings`);
  await page.reload();
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(await theme(), 'light');
  const light = await background();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  assert.equal(await theme(), 'dark');
  assert.notEqual(await background(), light);
  await page.reload();
  assert.equal(await theme(), 'dark', 'it stays after reopening');
  assert.equal(await page.getByRole('radio', { name: 'Dark' }).isChecked(), true);
  await page.getByText('Match my device').click();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.getByText('Light', { exact: true }).click();
  assert.equal(await theme(), 'light');
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
