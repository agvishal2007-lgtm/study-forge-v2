// A tick that has been tapped but not yet saved, and whether it survives the row moving lists.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/data/pendingTicks.ts');

test('a tapped tick belongs to the task, not to the list showing it', async () => {
  const ticks = await load();
  ticks.forgetPendingTicks();
  /*
   * This is the whole point. Ticking something off moves it from the list into Done, so the row is
   * taken apart and built again somewhere else. Anything the row itself was holding is gone by
   * then — which is why what was tapped is kept out here, where a rebuilt row can still find it.
   */
  ticks.setPendingTick('task-1', true);
  assert.equal(ticks.pendingTick('task-1'), true, 'still known after the row is rebuilt elsewhere');
  assert.equal(ticks.pendingTick('task-2'), undefined, 'and one task never speaks for another');
});

test('it is dropped once what is stored agrees, and dropped if the save fails', async () => {
  const ticks = await load();
  ticks.forgetPendingTicks();
  ticks.setPendingTick('task-1', true);
  ticks.setPendingTick('task-1', undefined);
  assert.equal(ticks.pendingTick('task-1'), undefined, 'nothing lingers once it is no longer needed');
});

test('a screen watching this is told when something changes, and not when nothing did', async () => {
  const ticks = await load();
  ticks.forgetPendingTicks();
  let told = 0;
  const stop = ticks.subscribePendingTicks(() => { told += 1; });

  const before = ticks.tickVersion();
  ticks.setPendingTick('task-1', true);
  assert.equal(told, 1, 'told once');
  assert.notEqual(ticks.tickVersion(), before, 'and the version moved, so React draws again');

  // Setting the same answer twice is not a change, and a screen redrawn for nothing is wasted work.
  ticks.setPendingTick('task-1', true);
  assert.equal(told, 1, 'not told again for the same answer');
  ticks.setPendingTick('task-2', undefined);
  assert.equal(told, 1, 'nor for forgetting something that was never there');

  ticks.setPendingTick('task-1', false);
  assert.equal(told, 2, 'but told when the answer really changes');

  stop();
  ticks.setPendingTick('task-1', true);
  assert.equal(told, 2, 'and not told at all once the screen has gone');
});
