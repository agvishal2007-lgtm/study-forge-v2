// Direct tests of the Guided Study rules.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/data/mastery.ts');
const NOW = 1000;
const q = (id, over = {}) => ({ id, kind: 'multiple', prompt: id, options: ['a', 'b'], correctOption: 0, accepted: [], modelAnswer: 'a', explanation: 'x', idea: '', ...over });
const checkpoint = (questions, over = {}) => ({
  id: 'c', lessonId: 'l', title: 't', order: 1, createdAt: 1, materialId: null, sourceNote: '', explainPrompt: 'Explain', keyPoints: ['one', 'two'], reteach: [],
  teaching: { intro: 'i', meaning: 'm', why: 'w', parts: [], example: 'e', walkthrough: [], keyIdea: 'k' }, questions, ...over,
});
const ALL = ['q1', 'q2', 'q3'].map((id) => q(id));

async function run(cp, actions) {
  const { applyStudyAction, newProgress } = await load();
  let progress = newProgress(cp.id, NOW);
  for (const action of actions) progress = applyStudyAction(cp, progress, action, NOW);
  return progress;
}
const answer = (id, correct, attempt = `a-${id}-${correct}`) => ({ type: 'answer', attemptId: attempt, questionId: id, answer: '0', correct, method: 'automatic' });
const teach = { type: 'finish-teaching', skipped: false, attemptId: 'x' };
const pass = { type: 'explain-rate', text: 'mine', ratings: ['included', 'included'] };
const fail = { type: 'explain-rate', text: 'mine', ratings: ['included', 'missed'] };

test('moving through screens alone never produces mastery', async () => {
  const progress = await run(checkpoint(ALL), [
    { type: 'teach-step', step: 1 }, { type: 'teach-step', step: 2 }, teach,
    { type: 'continue', attemptId: 'y' }, { type: 'continue', attemptId: 'z' }, { type: 'finish-reteach', attemptId: 'w' },
  ]);
  assert.notEqual(progress.status, 'mastered');
});

test('right answers alone do not produce mastery without an explanation', async () => {
  const progress = await run(checkpoint(ALL), [teach, answer('q1', true), answer('q2', true), answer('q3', true)]);
  assert.notEqual(progress.status, 'mastered');
});

test('all the evidence produces mastery', async () => {
  const progress = await run(checkpoint(ALL), [teach, answer('q1', true), answer('q2', true), answer('q3', true), pass]);
  assert.equal(progress.status, 'mastered');
  assert.equal(progress.stage.kind, 'mastered');
});

test('an explanation alone does not produce mastery', async () => {
  assert.notEqual((await run(checkpoint(ALL), [teach, pass])).status, 'mastered');
});

test('without finishing teaching, even full evidence is not mastery', async () => {
  assert.notEqual((await run(checkpoint(ALL), [answer('q1', true), answer('q2', true), answer('q3', true), pass])).status, 'mastered');
});

