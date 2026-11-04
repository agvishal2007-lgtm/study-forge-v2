// Runs against Google's real Auth and Firestore emulators with the real firestore.rules.
// `npx firebase-tools emulators:exec --only auth,firestore --project demo-study-forge "node --test tests/firebase.test.mjs"`
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc,
} from 'firebase/firestore/lite';
import { createFirebaseBackend } from '../src/data/firebaseBackend.ts';

function client(name) {
  const app = initializeApp({ apiKey: 'demo', projectId: 'demo-study-forge', authDomain: 'demo.firebaseapp.com' }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { app, auth, db, backend: createFirebaseBackend(app, auth, db) };
}

async function signedIn(name, sub, email) {
  const c = client(name);
  const credential = GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true }));
  const { user } = await signInWithCredential(c.auth, credential);
  return { ...c, uid: user.uid };
}

const denied = async (work, label) => {
  // Raw Firestore calls report permission-denied, and the app's own calls report kind 'denied'.
  await assert.rejects(work, (error) => String(error.code).includes('permission-denied') || error.kind === 'denied', `${label} must be refused`);
};
const item = (id, over = {}) => ({ collection: 'notes', id, json: JSON.stringify({ id, title: 'secret' }), deleted: false, rev: 1, baseRev: 0, ...over });
const validDoc = (over = {}) => ({ collection: 'notes', id: 'x', json: '{}', deleted: false, rev: 1, syncedAt: serverTimestamp(), ...over });

let alice;
let bob;
let nobody;

before(async () => {
  alice = await signedIn('alice', 'alice-google-id', 'alice@tcnj.edu');
  bob = await signedIn('bob', 'bob-google-id', 'bob@gmail.com');
  nobody = client('nobody');
  assert.notEqual(alice.uid, bob.uid);
});

test('a student can save and read their own work', async () => {
  const { conflicts } = await alice.backend.push(alice.uid, [item('note-1')]);
  assert.deepEqual(conflicts, []);
  const { items, cursor } = await alice.backend.pull(alice.uid, 0);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'note-1');
  assert.ok(cursor > 0);
});

test('another student cannot read, list, change, or delete that work', async () => {
  const ref = (db) => doc(db, 'users', alice.uid, 'items', encodeURIComponent('notes/note-1'));
  await denied(() => getDoc(ref(bob.db)), 'reading one item');
  await denied(() => getDocs(collection(bob.db, 'users', alice.uid, 'items')), 'listing items');
  await denied(() => bob.backend.pull(alice.uid, 0), 'pulling');
  await denied(() => setDoc(ref(bob.db), validDoc()), 'overwriting');
  await denied(() => deleteDoc(ref(bob.db)), 'deleting');
  await denied(() => bob.backend.push(alice.uid, [item('planted')]), 'adding items');
  await denied(() => bob.backend.deleteAll(alice.uid), 'deleting everything');
  const { items } = await alice.backend.pull(alice.uid, 0);
  assert.equal(items.length, 1);
  assert.equal(JSON.parse(items[0].json).title, 'secret');
});

test('someone not signed in cannot do anything', async () => {
  const ref = doc(nobody.db, 'users', alice.uid, 'items', encodeURIComponent('notes/note-1'));
  await denied(() => getDoc(ref), 'reading');
  await denied(() => getDocs(collection(nobody.db, 'users', alice.uid, 'items')), 'listing');
  await denied(() => setDoc(ref, validDoc()), 'writing');
  await denied(() => deleteDoc(ref), 'deleting');
});

test('nothing outside a student\'s own items is reachable, even for them', async () => {
  await denied(() => getDoc(doc(alice.db, 'users', alice.uid)), 'their user record');
  await denied(() => setDoc(doc(alice.db, 'users', alice.uid), { admin: true }), 'writing their user record');
  await denied(() => getDocs(collection(alice.db, 'users')), 'listing all users');
  await denied(() => setDoc(doc(alice.db, 'anything', 'else'), { a: 1 }), 'other collections');
  await denied(() => setDoc(doc(alice.db, 'users', alice.uid, 'other', 'x'), validDoc()), 'other subcollections');
});

test('planner items can be saved', async () => {
  const { conflicts } = await alice.backend.push(alice.uid, [item('plan-1', { collection: 'plannerItems' })]);
  assert.deepEqual(conflicts, []);
  const { items } = await alice.backend.pull(alice.uid, 0);
  assert.ok(items.some((entry) => entry.id === 'plan-1' && entry.collection === 'plannerItems'));
});

