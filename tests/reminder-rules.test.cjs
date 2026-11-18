// Reminders and quiet hours. All of this is wall-clock reasoning, which is where mistakes hide:
// midnight, weekends, clock changes, and not showing the same reminder twice.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const rules = () => import('../src/data/reminderRules.ts');
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);
const reminder = (extra = {}) => ({
  id: 'r1', text: 'Study', repeat: 'once', at: '2026-11-18T09:00', fromTime: '09:00', toTime: '17:00',
  paused: false, lastShown: '', createdAt: 0, updatedAt: 0, ...extra,
});

test('quiet hours through midnight cover the night, not the daytime', async () => {
  const { inQuietHours } = await rules();
  const quiet = { on: true, start: '22:00', end: '08:00', days: [0, 1, 2, 3, 4, 5, 6] };
  assert.equal(inQuietHours(quiet, at(2026, 11, 18, 23, 30)), true, 'late evening');
  assert.equal(inQuietHours(quiet, at(2026, 11, 19, 3, 0)), true, 'the small hours');
  assert.equal(inQuietHours(quiet, at(2026, 11, 19, 7, 59)), true, 'just before it ends');
  assert.equal(inQuietHours(quiet, at(2026, 11, 19, 8, 0)), false, 'the moment it ends');
  assert.equal(inQuietHours(quiet, at(2026, 11, 18, 14, 0)), false, 'the middle of the day');
  assert.equal(inQuietHours(quiet, at(2026, 11, 18, 21, 59)), false, 'just before it starts');
  // Switched off, it never applies.
  assert.equal(inQuietHours({ ...quiet, on: false }, at(2026, 11, 18, 23, 30)), false);
});

test('a night that runs past midnight belongs to the day it started', async () => {
  const { inQuietHours } = await rules();
  // Chosen for Monday only. Monday is day 1; 16 November 2026 is a Monday.
  const quiet = { on: true, start: '22:00', end: '08:00', days: [1] };
  assert.equal(inQuietHours(quiet, at(2026, 11, 16, 23, 0)), true, 'Monday night');
  assert.equal(inQuietHours(quiet, at(2026, 11, 17, 2, 0)), true, 'into Tuesday morning, still Monday night');
  assert.equal(inQuietHours(quiet, at(2026, 11, 17, 23, 0)), false, 'Tuesday night was not chosen');
});

test('quiet hours that make no sense are ignored rather than silencing everything', async () => {
  const { inQuietHours } = await rules();
  const when = at(2026, 11, 18, 23, 0);
  assert.equal(inQuietHours({ on: true, start: 'nonsense', end: '08:00', days: [0,1,2,3,4,5,6] }, when), false);
  assert.equal(inQuietHours({ on: true, start: '22:00', end: '22:00', days: [0,1,2,3,4,5,6] }, when), false, 'a zero-length window');
  assert.equal(inQuietHours({ on: true, start: '25:00', end: '08:00', days: [0,1,2,3,4,5,6] }, when), false);
});

test('a daily reminder keeps its time of day, so a clock change does not drag it', async () => {
  const { nextDue } = await rules();
  const daily = reminder({ repeat: 'daily', at: '2026-11-01T07:30' });
  // Whatever the date, it is 7:30 in local time, worked out from the wall clock each day.
  const next = nextDue(daily, at(2026, 11, 18, 9, 0));
  assert.equal(next.getHours(), 7);
  assert.equal(next.getMinutes(), 30);
  assert.equal(next.getDate(), 19, 'today has passed, so tomorrow');
  const earlier = nextDue(daily, at(2026, 11, 18, 6, 0));
  assert.equal(earlier.getDate(), 18, 'still to come today');
});

test('a weekday reminder skips the weekend', async () => {
  const { nextDue } = await rules();
  // 20 November 2026 is a Friday.
  const weekdays = reminder({ repeat: 'weekdays', at: '2026-11-02T08:00' });
  const afterFriday = nextDue(weekdays, at(2026, 11, 20, 12, 0));
  assert.equal(afterFriday.getDay(), 1, 'Monday, not Saturday');
  assert.equal(afterFriday.getDate(), 23);
});

test('a weekly reminder keeps the weekday it was set for', async () => {
  const { nextDue } = await rules();
  // 2 November 2026 is a Monday.
  const weekly = reminder({ repeat: 'weekly', at: '2026-11-02T08:00' });
  const next = nextDue(weekly, at(2026, 11, 18, 12, 0));
  assert.equal(next.getDay(), 1, 'still a Monday');
  assert.equal(next.getDate(), 23);
});

