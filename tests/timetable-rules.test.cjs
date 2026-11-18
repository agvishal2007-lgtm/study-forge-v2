// The daily schedule grid: a shape the student states, never one Study Forge assumes.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const rules = () => import('../src/data/timetableRules.ts');

test('a grid starts empty, and empty means empty rather than unset', async () => {
  const { blankTimetable, timetableUsed, periodName } = await rules();
  const table = blankTimetable(['', '', ''], 4);
  assert.equal(table.days.length, 4);
  assert.equal(table.days[0].length, 3);
  assert.equal(timetableUsed(table), false);
  assert.equal(timetableUsed(null), false);
  // A block nobody named reads as its number, never as a blank cell.
  assert.equal(periodName(table, 1), 'Period 2');
  assert.equal(periodName({ ...table, periodNames: ['Homeroom', ' ', ''] }, 0), 'Homeroom');
  assert.equal(periodName({ ...table, periodNames: ['Homeroom', ' ', ''] }, 1), 'Period 2');
});

test('changing the shape of a day never throws away what was typed', async () => {
  const { blankTimetable, resizeTimetable, setSlot, addPeriod, removePeriod } = await rules();
  let table = blankTimetable(['A1', 'A2'], 2);
  table = setSlot(table, 0, 0, 'bio').table;
  table = setSlot(table, 1, 1, 'chem').table;
  // A longer cycle keeps both days and adds empty ones.
  const longer = resizeTimetable(table, 2, 4);
  assert.equal(longer.days.length, 4);
  assert.equal(longer.days[0][0], 'bio');
  assert.equal(longer.days[1][1], 'chem');
  assert.deepEqual(longer.days[3], ['', '']);
  // An extra block appears on every day, empty.
  const wider = addPeriod(table, 'Lunch');
  assert.deepEqual(wider.periodNames, ['A1', 'A2', 'Lunch']);
  assert.equal(wider.days[0][0], 'bio');
  assert.equal(wider.days[0][2], '');
  // Removing a block takes it out of every day, and the last one can't be removed.
  const narrower = removePeriod(wider, 0);
  assert.deepEqual(narrower.periodNames, ['A2', 'Lunch']);
  assert.equal(narrower.days[1][0], 'chem');
  assert.equal(removePeriod(blankTimetable(['only'], 1), 0).periodNames.length, 1);
  // A shorter cycle doesn't corrupt what's left.
  assert.equal(resizeTimetable(table, 1, 1).days.length, 1);
  assert.deepEqual(resizeTimetable(table, 1, 1).days[0], ['bio']);
});

test('which days a class meets is read off the grid, not kept beside it', async () => {
  const { blankTimetable, setSlot, daysForCourse, classSlots, daySlots } = await rules();
  let table = blankTimetable(['1', '2', '3'], 4);
  // A class that moves one block along each day and drops on the fourth: the shape described by a
  // rotate-and-drop schedule, with nothing in the app needing to know the phrase.
  table = setSlot(table, 0, 0, 'bio').table;
  table = setSlot(table, 1, 1, 'bio').table;
  table = setSlot(table, 2, 2, 'bio').table;
  assert.deepEqual(daysForCourse(table, 'bio'), [0, 1, 2]);
  assert.deepEqual(daysForCourse(table, 'chem'), []);
  assert.deepEqual(daysForCourse(table, ''), []);
  // The day it rotates off has no classes at all, which is a real answer.
  assert.deepEqual(classSlots(table, 3).map((slot) => slot.courseId), []);
  assert.deepEqual(classSlots(table, 1).map((slot) => slot.name), ['2']);
  // Every block is still listed when the whole day is asked for, free ones included.
  assert.equal(daySlots(table, 1).length, 3);
  assert.deepEqual(daySlots(table, null), []);
  // A class that has been deleted leaves a gap, never a ghost.
  assert.deepEqual(classSlots(table, 0, ['chem']).map((slot) => slot.courseId), []);
  assert.deepEqual(classSlots(table, 0, ['bio']).map((slot) => slot.courseId), ['bio']);
});

