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
  // Falls back to Personal rather than to whichever class happens to be first. Opening on a class
  // list meant a task just added to Personal was nowhere on screen, which reads as a lost task.
  assert.equal(chooseList(lists, 'a-class-that-was-deleted').name, 'Personal', 'falls back to Personal');
  assert.equal(chooseList(lists, null).name, 'Personal');
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

test('with nothing chosen yet, the panel opens somewhere predictable', async () => {
  const { chooseList } = await import('../src/data/listRules.ts');
  const lists = [
    { id: 'acc', kind: 'course', name: 'Accounting', items: [] },
    { id: 'reading', kind: 'section', name: 'Reading', items: [] },
    { id: 'personal', kind: 'personal', name: 'Personal', items: [] },
  ];
  // A remembered list still wins, which is what keeps flipping sticky.
  assert.equal(chooseList(lists, 'reading').id, 'reading');
  // Otherwise Personal, so a task just added to it is never invisible on first open.
  assert.equal(chooseList(lists, null).id, 'personal');
  assert.equal(chooseList(lists, 'a-list-that-is-gone').id, 'personal');
  // And if there were somehow no Personal list, the first one rather than nothing.
  assert.equal(chooseList(lists.slice(0, 2), null).id, 'acc');
  assert.equal(chooseList([], null), null);
});

test('a student can make a list of their own, and it stays even when empty', async () => {
  const { listsFor, tidyListName, listNameProblem } = await import('../src/data/listRules.ts');
  const courses = [{ id: 'bio', name: 'Biology', status: 'active', position: 0 }];
  const items = [];
  // A list they made is there from the moment they make it, with nothing in it.
  const lists = listsFor(items, courses, ['College', 'Family']);
  assert.deepEqual(lists.map((one) => one.name), ['College', 'Family', 'Personal']);
  assert.equal(lists[0].kind, 'section');
  assert.equal(lists[0].items.length, 0);
  assert.equal(lists[0].left, 0);
  // A class with no work is still left out, so the panel doesn't fill with empty classes.
  assert.equal(lists.some((one) => one.name === 'Biology'), false);

  // Names are tidied, not taken raw.
  assert.equal(tidyListName('  Family  stuff \n'), 'Family stuff');
  assert.equal(tidyListName('x'.repeat(60)).length, 40);

  // A name already in use is refused, with the reason said.
  const taken = { lists: ['College'], courses: ['Biology'] };
  assert.match(listNameProblem('college', taken), /already have a list called/);
  assert.match(listNameProblem('Biology', taken), /one of your classes/);
  assert.match(listNameProblem('personal', taken), /already a Personal list/);
  assert.match(listNameProblem('   ', taken), /Give the list a name/);
  assert.equal(listNameProblem('Family', taken), '');
});

test('tasks filed under a made list land in it, and are never counted twice', async () => {
  const { listsFor } = await import('../src/data/listRules.ts');
  const item = (id, extra = {}) => ({ id, title: id, courseId: null, section: '', status: 'Not Started', type: 'To-do', dueDate: '', createdAt: 0, ...extra });
  const courses = [{ id: 'bio', name: 'Biology', status: 'active', position: 0 }];
  const items = [
    item('a', { section: 'College' }),
    item('b', { section: 'College' }),
    item('c'),
    item('d', { courseId: 'bio' }),
    item('e', { section: 'Chores' }),
  ];
  const lists = listsFor(items, courses, ['College']);
  const named = (name) => lists.find((one) => one.name === name);
  assert.deepEqual(named('College').items.map((one) => one.id), ['a', 'b']);
  // A section that arrived with a task still becomes a list, after the ones they made.
  assert.deepEqual(named('Chores').items.map((one) => one.id), ['e']);
  assert.deepEqual(named('Biology').items.map((one) => one.id), ['d']);
  // Only the task belonging to nothing is left in Personal.
  assert.deepEqual(named('Personal').items.map((one) => one.id), ['c']);
  // Every task is in exactly one list, still.
  const everywhere = lists.flatMap((one) => one.items.map((task) => task.id));
  assert.equal(new Set(everywhere).size, everywhere.length);
  assert.equal(everywhere.length, items.length);
});
