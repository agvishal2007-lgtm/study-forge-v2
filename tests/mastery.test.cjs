// Direct tests of the Guided Study rules.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/data/mastery.ts');
// A bare progress record, for tests that only care about a couple of its fields.
const require_newProgress = (id) => ({ checkpointId: id, status: 'not-started', teachingFinished: false, teachingSkipped: false, stage: { kind: 'teach', step: 0 }, answers: [], misses: {}, reteachCount: 0, explanations: [], draft: '', lastStudiedAt: 0, masteredAt: null });
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
  /*
   * Everything mastered used to mean nothing suggested — a student who finished a lesson was shown
   * an empty space. Now the one left longest is offered to review, which is what the owner's study
   * system asks for: mastering something is not a reason to be done with it forever.
   */
  const allDone = new Map(['a', 'b', 'c'].map((id, index) => [id, { status: 'mastered', lastStudiedAt: 100 - index }]));
  const afterAll = recommendNext(lessons, cps, allDone);
  assert.equal(afterAll.checkpoint.id, 'c', 'the one looked at longest ago');
  assert.equal(afterAll.review, true, 'to review, not to start over');
});

/*
 * Starting a checkpoint over. Under the owner's study system a restart "restarts the requested
 * scope while retaining historical evidence" and must not "erase previously demonstrated
 * achievement" — so these check the keeping, not just the restarting.
 */
test('starting over gives a fresh attempt and keeps what the last one showed', async () => {
  const { newProgress, restartProgress, everMasteredAt, restartCount } = await load();
  const september = Date.UTC(2026, 8, 12);
  const november = Date.UTC(2026, 10, 26);

  const mastered = {
    ...newProgress('cp-1', september),
    status: 'mastered',
    answers: [{ questionId: 'q1', correct: true, at: september }, { questionId: 'q2', correct: false, at: september }],
    explanations: [{ at: september, passed: true }],
    masteredAt: september,
    lastStudiedAt: september,
  };

  const again = restartProgress(mastered, november);
  assert.equal(again.status, 'not-started', 'the work really does start again');
  assert.deepEqual(again.answers, [], 'with no answers carried over');
  assert.equal(again.masteredAt, null, 'and mastery to be shown again, not assumed');

  assert.equal(restartCount(again), 1);
  assert.deepEqual(again.past[0], {
    status: 'mastered',
    answered: 2,
    correct: 1,
    explanations: 1,
    masteredAt: september,
    startedAt: september,
    restartedAt: november,
  }, 'and September is still on the record');
  assert.equal(everMasteredAt(again), september, 'so the student can still see they mastered it');
});

test('restarting twice keeps both attempts, oldest first', async () => {
  const { newProgress, restartProgress, restartCount, everMasteredAt } = await load();
  const first = Date.UTC(2026, 0, 10);
  const second = Date.UTC(2026, 3, 10);
  const third = Date.UTC(2026, 7, 10);

  let record = { ...newProgress('cp-1', first), status: 'mastered', masteredAt: first, answers: [{ questionId: 'q1', correct: true, at: first }] };
  record = restartProgress(record, second);
  record = { ...record, status: 'practicing', answers: [{ questionId: 'q1', correct: false, at: second }] };
  record = restartProgress(record, third);

  assert.equal(restartCount(record), 2);
  assert.deepEqual(record.past.map((attempt) => attempt.status), ['mastered', 'practicing'], 'oldest first');
  assert.equal(everMasteredAt(record), first, 'and the mastery from January survives both restarts');
});

test('starting over a checkpoint never begun leaves nothing behind', async () => {
  const { newProgress, restartProgress, restartCount } = await load();
  const now = Date.now();
  const untouched = newProgress('cp-1', now);
  const again = restartProgress(untouched, now + 1000);
  assert.equal(restartCount(again), 0, 'an attempt with nothing in it is not worth keeping');
  assert.deepEqual(again.answers, []);
});

/*
 * Reviewing, which under the owner's study system is a different thing from restarting: it must not
 * "erase previously demonstrated achievement", so these check that it cannot.
 */
test('reviewing records that it happened and never touches what was mastered', async () => {
  const { newProgress, addReview, lastLookedAt, reviewWords } = await load();
  const september = Date.UTC(2026, 8, 12);
  const november = Date.UTC(2026, 10, 26);
  const mastered = { ...newProgress('cp-1', september), status: 'mastered', masteredAt: september, lastStudiedAt: september, answers: [{ questionId: 'q1', correct: true, at: september }] };

  const after = addReview(mastered, { answered: 4, correct: 2 }, november);
  assert.equal(after.status, 'mastered', 'still mastered');
  assert.equal(after.masteredAt, september, 'and still mastered on the same day');
  assert.deepEqual(after.answers, mastered.answers, 'the answers that earned it are untouched');
  assert.deepEqual(after.reviews, [{ at: november, answered: 4, correct: 2 }]);
  assert.equal(lastLookedAt(after), november, 'but Study Forge knows it was looked at in November');
  assert.match(reviewWords(after), /2 of 4 right/);
});

test('a review that went badly is still not a reason to take mastery away', async () => {
  const { newProgress, addReview } = await load();
  const mastered = { ...newProgress('cp-1', 1000), status: 'mastered', masteredAt: 1000 };
  const after = addReview(mastered, { answered: 5, correct: 0 }, 2000);
  assert.equal(after.status, 'mastered');
  assert.equal(after.masteredAt, 1000);
  assert.deepEqual(after.reviews.at(-1), { at: 2000, answered: 5, correct: 0 });
});

test('a review cannot report more right than were asked', async () => {
  const { newProgress, addReview } = await load();
  const after = addReview(newProgress('cp-1', 1), { answered: 3, correct: 9 }, 2);
  assert.deepEqual(after.reviews.at(-1), { at: 2, answered: 3, correct: 3 }, 'nonsense is clamped rather than stored');
});

test('when everything is mastered, the suggestion is to review the one left longest', async () => {
  const { recommendNext } = await load();
  const lesson = { id: 'l1', title: 'Lesson one', order: 0, createdAt: 0, courseId: null, label: 'Lesson' };
  const make = (id, order) => ({ ...checkpoint([q('q1')], { id, lessonId: 'l1', order, title: id }), createdAt: order });
  const checkpoints = [make('older', 0), make('newer', 1)];
  const progress = new Map([
    ['older', { ...require_newProgress('older'), status: 'mastered', lastStudiedAt: 1000 }],
    ['newer', { ...require_newProgress('newer'), status: 'mastered', lastStudiedAt: 9000 }],
  ]);
  const suggestion = recommendNext([lesson], checkpoints, progress);
  assert.equal(suggestion.checkpoint.id, 'older', 'the one not looked at for longest');
  assert.equal(suggestion.review, true, 'and it is a review, not starting it over');
  assert.match(suggestion.reason, /not looked at for longest/);
});
