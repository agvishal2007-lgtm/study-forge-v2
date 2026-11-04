// Sign-in, separate accounts on one computer, and syncing between devices, in real browsers.
// Each "device" is a separate browser profile. The online service is a local stand-in.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('./fakeAccountServer.cjs');

const URL_BASE = 'http://localhost:4179/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-account-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
const PICTURE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
const ALICE = { uid: 'alice-uid', email: 'alice@tcnj.edu', photoURL: PICTURE };
const BOB = { uid: 'bob-uid', email: 'bob@gmail.com' };
const textFile = path.join(work, 'chapter.txt');
fs.writeFileSync(textFile, 'Chapter one text\n');

let preview;
let fake;
const open = new Map();

async function device(name, user) {
  let entry = open.get(name);
  if (!entry) {
    const context = await chromium.launchPersistentContext(path.join(work, name), { viewport: { width: 1280, height: 800 } });
    const page = context.pages()[0] ?? (await context.newPage());
    entry = { context, page, errors: [] };
    page.on('pageerror', (error) => entry.errors.push(error.message));
    open.set(name, entry);
  }
  if (user !== undefined) await entry.context.addInitScript(`window.__testSignIn = ${JSON.stringify(user)};`);
  await entry.page.goto(URL_BASE);
  return entry.page;
}
const close = async (name) => {
  await open.get(name)?.context.close();
  open.delete(name);
};
async function openMenu(page) {
  if (!(await page.getByTestId('account-dropdown').count())) await page.getByRole('button', { name: /Account menu for/ }).click();
  await page.getByTestId('account-dropdown').waitFor();
}
async function nav(page, name) {
  if (name === 'Settings' && (await page.getByRole('button', { name: /Account menu for/ }).count())) {
    await openMenu(page);
    await page.getByTestId('account-dropdown').getByRole('link', { name: 'Settings' }).click();
    return;
  }
  await page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
}
const signInButton = (page) => page.getByRole('button', { name: 'Sign in', exact: true });
const signOutButton = async (page) => {
  await openMenu(page);
  await page.getByTestId('account-dropdown').getByRole('button', { name: 'Sign out' }).click();
};
async function signIn(page) {
  await signInButton(page).click();
  await page.getByRole('button', { name: /Account menu for/ }).waitFor();
  await nav(page, 'Settings');
  await page.getByTestId('sync-status').waitFor();
}
const status = (page) => page.getByTestId('sync-status');
async function saved(page) {
  await nav(page, 'Settings');
  await page.getByRole('button', { name: 'Save online now' }).click();
  await page.locator('[data-testid=sync-status][data-phase=synced]').waitFor();
}
async function addCourse(page, name) {
  await nav(page, 'Courses');
  await page.getByLabel('Course name').fill(name);
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name }).waitFor();
}
async function addNote(page, title, body) {
  await nav(page, 'Notes');
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Title').fill(title);
  await page.locator('textarea.note-body').fill(body);
  await page.getByTestId('save-status').getByText('Saved').waitFor();
}
async function openNote(page, title) {
  await nav(page, 'Notes');
  await page.getByRole('link', { name: title, exact: true }).click();
  await page.locator('textarea.note-body').waitFor();
}

