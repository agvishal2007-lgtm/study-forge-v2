// Prompt 8: Today's Plan rules, tested directly.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const item = (id, dueDate, over = {}) => ({ id, title: id, courseId: null, type: 'Homework', dueDate, dueTime: '', status: 'Not Started', priority: 'Normal', estimateHours: null, points: null, earnedPoints: null, categoryId: null, details: '', createdAt: 0, updatedAt: 0, ...over });
const event = (id, date, over = {}) => ({ id, title: id, courseId: null, kind: 'Class', date, startTime: '09:00', endTime: '10:00', location: '', whatToDo: '', priority: 'Normal', completed: false, seriesId: '', plannerItemId: null, source: 'manual', sourceCalendar: '', hidden: false, createdAt: 0, updatedAt: 0, ...over });

test('the week has seven days, keeps the given order, and counts each deadline once', async () => {
  const { weekWorkload } = await import('../src/data/workloadRules.ts');
  const today = '2026-11-11';
  const essay = item('essay', '2026-11-13', { estimateHours: 3 });
  const quiz = item('quiz', '2026-11-13');
  const done = item('done', '2026-11-12', { status: 'Completed' });
  const later = item('later', '2026-11-30');
  const block = event('block', '2026-11-13', { kind: 'Study block', plannerItemId: 'essay', startTime: '14:00', endTime: '15:30' });
  const lecture = event('lecture', '2026-11-13');
  const hidden = event('hidden', '2026-11-13', { hidden: true });
  const off = event('off', '2026-11-14', { kind: 'No classes' });
  // Quiz first: the order given is the student's priority order, and it's kept.
  const days = weekWorkload([quiz, essay, done, later], [block, lecture, hidden, off], today);
  assert.equal(days.length, 7);
  assert.equal(days[0].date, today);
  assert.equal(days[6].date, '2026-11-17');
  const friday = days[2];
  assert.deepEqual(friday.deadlines.map((entry) => entry.id), ['quiz', 'essay']);
  // The reserved block sits with its deadline, not as a second item.
  assert.deepEqual(friday.events.map((entry) => entry.id), ['lecture']);
  assert.deepEqual(friday.reserved.get('essay').map((entry) => entry.id), ['block']);
  assert.equal(friday.estimatedHours, 3);
  assert.equal(friday.unestimated, 1, 'a missing estimate is not counted as zero hours of work');
  assert.equal(friday.plannedStudyMinutes, 90);
  assert.equal(days[1].deadlines.length, 0, 'finished work is not on the plan');
  assert.equal(days[3].events.length, 0, 'a no-classes marker is not an event to attend');
  assert.equal(days.flatMap((day) => day.deadlines).length, 2, 'nothing beyond seven days, nothing twice');
});

test('only the student\'s own missed study blocks can be moved', async () => {
  const { missedStudyBlocks, canReschedule } = await import('../src/data/workloadRules.ts');
  const now = { date: '2026-11-11', time: '18:00' };
  const mine = event('mine', '2026-11-10', { kind: 'Study block' });
  const earlierToday = event('earlier', '2026-11-11', { kind: 'Study block', startTime: '15:00', endTime: '16:00' });
  const laterToday = event('later', '2026-11-11', { kind: 'Study block', startTime: '19:00', endTime: '20:00' });
  const finished = event('finished', '2026-11-10', { kind: 'Study block', completed: true });
  const fromGoogle = event('google', '2026-11-10', { kind: 'Study block', source: 'google' });
  const lecture = event('lecture', '2026-11-10');
  const longAgo = event('old', '2026-10-01', { kind: 'Study block' });
  const missed = missedStudyBlocks([mine, earlierToday, laterToday, finished, fromGoogle, lecture, longAgo], now);
  assert.deepEqual(missed.map((entry) => entry.id), ['mine', 'earlier']);
  assert.equal(canReschedule(lecture), false);
  assert.equal(canReschedule(fromGoogle), false);
});

test('Start studying resumes first, then what is overdue or due, then lessons', async () => {
  const { startStudying } = await import('../src/data/workloadRules.ts');
  const base = { reviewResumeMs: 12 * 3600_000, nowMs: 1_000_000, cardsDue: 0, hasPracticeQuestions: false };
  assert.equal(startStudying({ ...base, practice: { url: '/practice/session?set=a', position: 2, total: 5 } }).label, 'Resume practice');
  assert.match(startStudying({ ...base, practice: { url: 'x', position: 2, total: 5 } }).reason, /question 3 of 5/);
  // A finished or stopped session isn't offered.
  assert.notEqual(startStudying({ ...base, practice: { url: 'x', position: 5, total: 5 } }).label, 'Resume practice');
  assert.notEqual(startStudying({ ...base, practice: { url: 'x', position: 1, total: 5, endedEarly: true } }).label, 'Resume practice');
  assert.equal(startStudying({ ...base, review: { url: '/cards/review', left: 3, savedAt: 999_000 } }).label, 'Resume flashcards');
  assert.notEqual(startStudying({ ...base, review: { url: '/cards/review', left: 3, savedAt: -50_000_000 } }).label, 'Resume flashcards', 'a stale review starts fresh');
  const overdue = { id: 'p1', title: 'Essay', isTest: false, group: 'overdue' };
  assert.deepEqual(startStudying({ ...base, cardsDue: 4, topWork: overdue }), { to: '/planner/p1', label: 'Start Essay', reason: 'It is overdue, and first in your order.' });
  assert.equal(startStudying({ ...base, cardsDue: 4, topWork: { ...overdue, group: 'week' } }).to, '/cards/review');
  assert.equal(startStudying({ ...base, topWork: { id: 'e', title: 'Exam 1', isTest: true, group: 'week' }, hasPracticeQuestions: true }).to, '/practice');
  assert.equal(startStudying({ ...base, nextCheckpoint: { id: 'c1', title: 'Debits' } }).to, '/study/checkpoints/c1');
  assert.equal(startStudying(base).to, '/study');
});

test('the last 7 days count only saved records, and bars say what they count', async () => {
  const { lastWeek, barLabel, barPercent } = await import('../src/data/workloadRules.ts');
  const look = lastWeek({
    today: '2026-11-11',
    studiedDays: new Set(['2026-11-11', '2026-11-05', '2026-11-04']),
    cardReviewsByDay: new Map([['2026-11-10', 6], ['2026-11-01', 9]]),
    attempts: [{ at: '2026-11-09', result: 'correct' }, { at: '2026-11-09', result: 'wrong' }, { at: '2026-10-30', result: 'correct' }],
    plannerItems: [item('a', '2026-11-06', { status: 'Completed' }), item('b', '2026-11-10'), item('c', '2026-11-20'), item('d', '')],
    secondsByDay: new Map([['2026-11-11', 600], ['2026-11-01', 9000]]),
  });
  assert.deepEqual(look, { from: '2026-11-05', to: '2026-11-11', daysStudied: 2, cardsReviewed: 6, practiceAnswers: 2, practiceCorrect: 1, dueDone: 1, dueTotal: 2, studySeconds: 600 });
  assert.equal(barLabel(2, 8, 'checkpoints'), '2 of 8 checkpoints');
  assert.equal(barPercent(0, 0), 0);
  assert.equal(barPercent(1, 3), 33);
});
