// Block schedules: which day of an A/B rotation a date falls on, and the dates a class meets.
const { test } = require('node:test');
const assert = require('node:assert/strict');

// A plain A/B block, Monday to Friday, where Monday 2 November 2026 was an A day.
const AB = { length: 2, anchor: '2026-11-02', weekdays: [1, 2, 3, 4, 5] };

test('a rotation only moves on days school is in session', async () => {
  const { rotationDayOn, rotationLabel } = await import('../src/data/rotationRules.ts');
  // Monday starts it, then each school day takes the next letter.
  assert.equal(rotationLabel(rotationDayOn(AB, '2026-11-02')), 'A');
  assert.equal(rotationLabel(rotationDayOn(AB, '2026-11-03')), 'B');
  assert.equal(rotationLabel(rotationDayOn(AB, '2026-11-04')), 'A');
  assert.equal(rotationLabel(rotationDayOn(AB, '2026-11-05')), 'B');
  assert.equal(rotationLabel(rotationDayOn(AB, '2026-11-06')), 'A');
  // The weekend is not a school day at all, and it does not push the cycle on: Friday was A,
  // so the next Monday is B, not A again.
  assert.equal(rotationDayOn(AB, '2026-11-07'), null, 'Saturday');
  assert.equal(rotationDayOn(AB, '2026-11-08'), null, 'Sunday');
  assert.equal(rotationLabel(rotationDayOn(AB, '2026-11-09')), 'B', 'the Monday after');
});

test('days before the one it was set from work out too', async () => {
  const { rotationDayOn, rotationLabel } = await import('../src/data/rotationRules.ts');
  assert.equal(rotationLabel(rotationDayOn(AB, '2026-10-30')), 'B', 'the Friday before');
  assert.equal(rotationLabel(rotationDayOn(AB, '2026-10-29')), 'A');
  // Months and a year back still line up, with weekends never counted.
  assert.equal(rotationLabel(rotationDayOn(AB, '2026-09-02')), 'B');
  assert.equal(rotationLabel(rotationDayOn(AB, '2025-11-03')), 'A');
});

test('a longer rotation runs through all its letters', async () => {
  const { rotationDayOn, rotationLabel } = await import('../src/data/rotationRules.ts');
  const six = { length: 6, anchor: '2026-11-02', weekdays: [1, 2, 3, 4, 5] };
  const week = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'];
  assert.deepEqual(week.map((date) => rotationLabel(rotationDayOn(six, date))), ['A', 'B', 'C', 'D', 'E', 'F', 'A']);
});

test('a day off is put right by saying what today really is', async () => {
  const { rotationDayOn, rotationLabel, reanchor } = await import('../src/data/rotationRules.ts');
  // Going by the cycle alone, this Tuesday is an A day.
  assert.equal(rotationLabel(rotationDayOn(AB, '2026-11-10')), 'A');
  // School was shut for a day that nobody recorded, so really it is a B day. The student says so,
  // and every day after it follows from that without anything else being edited.
  const fixed = reanchor(AB, '2026-11-10', 1);
  assert.equal(rotationLabel(rotationDayOn(fixed, '2026-11-10')), 'B');
  assert.equal(rotationLabel(rotationDayOn(fixed, '2026-11-11')), 'A');
  assert.equal(rotationLabel(rotationDayOn(fixed, '2026-11-12')), 'B');
  // Days before it move with it too, so nothing is left contradicting itself.
  assert.equal(rotationLabel(rotationDayOn(fixed, '2026-11-09')), 'A');
  // Setting it to a later letter works the same way.
  const six = { length: 6, anchor: '2026-11-02', weekdays: [1, 2, 3, 4, 5] };
  const toD = reanchor(six, '2026-11-10', 3);
  assert.equal(rotationLabel(rotationDayOn(toD, '2026-11-10')), 'D');
  assert.equal(rotationLabel(rotationDayOn(toD, '2026-11-11')), 'E');
});

test('a class meeting on its own days lands on the right dates', async () => {
  const { rotationDates } = await import('../src/data/rotationRules.ts');
  // A class that meets on A days only, over two school weeks.
  assert.deepEqual(rotationDates(AB, '2026-11-02', '2026-11-13', [0]), ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-10', '2026-11-12']);
  // One that meets on both days is every school day, and never a weekend.
  const both = rotationDates(AB, '2026-11-02', '2026-11-08', [0, 1]);
  assert.deepEqual(both, ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
  // Asking for no days gives no meetings rather than every day.
  assert.deepEqual(rotationDates(AB, '2026-11-02', '2026-11-13', []), []);
});

test('a rotation that makes no sense is refused rather than guessed at', async () => {
  const { rotationDayOn, usableRotation } = await import('../src/data/rotationRules.ts');
  assert.equal(usableRotation(null), false);
  assert.equal(usableRotation({ length: 1, anchor: '2026-11-02', weekdays: [1] }), false, 'a cycle of one is not a cycle');
  assert.equal(usableRotation({ length: 2, anchor: '2026-11-02', weekdays: [] }), false, 'no school days');
  assert.equal(usableRotation({ length: 2, anchor: 'not a date', weekdays: [1] }), false);
  assert.equal(rotationDayOn({ length: 2, anchor: 'not a date', weekdays: [1] }, '2026-11-02'), null);
  assert.equal(usableRotation(AB), true);
});

test('a school that runs six days a week is handled the same way', async () => {
  const { rotationDayOn, rotationLabel, schoolWeek } = await import('../src/data/rotationRules.ts');
  const six = { length: 2, anchor: '2026-11-02', weekdays: [1, 2, 3, 4, 5, 6] };
  assert.equal(rotationLabel(rotationDayOn(six, '2026-11-07')), 'B', 'Saturday is a school day here');
  assert.equal(rotationDayOn(six, '2026-11-08'), null, 'Sunday still is not');
  // Weekdays are tidied: repeats and nonsense are dropped, and order does not matter.
  assert.deepEqual(schoolWeek([5, 1, 1, 9, -2, 3]), [1, 3, 5]);
});
