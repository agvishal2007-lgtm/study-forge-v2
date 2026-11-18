// School level: the words, the suggested term names, and how grades read at each level.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/data/schoolLevelRules.ts');

test('college keeps its own words, and every other level says "class" and "teacher"', async () => {
  const { wordsFor } = await load();
  const college = wordsFor('college', 'semester');
  assert.equal(college.course, 'course');
  assert.equal(college.Courses, 'Courses');
  assert.equal(college.teacher, 'professor');
  assert.equal(college.term, 'semester');
  for (const level of ['high', 'middle', 'elementary']) {
    const words = wordsFor(level, 'year');
    assert.equal(words.course, 'class');
    assert.equal(words.Courses, 'Classes');
    assert.equal(words.teacher, 'teacher');
    assert.equal(words.term, 'school year', 'a whole year is called a school year, not a "year"');
  }
  assert.equal(wordsFor('high', 'quarter').Term, 'Quarter');
  assert.equal(wordsFor('high', 'trimester').term, 'trimester');
});

test('the suggested term name matches the time of year, and a school year spans two of them', async () => {
  const { suggestTermName } = await load();
  const sept = new Date('2026-09-15T12:00:00');
  const feb = new Date('2027-02-10T12:00:00');
  const june = new Date('2027-06-10T12:00:00');
  assert.equal(suggestTermName('semester', sept), 'Fall 2026');
  assert.equal(suggestTermName('semester', feb), 'Spring 2027');
  assert.equal(suggestTermName('semester', june), 'Summer 2027');
  // A school year started in 2026 is still the 2026–27 year in February.
  assert.equal(suggestTermName('year', sept), '2026–27 school year');
  assert.equal(suggestTermName('year', feb), '2026–27 school year');
  assert.equal(suggestTermName('quarter', sept), 'Quarter 1, 2026–27');
  assert.equal(suggestTermName('quarter', feb), 'Quarter 3, 2026–27');
  assert.equal(suggestTermName('trimester', sept), 'Trimester 1, 2026–27');
});

test('only college and high school have accounts; elementary loses the exam tools', async () => {
  const { allowsAccounts, showsExamTools, showsGpa, showsTemplates } = await load();
  assert.equal(allowsAccounts('college'), true);
  assert.equal(allowsAccounts('high'), true);
  assert.equal(allowsAccounts('middle'), false, 'middle school is this device only');
  assert.equal(allowsAccounts('elementary'), false, 'elementary is this device only');
  assert.equal(showsExamTools('elementary'), false);
  assert.equal(showsExamTools('middle'), true);
  assert.equal(showsGpa('middle'), false);
  assert.equal(showsTemplates('elementary'), false);
});

test('grades read as a letter for older students and in plain words for the youngest', async () => {
  const { gradeWords, letterFor, plainMarkFor, estimateGpa } = await load();
  assert.equal(letterFor(93).letter, 'A');
  assert.equal(letterFor(92.9).letter, 'A-');
  assert.equal(letterFor(0).letter, 'F');
  assert.equal(letterFor(100).points, 4);
  assert.equal(gradeWords('college', 91.2), '91.2% (A-)');
  assert.equal(gradeWords('high', 85), '85% (B)');
  assert.equal(gradeWords('elementary', 91.2), 'Doing great (91%)');
  assert.equal(plainMarkFor(69), 'Needs some help');
  // An estimate counts each class once and ignores anything not graded yet.
  assert.equal(estimateGpa([]), null);
  assert.equal(estimateGpa([null, null]), null, 'nothing graded means no GPA, not a zero');
  assert.equal(estimateGpa([93, 83]), 3.5);
  assert.equal(estimateGpa([93, null, 83]), 3.5, 'ungraded work is never counted as an F');
});

test('each level has starting classes, and college leaves room for real course names', async () => {
  const { STARTER_CLASSES, SCHOOL_LEVELS, DEFAULT_TERM_KIND, LEVEL_GRADE_HELP } = await load();
  for (const level of SCHOOL_LEVELS) {
    assert.ok(STARTER_CLASSES[level].length >= 5, `${level} offers something to start with`);
    assert.equal(new Set(STARTER_CLASSES[level]).size, STARTER_CLASSES[level].length, `${level} has no duplicates`);
    assert.ok(LEVEL_GRADE_HELP[level].length > 20, `${level} explains how its grades work`);
  }
  assert.equal(DEFAULT_TERM_KIND.college, 'semester');
  assert.equal(DEFAULT_TERM_KIND.elementary, 'year', 'the youngest students keep one school year');
});
