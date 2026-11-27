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

test('what the Academy and the walkthrough tell students matches what the kinds actually do', async () => {
  const { COURSE_KINDS, levelWordFor } = await load();
  const fs = require('node:fs');
  const lesson = fs.readFileSync(require('node:path').join(__dirname, '../src/features/academy/lessons.ts'), 'utf8');
  const tour = fs.readFileSync(require('node:path').join(__dirname, '../src/features/walkthrough/steps.ts'), 'utf8');

  /*
   * The explanation names example words. Check it from the data's side, not the text's: for each
   * kind the lesson gives as an example, the lesson must contain the plural of the word that kind
   * really suggests. Rename the word in the data and this fails; change the word in the lesson and
   * this fails too. An earlier version of this test scanned the text for a list of words it knew,
   * which passed happily when the lesson named a word no kind suggests at all.
   */
  for (const value of ['coursework', 'software', 'exam']) {
    const word = `${levelWordFor(value)}s`;
    assert.ok(lesson.includes(word), `the Academy names ${value}'s real word, ${word}`);
  }
  for (const value of ['coursework', 'skill', 'exam']) {
    const word = `${levelWordFor(value)}s`;
    assert.ok(tour.includes(word), `the walkthrough names ${value}'s real word, ${word}`);
  }

  // The lesson exists at all, and says the thing that is easiest to get wrong: this changes a word,
  // not a standard.
  assert.match(lesson, /id: 'what-this-is'/, 'the Academy explains what a course is');
  assert.match(lesson, /Mastery is the same standard whatever kind of course it is/,
    'and says the kind does not change what mastery takes');
  assert.equal(levelWordFor('coursework'), 'Chapter', 'which is the word the lesson names for a class');
});
