// Google Calendar events keep everything they carry: meeting links wherever Google stores them,
// a real place apart from a web address, the description, other links and attachments.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4220;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let work;
const pageErrors = [];
const stamp = (date, time) => new Date(`${date}T${time}:00-05:00`).toISOString();
const timed = (date, start, end) => ({ start: { dateTime: stamp(date, start), timeZone: 'America/New_York' }, end: { dateTime: stamp(date, end), timeZone: 'America/New_York' } });

const events = [
  {
    id: 'therapy', summary: 'Therapy appointment', ...timed('2026-11-04', '15:00', '16:00'),
    description: 'Video visit. Join: <a href="https://us02web.zoom.us/j/81234567890?pwd=abc123">https://us02web.zoom.us/j/81234567890?pwd=abc123</a><br>Intake form: <a href="https://portal.example-clinic.org/forms/intake">here</a>',
    organizer: { displayName: 'Example Clinic' },
    htmlLink: 'https://www.google.com/calendar/event?eid=therapy',
  },
  {
    id: 'group', summary: 'Study group', ...timed('2026-11-05', '18:00', '19:00'),
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    conferenceData: { conferenceSolution: { key: { type: 'hangoutsMeet' } }, entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }, { entryPointType: 'phone', uri: 'tel:+1-555-0100', label: '+1 555-0100', pin: '4242' }] },
    attachments: [{ fileUrl: 'https://drive.google.com/open?id=notes123', title: 'Shared notes.pdf' }],
  },
  {
    id: 'lecture', summary: 'Guest lecture', ...timed('2026-11-06', '13:00', '14:00'),
    location: 'Armstrong Hall 101',
    description: 'In person, or on Teams: https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0. Slides: https://docs.google.com/presentation/d/slides1/edit',
  },
  { id: 'oh_1', recurringEventId: 'oh', summary: 'Office hours', ...timed('2026-11-09', '10:00', '11:00'), description: 'https://zoom.us/j/1111111111' },
  { id: 'oh_2', recurringEventId: 'oh', summary: 'Office hours', ...timed('2026-11-16', '10:00', '11:00'), description: 'This week only, on Meet: https://meet.google.com/xyz-abcd-efg' },
  { id: 'walk', summary: 'Walk with Sam', ...timed('2026-11-07', '09:00', '10:00'), location: 'Lake Ceva' },
];

