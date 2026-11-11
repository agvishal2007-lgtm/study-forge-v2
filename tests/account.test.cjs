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
  // Signed out, Settings is the gear in the account bar, not a main-nav destination.
  await page.getByRole('navigation', { name: name === 'Settings' ? 'Account' : 'Main' }).getByRole('link', { name, exact: true }).click();
}
const signInButton = (page) => page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: 'Log In / Sign Up', exact: true });
const googleButton = (page) => page.getByRole('button', { name: 'Continue with Google' });
const signOutButton = async (page) => {
  await openMenu(page);
  await page.getByTestId('account-dropdown').getByRole('button', { name: 'Sign out' }).click();
};
async function signIn(page) {
  await signInButton(page).click();
  await googleButton(page).click();
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
  await signInButton(slow).click();
  assert.equal(await googleButton(slow).isDisabled(), true);
  await slow.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Continue with Google' && !b.disabled));
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
  await googleButton(page).click();
  await googleButton(page).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Continue with Google' && !b.disabled));
  assert.equal(await page.getByRole('alert').count(), 0);
  await close('laptop');
  const blocked = await device('laptop', 'auth/admin-restricted-operation');
  await nav(blocked, 'Settings');
  await signInButton(blocked).click();
  await googleButton(blocked).click();
  await blocked.getByRole('alert').getByText('Your school blocked this sign-in').waitFor();
  await nav(blocked, 'Notes');
  await blocked.getByRole('link', { name: 'Guest note' }).waitFor();
  await close('laptop');
  const popup = await device('laptop', 'auth/popup-blocked');
  await nav(popup, 'Settings');
  await signInButton(popup).click();
  await googleButton(popup).click();
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
  await laptop.getByRole('heading', { name: /^Today:/ }).waitFor();
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

test('practice sets and answers follow the student', async () => {
  const laptop = await device('laptop');
  const phone = await device('phone');
  await nav(laptop, 'Practice');
  await laptop.getByLabel('New practice set').fill('Synced set');
  await laptop.getByRole('button', { name: 'Create set' }).click();
  await laptop.getByRole('heading', { name: 'Synced set' }).waitFor();
  await laptop.getByLabel('Question', { exact: true }).fill('Synced practice question');
  await laptop.getByLabel('Answer choices').fill('Right\nWrong');
  await laptop.getByLabel('Correct answer').selectOption({ label: 'Right' });
  await laptop.getByRole('button', { name: 'Add question' }).click();
  await laptop.getByTestId('question-row').waitFor();
  await saved(laptop);
  await saved(phone);
  await nav(phone, 'Practice');
  await phone.getByRole('link', { name: 'Start Synced set' }).click();
  await phone.getByRole('radio', { name: 'Wrong', exact: true }).check();
  await phone.getByRole('button', { name: 'Submit answer' }).click();
  await phone.getByTestId('practice-feedback').waitFor();
  await saved(phone);
  await saved(laptop);
  await nav(laptop, 'Practice');
  await laptop.getByTestId('set-row').getByText('1 question, 0% accuracy').waitFor();
});

test('a new student can sign up with an email and password, and sign in again later', async () => {
  const page = await device('emailer', null);
  await page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: 'Log In / Sign Up', exact: true }).click();
  await page.getByRole('link', { name: 'Sign Up', exact: true }).click();
  // Both tabs have an Email box, so wait for the sign-up form before typing into it.
  await page.getByLabel('Type the password again').waitFor();
  await page.getByRole('heading', { name: 'Create your account' }).waitFor();
  await page.screenshot({ path: path.join(shots, 'sign-up.png') });
  for (const name of ['Continue with Google', 'Continue with Microsoft']) await page.getByRole('button', { name }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Facebook/ }).count(), 0);
  const create = () => page.getByRole('button', { name: 'Create account' }).click();
  const problems = page.getByTestId('auth-problems');
  await create();
  await problems.getByText('Enter your email').waitFor();
  await page.getByLabel('Email').fill('dana@school.edu');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await create();
  await problems.getByText('at least 8 characters').waitFor();
  await page.getByLabel('Password', { exact: true }).fill('long enough now');
  await page.getByLabel('Type the password again').fill('not the same');
  await create();
  await problems.getByText("don't match").waitFor();
  assert.equal(fake.state.accounts.size, 0, 'nothing was created yet');
  assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'password');
  await page.getByLabel('Show password').check();
  assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'text');
  await page.getByLabel('Type the password again').fill('long enough now');
  await create();
  await page.getByRole('button', { name: /Account menu for dana@school.edu/ }).waitFor();
  assert.match(page.url(), /#\/$/, 'it lands on Today');

  // The email isn't confirmed yet, and the student can ask for it again.
  await nav(page, 'Settings');
  await page.getByTestId('confirm-email').waitFor();
  await page.getByRole('button', { name: 'Send it again' }).click();
  await page.getByRole('button', { name: 'Sent again' }).waitFor();
  assert.equal(fake.state.accounts.get('dana@school.edu').confirmations, 2);

  // Work saves online like any other account.
  await addNote(page, 'Email note', 'Saved by an email account');
  await saved(page);
  await signOutButton(page);
  await signInButton(page).waitFor();

  // A wrong password gets one message that doesn't reveal whether the account exists.
  await signInButton(page).click();
  await page.getByLabel('Email').fill('dana@school.edu');
  await page.getByLabel('Password', { exact: true }).fill('wrong password');
  await page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
  await problems.getByText("That email and password don't match").waitFor();
  const wrongMessage = await problems.innerText();
  await page.getByLabel('Email').fill('nobody@school.edu');
  await page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(await problems.innerText(), wrongMessage);
  await page.getByLabel('Email').fill('dana@school.edu');
  await page.getByLabel('Password', { exact: true }).fill('long enough now');
  await page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /Account menu for dana@school.edu/ }).waitFor();
  await saved(page);
  await nav(page, 'Notes');
  await page.getByRole('link', { name: 'Email note' }).waitFor();
  await signOutButton(page);
  await signInButton(page).waitFor();

  // Signing up again with the same email points to signing in.
  await page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: 'Log In / Sign Up', exact: true }).click();
  await page.getByRole('link', { name: 'Sign Up', exact: true }).click();
  // Both tabs have an Email box, so wait for the sign-up form before typing into it.
  await page.getByLabel('Type the password again').waitFor();
  await page.getByLabel('Email').fill('dana@school.edu');
  await page.getByLabel('Password', { exact: true }).fill('another password');
  await page.getByLabel('Type the password again').fill('another password');
  await create();
  await problems.waitFor();
  assert.match(await problems.innerText(), /already exists/);
});

