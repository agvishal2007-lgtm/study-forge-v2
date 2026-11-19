// The per-feature study choices, as behaviour rather than as switches that do nothing.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const rules = () => import('../src/data/studyToolRules.ts');

test('the created order is left exactly as it was given', async () => {
  const { inChosenOrder } = await rules();
  const items = ['a', 'b', 'c', 'd'];
  assert.deepEqual(inChosenOrder(items, 'created', 'deck-1'), items);
  // The same array, untouched, so choosing the default cannot reorder anything.
  assert.equal(inChosenOrder(items, 'created', 'deck-1'), items);
  // Nothing to shuffle is not an error.
  assert.deepEqual(inChosenOrder([], 'shuffled', 'deck-1'), []);
  assert.deepEqual(inChosenOrder(['only'], 'shuffled', 'deck-1'), ['only']);
});

test('a shuffle holds still for a session, and differs between them', async () => {
  const { inChosenOrder } = await rules();
  const items = Array.from({ length: 12 }, (_, at) => `card-${at}`);
  const once = inChosenOrder(items, 'shuffled', 'deck-1');
  const again = inChosenOrder(items, 'shuffled', 'deck-1');
  // The same seed gives the same order: the deck cannot reorder itself between two cards.
  assert.deepEqual(once, again);
  // A different deck or session gets a different order.
  assert.notDeepEqual(once, inChosenOrder(items, 'shuffled', 'deck-2'));
  // Everything is still there, exactly once, and the original list is untouched.
  assert.deepEqual([...once].sort(), [...items].sort());
  assert.deepEqual(items, Array.from({ length: 12 }, (_, at) => `card-${at}`));
  // And it is actually shuffled rather than handed back in order.
  assert.notDeepEqual(once, items);
});

test('a card can start from either side, with nothing lost either way', async () => {
  const { sidesFor } = await rules();
  const card = { front: 'Mitochondrion', back: 'Makes most of a cell\'s energy' };
  assert.deepEqual(sidesFor(card, 'front'), { shown: card.front, hidden: card.back, flipped: false });
  assert.deepEqual(sidesFor(card, 'back'), { shown: card.back, hidden: card.front, flipped: true });
});

test('explanations and note views follow the choice, and say what they do', async () => {
  const { explainNow, opensWriting, explains } = await rules();
  assert.equal(explainNow('each'), true);
  assert.equal(explainNow('end'), false);
  assert.equal(opensWriting('write'), true);
  assert.equal(opensWriting('preview'), false);
  // Every choice carries a sentence about its effect, so no setting is just a name.
  for (const [key, values] of Object.entries({
    cardOrder: ['created', 'shuffled'],
    cardSide: ['front', 'back'],
    practiceOrder: ['created', 'shuffled'],
    explanations: ['each', 'end'],
    noteStart: ['write', 'preview'],
    autoTranscript: ['on', 'off'],
  })) {
    for (const value of values) {
      assert.ok(explains(key, value).length > 15, `${key}.${value} has no real explanation`);
    }
  }
  assert.equal(explains('nothing', 'here'), '');
});
