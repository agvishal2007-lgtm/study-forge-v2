// What kind of thing a course is, from the owner's studying system. Optional, never guessed.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/data/courseKinds.ts');

test('a course that never says what it is keeps the word Study Forge always used', async () => {
  const { levelWordFor, kindLabel } = await load();
  for (const nothing of [undefined, null, '', 'nonsense', 0]) {
    assert.equal(levelWordFor(nothing), 'Lesson', `${String(nothing)} falls back rather than breaking`);
  }
  assert.equal(kindLabel(undefined), '', 'and nothing is shown for a course that has not said');
});

test('the six kinds each suggest a word, and the words are real ones', async () => {
  const { COURSE_KINDS, levelWordFor } = await load();
  assert.equal(COURSE_KINDS.length, 6);
  assert.deepEqual(COURSE_KINDS.map((kind) => kind.value),
    ['coursework', 'software', 'skill', 'exam', 'independent', 'certification']);
  assert.equal(levelWordFor('coursework'), 'Chapter', 'a class has chapters');
  assert.equal(levelWordFor('software'), 'Lesson', 'software has lessons');
  assert.equal(levelWordFor('exam'), 'Section', 'an exam has sections');
  for (const kind of COURSE_KINDS) {
    assert.match(kind.levelWord, /^[A-Z][a-z]+$/, `${kind.value} suggests a plain word`);
    assert.ok(kind.label.length > 3 && kind.example.length > 3, `${kind.value} is explained in words a student would use`);
  }
});

test('only the six are accepted, so a stray value cannot change how a course behaves', async () => {
  const { isCourseKind } = await load();
  for (const good of ['coursework', 'software', 'skill', 'exam', 'independent', 'certification']) {
    assert.equal(isCourseKind(good), true);
  }
  for (const bad of ['', 'COURSEWORK', 'class', null, undefined, 0, {}, []]) {
    assert.equal(isCourseKind(bad), false, `${String(bad)} is not one of the six`);
  }
});