test('forgot password never reveals who has an account', async () => {
  const page = await device('emailer', null);
  await signInButton(page).click();
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.getByRole('alert').getByText('Enter your email').waitFor();
  await page.getByLabel('Email').fill('dana@school.edu');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  const sentText = (await page.getByTestId('reset-sent').innerText()).replace('dana@school.edu', 'X');
  assert.deepEqual(fake.state.resets, ['dana@school.edu']);
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await page.getByRole('heading', { name: 'Reset your password' }).waitFor();
  await page.getByLabel('Email').fill('stranger@school.edu');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  assert.equal((await page.getByTestId('reset-sent').innerText()).replace('stranger@school.edu', 'X'), sentText);
  assert.equal(fake.state.resets.length, 1, 'no email goes to an address with no account');
});

test('forgot email shows shortened hints from this browser, which can be removed', async () => {
  const page = await device('emailer', null);
  await signInButton(page).click();
  await page.getByRole('link', { name: 'Forgot which email you used?' }).click();
  const known = page.getByTestId('known-accounts');
  await known.getByText('da***@school.edu').waitFor();
  assert.match(await known.innerText(), /Signed in with email and password/);
  assert.doesNotMatch(await page.content(), /dana@school\.edu/, 'the full address is not kept');
  await page.screenshot({ path: path.join(shots, 'forgot-email.png') });
  await page.getByRole('button', { name: 'Remove these hints from this browser' }).click();
  await page.getByText('No accounts have been used in this browser').waitFor();
  await page.reload();
  await page.getByText('No accounts have been used in this browser').waitFor();
});

test('privacy is one tap from signing in and says what is kept', async () => {
  const page = await device('emailer', null);
  await signInButton(page).click();
  await page.getByRole('main').getByRole('link', { name: 'Privacy' }).click();
  const text = await page.getByTestId('privacy').innerText();
  for (const words of ['Files and recordings aren\'t saved online', 'Removing your data', 'no ads']) assert.ok(text.includes(words), words);
  await close('emailer');
});

