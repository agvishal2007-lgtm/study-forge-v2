// Google Classroom, read only. These are the shapes Google returns, tested without a network or an
// account, because the interesting decisions are all about what to do with half-given data.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const rules = () => import('../src/data/classroomRules.ts');
const work = (id, courseId, extra = {}) => ({ id, courseId, title: `Work ${id}`, ...extra });

test('only classes a student is actually taking are offered', async () => {
  const { usableCourse, courseTitle } = await rules();
  assert.equal(usableCourse({ id: 'c1', name: 'Algebra 2' }), true, 'no state given means active');
  assert.equal(usableCourse({ id: 'c1', name: 'Algebra 2', courseState: 'ACTIVE' }), true);
  for (const state of ['ARCHIVED', 'PROVISIONED', 'DECLINED', 'SUSPENDED']) {
    assert.equal(usableCourse({ id: 'c1', name: 'Algebra 2', courseState: state }), false, `${state} should be left out`);
  }
  assert.equal(usableCourse({ id: '', name: 'Algebra 2' }), false);
  assert.equal(usableCourse({ id: 'c1', name: '   ' }), false);
  // The section is how a student tells two classes of the same subject apart.
  assert.equal(courseTitle({ id: 'c', name: 'Algebra 2', section: 'Period 3' }), 'Algebra 2 (Period 3)');
  assert.equal(courseTitle({ id: 'c', name: 'Algebra 2' }), 'Algebra 2');
  // Not repeated when the teacher already put it in the name.
  assert.equal(courseTitle({ id: 'c', name: 'Algebra 2 Period 3', section: 'period 3' }), 'Algebra 2 Period 3');
  // A single-letter section is the common case, and it must not be swallowed by a letter inside the
  // name: "Algebra 2" contains a b, and section B still has to show.
  assert.equal(courseTitle({ id: 'c', name: 'Algebra 2', section: 'B' }), 'Algebra 2 (B)');
  assert.equal(courseTitle({ id: 'c', name: 'Biology', section: 'A' }), 'Biology (A)');
  assert.equal(courseTitle({ id: 'c', name: 'Chemistry - B', section: 'B' }), 'Chemistry - B');
  assert.equal(courseTitle({ id: 'c', name: 'English 9', section: '9' }), 'English 9');
});

test('a due date is only a due date when Google gave all of it', async () => {
  const { dueOn, dueAt } = await rules();
  assert.equal(dueOn(work('w', 'c', { dueDate: { year: 2026, month: 11, day: 4 } })), '2026-11-04');
  assert.equal(dueOn(work('w', 'c', { dueDate: { year: 2026, month: 9, day: 1 } })), '2026-09-01');
  // Half a date is no date, rather than a guess.
  assert.equal(dueOn(work('w', 'c', { dueDate: { year: 2026, month: 11 } })), null);
  assert.equal(dueOn(work('w', 'c', { dueDate: {} })), null);
  assert.equal(dueOn(work('w', 'c')), null);
  assert.equal(dueOn(work('w', 'c', { dueDate: { year: 2026, month: 13, day: 4 } })), null);
  // The time is kept as given and padded, and absent when Google sent none.
  assert.equal(dueAt(work('w', 'c', { dueTime: { hours: 23, minutes: 59 } })), '23:59');
  assert.equal(dueAt(work('w', 'c', { dueTime: { hours: 9 } })), '09:00');
  assert.equal(dueAt(work('w', 'c')), null);
});

test('coursework becomes the right kind of planner item', async () => {
  const { plannerTypeFor, usableWork } = await rules();
  assert.equal(plannerTypeFor('ASSIGNMENT'), 'Assignment');
  assert.equal(plannerTypeFor(undefined), 'Assignment');
  assert.equal(plannerTypeFor('SHORT_ANSWER_QUESTION'), 'Quiz');
  assert.equal(plannerTypeFor('MULTIPLE_CHOICE_QUESTION'), 'Quiz');
  assert.equal(plannerTypeFor('MATERIAL'), 'Reading');
  // A draft or deleted assignment is not something to put in a planner.
  assert.equal(usableWork(work('w', 'c')), true, 'no state given means published');
  assert.equal(usableWork(work('w', 'c', { state: 'DRAFT' })), false);
  assert.equal(usableWork(work('w', 'c', { state: 'DELETED' })), false);
  assert.equal(usableWork({ id: 'w', courseId: 'c', title: ' ' }), false);
});

