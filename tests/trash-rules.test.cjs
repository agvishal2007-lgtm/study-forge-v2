// When Trash empties itself: pure rules, exact dates, nothing deleted here.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const DAY = 24 * 60 * 60 * 1000;
const load = () => import('../src/data/trashRules.ts');

test('Never means nothing is ever due, however long it has sat there', async () => {
  const rules = await load();
  const tenYears = Date.now() - 3650 * DAY;
  assert.equal(rules.expiresAt(tenYears, 'never'), null);
  assert.equal(rules.isExpired(tenYears, 'never', Date.now()), false);
  assert.equal(rules.timeLeftWords(tenYears, 'never', Date.now()), '');
});

test('the clock starts when something is put in Trash, not when the policy was chosen', async () => {
  const rules = await load();
  const now = Date.UTC(2026, 0, 31);
  const trashedOn = Date.UTC(2026, 0, 1);
  assert.equal(rules.isExpired(trashedOn, 30, now), true, '30 days have passed');
  assert.equal(rules.isExpired(trashedOn, 60, now), false, '60 have not');
  // A policy chosen today does not spare something trashed last month, and does not hurry it either.
  assert.equal(rules.expiresAt(trashedOn, 30), trashedOn + 30 * DAY);
});

test('a student who already has work keeps deleting things themselves until they choose', async () => {
  const rules = await load();
  assert.equal(rules.startingPolicy(true), 'never', 'an existing Trash is never emptied by an upgrade');
  assert.equal(rules.startingPolicy(false), 30, 'a new student starts on the recommendation');
  assert.equal(rules.RECOMMENDED, 30);
});

test('shortening the time says exactly what would go at once, so it can be asked about first', async () => {
  const rules = await load();
  const now = Date.UTC(2026, 2, 1);
  const rows = [
    { name: 'last week', deletedAt: now - 8 * DAY },
    { name: 'last month', deletedAt: now - 40 * DAY },
    { name: 'this morning', deletedAt: now - 2 * 60 * 60 * 1000 },
  ];
  assert.deepEqual(rules.dueAtOnce(rows, 90, now).map((row) => row.name), []);
  assert.deepEqual(rules.dueAtOnce(rows, 30, now).map((row) => row.name), ['last month']);
  assert.deepEqual(rules.dueAtOnce(rows, 7, now).map((row) => row.name), ['last week', 'last month']);
  assert.deepEqual(rules.dueAtOnce(rows, 'never', now).map((row) => row.name), []);
});

test('only the six offered choices are accepted, so a synced record cannot invent a policy', async () => {
  const rules = await load();
  for (const good of [7, 14, 30, 60, 90, 'never']) assert.equal(rules.isRetention(good), true, `${good} is offered`);
  for (const bad of [0, 1, -30, '30', 365, null, undefined, {}, NaN]) assert.equal(rules.isRetention(bad), false, `${String(bad)} is not`);
  assert.deepEqual(rules.RETENTION_CHOICES.map((choice) => choice.value), [7, 14, 30, 60, 90, 'never']);
});

test('what is left is said in whole days, and never promised to the minute', async () => {
  const rules = await load();
  const now = Date.UTC(2026, 5, 10, 12);
  assert.equal(rules.timeLeftWords(now - 29 * DAY, 30, now), 'deleted tomorrow');
  assert.equal(rules.timeLeftWords(now - 20 * DAY, 30, now), 'deleted in 10 days');
  assert.match(rules.timeLeftWords(now - 31 * DAY, 30, now), /next time you open/);
  assert.match(rules.retentionWords(30), /30 days/);
  assert.match(rules.retentionWords('never'), /until you delete them/);
});

test('a missing or nonsense deleted date is left alone rather than deleted immediately', async () => {
  const rules = await load();
  const now = Date.now();
  for (const bad of [0, -1, NaN, Infinity]) {
    assert.equal(rules.expiresAt(bad, 7), null, `${String(bad)} gives no due date`);
    assert.equal(rules.isExpired(bad, 7, now), false, `${String(bad)} is never expired`);
  }
});