before(async () => {
  fake = createServer();
  await new Promise((resolve) => fake.server.listen(4199, resolve));
  preview = spawn('npx', ['vite', 'preview', '--port', '4179', '--strictPort', '--outDir', 'dist-account'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
});

after(async () => {
  for (const name of [...open.keys()]) await close(name);
  if (preview) process.kill(-preview.pid);
  fake.server.closeAllConnections?.();
  fake.server.close();
  fs.rmSync(work, { recursive: true, force: true });
});

test('everything works with no account and contacts nothing online', async () => {
  const page = await device('laptop');
  await addNote(page, 'Guest note', 'Written with no account');
  await addCourse(page, 'Guest course');
  await nav(page, 'Settings');
  await signInButton(page).waitFor();
  await page.screenshot({ path: path.join(shots, 'account-signed-out.png') });
  assert.equal(fake.state.pushes, 0);
  await page.getByText('whoever runs this site could technically view it').waitFor();
});

test('the sign-in button waits until sign-in can open immediately', async () => {
  await device('laptop');
  await close('laptop');
  const entry = await chromium.launchPersistentContext(path.join(work, 'laptop'), { viewport: { width: 1280, height: 800 } });
  const slow = entry.pages()[0] ?? (await entry.newPage());
  await slow.route('**/testBackend-*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await slow.goto(URL_BASE);
  assert.equal(await signInButton(slow).isDisabled(), true);
  await slow.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Sign in' && !b.disabled));
  await entry.close();
});

test('two panels scroll separately, each with its own scrollbar', async () => {
  const entry = await chromium.launchPersistentContext(path.join(work, 'layout'), { viewport: { width: 1000, height: 220 }, ignoreDefaultArgs: ['--hide-scrollbars'] });
  const page = entry.pages()[0] ?? (await entry.newPage());
  await page.goto(`${URL_BASE}#/settings`);
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  const read = () => page.evaluate(() => {
    const left = document.querySelector('.nav-links');
    const right = document.querySelector('main');
    return {
      left: left.scrollTop, right: right.scrollTop,
      leftFits: left.scrollHeight <= left.clientHeight, rightFits: right.scrollHeight <= right.clientHeight,
      leftBar: getComputedStyle(left).overflowY, rightBar: getComputedStyle(right).overflowY,
      leftWidth: left.offsetWidth - left.clientWidth, rightWidth: right.offsetWidth - right.clientWidth,
    };
  });
  const start = await read();
  assert.equal(start.leftBar, 'scroll');
  assert.equal(start.rightBar, 'scroll');
  assert.ok(start.leftWidth > 0 && start.rightWidth > 0, 'both scrollbars take up real space');
  assert.equal(start.leftFits, false);
  assert.equal(start.rightFits, false);
  await page.evaluate(() => { document.querySelector('main').scrollTop = 150; });
  let now = await read();
  assert.ok(now.right > 0);
  assert.equal(now.left, 0, 'scrolling the section leaves the buttons alone');
  await page.evaluate(() => { document.querySelector('main').scrollTop = 0; document.querySelector('.nav-links').scrollTop = 60; });
  now = await read();
  assert.ok(now.left > 0);
  assert.equal(now.right, 0, 'scrolling the buttons leaves the section alone');
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.screenshot({ path: path.join(shots, 'layout-two-panels.png') });
  assert.equal(await page.locator('.nav-links').getByRole('link', { name: 'Settings' }).count(), 0, 'Settings left the sidebar');
  await entry.close();
});

test('the account controls stay at the top right on every screen', async () => {
  const page = await device('laptop');
  for (const name of ['Today', 'Courses', 'Library', 'Study', 'Notes', 'Record']) {
    await page.locator('.nav-links').getByRole('link', { name, exact: true }).click();
    const box = await signInButton(page).boundingBox();
    assert.ok(box.x > 900, `${name}: Sign in is on the right`);
    assert.ok(box.y < 60, `${name}: Sign in is at the top`);
    await page.getByRole('link', { name: 'Settings' }).waitFor();
  }
  await page.screenshot({ path: path.join(shots, 'layout-signed-out.png') });
  await close('laptop');
});

test('closing the sign-in window is quiet, and a school block explains what to do', async () => {
  const page = await device('laptop', 'auth/popup-closed-by-user');
  await nav(page, 'Settings');
  await signInButton(page).click();
  await signInButton(page).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  await close('laptop');
  const blocked = await device('laptop', 'auth/admin-restricted-operation');
  await nav(blocked, 'Settings');
  await signInButton(blocked).click();
  await blocked.getByRole('alert').getByText('Your school blocked this sign-in').waitFor();
  await nav(blocked, 'Notes');
  await blocked.getByRole('link', { name: 'Guest note' }).waitFor();
  await close('laptop');
  const popup = await device('laptop', 'auth/popup-blocked');
  await nav(popup, 'Settings');
  await signInButton(popup).click();
  await popup.getByRole('alert').getByText('Allow pop-ups').waitFor();
  await close('laptop');
});

test('signing in starts a separate space, and copying earlier work is the student\'s choice', async () => {
  const page = await device('laptop', ALICE);
  await signIn(page);
  await page.getByRole('button', { name: /Account menu for alice@tcnj.edu/ }).waitFor();
  await page.getByTestId('guest-offer').getByText('1 course, 0 files, 1 note').waitFor();
  await page.screenshot({ path: path.join(shots, 'account-signed-in.png') });
  // The profile picture replaced Sign in, and the menu opens, closes, and leads to Settings.
  assert.equal(await signInButton(page).count(), 0);
  const picture = page.locator('.avatar-button img');
  assert.match(await picture.getAttribute('src'), /^data:image/);
  const pictureBox = await picture.boundingBox();
  assert.ok(pictureBox.x > 1150 && pictureBox.y < 60, 'picture is at the top right');
  await openMenu(page);
  await page.getByTestId('account-dropdown').getByText('alice@tcnj.edu').waitFor();
  await page.screenshot({ path: path.join(shots, 'account-dropdown.png') });
  await page.keyboard.press('Escape');
  await page.getByTestId('account-dropdown').waitFor({ state: 'detached' });
  await openMenu(page);
  await page.locator('h1').click(); // Clicking elsewhere closes it.
  await page.getByTestId('account-dropdown').waitFor({ state: 'detached' });
  await nav(page, 'Notes');
  await page.getByText('No notes yet').waitFor();
  assert.equal(await page.getByRole('link', { name: 'Guest note' }).count(), 0, 'not added without asking');
  await nav(page, 'Settings');
  await page.getByRole('button', { name: 'Add it to my account' }).click();
  await page.getByTestId('guest-report').getByText('Added 1 course, 0 files, 1 note').waitFor();
  await nav(page, 'Notes');
  await page.getByRole('link', { name: 'Guest note' }).waitFor();
  await saved(page);
  assert.ok(fake.state.items('alice-uid').some((item) => item.collection === 'notes' && item.json.includes('Guest note')));
});

test('a note and course reach another device, and edits come back', async () => {
  const laptop = await device('laptop');
  await addNote(laptop, 'Shared note', 'First version');
  await saved(laptop);
  const phone = await device('phone', ALICE);
  await signIn(phone);
  await openNote(phone, 'Shared note');
  assert.equal(await phone.locator('textarea.note-body').inputValue(), 'First version');
  await nav(phone, 'Courses');
  await phone.getByRole('link', { name: /Guest course/ }).waitFor();
  await openNote(phone, 'Shared note');
  await phone.locator('textarea.note-body').fill('Edited on the phone');
  await phone.getByTestId('save-status').getByText('Saved').waitFor();
  await saved(phone);
  await saved(laptop);
  await openNote(laptop, 'Shared note');
  assert.equal(await laptop.locator('textarea.note-body').inputValue(), 'Edited on the phone');
});

test('changes save online by themselves shortly after editing', async () => {
  const laptop = await device('laptop');
  const before = fake.state.items('alice-uid').length;
  await addNote(laptop, 'Automatic', 'No button pressed');
  const deadline = Date.now() + 15000;
  while (fake.state.items('alice-uid').length === before) {
    assert.ok(Date.now() < deadline, 'should sync without pressing anything');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
});

test('the same note edited on two devices keeps both versions', async () => {
  const laptop = await device('laptop');
  const phone = await device('phone');
  await saved(laptop);
  await saved(phone);
  await openNote(laptop, 'Shared note');
  await laptop.locator('textarea.note-body').fill('Laptop version');
  await laptop.getByTestId('save-status').getByText('Saved').waitFor();
  await openNote(phone, 'Shared note');
  await phone.locator('textarea.note-body').fill('Phone version');
  await phone.getByTestId('save-status').getByText('Saved').waitFor();
  await saved(laptop);
  await saved(phone);
  await saved(laptop);
  await openNote(phone, 'Shared note');
  assert.equal(await phone.locator('textarea.note-body').inputValue(), 'Phone version');
  await openNote(phone, 'Shared note (from another device)');
  assert.equal(await phone.locator('textarea.note-body').inputValue(), 'Laptop version');
  await openNote(laptop, 'Shared note');
  assert.equal(await laptop.locator('textarea.note-body').inputValue(), 'Phone version');
  await openNote(laptop, 'Shared note (from another device)');
  assert.equal(await laptop.locator('textarea.note-body').inputValue(), 'Laptop version');
});

test('a deletion reaches other devices, but an edit made elsewhere is never lost to it', async () => {
  const laptop = await device('laptop');
  const phone = await device('phone');
  await addNote(laptop, 'Delete me', 'Gone soon');
  await addNote(laptop, 'Keep me', 'Survives');
  await saved(laptop);
  await saved(phone);
  await openNote(laptop, 'Delete me');
  await laptop.getByRole('button', { name: 'Delete note' }).click();
  await laptop.getByRole('dialog').getByRole('button', { name: 'Delete note' }).click();
  await laptop.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
  await openNote(laptop, 'Keep me');
  await laptop.getByRole('button', { name: 'Delete note' }).click();
  await laptop.getByRole('dialog').getByRole('button', { name: 'Delete note' }).click();
  await laptop.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
  await openNote(phone, 'Keep me');
  await phone.locator('textarea.note-body').fill('Edited while deleted elsewhere');
  await phone.getByTestId('save-status').getByText('Saved').waitFor();
  await saved(laptop);
  await saved(phone);
  await saved(laptop);
  await nav(phone, 'Notes');
  await phone.getByRole('link', { name: 'Keep me', exact: true }).waitFor();
  assert.equal(await phone.getByRole('link', { name: 'Delete me', exact: true }).count(), 0);
  await openNote(laptop, 'Keep me');
  assert.equal(await laptop.locator('textarea.note-body').inputValue(), 'Edited while deleted elsewhere');
});

test('study progress follows the student, and evidence from both devices combines', async () => {
  const laptop = await device('laptop');
  const phone = await device('phone');
  await nav(laptop, 'Study');
  await laptop.getByRole('button', { name: 'Add sample lesson' }).click();
  await laptop.getByRole('link', { name: 'The accounting equation', exact: true }).click();
  await laptop.getByRole('button', { name: 'I already know this' }).click();
  await laptop.getByRole('radio', { name: 'A loan the business must repay' }).check();
  await laptop.getByRole('button', { name: 'Submit answer' }).click();
  await laptop.getByTestId('feedback').waitFor();
  await saved(laptop);
  await saved(phone);
  await nav(phone, 'Study');
  await phone.getByRole('link', { name: 'Lesson 1: How accounting keeps score' }).click();
  await phone.getByRole('link', { name: 'The accounting equation', exact: true }).click();
  await phone.getByTestId('answer-counts').getByText('1 answered: 1 right').waitFor();
  await phone.getByRole('button', { name: 'Continue' }).click();
  await phone.getByRole('radio', { name: '$6,000', exact: true }).check();
  await phone.getByRole('button', { name: 'Submit answer' }).click();
  await phone.getByTestId('feedback').waitFor();

  // Both devices answer before either syncs: nothing is lost.
  await nav(laptop, 'Today');
  await laptop.getByRole('heading', { name: 'Today' }).waitFor();
  await nav(laptop, 'Study');
  await laptop.getByTestId('next-up').getByRole('link', { name: 'The accounting equation' }).click();
  await laptop.getByRole('button', { name: 'Continue' }).click();
  await laptop.getByRole('radio', { name: '$6,000', exact: true }).check();
  await laptop.getByRole('button', { name: 'Submit answer' }).click();
  await laptop.getByTestId('feedback').waitFor();
  await saved(laptop);
  await saved(phone);
  await saved(laptop);
  const items = fake.state.items('alice-uid').filter((item) => item.collection === 'checkpointProgress');
  assert.equal(items.length, 1);
  assert.equal(JSON.parse(items[0].json).answers.length, 3, 'one answer, plus one from each device');
});

test('planner items follow the student, and the newest change wins', async () => {
  const laptop = await device('laptop');
  const phone = await device('phone');
  await nav(laptop, 'Planner');
  await laptop.getByRole('button', { name: 'Add item' }).click();
  await laptop.getByLabel('Name', { exact: true }).fill('Synced homework');
  await laptop.getByRole('button', { name: 'Save item' }).click();
  await laptop.getByTestId('planner-row').getByRole('link', { name: 'Synced homework' }).waitFor();
  await saved(laptop);
  await saved(phone);
  await nav(phone, 'Planner');
  await phone.getByRole('link', { name: 'Synced homework' }).waitFor();
  // Both change it before syncing. The phone's change comes later.
  await nav(laptop, 'Planner');
  await laptop.getByLabel('Status of Synced homework').selectOption('In Progress');
  await laptop.waitForTimeout(30);
  await phone.getByRole('button', { name: 'Mark Synced homework done' }).click();
  await phone.locator('[data-testid=planner-row][data-done=true]').waitFor();
  await saved(laptop);
  await saved(phone);
  await saved(laptop);
  await nav(laptop, 'Planner');
  await laptop.locator('[data-testid=planner-row][data-done=true]', { hasText: 'Synced homework' }).waitFor();
});

test('flashcards and their schedule follow the student', async () => {
  const laptop = await device('laptop');
  const phone = await device('phone');
  await nav(laptop, 'Flashcards');
  await laptop.getByLabel('New deck').fill('Synced deck');
  await laptop.getByRole('button', { name: 'Create deck' }).click();
  await laptop.getByLabel('Front', { exact: true }).fill('Synced question');
  await laptop.getByLabel('Back', { exact: true }).fill('Synced answer');
  await laptop.getByRole('button', { name: 'Add card' }).click();
  await laptop.getByTestId('card-row').waitFor();
  await saved(laptop);
  await saved(phone);
  await nav(phone, 'Flashcards');
  await phone.getByRole('link', { name: 'Review Synced deck' }).click();
  await phone.getByRole('button', { name: 'Reveal answer' }).click();
  await phone.getByTestId('card-back').getByText('Synced answer').waitFor();
  await phone.getByRole('button', { name: /^Good/ }).click();
  await phone.getByRole('heading', { name: 'All done' }).waitFor();
  await saved(phone);
  await saved(laptop);
  await nav(laptop, 'Flashcards');
  await laptop.getByTestId('deck-row').getByText('1 card, 0 due').waitFor();
});

test('a half-typed answer stays on its own device', async () => {
  const items = fake.state.items('alice-uid').filter((item) => item.collection === 'checkpointProgress');
  assert.equal(JSON.parse(items[0].json).draft, '');
});

test('files stay on the device and only their text-side records travel', async () => {
  const laptop = await device('laptop');
  await nav(laptop, 'Library');
  await laptop.getByTestId('file-input').first().setInputFiles(textFile);
  await laptop.locator('.save-panel li[data-phase=saved]').waitFor();
  await laptop.locator('.save-panel').getByRole('link', { name: 'Open' }).click();
  await laptop.getByText('Chapter one text').waitFor();
  await saved(laptop);
  const collections = new Set(fake.state.items('alice-uid').map((item) => item.collection));
  assert.ok(!collections.has('materials'));
  assert.ok(!collections.has('blobs'));
  assert.ok(!JSON.stringify(fake.state.items('alice-uid')).includes('Chapter one text'), 'file contents never leave');
  const phone = await device('phone');
  await saved(phone);
  await nav(phone, 'Library');
  await phone.getByText('No files yet').waitFor();
});

test('a second student on the same computer cannot open the first student\'s work', async () => {
  const laptop = await device('laptop');
  await nav(laptop, 'Settings');
  await signOutButton(laptop);
  await signInButton(laptop).waitFor();
  await nav(laptop, 'Notes');
  await laptop.getByRole('link', { name: 'Guest note' }).waitFor();
  assert.equal(await laptop.getByRole('link', { name: 'Shared note', exact: true }).count(), 0, 'signed out shows only no-account work');
  await nav(laptop, 'Library');
  await laptop.getByText('No files yet').waitFor();

  await close('laptop');
  const asBob = await device('laptop', BOB);
  await signIn(asBob);
  await asBob.getByRole('button', { name: /Account menu for bob@gmail.com/ }).waitFor();
  await asBob.locator('.avatar-letter', { hasText: 'B' }).waitFor(); // No picture shows their first letter.
  await nav(asBob, 'Notes');
  await asBob.getByText('No notes yet').waitFor();
  await nav(asBob, 'Library');
  await asBob.getByText('No files yet').waitFor();
  await addNote(asBob, 'Bob private', 'Only for Bob');
  await saved(asBob);
  assert.ok(!fake.state.items('alice-uid').some((item) => item.json.includes('Only for Bob')));
  assert.ok(!fake.state.items('bob-uid').some((item) => item.json.includes('Edited on the phone')));
  await nav(asBob, 'Settings');
  await signOutButton(asBob);
  await signInButton(asBob).waitFor();
  await close('laptop');

  // Alice returns, and her work, including her file, is still here.
  const asAlice = await device('laptop', ALICE);
  await signIn(asAlice);
  await nav(asAlice, 'Library');
  await asAlice.getByRole('link', { name: 'chapter.txt' }).waitFor();
  await nav(asAlice, 'Notes');
  await asAlice.getByRole('link', { name: 'Shared note', exact: true }).waitFor();
  assert.equal(await asAlice.getByRole('link', { name: 'Bob private' }).count(), 0);
});

test('signing out is one click, works offline, and keeps the work on this device', async () => {
  const laptop = await device('laptop');
  fake.state.mode = 'down';
  await signOutButton(laptop);
  await signInButton(laptop).waitFor();
  assert.equal(await laptop.getByRole('dialog').count(), 0, 'no questions asked');
  fake.state.mode = 'ok';
  await close('laptop');
  const back = await device('laptop', ALICE);
  await signIn(back);
  await nav(back, 'Library');
  await back.getByRole('link', { name: 'chapter.txt' }).waitFor();
});

test('offline and full quota say so, keep the work, and catch up later', async () => {
  const laptop = await device('laptop');
  await nav(laptop, 'Settings');
  fake.state.mode = 'quota';
  await laptop.getByRole('button', { name: 'Save online now' }).click();
  await laptop.locator('[data-testid=sync-status][data-phase=quota]').waitFor();
  await laptop.screenshot({ path: path.join(shots, 'account-quota.png') });
  await addNote(laptop, 'During quota', 'Still saved here');
  await nav(laptop, 'Settings');
  fake.state.mode = 'down';
  await laptop.getByRole('button', { name: 'Save online now' }).click();
  await laptop.locator('[data-testid=sync-status][data-phase=offline]').waitFor();
  fake.state.mode = 'denied';
  await laptop.getByRole('button', { name: 'Save online now' }).click();
  await laptop.locator('[data-testid=sync-status][data-phase=denied]').waitFor();
  fake.state.mode = 'ok';
  assert.ok(!fake.state.items('alice-uid').some((item) => item.json.includes('Still saved here')));
  await saved(laptop);
  assert.ok(fake.state.items('alice-uid').some((item) => item.json.includes('Still saved here')));
});

test('work closed before saving online goes up on the next visit', async () => {
  const laptop = await device('laptop');
  await addNote(laptop, 'Closed quickly', 'Then the lid shut');
  await close('laptop');
  assert.ok(!fake.state.items('alice-uid').some((item) => item.json.includes('Then the lid shut')));
  const again = await device('laptop');
  await saved(again);
  assert.ok(fake.state.items('alice-uid').some((item) => item.json.includes('Then the lid shut')));
});

test('removing from a shared computer asks first, needs a good sync, and clears the device', async () => {
  const laptop = await device('laptop');
  await nav(laptop, 'Settings');
  fake.state.mode = 'down';
  await laptop.getByRole('button', { name: 'Remove my work from this device' }).click();
  await laptop.getByRole('dialog').getByRole('button', { name: 'Remove and sign out' }).click();
  await laptop.getByRole('alert').getByText('nothing was removed from this device').waitFor();
  fake.state.mode = 'ok';
  await nav(laptop, 'Library');
  await laptop.getByRole('link', { name: 'chapter.txt' }).waitFor();
  await nav(laptop, 'Settings');
  await laptop.getByRole('button', { name: 'Remove my work from this device' }).click();
  await laptop.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await laptop.getByTestId('sync-status').waitFor();
  await laptop.getByRole('button', { name: 'Remove my work from this device' }).click();
  await laptop.getByRole('dialog').getByRole('button', { name: 'Remove and sign out' }).click();
  await signInButton(laptop).waitFor();
  const left = await laptop.evaluate(async () => {
    const dbs = (await indexedDB.databases()).map((database) => database.name);
    const root = await navigator.storage.getDirectory();
    const folders = [];
    for await (const name of root.keys()) folders.push(name);
    return { dbs, folders };
  });
  assert.ok(!left.dbs.some((name) => name.includes('alice')), left.dbs.join());
  assert.ok(!left.folders.some((name) => name.includes('alice')), left.folders.join());
  // The text is still in the account, on signing back in. The file is gone, as the warning said.
  await close('laptop');
  const back = await device('laptop', ALICE);
  await signIn(back);
  await back.locator('[data-testid=sync-status][data-phase=synced]').waitFor();
  await nav(back, 'Notes');
  await back.getByRole('link', { name: 'Shared note', exact: true }).waitFor();
  await nav(back, 'Library');
  await back.getByText('No files yet').waitFor();
});

test('deleting the online copy asks first, signs out, and keeps this device\'s copy', async () => {
  const phone = await device('phone');
  await saved(phone);
  await nav(phone, 'Settings');
  await phone.getByRole('button', { name: 'Delete my online copy' }).click();
  await phone.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  assert.ok(fake.state.items('alice-uid').length > 0);
  await phone.getByRole('button', { name: 'Delete my online copy' }).click();
  await phone.getByRole('dialog').getByRole('button', { name: 'Delete online copy' }).click();
  await signInButton(phone).waitFor();
  assert.equal(fake.state.items('alice-uid').length, 0);
});

test('no uncaught errors happened on any device', () => {
  for (const [name, entry] of open) assert.deepEqual(entry.errors, [], name);
});