test('a class is matched by its Classroom id, so a renamed class keeps its name', async () => {
  const { matchByClassroom, courseKeyFor, workItemId } = await rules();
  const known = [{ id: 'local-1', code: courseKeyFor('g-77') }, { id: 'local-2', code: 'BIO-101' }];
  assert.equal(matchByClassroom('g-77', known).id, 'local-1');
  assert.equal(matchByClassroom('g-99', known), undefined);
  // Never matched on the name — that is the whole point, so renaming survives every later import.
  assert.equal(matchByClassroom('Algebra 2', known), undefined);
  // The same piece of work always gets the same id, so importing twice updates rather than repeats.
  assert.equal(workItemId('c1', 'w1'), workItemId('c1', 'w1'));
  assert.notEqual(workItemId('c1', 'w1'), workItemId('c1', 'w2'));
});

test('an import is worked out in full before anything is changed', async () => {
  const { planImport, courseKeyFor } = await rules();
  const courses = [
    { id: 'g1', name: 'Algebra 2', section: 'B' },
    { id: 'g2', name: 'Chemistry' },
    { id: 'g3', name: 'Last year', courseState: 'ARCHIVED' },
  ];
  const coursework = [
    work('w1', 'g1', { title: 'Problem set 4', dueDate: { year: 2026, month: 11, day: 20 } }),
    work('w2', 'g1', { title: 'No deadline reading' }),
    work('w3', 'g2', { title: 'Old lab', dueDate: { year: 2026, month: 10, day: 1 } }),
    work('w4', 'g3', { title: 'From an archived class', dueDate: { year: 2026, month: 12, day: 1 } }),
    work('w5', 'g2', { title: 'A draft', state: 'DRAFT' }),
  ];
  const known = [{ id: 'local-chem', code: courseKeyFor('g2') }];
  const plan = planImport(courses, coursework, known, '2026-11-04');

  // A class already here keeps its own record; only genuinely new ones are created.
  assert.deepEqual(plan.existing, [{ classroomId: 'g2', courseId: 'local-chem' }]);
  assert.deepEqual(plan.newCourses, [{ classroomId: 'g1', name: 'Algebra 2 (B)' }]);
  // Work with no due date is kept, because plenty of real assignments have none.
  assert.deepEqual(plan.work.map((one) => one.title), ['Problem set 4', 'No deadline reading']);
  assert.equal(plan.work.find((one) => one.title === 'No deadline reading').due, null);
  // And everything left out says why, so nothing disappears quietly.
  assert.deepEqual(plan.skipped.map((one) => `${one.title}: ${one.because}`), [
    'Old lab: it was due before today',
    'From an archived class: its class is not one you are taking now',
    'A draft: not published in Classroom',
  ]);
  // Asked for the past as well, the finished work comes too.
  const withPast = planImport(courses, coursework, known, '2026-11-04', { includePast: true });
  assert.ok(withPast.work.some((one) => one.title === 'Old lab'));
});

test('the plan says what it will do, counting honestly', async () => {
  const { describePlan, planImport } = await rules();
  assert.equal(describePlan({ newCourses: [], existing: [], work: [], skipped: [] }), 'Nothing to bring in.');
  const plan = planImport(
    [{ id: 'g1', name: 'Algebra 2' }],
    [work('w1', 'g1', { dueDate: { year: 2026, month: 12, day: 1 } }), work('w2', 'g1')],
    [],
    '2026-11-04',
  );
  const said = describePlan(plan);
  assert.match(said, /1 new class/);
  assert.match(said, /2 assignments/);
  // The ones with no deadline are called out rather than left to be discovered.
  assert.match(said, /1 assignment has no due date in Classroom/);
  assert.ok(!said.includes('classes already here'), 'nothing that is zero should be mentioned');
});
