// Terms a student can look back at: where a term sits in time, and what adds up in it.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const rules = () => import('../src/data/termRules.ts');
const term = (name, start, end, status = 'current') => ({ id: name, name, kind: 'semester', start, end, status, createdAt: 0, updatedAt: 0 });
const course = (id, credits, finalGrade, name = id) => ({ id, name, code: '', term: 'T', credits, finalGrade, status: 'active' });

test('where a term sits comes from its dates, and putting one away is never undone by a date', async () => {
  const { statusFor } = await rules();
  const spring = term('Spring 2027', '2027-01-15', '2027-05-10');
  assert.equal(statusFor(spring, '2026-12-01'), 'upcoming');
  assert.equal(statusFor(spring, '2027-02-01'), 'current');
  assert.equal(statusFor(spring, '2027-06-01'), 'past');
  // On the first and last day it is still on.
  assert.equal(statusFor(spring, '2027-01-15'), 'current');
  assert.equal(statusFor(spring, '2027-05-10'), 'current');
  // A term the student put away stays put away, whatever the calendar says.
  assert.equal(statusFor({ ...spring, status: 'archived' }, '2027-02-01'), 'archived');
  // With no dates, what the student said stands rather than being guessed from today.
  assert.equal(statusFor(term('Someday', '', '', 'upcoming'), '2027-02-01'), 'upcoming');
});

test('terms are listed the way a student thinks of them', async () => {
  const { orderTerms } = await rules();
  const terms = [
    term('Fall 2025', '2025-08-25', '2025-12-12'),
    term('Fall 2026', '2026-08-24', '2026-12-11'),
    term('Spring 2027', '2027-01-15', '2027-05-10'),
    term('Old one', '2024-01-01', '2024-05-01', 'archived'),
  ];
  const names = orderTerms(terms, '2026-11-18').map((one) => one.name);
  // What's on now first, then what's coming, then back in time, with anything put away last.
  assert.equal(names[0], 'Fall 2026', 'the term happening now comes first');
  assert.equal(names[1], 'Spring 2027', 'then what is coming');
  assert.equal(names[2], 'Fall 2025', 'then the most recent finished one');
  assert.equal(names[3], 'Old one', 'put away last');
});

test('a term adds up only what the student really entered', async () => {
  const { summarizeTerm } = await rules();
  const sum = summarizeTerm([
    course('a', 3, 'A'),
    course('b', 4, 'B+'),
    course('c', 3, ''),
  ]);
  assert.equal(sum.attempted, 10);
  assert.equal(sum.earned, 7, 'only classes with a passing grade count as earned');
  assert.equal(sum.classes, 3);
  assert.equal(sum.graded, 2);
  assert.equal(sum.gpa, 3.65, 'A is 4.0 and B+ is 3.3');
  assert.equal(sum.incomplete, false);
});

test('credits nobody entered are flagged rather than counted as zero', async () => {
  const { summarizeTerm } = await rules();
  const sum = summarizeTerm([course('a', 3, 'A'), course('b', null, 'B')]);
  assert.equal(sum.attempted, 3, 'the class with no credits adds nothing');
  assert.equal(sum.incomplete, true, 'and the total says it is not the whole story');
  // Its grade still counts towards the average, because that was entered.
  assert.equal(sum.gpa, 3.5);
});

test('a failed or withdrawn class is attempted but not earned', async () => {
  const { summarizeTerm, passed } = await rules();
  assert.equal(passed('F'), false);
  assert.equal(passed('W'), false);
  assert.equal(passed('A-'), true);
  assert.equal(passed('Pass'), true);
  assert.equal(passed(''), null, 'no grade is not a verdict');
  assert.equal(passed('Merit'), null, 'wording nobody knows is not guessed at');
  const sum = summarizeTerm([course('a', 3, 'A'), course('b', 3, 'F'), course('c', 3, 'W')]);
  assert.equal(sum.attempted, 9);
  assert.equal(sum.earned, 3);
  // W isn't a letter grade, so it doesn't drag the average; F does.
  assert.equal(sum.gpa, 2);
});

test('pass or fail stays out of the average, but still earns its credits', async () => {
  const { summarizeTerm } = await rules();
  const sum = summarizeTerm([course('a', 3, 'A'), course('b', 2, 'Pass')]);
  assert.equal(sum.earned, 5, 'a pass earns its credits');
  assert.equal(sum.gpa, 4, 'and has no effect on the average');
});

test('adding up several terms never counts the same class twice', async () => {
  const { summarizeAll } = await rules();
  const repeated = [course('a', 3, 'A'), course('a', 3, 'A'), course('b', 3, 'B')];
  const sum = summarizeAll(repeated);
  assert.equal(sum.classes, 2);
  assert.equal(sum.attempted, 6);
});

test('a term with nothing in it says nothing rather than zero', async () => {
  const { summarizeTerm } = await rules();
  const sum = summarizeTerm([]);
  assert.equal(sum.gpa, null, 'no grades means no average, not an average of zero');
  assert.equal(sum.attempted, 0);
  assert.equal(sum.classes, 0);
  assert.equal(sum.incomplete, false);
});
