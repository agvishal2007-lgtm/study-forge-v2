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
