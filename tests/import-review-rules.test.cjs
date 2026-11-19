// Courses that arrived from a calendar, waiting to be looked over. A school's calendar names a class
// the way its software does, and nothing used to explain why Courses filled up with codes.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const rules = () => import('../src/data/importReviewRules.ts');
const course = (id, name, status = 'active') => ({ id, name, status });

test('imported courses are collected without repeats and without losing earlier ones', async () => {
  const { EMPTY_REVIEW, withNewCourses } = await rules();
  const first = withNewCourses(EMPTY_REVIEW, ['a', 'b'], 100);
  assert.deepEqual(first.courseIds, ['a', 'b']);
  assert.equal(first.at, 100);
  // A second import adds to the list rather than replacing it.
  const second = withNewCourses(first, ['c'], 200);
  assert.deepEqual(second.courseIds, ['a', 'b', 'c']);
  assert.equal(second.at, 200);
  // The same course twice counts once, and nothing new means nothing changes at all.
  assert.deepEqual(withNewCourses(second, ['b'], 300).courseIds, ['a', 'b', 'c']);
  assert.equal(withNewCourses(second, ['b'], 300), second, 'an unchanged review should not be rewritten');
  assert.equal(withNewCourses(second, [], 300), second);
  // Being told once is remembered separately from the list itself.
  assert.equal(first.explained, false);
  assert.deepEqual(withNewCourses({ ...first, explained: true }, ['d'], 400).explained, true);
});

test('only courses that still exist and are still in use are brought back to attention', async () => {
  const { reviewable } = await rules();
  const review = { courseIds: ['a', 'b', 'c', 'gone'], at: 1, explained: false };
  const courses = [course('a', 'BIO-101'), course('b', 'Binned', 'trashed'), course('c', 'Old', 'archived'), course('d', 'Not from an import')];
  assert.deepEqual(reviewable(review, courses).map((one) => one.id), ['a']);
  assert.deepEqual(reviewable({ courseIds: [], at: 0, explained: false }, courses), []);
});

test('a name that looks like a school code is spotted, and a real name is left alone', async () => {
  const { looksLikeACode } = await rules();
  for (const name of ['BIO-101-02', 'ACCT201', 'MATH1120', '24FA-MATH-1120-05', 'CHEM 102']) {
    assert.equal(looksLikeACode(name), true, `${name} should read as a code`);
  }
  for (const name of ['Biology 101', 'Financial Accounting', 'History of Art', 'Chemistry', '']) {
    assert.equal(looksLikeACode(name), false, `${name} should read as a name`);
  }
});

test('the ones that look like codes are offered first, and nothing is renamed by itself', async () => {
  const { reviewOrder } = await rules();
  const courses = [course('a', 'Biology 101'), course('b', 'ACCT201'), course('c', 'History of Art'), course('d', 'MATH1120')];
  assert.deepEqual(reviewOrder(courses).map((one) => one.id), ['b', 'd', 'a', 'c']);
  // Every course is still there: this orders, it never filters or rewrites.
  assert.equal(reviewOrder(courses).length, 4);
  assert.deepEqual(reviewOrder(courses).map((one) => one.name).sort(), courses.map((one) => one.name).sort());
});

test('an import says what it did, in plain words, and says nothing when it did nothing', async () => {
  const { describeImport } = await rules();
  assert.equal(describeImport(1), '1 class came from your calendar.');
  assert.equal(describeImport(4), '4 classes came from your calendar.');
  assert.equal(describeImport(0), '');
  assert.equal(describeImport(-2), '');
});
