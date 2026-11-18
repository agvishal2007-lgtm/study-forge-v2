// Days that don't run like the others — an assembly, a field trip, a spirit day, anything a school
// names itself. No list of kinds, because there isn't one.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const rules = () => import('../src/data/specialDayRules.ts');
const day = (id, date, extra = {}) => ({ id, date, name: '', effect: 'as-usual', blocks: [], cycleMoves: true, note: '', createdAt: 0, updatedAt: 0, ...extra });

test('a special day is found by its date, and the newest one wins a clash', async () => {
  const { specialOn, inDateOrder, usableSpecial } = await rules();
  const days = [day('a', '2026-12-04', { name: 'Spirit day' }), day('b', '2026-11-20', { name: 'Assembly' })];
  assert.equal(specialOn(days, '2026-11-20').name, 'Assembly');
  assert.equal(specialOn(days, '2026-11-21'), null);
  assert.deepEqual(inDateOrder(days).map((one) => one.id), ['b', 'a']);
  // Two saved for the same date: the one saved last is the one meant.
  const clash = [day('c', '2026-11-20', { name: 'Old', updatedAt: 5 }), day('d', '2026-11-20', { name: 'New', updatedAt: 9 })];
  assert.equal(specialOn(clash, '2026-11-20').name, 'New');
  // A date is all a special day needs to be worth keeping.
  assert.equal(usableSpecial({ date: '2026-11-20' }), true);
  assert.equal(usableSpecial({ date: '' }), false);
  assert.equal(usableSpecial({ date: 'next Tuesday' }), false);
});

test('what a special day does to the blocks of a day', async () => {
  const { blockHappens, slotsAfterSpecial } = await rules();
  const slots = [{ period: 0 }, { period: 1 }, { period: 2 }];
  // A spirit day changes nothing about the classes.
  assert.deepEqual(slotsAfterSpecial(slots, day('a', '2026-11-20')).map((slot) => slot.period), [0, 1, 2]);
  assert.deepEqual(slotsAfterSpecial(slots, null).map((slot) => slot.period), [0, 1, 2]);
  // A field trip cancels them.
  assert.deepEqual(slotsAfterSpecial(slots, day('a', '2026-11-20', { effect: 'no-classes' })), []);
  // An assembly schedule runs only the blocks that were marked.
  const assembly = day('a', '2026-11-20', { effect: 'some-classes', blocks: [0, 2] });
  assert.deepEqual(slotsAfterSpecial(slots, assembly).map((slot) => slot.period), [0, 2]);
  assert.equal(blockHappens(assembly, 1), false);
  assert.equal(blockHappens(assembly, 2), true);
  assert.equal(blockHappens(null, 5), true);
  // Marked as running only some blocks, with none chosen yet, means none — not all.
  assert.deepEqual(slotsAfterSpecial(slots, day('a', '2026-11-20', { effect: 'some-classes' })), []);
});

test('a special day says plainly what it is, in the words the student used', async () => {
  const { describeSpecial, datesThatDontMoveTheCycle } = await rules();
  assert.equal(describeSpecial(day('a', '2026-11-20', { name: 'Spirit day' })), 'Spirit day — classes run as usual.');
  assert.equal(describeSpecial(day('a', '2026-11-20', { name: 'Field trip', effect: 'no-classes' })), 'Field trip — no classes.');
  assert.equal(
    describeSpecial(day('a', '2026-11-20', { name: 'Assembly', effect: 'some-classes', blocks: [2, 0] }), ['Homeroom', 'Block 2', 'Block 3']),
    'Assembly — only Homeroom, Block 3.',
  );
  // A block nobody named still reads as something.
  assert.equal(
    describeSpecial(day('a', '2026-11-20', { name: 'Half day', effect: 'some-classes', blocks: [1] }), ['', '']),
    'Half day — only Period 2.',
  );
  // Unnamed is not blank.
  assert.equal(describeSpecial(day('a', '2026-11-20')), 'Special day — classes run as usual.');
  assert.equal(describeSpecial(null), '');
  // And which dates the rotation should leave out of its count.
  const days = [day('a', '2026-11-20', { cycleMoves: false }), day('b', '2026-11-21'), day('c', '2026-12-01', { cycleMoves: false })];
  assert.deepEqual(datesThatDontMoveTheCycle(days), ['2026-11-20', '2026-12-01']);
});