test('the same class twice in a day is allowed but reported', async () => {
  const { blankTimetable, setSlot } = await rules();
  let table = blankTimetable(['1', '2'], 1);
  const first = setSlot(table, 0, 0, 'bio');
  assert.equal(first.repeated, false);
  const second = setSlot(first.table, 0, 1, 'bio');
  assert.equal(second.repeated, true, 'a double block should be allowed, and mentioned');
  assert.deepEqual(second.table.days[0], ['bio', 'bio']);
  // Clearing a slot is never reported as a repeat.
  assert.equal(setSlot(second.table, 0, 1, '').repeated, false);
});

test('a day can be copied, or shifted along, without typing it out again', async () => {
  const { blankTimetable, setSlot, copyDay, rotateDay } = await rules();
  let table = blankTimetable(['1', '2', '3'], 3);
  table = setSlot(table, 0, 0, 'bio').table;
  table = setSlot(table, 0, 1, 'chem').table;
  table = setSlot(table, 0, 2, 'eng').table;
  assert.deepEqual(copyDay(table, 0, 1).days[1], ['bio', 'chem', 'eng']);
  // Shifted one along, with what falls off the end coming back at the start.
  assert.deepEqual(rotateDay(table, 0, 1, 1).days[1], ['eng', 'bio', 'chem']);
  assert.deepEqual(rotateDay(table, 0, 1, 2).days[1], ['chem', 'eng', 'bio']);
  // A full turn is where it started, and the other days are untouched.
  assert.deepEqual(rotateDay(table, 0, 1, 3).days[1], ['bio', 'chem', 'eng']);
  assert.deepEqual(rotateDay(table, 0, 1, 1).days[2], ['', '', '']);
  assert.deepEqual(rotateDay(table, 0, 1, -1).days[1], ['chem', 'eng', 'bio']);
});

test('block times are free-form, and a length is worked out rather than assumed', async () => {
  const { blankTimetable, setBlockTime, blockTime, blockLength, daySlots } = await rules();
  let table = blankTimetable(['1', '2'], 3);
  // One set of times for every day: typed once, written to all of them.
  table = setBlockTime(table, 0, 0, { start: '08:10', end: '09:00' });
  assert.equal(blockLength(blockTime(table, 0, 0)), '50 min');
  assert.equal(blockLength(blockTime(table, 2, 0)), '50 min', 'the same times should apply to every day');
  // Any length at all, because no length is standard.
  table = setBlockTime(table, 0, 1, { start: '09:05', end: '11:05' });
  assert.equal(blockLength(blockTime(table, 0, 1)), '2 hr');
  assert.equal(blockLength({ start: '13:00', end: '13:30' }), '30 min');
  assert.equal(blockLength({ start: '09:00', end: '10:35' }), '1 hr 35 min');
  // Nothing said is nothing shown, and nonsense is not turned into a negative length.
  assert.equal(blockTime(blankTimetable(['1'], 1), 0, 0), null);
  assert.equal(blockLength(null), null);
  assert.equal(blockLength({ start: '10:00', end: '09:00' }), null);
  assert.equal(blockLength({ start: '', end: '10:00' }), null);
  assert.equal(blockLength({ start: '25:00', end: '26:00' }), null);
  // A day of its own can keep its own times once days are allowed to differ.
  const perDay = setBlockTime({ ...table, sameTimes: false }, 1, 0, { start: '10:00', end: '10:40' });
  assert.equal(blockLength(blockTime(perDay, 1, 0)), '40 min');
  assert.equal(blockLength(blockTime(perDay, 0, 0)), '50 min', 'other days should be left alone');
  // The times travel with the day's slots.
  assert.equal(daySlots(table, 0)[0].time.start, '08:10');
});
