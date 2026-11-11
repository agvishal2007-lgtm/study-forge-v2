// The sign-up checks and wording, tested directly.
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('sign-up checks catch mistakes before anything is sent', async () => {
  const { signUpProblems, looksLikeEmail } = await import('../src/data/authMessages.ts');
  assert.equal(looksLikeEmail('a@b.co'), true);
  for (const bad of ['', 'a', 'a@b', 'a b@c.co', '@b.co']) assert.equal(looksLikeEmail(bad), false, bad);
  assert.deepEqual(signUpProblems('a@b.co', 'long enough', 'long enough'), []);
  assert.match(signUpProblems('nope', 'long enough', 'long enough')[0], /email/);
  assert.match(signUpProblems('a@b.co', '1234567', '1234567')[0], /8 characters/);
  assert.match(signUpProblems('a@b.co', 'long enough', 'different')[0], /don't match/);
});

test('sign-in problems read in plain words, and closing the window stays quiet', async () => {
  const { describeAuthFailure } = await import('../src/data/authMessages.ts');
  const say = (code) => describeAuthFailure({ code, message: 'raw' });
  assert.equal(say('auth/popup-closed-by-user'), '');
  assert.equal(say('auth/cancelled-popup-request'), '');
  assert.equal(say('auth/invalid-credential'), say('auth/user-not-found'), 'it never reveals which part was wrong');
  assert.equal(say('auth/invalid-credential'), say('auth/wrong-password'));
  const microsoft = describeAuthFailure({ code: 'auth/invalid-credential' }, 'Microsoft');
  assert.match(microsoft, /Microsoft sign-in didn't finish/);
  assert.doesNotMatch(microsoft, /password/i, 'no password was typed, so it never blames one');
  assert.match(say('auth/email-already-in-use'), /already exists/);
  assert.match(say('auth/account-exists-with-different-credential'), /different way/);
  assert.match(say('auth/too-many-requests'), /Too many tries/);
  assert.match(say('auth/operation-not-allowed'), /isn't turned on/);
  assert.match(say('auth/admin-restricted-operation'), /school blocked/);
});

test('email hints stay short enough to protect the address', async () => {
  const { maskEmail } = await import('../src/data/knownAccounts.ts');
  assert.equal(maskEmail('dana@school.edu'), 'da***@school.edu');
  assert.equal(maskEmail('jo@gmail.com'), 'j***@gmail.com');
  assert.equal(maskEmail('a@gmail.com'), 'a***@gmail.com');
  assert.equal(maskEmail('Your account'), 'Yo***');
  assert.equal(maskEmail(''), '');
});

test('everything sync sends is something the published rules accept', () => {
  // One refused collection stops a student's whole sync, so the list and the rules must agree.
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const names = (text) => [...text.matchAll(/'([^']+)'/g)].map((found) => found[1]);
  const allowed = names(read('firestore.rules').match(/data\.collection in \[([^\]]+)\]/)[1]);
  const sent = names(read('src/data/sync.ts').match(/const COLLECTIONS[^=]*= \[([^\]]+)\]/)[1]);
  assert.deepEqual(sent.filter((name) => !allowed.includes(name)), [], 'sync sends collections the rules would refuse');
  for (const name of ['studyTime', 'resourceLinks', 'gradeCategories']) assert.ok(sent.includes(name), `${name} is not synced`);
});