test('an hourly reminder only comes inside its window', async () => {
  const { nextDue } = await rules();
  const hourly = reminder({ repeat: 'hourly', at: '2026-11-01T09:15', fromTime: '09:00', toTime: '12:00' });
  const inside = nextDue(hourly, at(2026, 11, 18, 10, 0));
  assert.equal(inside.getHours(), 10);
  assert.equal(inside.getMinutes(), 15);
  // After the window, the next one is tomorrow morning, not tonight.
  const after = nextDue(hourly, at(2026, 11, 18, 15, 0));
  assert.equal(after.getDate(), 19);
  assert.equal(after.getHours(), 9);
  // A window that makes no sense gives nothing rather than every hour of the night.
  assert.equal(nextDue(reminder({ repeat: 'hourly', fromTime: '17:00', toTime: '09:00' }), at(2026, 11, 18, 10, 0)), null);
});

test('a paused reminder never comes due, and keeps its place', async () => {
  const { nextDue, dueNow, describeNext } = await rules();
  const paused = reminder({ repeat: 'daily', at: '2026-11-01T07:30', paused: true });
  assert.equal(nextDue(paused, at(2026, 11, 18, 6, 0)), null);
  assert.deepEqual(dueNow([paused], { on: false, start: '', end: '', days: [] }, at(2026, 11, 18, 8, 0)), []);
  assert.equal(describeNext(paused, at(2026, 11, 18, 8, 0)), 'Paused');
});

test('the same reminder is not shown twice for the same moment', async () => {
  const { dueNow } = await rules();
  const open = { on: false, start: '', end: '', days: [] };
  const once = reminder({ at: '2026-11-18T09:00' });
  assert.equal(dueNow([once], open, at(2026, 11, 18, 9, 30)).length, 1, 'due and not yet shown');
  const shown = { ...once, lastShown: '2026-11-18T09:00' };
  assert.equal(dueNow([shown], open, at(2026, 11, 18, 9, 30)).length, 0, 'already shown');
  // A daily one shown this morning is due again tomorrow, not again today.
  const daily = reminder({ repeat: 'daily', at: '2026-11-01T07:30', lastShown: '2026-11-18T07:30' });
  assert.equal(dueNow([daily], open, at(2026, 11, 18, 9, 0)).length, 0, 'today is done');
  assert.equal(dueNow([daily], open, at(2026, 11, 19, 9, 0)).length, 1, 'tomorrow it comes again');
});

test('quiet hours hold a reminder back without losing it', async () => {
  const { dueNow } = await rules();
  const quiet = { on: true, start: '22:00', end: '08:00', days: [0, 1, 2, 3, 4, 5, 6] };
  const due = reminder({ repeat: 'daily', at: '2026-11-01T23:00' });
  // During the quiet, nothing is shown.
  assert.equal(dueNow([due], quiet, at(2026, 11, 18, 23, 30)).length, 0);
  // Once it is over, it is still waiting rather than skipped.
  assert.equal(dueNow([due], quiet, at(2026, 11, 19, 8, 30)).length, 1);
});

test('a one-off that has passed says so rather than pretending', async () => {
  const { describeNext, nextDue } = await rules();
  const past = reminder({ at: '2026-11-01T09:00' });
  assert.equal(nextDue(past, at(2026, 11, 18, 9, 0)), null);
  assert.equal(describeNext(past, at(2026, 11, 18, 9, 0)), 'Already passed');
  // And one still to come reads in plain words.
  const soon = reminder({ at: '2026-11-18T17:00' });
  assert.equal(describeNext(soon, at(2026, 11, 18, 9, 0)), 'Next at 5:00 pm today');
  const tomorrow = reminder({ at: '2026-11-19T07:05' });
  assert.equal(describeNext(tomorrow, at(2026, 11, 18, 9, 0)), 'Next at 7:05 am tomorrow');
});

test('a time written wrongly is refused rather than guessed at', async () => {
  const { readStamp } = await rules();
  assert.equal(readStamp('not a time'), null);
  assert.equal(readStamp('2026-13-01T09:00'), null, 'there is no thirteenth month');
  assert.equal(readStamp('2026-11-18T25:00'), null);
  assert.ok(readStamp('2026-11-18T09:00') instanceof Date);
});