test('Microsoft uses the same sign-in path as Google', async () => {
  const page = await device('social', { uid: 'social-uid', email: 'sam@outlook.com' });
  await signInButton(page).click();
  await page.getByRole('button', { name: 'Continue with Microsoft' }).click();
  await page.getByRole('button', { name: /Account menu for sam@outlook.com/ }).waitFor();
  await nav(page, 'Settings');
  await page.getByTestId('sync-status').waitFor();
  assert.equal(await page.getByTestId('confirm-email').count(), 0, 'only password accounts are asked to confirm');
  await close('social');
});

test('a failed Microsoft sign-in never blames an email or password, and trying again works', async () => {
  const page = await device('retry', 'auth/invalid-credential');
  await signInButton(page).click();
  await page.getByRole('button', { name: 'Continue with Microsoft' }).click();
  const alert = page.getByTestId('auth-problems');
  await alert.getByText("Microsoft sign-in didn't finish").waitFor();
  assert.doesNotMatch(await alert.innerText(), /password/i);
  await page.evaluate(() => { window.__testSignIn = { uid: 'retry-uid', email: 'retry@outlook.com' }; });
  await page.getByRole('button', { name: 'Continue with Microsoft' }).click();
  await page.getByRole('button', { name: /Account menu for retry@outlook.com/ }).waitFor();
  await close('retry');
});

