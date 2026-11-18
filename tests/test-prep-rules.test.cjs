// SAT and PSAT preparation: the published score scales, what follows from them, and a question bank
// that has to be well formed before anybody practises from it.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const rules = () => import('../src/data/testPrepRules.ts');
const bank = () => import('../src/data/testPrepQuestions.ts');
const score = (test_, rw, math, date = '2026-01-01', extra = {}) => ({ id: `s-${date}-${rw}`, test: test_, date, source: '', rw, math, createdAt: 0, updatedAt: 0, ...extra });
const attempt = (domain, correct, id = 'q') => ({ id: `a-${domain}-${correct}-${Math.random()}`, questionId: id, domain, correct, at: 0, createdAt: 0, updatedAt: 0 });

test('the score scales are the published ones, and a total is its two sections added', async () => {
  const { testFacts, totalRange, validSection, totalOf } = await rules();
  assert.deepEqual(totalRange('sat'), [400, 1600]);
  assert.deepEqual(totalRange('psat-nmsqt'), [320, 1520]);
  assert.deepEqual(totalRange('psat-10'), [320, 1520]);
  assert.deepEqual(totalRange('psat-8-9'), [240, 1440]);
  assert.equal(testFacts('sat').sectionLow, 200);
  assert.equal(testFacts('sat').sectionHigh, 800);
  assert.equal(testFacts('psat-8-9').sectionLow, 120);
  assert.equal(testFacts('psat-8-9').sectionHigh, 720);
  assert.equal(totalOf(680, 720), 1400);
  // Reported in steps of ten, inside the scale.
  assert.equal(validSection('sat', 680), true);
  assert.equal(validSection('sat', 685), false, 'scores come in steps of ten');
  assert.equal(validSection('sat', 190), false);
  assert.equal(validSection('sat', 810), false);
  assert.equal(validSection('psat-8-9', 720), true);
  assert.equal(validSection('psat-8-9', 760), false, 'that is above this test\'s scale');
});

test('the Selection Index belongs to the PSAT/NMSQT alone and is worked out, not guessed', async () => {
  const { selectionIndex } = await rules();
  // Twice Reading and Writing, plus Math, divided by ten.
  assert.equal(selectionIndex('psat-nmsqt', 700, 700), 210);
  assert.equal(selectionIndex('psat-nmsqt', 760, 760), 228, 'the top of the range');
  assert.equal(selectionIndex('psat-nmsqt', 160, 160), 48, 'the bottom of the range');
  // No other test has one, so there is no number to give.
  assert.equal(selectionIndex('sat', 700, 700), null);
  assert.equal(selectionIndex('psat-10', 700, 700), null);
  // A score outside the scale gives nothing rather than nonsense.
  assert.equal(selectionIndex('psat-nmsqt', 765, 700), null);
});

test('progress is what the scores say, and never a forecast', async () => {
  const { progressOf, totalOf } = await rules();
  const none = progressOf([], 1400);
  assert.equal(none.latest, null);
  assert.equal(none.change, null);
  const one = progressOf([score('sat', 600, 600, '2026-01-01')], 1400);
  assert.equal(totalOf(one.latest.rw, one.latest.math), 1200);
  assert.equal(one.change, null, 'one score is not a trend');
  assert.equal(one.toGoal, 200);
  const many = [score('sat', 600, 600, '2026-01-01'), score('sat', 700, 700, '2026-03-01'), score('sat', 650, 680, '2026-02-01')];
  const progress = progressOf(many, 1400);
  assert.equal(totalOf(progress.latest.rw, progress.latest.math), 1400, 'latest is by date, not by order given');
  assert.equal(totalOf(progress.best.rw, progress.best.math), 1400);
  assert.equal(progress.change, 200);
  assert.equal(progress.toGoal, 0, 'at the goal is nought short, never a negative');
  assert.equal(progressOf(many, null).toGoal, null, 'no goal, nothing to say about one');
  // A score that isn't a real reported score is left out rather than counted.
  assert.equal(progressOf([score('sat', 605, 600)], null).latest, null);
});

test('a countdown says what it knows and nothing more', async () => {
  const { daysUntil, describeCountdown } = await rules();
  assert.equal(daysUntil('2026-12-06', '2026-11-18'), 18);
  assert.equal(daysUntil('2026-11-18', '2026-11-18'), 0);
  assert.equal(daysUntil('2026-11-16', '2026-11-18'), -2);
  assert.equal(daysUntil(null, '2026-11-18'), null);
  assert.equal(daysUntil('not a date', '2026-11-18'), null);
  assert.equal(describeCountdown(null), 'No test date set yet.');
  assert.equal(describeCountdown(0), 'Your test is today.');
  assert.equal(describeCountdown(1), 'Your test is tomorrow.');
  assert.equal(describeCountdown(5), '5 days to go.');
  assert.match(describeCountdown(18), /^18 days to go — about 2 weeks\.$/);
  // A date that has passed is not still coming.
  assert.equal(describeCountdown(-2), 'That date was 2 days ago.');
});

