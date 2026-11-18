// Focus sounds: the parts that only calculate — volumes, mixing, the timer's words, and what a
// remembered mix reads back as.
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('a volume is always something safe, whatever it was stored as', async () => {
  const { safeVolume } = await import('../src/data/focusSoundRules.ts');
  assert.equal(safeVolume(0.4), 0.4);
  assert.equal(safeVolume(2), 1, 'too loud is held at the top');
  assert.equal(safeVolume(-1), 0);
  for (const odd of [undefined, null, 'loud', NaN, {}]) assert.equal(safeVolume(odd), 0.5, String(odd));
  assert.equal(safeVolume(undefined, 0.6), 0.6, 'a given fallback is used');
});

test('adding another sound never makes everything suddenly louder', async () => {
  const { mixedGain } = await import('../src/data/focusSoundRules.ts');
  // On its own a sound plays at what was asked for.
  assert.equal(mixedGain(0.8, 1), 0.8);
  // With more playing, each is held back, so the total stays in the same place.
  assert.ok(mixedGain(0.8, 2) < 0.8);
  assert.ok(mixedGain(0.8, 3) < mixedGain(0.8, 2));
  // Three at full volume still can't add up past one at full volume.
  const three = 3 * mixedGain(1, 3) ** 2;
  assert.ok(Math.abs(three - 1) < 0.001, `three layers add up to ${three}`);
});

test('how long is left reads in plain words', async () => {
  const { timeLeftWords } = await import('../src/data/focusSoundRules.ts');
  assert.equal(timeLeftWords(0), 'Finished');
  assert.equal(timeLeftWords(-5), 'Finished');
  assert.equal(timeLeftWords(1000), '1 second left');
  assert.equal(timeLeftWords(45_000), '45 seconds left');
  assert.equal(timeLeftWords(60_000 * 28), '28 minutes left');
  assert.equal(timeLeftWords(60_000), '60 seconds left', 'under a minute and a half is counted in seconds');
  assert.equal(timeLeftWords(60_000 * 2), '2 minutes left');
});

test('a remembered mix only brings back sounds that really exist', async () => {
  const { readMix } = await import('../src/data/focusSoundRules.ts');
  const mix = readMix({ layers: [{ id: 'brown', volume: 0.3 }, { id: 'nonsense', volume: 1 }, { id: 'brown', volume: 0.9 }], master: 0.4 });
  assert.deepEqual(mix.layers, [{ id: 'brown', volume: 0.3 }], 'unknown sounds and repeats are dropped');
  assert.equal(mix.master, 0.4);
  // Nothing saved, or rubbish saved, still gives something usable.
  assert.deepEqual(readMix(null), { layers: [], master: 0.6 });
  assert.deepEqual(readMix({ layers: 'no', master: 'loud' }), { layers: [], master: 0.6 });
});

test('every sound is one the browser makes, with no file to fetch and no words in it', async () => {
  const { SOUNDS } = await import('../src/data/focusSoundRules.ts');
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/data/focusSounds.ts'), 'utf8');
  assert.ok(SOUNDS.length >= 5);
  for (const sound of SOUNDS) {
    assert.ok(sound.name && sound.what, `${sound.id} says what it is`);
  }
  // Nothing is fetched, so there is nothing to license and nothing that could contain a voice.
  assert.doesNotMatch(source, /fetch\(|\.mp3|\.ogg|\.wav|https?:\/\//, 'no audio is downloaded');
});