test('files can come from Google Drive and Dropbox, and problems are explained', async () => {
  const page = await device('importer', null);
  await page.evaluate(() => { window.__testCloudPick = { files: ['Drive slides.txt', 'Second.txt'], failed: ['Too big.mov'] }; });
  await nav(page, 'Library');
  await page.getByRole('button', { name: 'From Google Drive' }).click();
  await page.getByRole('alert').getByText("These couldn't be copied from Google Drive: Too big.mov").waitFor();
  await page.getByRole('link', { name: 'Drive slides.txt' }).waitFor();
  await page.getByRole('link', { name: 'Second.txt' }).waitFor();
  await page.screenshot({ path: path.join(shots, 'library-cloud.png') });
  await page.evaluate(() => { window.__testCloudPick = 'cancelled'; });
  await page.getByRole('button', { name: 'From Dropbox' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'From Dropbox' && !b.disabled));
  assert.equal(await page.getByRole('alert').count(), 0, 'cancelling stays quiet');
  await page.evaluate(() => { window.__testCloudPick = "That service couldn't be reached."; });
  await page.getByRole('button', { name: 'From Dropbox' }).click();
  await page.getByRole('alert').getByText("That service couldn't be reached").waitFor();
  await page.evaluate(() => { window.__testCloudPick = { files: ['Dropbox reading.txt'] }; });
  await page.getByRole('button', { name: 'From Dropbox' }).click();
  await page.getByRole('link', { name: 'Dropbox reading.txt' }).waitFor();
  await page.reload();
  await page.getByRole('link', { name: 'Dropbox reading.txt' }).waitFor();
  await close('importer');
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
  await phone.getByText('Nothing here yet').waitFor();
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
  await laptop.getByText('Nothing here yet').waitFor();

  await close('laptop');
  const asBob = await device('laptop', BOB);
  await signIn(asBob);
  await asBob.getByRole('button', { name: /Account menu for bob@gmail.com/ }).waitFor();
  await asBob.locator('.avatar-letter', { hasText: 'B' }).waitFor(); // No picture shows their first letter.
  await nav(asBob, 'Notes');
  await asBob.getByText('No notes yet').waitFor();
  await nav(asBob, 'Library');
  await asBob.getByText('Nothing here yet').waitFor();
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
  await back.getByText('Nothing here yet').waitFor();
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

test('after signing in with Google, that calendar connects in one tap, and other sign-ins are not asked', async () => {
  const page = await device('calendar', { uid: 'calendar-uid', email: 'student@gmail.com', usesGoogle: true });
  page.setDefaultTimeout(20000);
  // A fixed clock keeps the dates the same on every machine, so the month never drifts.
  await page.clock.setFixedTime(new Date('2026-11-04T09:00:00-05:00'));
  await page.goto(URL_BASE);
  let scopes = '';
  let hint = '';
  await page.exposeFunction('__tokenAsked', (scope, who) => { scopes = scope; hint = who; });
  await page.route('https://accounts.google.com/gsi/client', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.google = { accounts: { oauth2: { initTokenClient(config) { return { requestAccessToken: async () => { await window.__tokenAsked(config.scope, config.hint); config.callback({ access_token: 'fake', expires_in: 3600 }); } }; } } } };`,
  }));
  const stamp = (date, time) => new Date(`${date}T${time}:00-05:00`).toISOString();
  const soon = '2026-11-06';
  const events = {
    'student@gmail.com': [{ id: 'eco', recurringEventId: 'ecos', summary: 'ECO 231', start: { dateTime: stamp(soon, '10:00') }, end: { dateTime: stamp(soon, '10:50') } }],
    canvas: [{ id: 'quiz', summary: 'Quiz 1 [1268-ECO231-03]', start: { dateTime: stamp(soon, '14:00') }, end: { dateTime: stamp(soon, '14:00') } }],
    birthdays: [{ id: 'bday', summary: 'Sam birthday', start: { date: soon }, end: { date: soon } }],
  };
  await page.route('https://www.googleapis.com/calendar/v3/**', (route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json', 'access-control-allow-headers': 'authorization' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/calendarList')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ items: [{ id: 'student@gmail.com', summary: 'Me', primary: true }, { id: 'canvas', summary: 'Canvas Calendar' }, { id: 'birthdays', summary: 'Birthdays' }] }) });
    const id = decodeURIComponent(url.pathname.split('/calendars/')[1].split('/')[0]);
    return route.fulfill({ status: 200, headers, body: JSON.stringify({ items: events[id] ?? [] }) });
  });
  await signInButton(page).click();
  await googleButton(page).click();
  const offer = page.getByTestId('calendar-offer');
  await offer.waitFor();
  assert.match(await offer.innerText(), /student@gmail.com/);
  await page.waitForFunction(() => !!window.google);
  await offer.getByRole('button', { name: 'Connect Google Calendar' }).click();
  const done = page.getByTestId('calendar-offer-done');
  await done.waitFor();
  assert.match(await done.innerText(), /1 added to your calendar/);
  assert.match(await done.innerText(), /1 deadline added to your Planner/);
  assert.equal(hint, 'student@gmail.com', 'it asks about the same account');
  assert.match(scopes, /calendar\.events\.readonly/);
  // The Planner is the plainest check that the Canvas deadline came in.
  await nav(page, 'Planner');
  await page.getByRole('link', { name: 'Quiz 1' }).waitFor();
  await nav(page, 'Calendar');
  await page.getByRole('tab', { name: 'Plan Calendar' }).click();
  await page.locator(`[data-date="${soon}"]`).getByText('ECO 231').waitFor();
  assert.equal(await page.getByText('Sam birthday').count(), 0, 'calendars that are not for school stay out');
  await page.getByRole('tab', { name: 'Deadline Calendar' }).click();
  await page.locator(`[data-date="${soon}"]`).getByText('Quiz 1').waitFor();
  await page.getByRole('link', { name: 'Google Calendar', exact: true }).waitFor();

  events['student@gmail.com'][0].summary = 'ECO 231 moved';
  await page.getByRole('button', { name: 'Get the latest' }).click();
  await page.getByTestId('calendar-update-note').getByText('1 updated').waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Study Forge Calendar', exact: true }).waitFor();
  assert.equal(await offer.count(), 0, 'once connected it stops asking');

  await nav(page, 'Courses');
  await page.getByRole('link', { name: /ECO 231/ }).first().waitFor();
  await close('calendar');

  const other = await device('calendar-later', { uid: 'later-uid', email: 'later@gmail.com', usesGoogle: true });
  await signInButton(other).click();
  await googleButton(other).click();
  await other.getByTestId('calendar-offer').getByRole('button', { name: 'Not now' }).click();
  await other.getByTestId('calendar-offer').waitFor({ state: 'detached' });
  await other.reload();
  await other.getByRole('button', { name: /Account menu for/ }).waitFor();
  assert.equal(await other.getByTestId('calendar-offer').count(), 0, 'not now is remembered');
  await close('calendar-later');

  const microsoft = await device('calendar-microsoft', { uid: 'ms-uid', email: 'ms@outlook.com' });
  await signInButton(microsoft).click();
  await microsoft.getByRole('button', { name: 'Continue with Microsoft' }).click();
  await microsoft.getByRole('button', { name: /Account menu for/ }).waitFor();
  assert.equal(await microsoft.getByTestId('calendar-offer').count(), 0, 'it only offers Google Calendar to Google accounts');
  await close('calendar-microsoft');
});

test('no uncaught errors happened on any device', () => {
  for (const [name, entry] of open) assert.deepEqual(entry.errors, [], name);
});