test('weak areas come from real answers, and an untried topic is unknown rather than zero', async () => {
  const { standings, nextFocus, weakAreas, DOMAINS } = await rules();
  const marks = standings([]);
  assert.equal(marks.length, DOMAINS.length, 'every domain is listed, practised or not');
  assert.equal(marks[0].accuracy, null, 'nothing tried is unknown, not nought');
  // Untried comes first, because resolving an unknown beats confirming a known weakness.
  assert.equal(nextFocus([]).tried, 0);
  const tried = DOMAINS.map((domain) => attempt(domain.id, true));
  const withOneWeak = [...tried, attempt('algebra', false), attempt('algebra', false), attempt('algebra', false)];
  assert.equal(nextFocus(withOneWeak).domain, 'algebra');
  assert.equal(standings(withOneWeak).find((one) => one.domain === 'algebra').accuracy, 25);
  // One unlucky question is not a weak area; a few are.
  assert.deepEqual(weakAreas([attempt('geometry', false)]).map((one) => one.domain), []);
  assert.deepEqual(weakAreas(withOneWeak).map((one) => one.domain), ['algebra']);
  assert.deepEqual(weakAreas(tried).map((one) => one.domain), [], 'all right is not weak');
});

test('every question in the bank is well formed before anyone practises from it', async () => {
  const { QUESTIONS, pickQuestions, typedAnswerMatches } = await bank();
  const { DOMAINS } = await rules();
  const domains = new Set(DOMAINS.map((domain) => domain.id));
  const ids = new Set();
  assert.ok(QUESTIONS.length >= 30, `the bank is thin: ${QUESTIONS.length} questions`);
  for (const question of QUESTIONS) {
    assert.ok(!ids.has(question.id), `two questions share the id ${question.id}`);
    ids.add(question.id);
    assert.ok(domains.has(question.domain), `${question.id} has an unknown domain`);
    assert.ok(['rw', 'math'].includes(question.section), `${question.id} has an unknown section`);
    assert.ok([1, 2, 3].includes(question.level), `${question.id} has an odd level`);
    assert.ok(question.prompt.trim().length > 10, `${question.id} has no real prompt`);
    assert.ok(question.why.trim().length > 30, `${question.id} has no real explanation`);
    if (question.choices) {
      assert.equal(question.choices.length, 4, `${question.id} should offer four choices`);
      assert.equal(new Set(question.choices).size, 4, `${question.id} repeats a choice`);
      assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4, `${question.id} points at no answer`);
      assert.equal(question.accepts, undefined, `${question.id} is both kinds of question at once`);
    } else {
      assert.ok(Array.isArray(question.accepts) && question.accepts.length > 0, `${question.id} accepts no answer`);
      // The answer it states must be one it would accept, which is easy to get wrong by hand.
      assert.equal(typedAnswerMatches(question, question.accepts[0]), true, `${question.id} rejects its own answer`);
    }
  }
  // Every domain has something to practise, so no topic offers an empty session.
  for (const domain of DOMAINS) {
    assert.ok(pickQuestions({ test: 'sat', domain: domain.id }).length > 0, `nothing to practise in ${domain.id}`);
  }
  // The hardest questions are left out of the youngest test.
  assert.ok(pickQuestions({ test: 'psat-8-9' }).every((question) => question.level < 3));
  assert.ok(pickQuestions({ test: 'sat' }).length > pickQuestions({ test: 'psat-8-9' }).length);
  // Sections can be practised on their own.
  assert.ok(pickQuestions({ test: 'sat', section: 'math' }).every((question) => question.section === 'math'));
});

test('a typed answer is read generously, but not so generously it accepts the wrong one', async () => {
  const { typedAnswerMatches } = await bank();
  const question = { id: 'q', section: 'math', domain: 'data', level: 1, prompt: 'x', why: 'y', accepts: ['12.50'] };
  for (const given of [' 12.50 ', '$12.50', '12.5', '12.500']) {
    assert.equal(typedAnswerMatches(question, given), true, `${given} should be accepted`);
  }
  for (const given of ['12', '1250', '', '  ', 'twelve fifty']) {
    assert.equal(typedAnswerMatches(question, given), false, `${given} should not be accepted`);
  }
  // A question with choices is never matched this way.
  assert.equal(typedAnswerMatches({ id: 'c', choices: ['a'], answer: 0 }, 'a'), false);
});
