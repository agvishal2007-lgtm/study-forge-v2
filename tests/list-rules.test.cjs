// To-do lists: a view of the one set of tasks, never a second copy of them.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const rules = () => import('../src/data/listRules.ts');
const task = (id, extra = {}) => ({
  id, title: id, createdAt: Number(id.replace(/\D/g, '') || 0), dueDate: '', dueTime: '',
  status: 'Not Started', priority: 'Normal', courseId: null, section: '', details: '', ...extra,
});
const course = (id, name, position) => ({ id, name, code: '', term: '', position, status: 'active', createdAt: position, updatedAt: position });

test('every class with work gets a list, then the student\'s sections, then Personal', async () => {
  const { listsFor } = await rules();
  const lists = listsFor([
    task('t1', { courseId: 'acc' }),
    task('t2', { section: 'Morning routine' }),
    task('t3'),
    task('t4', { courseId: 'bio' }),
  ], [course('acc', 'Accounting', 0), course('bio', 'Biology', 1), course('empty', 'Nothing here', 2)]);
  assert.deepEqual(lists.map((list) => list.name), ['Accounting', 'Biology', 'Morning routine', 'Personal']);
  // A class with no work isn't shown, so the panel doesn't fill with empty classes.
  assert.equal(lists.find((list) => list.name === 'Nothing here'), undefined);
  // Personal always exists, as somewhere for a task that belongs to nothing.
  assert.deepEqual(lists.at(-1).items.map((item) => item.id), ['t3']);
});

test('a task is in exactly one list, never two', async () => {
  const { listsFor } = await rules();
  // This task has both a class and a section. The class wins; it is not shown twice.
  const lists = listsFor([task('t1', { courseId: 'acc', section: 'Reading' })], [course('acc', 'Accounting', 0)]);
  const everywhere = lists.flatMap((list) => list.items.map((item) => item.id));
  assert.deepEqual(everywhere, ['t1']);
  assert.equal(everywhere.filter((id) => id === 't1').length, 1);
});

test('a list counts what is left to do, and finished tasks stay in it', async () => {
  const { listsFor } = await rules();
  const lists = listsFor([
    task('t1', { courseId: 'acc', status: 'Completed' }),
    task('t2', { courseId: 'acc' }),
  ], [course('acc', 'Accounting', 0)]);
  const acc = lists[0];
  assert.equal(acc.items.length, 2, 'a finished task stays in its list');
  assert.equal(acc.left, 1, 'but only what is left is counted');
});

test('the list that was open stays open, and a gone one falls back rather than breaking', async () => {
  const { listsFor, chooseList } = await rules();
  const lists = listsFor([task('t1', { courseId: 'acc' }), task('t2')], [course('acc', 'Accounting', 0)]);
  assert.equal(chooseList(lists, 'personal').name, 'Personal', 'the one they had open');
  assert.equal(chooseList(lists, 'a-class-that-was-deleted').name, 'Accounting', 'falls back to the first');
  assert.equal(chooseList(lists, null).name, 'Accounting');
  assert.equal(chooseList([], 'personal'), null, 'nothing at all is handled');
});

test('flipping through goes both ways and comes round again', async () => {
  const { listsFor, flip } = await rules();
  const lists = listsFor([task('t1', { courseId: 'acc' }), task('t2', { courseId: 'bio' }), task('t3')],
    [course('acc', 'Accounting', 0), course('bio', 'Biology', 1)]);
  assert.equal(flip(lists, 'acc', 1), 'bio');
  assert.equal(flip(lists, 'bio', 1), 'personal');
  assert.equal(flip(lists, 'personal', 1), 'acc', 'round the end');
  assert.equal(flip(lists, 'acc', -1), 'personal', 'and backwards round the start');
});

test('a task typed into a list belongs to that list', async () => {
  const { listsFor, belongsTo } = await rules();
  const lists = listsFor([task('t1', { courseId: 'acc' }), task('t2', { section: 'Reading' }), task('t3')],
    [course('acc', 'Accounting', 0)]);
  assert.deepEqual(belongsTo(lists[0]), { courseId: 'acc', section: '' }, 'typed in a class, belongs to it');
  assert.deepEqual(belongsTo(lists[1]), { courseId: null, section: 'Reading' });
  assert.deepEqual(belongsTo(lists[2]), { courseId: null, section: '' }, 'Personal belongs to nothing');
});

test('with no tasks at all there is still somewhere to start', async () => {
  const { listsFor } = await rules();
  const lists = listsFor([], [course('acc', 'Accounting', 0)]);
  assert.deepEqual(lists.map((list) => list.name), ['Personal']);
  assert.equal(lists[0].items.length, 0);
  assert.equal(lists[0].left, 0);
});

test('a task taken off the list is in no list, but is not gone', async () => {
  const { listsFor } = await rules();
  const lists = listsFor([
    task('t1', { courseId: 'acc' }),
    task('t2', { courseId: 'acc', hiddenFromList: true }),
  ], [course('acc', 'Accounting', 0)]);
  const acc = lists.find((list) => list.name === 'Accounting');
  assert.deepEqual(acc.items.map((item) => item.id), ['t1'], 'the hidden one is out of the way');
  // It is out of every list, not moved to another one.
  const everywhere = lists.flatMap((list) => list.items.map((item) => item.id));
  assert.equal(everywhere.includes('t2'), false);
  // Putting it back brings it to its own class, not Personal.
  const back = listsFor([task('t1', { courseId: 'acc' }), task('t2', { courseId: 'acc' })], [course('acc', 'Accounting', 0)]);
  assert.deepEqual(back.find((list) => list.name === 'Accounting').items.map((item) => item.id), ['t1', 't2']);
});