test('a low score blocks mastery until the student improves', async () => {
  const qs = ['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => q(id));
  const base = [teach, answer('q1', true), answer('q2', false), answer('q3', false), answer('q4', true), answer('q5', true), pass];
  assert.notEqual((await run(checkpoint(qs), base)).status, 'mastered', '60% is below 80%');
  const fixed = await run(checkpoint(qs), [...base.slice(0, -1), answer('q2', true, 'retry'), pass]);
  assert.equal(fixed.status, 'mastered', 'latest answers reach 80%');
});

test('a checkpoint with an application question requires getting one right', async () => {
  const qs = [q('q1'), q('q2'), q('q3'), q('q4'), q('app', { kind: 'application' })];
  const missed = await run(checkpoint(qs), [teach, answer('q1', true), answer('q2', true), answer('q3', true), answer('q4', true), answer('app', false), pass]);
  assert.notEqual(missed.status, 'mastered', '80% accuracy but no application shown');
  const right = await run(checkpoint(qs), [teach, answer('q1', true), answer('q2', true), answer('q3', true), answer('q4', true), answer('app', true), pass]);
  assert.equal(right.status, 'mastered');
});

test('a failed explanation check blocks mastery and repeated failure needs review', async () => {
  const actions = [teach, answer('q1', true), answer('q2', true), answer('q3', true), fail];
  assert.notEqual((await run(checkpoint(ALL), actions)).status, 'mastered');
  assert.equal((await run(checkpoint(ALL), [...actions, fail])).status, 'needs-review');
  assert.equal((await run(checkpoint(ALL), [...actions, fail, pass])).status, 'mastered');
});

test('submitting the same attempt twice counts once', async () => {
  const progress = await run(checkpoint(ALL), [teach, answer('q1', false, 'same'), answer('q1', false, 'same')]);
  assert.equal(progress.answers.length, 1);
  assert.equal(progress.misses.q1, 1);
});

test('a miss teaches again, then gives a new question on the same idea, not the same question', async () => {
  const { nextQuestion } = await load();
  const qs = [q('a1', { idea: 'A' }), q('b1', { idea: 'B' }), q('a2', { idea: 'A' })];
  const cp = checkpoint(qs);
  const missed = await run(cp, [teach, answer('a1', false)]);
  assert.equal(missed.stage.kind, 'feedback');
  const reteaching = await run(cp, [teach, answer('a1', false), { type: 'continue', attemptId: 'n' }]);
  assert.equal(reteaching.stage.kind, 'reteach');
  assert.equal(reteaching.stage.idea, 'A');
  assert.equal(nextQuestion(cp, reteaching).id, 'a2');
});

test('missing the same idea twice is marked Needs Review, and the student is never blocked', async () => {
  const qs = [q('a1', { idea: 'A' }), q('a2', { idea: 'A' }), q('b1', { idea: 'B' })];
  const cp = checkpoint(qs);
  const stuck = await run(cp, [teach, answer('a1', false), { type: 'continue', attemptId: 'n' }, { type: 'finish-reteach', attemptId: 'n2' }, answer('a2', false), { type: 'continue', attemptId: 'n3' }]);
  assert.equal(stuck.status, 'needs-review');
  assert.equal(stuck.stage.kind, 'stuck');
  const again = await run(cp, [teach, answer('a1', false), { type: 'continue', attemptId: 'n' }, { type: 'finish-reteach', attemptId: 'n2' }, answer('a2', false), { type: 'continue', attemptId: 'n3' }, { type: 'try-another-example', idea: 'A' }]);
  assert.equal(again.stage.kind, 'reteach');
  assert.equal(again.status, 'practicing');
  assert.notEqual(again.status, 'mastered');
});

test('a correct answer earlier is kept when another part is missed', async () => {
  const progress = await run(checkpoint(ALL), [teach, answer('q1', true), answer('q2', false)]);
  assert.equal(progress.answers.find((a) => a.questionId === 'q1').correct, true);
});

test('a draft never counts as an answer', async () => {
  const progress = await run(checkpoint(ALL), [teach, { type: 'draft', text: 'half typed' }]);
  assert.equal(progress.answers.length, 0);
  assert.equal(progress.draft, 'half typed');
});

test('a checkpoint missing content can never be mastered', async () => {
  const { evaluateMastery, missingContent } = await load();
  const cp = checkpoint(ALL, { keyPoints: [] });
  assert.ok(missingContent(cp).length > 0);
  const progress = await run(cp, [teach, answer('q1', true), answer('q2', true), answer('q3', true), { type: 'explain-rate', text: 'x', ratings: [] }]);
  assert.equal(evaluateMastery(cp, progress).mastered, false);
});

test('typed answers grade fairly', async () => {
  const { gradeAutomatically, canAutoGrade } = await load();
  const question = q('t', { options: [], correctOption: null, accepted: ['$12,000', 'twelve thousand'] });
  assert.equal(gradeAutomatically(question, '  $12,000 '), true);
  assert.equal(gradeAutomatically(question, 'TWELVE   thousand!'), true);
  assert.equal(gradeAutomatically(question, '$11,000'), false);
  assert.equal(canAutoGrade(question, 'something else'), false, 'unmatched answers go to self-check, not marked wrong');
});

test('counts rise only when a lesson is fully mastered', async () => {
  const { countLesson } = await load();
  const cps = [{ id: 'a' }, { id: 'b' }];
  const none = countLesson(cps, new Map());
  assert.deepEqual(none, { mastered: 0, total: 2, completed: false });
  const partial = countLesson(cps, new Map([['a', { status: 'mastered' }], ['b', { status: 'practicing' }]]));
  assert.deepEqual(partial, { mastered: 1, total: 2, completed: false });
  assert.equal(countLesson(cps, new Map([['a', { status: 'mastered' }], ['b', { status: 'mastered' }]])).completed, true);
  assert.equal(countLesson([], new Map()).completed, false);
});

test('the next recommendation resumes, then reviews, then moves on', async () => {
  const { recommendNext } = await load();
  const lessons = [{ id: 'l', order: 1, createdAt: 1 }];
  const cps = [checkpoint(ALL, { id: 'a', order: 1 }), checkpoint(ALL, { id: 'b', order: 2 }), checkpoint(ALL, { id: 'c', order: 3 })];
  assert.equal(recommendNext(lessons, cps, new Map()).checkpoint.id, 'a');
  assert.equal(recommendNext(lessons, cps, new Map([['a', { status: 'mastered' }]])).checkpoint.id, 'b');
  assert.equal(recommendNext(lessons, cps, new Map([['a', { status: 'needs-review' }]])).checkpoint.id, 'a');
  assert.equal(recommendNext(lessons, cps, new Map([['a', { status: 'needs-review' }], ['c', { status: 'practicing', lastStudiedAt: 5 }]])).checkpoint.id, 'c');
  const allDone = new Map(['a', 'b', 'c'].map((id) => [id, { status: 'mastered' }]));
  assert.equal(recommendNext(lessons, cps, allDone), null);
});
