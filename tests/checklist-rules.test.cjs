// Ticking tasks off: what un-ticking restores, and what the checklist says about steps.
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('un-ticking a task says it is not finished without forgetting how far it got', async () => {
  const { uncheckedStatus, isDone } = await import('../src/data/plannerRules.ts');
  // Everything a student would call finished counts as ticked.
  for (const status of ['Completed', 'Submitted', 'Waiting for Grade']) assert.equal(isDone({ status }), true, status);
  for (const status of ['Not Started', 'In Progress', 'Ready to Submit']) assert.equal(isDone({ status }), false, status);
  // Something only ticked off goes back to the start.
  assert.equal(uncheckedStatus('Completed'), 'Not Started');
  // Work already handed in plainly isn't un-started, so it goes back to In Progress instead.
  assert.equal(uncheckedStatus('Submitted'), 'In Progress');
  assert.equal(uncheckedStatus('Waiting for Grade'), 'In Progress');
});

test('a checklist says what is next, never a score', async () => {
  const { describeNext, stepProgress } = await import('../src/data/stepRules.ts');
  const steps = [
    { id: '1', title: 'Outline', done: true, targetDate: '' },
    { id: '2', title: 'Draft', done: false, targetDate: '2026-12-01' },
    { id: '3', title: 'Revise', done: false, targetDate: '' },
  ];
  const progress = stepProgress(steps, '2026-11-17');
  const words = describeNext(progress, (date) => date);
  assert.equal(words, 'Next: Draft (target 2026-12-01)');
  assert.doesNotMatch(words, /\d\s*(of|\/)\s*\d/, 'no fraction like "1 of 3"');
  assert.doesNotMatch(words, /%/, 'no percentage');
  const allDone = stepProgress(steps.map((step) => ({ ...step, done: true })), '2026-11-17');
  assert.equal(describeNext(allDone, (date) => date), 'Every step is ticked.');
});

test("the student's own sections keep the order they were made, with no-section last", async () => {
  const { sectionsOf, groupBySection } = await import('../src/data/plannerRules.ts');
  const item = (id, section, createdAt, dueDate = '') => ({
    id, title: id, section, createdAt, dueDate, dueTime: '', status: 'Not Started', priority: 'Normal', courseId: null,
  });
  const items = [
    item('lunch', 'Wellness', 300),
    item('wake', 'Morning routine', 100),
    item('loose', '', 50),
    item('teeth', 'Morning routine', 200),
    item('sun', 'Wellness', 400),
  ];
  // Order comes from when each section was first made, not the alphabet and not when items were added.
  assert.deepEqual(sectionsOf(items), ['Morning routine', 'Wellness']);
  const groups = groupBySection(items);
  assert.deepEqual(groups.map((group) => group.section), ['Morning routine', 'Wellness', '']);
  assert.deepEqual(groups[0].items.map((entry) => entry.id), ['wake', 'teeth']);
  assert.deepEqual(groups[2].items.map((entry) => entry.id), ['loose'], 'a task with no section still has a home');
  // A section nobody is using any more leaves on its own; an empty group is never shown.
  assert.deepEqual(groupBySection([item('only', '', 1)]).map((group) => group.section), ['']);
  // Spelling it with stray spaces is the same section, not a second one.
  assert.deepEqual(sectionsOf([item('a', ' Wellness ', 1), item('b', 'Wellness', 2)]), ['Wellness']);
});

test('a finished task stays in its own section, because staying put is the point', async () => {
  const { groupBySection } = await import('../src/data/plannerRules.ts');
  const items = [
    { id: 'done', title: 'done', section: 'Research', createdAt: 1, dueDate: '', dueTime: '', status: 'Completed', priority: 'Normal', courseId: null },
    { id: 'todo', title: 'todo', section: 'Research', createdAt: 2, dueDate: '', dueTime: '', status: 'Not Started', priority: 'Normal', courseId: null },
  ];
  const groups = groupBySection(items);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items.map((entry) => entry.id).sort(), ['done', 'todo']);
});

test('a measurable goal reads in plain words, and going past it is never a shortfall', async () => {
  const { describeGoal } = await import('../src/data/plannerRules.ts');
  assert.equal(describeGoal(undefined), '', 'an ordinary task says nothing about goals');
  assert.equal(describeGoal({ target: 15, unit: 'minutes', done: 0 }), '15 minutes goal');
  assert.equal(describeGoal({ target: 15, unit: 'minutes', done: 10 }), '15 minutes goal, 10 so far');
  // Meeting it, and beating it, both just say done. No "short by", no percentage, no fraction.
  assert.equal(describeGoal({ target: 15, unit: 'minutes', done: 15 }), '15 minutes goal, 15 done');
  assert.equal(describeGoal({ target: 15, unit: 'minutes', done: 30 }), '15 minutes goal, 30 done');
  for (const words of [describeGoal({ target: 15, unit: 'min', done: 10 }), describeGoal({ target: 15, unit: 'min', done: 30 })]) {
    assert.doesNotMatch(words, /%/, 'no percentage');
    assert.doesNotMatch(words, /\d\s*(of|\/)\s*\d/, 'no fraction');
    assert.doesNotMatch(words, /short|behind|fail|miss/i, 'nothing discouraging');
  }
  // A goal with no target isn't a goal.
  assert.equal(describeGoal({ target: 0, unit: 'minutes', done: 5 }), '');
});