test('decks, cards, and card progress can be saved', async () => {
  const { conflicts } = await alice.backend.push(alice.uid, [
    item('deck-1', { collection: 'decks' }), item('card-1', { collection: 'cards' }), item('card-1-progress', { collection: 'cardProgress' }),
  ]);
  assert.deepEqual(conflicts, []);
  const { items } = await alice.backend.pull(alice.uid, 0);
  for (const [id, collection] of [['deck-1', 'decks'], ['card-1', 'cards'], ['card-1-progress', 'cardProgress']]) {
    assert.ok(items.some((entry) => entry.id === id && entry.collection === collection));
  }
});

test('badly shaped or oversized items are refused, so the free storage can\'t be abused', async () => {
  const ref = doc(alice.db, 'users', alice.uid, 'items', 'bad');
  await denied(() => setDoc(ref, validDoc({ collection: 'materials' })), 'a file record');
  await denied(() => setDoc(ref, validDoc({ extra: 'field' })), 'extra fields');
  await denied(() => setDoc(ref, validDoc({ json: 'x'.repeat(900_001) })), 'an oversized item');
  await denied(() => setDoc(ref, validDoc({ rev: 'one' })), 'a wrong type');
  await denied(() => setDoc(ref, validDoc({ syncedAt: new Date(0) })), 'a faked time');
  const { rev, ...missing } = validDoc();
  await denied(() => setDoc(ref, missing), 'a missing field');
  await setDoc(ref, validDoc());
  await deleteDoc(ref);
});

test('a write based on an old version is refused, not silently overwritten', async () => {
  await alice.backend.push(alice.uid, [item('note-2')]);
  const first = await alice.backend.push(alice.uid, [item('note-2', { rev: 2, baseRev: 1, json: '{"v":"device A"}' })]);
  assert.deepEqual(first.conflicts, []);
  const second = await alice.backend.push(alice.uid, [item('note-2', { rev: 2, baseRev: 1, json: '{"v":"device B"}' })]);
  assert.deepEqual(second.conflicts, ['notes/note-2']);
  const { items } = await alice.backend.pull(alice.uid, 0);
  assert.equal(JSON.parse(items.find((entry) => entry.id === 'note-2').json).v, 'device A');
});

test('a mixed batch writes what it can and reports the rest', async () => {
  const result = await alice.backend.push(alice.uid, [item('note-2', { rev: 9, baseRev: 5 }), item('note-3')]);
  assert.deepEqual(result.conflicts, ['notes/note-2']);
  const { items } = await alice.backend.pull(alice.uid, 0);
  assert.ok(items.some((entry) => entry.id === 'note-3'));
});

test('checking again finds new work and skips what is long past', async () => {
  const { cursor } = await alice.backend.pull(alice.uid, 0);
  // Each check looks back 10 seconds on purpose, so older items aren't read again.
  assert.equal((await alice.backend.pull(alice.uid, cursor + 11_000)).items.length, 0, 'older work is not read again');
  await alice.backend.push(alice.uid, [item('note-4')]);
  const { items } = await alice.backend.pull(alice.uid, cursor);
  assert.ok(items.some((entry) => entry.id === 'note-4'), 'new work is found');
});

test('more than one page of items comes back complete', async () => {
  const many = Array.from({ length: 330 }, (_, index) => item(`bulk-${index}`));
  for (let i = 0; i < many.length; i += 100) await bob.backend.push(bob.uid, many.slice(i, i + 100));
  const { items } = await bob.backend.pull(bob.uid, 0);
  assert.equal(new Set(items.map((entry) => entry.id)).size, 330);
});

test('unusual ids survive the round trip', async () => {
  const id = 'note/with spaces & símbolos-backup-123';
  await alice.backend.push(alice.uid, [item(id)]);
  const { items } = await alice.backend.pull(alice.uid, 0);
  assert.ok(items.some((entry) => entry.id === id));
});

test('deleting everything removes only the student\'s own online copy', async () => {
  await alice.backend.deleteAll(alice.uid);
  assert.equal((await alice.backend.pull(alice.uid, 0)).items.length, 0);
  assert.equal((await bob.backend.pull(bob.uid, 0)).items.length, 330);
});