async function fakeGoogle(target) {
  await target.route('https://accounts.google.com/gsi/client', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.google = { accounts: { oauth2: {
      revoke(token, done) { done && done(); },
      initTokenClient(config) { return { requestAccessToken: () => config.callback({ access_token: 'fake-token', expires_in: 3600 }) }; },
    } } };`,
  }));
  await target.route('https://www.googleapis.com/calendar/v3/**', (route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-headers': 'authorization' } });
    if (url.pathname.endsWith('/calendarList')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ items: [{ id: 'me@example.com', summary: 'Me', primary: true }] }) });
    return route.fulfill({ status: 200, headers, body: JSON.stringify({ items: events }) });
  });
}

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-meetings-'));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  context = await chromium.launchPersistentContext(path.join(work, 'main'), { viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York', serviceWorkers: 'block' });
  await returningStudent(context);
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

/** Opens an event's own page through search, the way a student would find it. */
async function openEvent(title, nth = 0) {
  await page.goto(`${URL_BASE}#/search`);
  await page.getByRole('searchbox').first().fill(title);
  await page.locator('#content a[href*="/calendar/event/"]', { hasText: title }).nth(nth).click();
  await page.getByTestId('event-details').waitFor();
  return page.getByTestId('event-details');
}

test('events come in from Google with everything they carry', async () => {
  await page.goto(`${URL_BASE}#/calendar/google`);
  await page.waitForFunction(() => !!window.google);
  await page.getByRole('button', { name: 'Connect Google Calendar' }).click();
  await page.getByTestId('google-calendars').waitFor();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByTestId('google-review').waitFor();
  // Nothing here should be skipped for this check.
  for (const select of await page.getByLabel(/^Where .* goes$/).all()) {
    if ((await select.inputValue()) === 'Skip') await select.selectOption({ index: 0 });
  }
  await page.getByRole('button', { name: 'Bring these in' }).click();
  await page.getByTestId('google-message').waitFor();
});

test('a Zoom link in the description becomes a Join button, and the other link is kept', async () => {
  const card = await openEvent('Therapy appointment');
  const join = card.getByRole('link', { name: 'Join Zoom meeting' });
  assert.equal(await join.getAttribute('href'), 'https://us02web.zoom.us/j/81234567890?pwd=abc123');
  assert.equal(await join.getAttribute('target'), '_blank');
  assert.match(await join.getAttribute('rel'), /noopener/);
  // A link hidden behind the word "here" is still kept, under its site's name.
  assert.equal(await card.getByRole('link', { name: 'portal.example-clinic.org' }).getAttribute('href'), 'https://portal.example-clinic.org/forms/intake');
  await card.getByText('Video visit.', { exact: false }).waitFor();
  assert.equal(await card.locator('.event-notes a, .event-notes br').count(), 0, 'the description is shown as text');
  await card.getByText('Example Clinic').waitFor();
  assert.equal(await card.getByRole('link', { name: 'Open in Google Calendar' }).getAttribute('href'), 'https://www.google.com/calendar/event?eid=therapy');
  // No address was given, so it says Online rather than showing a web address as a place.
  assert.match(await card.locator('.event-facts').innerText(), /Where\s+Online/);
});

test('one tap from the calendar itself, without opening the event', async () => {
  await page.goto(`${URL_BASE}#/calendar`);
  const row = page.getByTestId('plan-row').filter({ hasText: 'Therapy appointment' });
  await row.waitFor();
  assert.equal(await row.getByRole('link', { name: /Join Zoom meeting: Therapy appointment/ }).getAttribute('href'), 'https://us02web.zoom.us/j/81234567890?pwd=abc123');
  assert.doesNotMatch(await row.innerText(), /zoom\.us/, 'the calendar is not cluttered with the address');
});

test('Google Meet from conference data, with the dial-in and the attachment', async () => {
  const card = await openEvent('Study group');
  assert.equal(await card.getByRole('link', { name: 'Join Google Meet' }).getAttribute('href'), 'https://meet.google.com/abc-defg-hij');
  assert.equal(await card.getByRole('link', { name: /^Join/ }).count(), 1, 'the same meeting is not offered twice');
  await card.getByText('Phone: +1 555-0100, PIN 4242').waitFor();
  assert.equal(await card.getByRole('link', { name: 'Shared notes.pdf' }).getAttribute('href'), 'https://drive.google.com/open?id=notes123');
});

test('a real place and a Teams link stay separate, and the slides link is named', async () => {
  const card = await openEvent('Guest lecture');
  assert.match(await card.locator('.event-facts').innerText(), /Armstrong Hall 101/);
  assert.equal(await card.getByRole('link', { name: 'Join Microsoft Teams meeting' }).getAttribute('href'), 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0');
  assert.equal(await card.getByRole('link', { name: 'Google Slides' }).getAttribute('href'), 'https://docs.google.com/presentation/d/slides1/edit');
});

test('each occurrence of a repeating event keeps its own meeting link', async () => {
  // Search shows a repeating event once, so each week is opened from its own day.
  const joinOn = async (date) => {
    await page.goto(`${URL_BASE}#/calendar?view=plan`);
    await page.locator(`[data-date="${date}"]`).click();
    await page.locator('#content a[href*="/calendar/event/"]', { hasText: 'Office hours' }).first().click();
    await page.getByTestId('event-details').waitFor();
    return page.getByTestId('event-details').getByRole('link', { name: /^Join/ }).getAttribute('href');
  };
  assert.equal(await joinOn('2026-11-09'), 'https://zoom.us/j/1111111111');
  assert.equal(await joinOn('2026-11-16'), 'https://meet.google.com/xyz-abcd-efg', 'the changed week has its own link');
});

test('an event without a meeting has no Join button, and nothing is made up', async () => {
  const card = await openEvent('Walk with Sam');
  assert.equal(await card.getByRole('link', { name: /^Join/ }).count(), 0);
  assert.match(await card.locator('.event-facts').innerText(), /Lake Ceva/);
  assert.equal(await card.locator('.event-block').count(), 0, 'no empty sections');
});

test('when Google changes the meeting link, getting the latest updates it', async () => {
  events[0].description = 'Moved to a new room: https://us02web.zoom.us/j/99999999999';
  await page.goto(`${URL_BASE}#/calendar/google`);
  await page.getByTestId('google-connected').waitFor();
  await page.waitForFunction(() => !!window.google);
  await page.getByRole('button', { name: 'Get the latest' }).click();
  await page.getByTestId('google-message').waitFor();
  const card = await openEvent('Therapy appointment');
  assert.equal(await card.getByRole('link', { name: 'Join Zoom meeting' }).getAttribute('href'), 'https://us02web.zoom.us/j/99999999999');
  assert.equal(await card.getByRole('link', { name: 'portal.example-clinic.org' }).count(), 0, 'a link Google removed is removed here too');
});

test('the event page fits a phone, with a full-width Join button', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  const card = await openEvent('Study group');
  const join = await card.getByRole('link', { name: 'Join Google Meet' }).boundingBox();
  assert.ok(join.height >= 44, `the Join button is only ${Math.round(join.height)}px tall`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
