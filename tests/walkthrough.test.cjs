// The walkthrough, in a real browser, on the real screens.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const URL_BASE = 'http://localhost:4180/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-tour-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
const TOTAL = 24;
/** Where a step sits in the walkthrough, by name, so adding one never moves these tests. */
const numberOf = (id) => EXPECTED.findIndex(([stepId]) => stepId === id) + 1;
let server;
let context;
let page;
const pageErrors = [];

async function open(profile, { auto = true, viewport = { width: 1280, height: 800 }, mobile = false } = {}) {
  await context?.close().catch(() => undefined);
  context = await chromium.launchPersistentContext(path.join(work, profile), { viewport, isMobile: mobile, hasTouch: mobile });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
  if (auto) await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
}
const card = () => page.getByTestId('tour-card');
const closeTour = () => page.getByRole('button', { name: 'Close walkthrough' }).click();
const count = () => page.getByTestId('tour-count').textContent();
const press = (name) => card().getByRole('button', { name, exact: true }).click();
async function atStep(number) {
  await page.locator(`[data-testid=tour-count]`, { hasText: `Step ${number} of ${TOTAL}` }).waitFor({ state: 'attached' });
}
/** Does what a hands-on step asks for, proving Next stays locked until then. */
async function doAction() {
  const id = await card().getAttribute('data-step');
  await page.getByTestId('tour-try').waitFor();
  assert.equal(await card().getAttribute('data-action-pending'), 'true', `${id}: Next is locked`);
  if (id === 'courses') {
    await page.getByLabel('Course name').fill('Real class');
    await page.getByRole('button', { name: 'Create course' }).click();
  } else if (id === 'mastery') {
    await page.getByRole('button', { name: 'Add sample lesson' }).click();
  } else if (id === 'notes') {
    await page.getByRole('button', { name: 'New note' }).click();
    await page.locator('textarea.note-body').fill('My first note');
  }
  await page.getByTestId('tour-done').waitFor({ timeout: 8000 });
}
async function next() {
  const now = Number((await count()).match(/Step (\d+)/)[1]);
  await page.waitForFunction(() => document.querySelector('[data-testid=tour-card]').dataset.actionPending !== undefined);
  await settle();
  if ((await card().getAttribute('data-action-pending')) === 'true' && (await page.getByTestId('tour-try').count())) await doAction();
  await press(now === 1 ? 'Start' : 'Next');
  await atStep(now + 1);
}
const settle = () => page.waitForFunction(() => {
  const el = document.querySelector('[data-testid=tour-box]') ?? document.querySelector('[data-testid=tour-card]');
  const now = JSON.stringify(el.getBoundingClientRect());
  const same = window.__lastRect === now;
  window.__lastRect = now;
  return same && document.querySelector('[data-testid=tour-card]').style.visibility !== 'hidden';
}, null, { polling: 150 });

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4180', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
});

after(async () => {
  await context?.close().catch(() => undefined);
  try { if (server) process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('it never opens by itself, and a new student can find it', async () => {
  await open('first-visit', { auto: false });
  await page.getByRole('heading', { name: 'Start with one course' }).waitFor();
  await page.waitForTimeout(400);
  assert.equal(await card().count(), 0);
  await page.reload();
  await page.getByRole('heading', { name: 'Start with one course' }).waitFor();
  await page.waitForTimeout(400);
  assert.equal(await card().count(), 0, 'nor on coming back');
  await page.getByRole('button', { name: 'New here? Take the walkthrough' }).click();
  await atStep(1);
  // It's beside Settings, to its left.
  await closeTour();
  const help = await page.getByRole('button', { name: 'Walkthrough', exact: true }).boundingBox();
  const gear = await page.getByRole('link', { name: 'Settings' }).boundingBox();
  assert.ok(help.x + help.width <= gear.x, 'the walkthrough button is left of Settings');
  assert.ok(Math.abs(help.y - gear.y) < 4, 'in the same row');
});

test('the button starts it at 0%', async () => {
  await open('main');
  await card().waitFor();
  assert.match(await count(), new RegExp(`Step 1 of ${TOTAL}, 0% complete`));
  await page.getByRole('heading', { name: 'Welcome to Study Forge' }).waitFor();
  await settle();
  await page.screenshot({ path: path.join(shots, 'tour-welcome.png') });
});

test('nothing outside the walkthrough can be clicked or tabbed to', async () => {
  const hit = await page.evaluate(() => {
    const link = document.querySelector('.nav-links a');
    const { x, y, width, height } = link.getBoundingClientRect();
    return document.elementFromPoint(x + width / 2, y + height / 2).dataset.testid ?? document.elementFromPoint(x + width / 2, y + height / 2).className;
  });
  assert.match(hit, /tour-(blocker|dark)|tour-blocker/);
  assert.equal(await page.evaluate(() => document.getElementById('root').hasAttribute('inert')), true);
  await page.mouse.click(60, 145);
  await page.waitForTimeout(150);
  assert.ok(!page.url().includes('courses'), 'clicking Courses behind it does nothing');
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('[data-testid=tour-card]')), true, 'focus stays in the walkthrough');
  }
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('[data-testid=tour-card]')), true);
});

const EXPECTED = [
  ['sections', '#/', '.nav-links'],
  ['add', '#/', '[data-tour=smart-add]'],
  ['account', '#/', '.topbar'],
  ['today', '#/', '#content .page'],
  ['courses', '#/courses', '[data-tour=add-course]'],
  ['library', '#/library', '[data-tour=add-files]'],
  ['viewer', '#/library', '#content .page'],
  ['planner', '#/planner', '[data-tour=add-planner]'],
  ['study', '#/study', '[data-tour=study-intro]'],
  ['mastery', '#/study', '[data-tour=sample-lesson]'],
  ['write-lesson', '#/study', '[data-tour=new-lesson]'],
  ['flashcards', '#/cards', '[data-tour=new-deck]'],
  ['practice', '#/practice', '[data-tour=new-practice]'],
  ['exams', '#/exams', '[data-tour=exam-start]'],
  ['calendar', '#/calendar', '[data-tour=calendar-add]'],
  ['progress', '#/progress', '[data-tour=progress-streak]'],
  ['notes', '#/notes', '[data-tour=new-note]'],
  ['record-type', '#/record', '[data-tour=record-source]'],
  ['record-safe', '#/record', '[data-tour=record-start]'],
  ['backup', '#/settings', '[data-tour=backup]'],
  ['offline', '#/settings', '[data-tour=offline]'],
  ['search', '#/search', '[data-tour=search-box]'],
];

test('every step opens the real screen and puts a box around the real section', async () => {
  for (const [index, [id, hash, selector]] of EXPECTED.entries()) {
    await next();
    assert.equal(await card().getAttribute('data-step'), id);
    assert.match(await count(), new RegExp(`${Math.round(((index + 1) / TOTAL) * 100)}% complete`));
    assert.equal(new URL(page.url()).hash || '#/', hash, `${id} is on the right screen`);
    await page.getByTestId('tour-box').waitFor();
    await settle();
    const fit = await page.evaluate((target) => {
      const box = document.querySelector('[data-testid=tour-box]').getBoundingClientRect();
      const element = document.querySelector(target).getBoundingClientRect();
      const panel = document.querySelector(target).closest('main')?.getBoundingClientRect();
      const top = Math.max(element.top, panel?.top ?? 0, 0);
      const bottom = Math.min(element.bottom, panel?.bottom ?? innerHeight, innerHeight);
      const left = Math.max(element.left, 0);
      const right = Math.min(element.right, innerWidth);
      const c = document.querySelector('[data-testid=tour-card]').getBoundingClientRect();
      return {
        // At the very edge of the screen, the box sits just inside it so its border can be seen.
        surrounds: box.top <= top + 4 && box.bottom >= bottom - 4 && box.left <= left + 4 && box.right >= right - 4,
        close: box.top >= top - 12 && box.bottom <= bottom + 12,
        visible: bottom - top,
        cardOnScreen: c.top >= 0 && c.left >= 0 && c.bottom <= innerHeight && c.right <= innerWidth,
      };
    }, selector);
    assert.ok(fit.surrounds, `${id}: the box surrounds the section`);
    assert.ok(fit.close, `${id}: the box fits the section`);
    assert.ok(fit.visible > 10, `${id}: the section is scrolled into view`);
    assert.ok(fit.cardOnScreen, `${id}: the explanation is fully on screen`);
    if (['courses', 'study', 'record-type', 'backup'].includes(id)) await page.screenshot({ path: path.join(shots, `tour-${id}.png`) });
  }
});

test('Back returns to the earlier section', async () => {
  await press('Back');
  await atStep(numberOf('offline'));
  assert.equal(await card().getAttribute('data-step'), 'offline');
  await page.locator('[data-testid=tour-card]').getByRole('button', { name: 'Back' }).waitFor();
  assert.match(await count(), /88% complete/);
});

test('a reload closes it, and the button picks up at the same step, on the right screen', async () => {
  // The place is saved a moment after the tap, so give that time to land before reloading.
  await page.waitForFunction(() => new Promise((resolve) => {
    const request = indexedDB.open('study-forge');
    request.onsuccess = () => {
      const read = request.result.transaction('meta').objectStore('meta').get('walkthrough');
      read.onsuccess = () => { request.result.close(); resolve(read.result?.step === 20); };
    };
  }));
  await page.reload();
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await page.waitForTimeout(300);
  assert.equal(await card().count(), 0);
  await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await atStep(numberOf('offline'));
  await page.getByTestId('tour-box').waitFor();
  assert.ok(page.url().endsWith('#/settings'));
});

test('the X cleans up completely, and it does not come back by itself', async () => {
  await closeTour();
  await card().waitFor({ state: 'detached' });
  assert.equal(await page.getByTestId('tour-blocker').count(), 0);
  assert.equal(await page.evaluate(() => document.getElementById('root').hasAttribute('inert')), false);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Notes', exact: true }).click();
  await page.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
  await page.waitForTimeout(300);
  assert.equal(await card().count(), 0);
});

test('Escape also leaves, and the question mark resumes at the same step', async () => {
  await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await atStep(numberOf('offline'));
  await page.keyboard.press('Escape');
  await card().waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await atStep(numberOf('offline'));
});

test('tapping the button the moment the page opens still resumes at the saved step', async () => {
  await closeTour();
  await card().waitFor({ state: 'detached' });
  await page.waitForTimeout(200);
  await page.reload();
  await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await atStep(numberOf('offline'));
});

test('Start over returns to the beginning at 0%', async () => {
  await press('Start over');
  await atStep(1);
  assert.match(await count(), /0% complete/);
  assert.equal(new URL(page.url()).hash || '#/', '#/');
});

test('finishing reaches the last step, cleans up, and does not repeat', async () => {
  for (let i = 1; i < TOTAL; i++) await next();
  await page.getByRole('heading', { name: "You're ready" }).waitFor();
  await settle();
  await page.screenshot({ path: path.join(shots, 'tour-finish.png') });
  assert.equal(await page.getByRole('button', { name: 'Close walkthrough' }).count(), 1, 'the X is on every step');
  await press('Finish');
  await card().waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.getElementById('root').hasAttribute('inert')), false);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Courses', exact: true }).click();
  await page.getByRole('heading', { name: 'Courses', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Courses', exact: true }).waitFor();
  await page.waitForTimeout(300);
  assert.equal(await card().count(), 0);
  await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await atStep(1);
  await closeTour();
});

test('a section that is missing never crashes it', async () => {
  await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await atStep(1);
  await page.addStyleTag({ content: '[data-tour="add-files"] { display: none !important; }' });
  for (let i = 1; i < 6; i++) await next();
  assert.equal(await card().getAttribute('data-step'), 'library');
  await page.getByTestId('tour-missing').waitFor();
  assert.equal(await page.getByTestId('tour-box').count(), 0);
  await next();
  await page.getByTestId('tour-box').waitFor();
  await closeTour();
});

test('a hands-on step whose part is missing never traps anyone', async () => {
  await open('trapped', { auto: false });
  await page.addStyleTag({ content: '[data-tour="add-course"] { display: none !important; }' });
  await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await atStep(1);
  await page.addStyleTag({ content: '[data-tour="add-course"] { display: none !important; }' });
  for (let i = 1; i < numberOf('courses') - 1; i++) await next();
  await press('Next');
  await atStep(numberOf('courses'));
  await page.getByTestId('tour-missing').waitFor();
  assert.equal(await card().getByRole('button', { name: 'Next', exact: true }).isDisabled(), false);
  await closeTour();
});

test('a student with real content gets accurate boxes too, and their work is untouched', async () => {
  await open('with-content', { auto: false });
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Study', exact: true }).click();
  await page.getByRole('button', { name: 'Add sample lesson' }).click();
  await page.getByRole('heading', { name: /Lesson 1/ }).waitFor();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today', exact: true }).click();
  await page.getByRole('link', { name: /Sample: Accounting Basics/ }).waitFor();
  await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await atStep(1);
  for (let i = 1; i < TOTAL; i++) {
    await next();
    if (i < TOTAL - 1) await page.getByTestId('tour-box').waitFor();
  }
  await press('Finish');
  await page.getByRole('link', { name: /Sample: Accounting Basics/ }).waitFor();
});

test('starting from an unsaved lesson editor asks first', async () => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Study', exact: true }).click();
  await page.getByRole('link', { name: /Lesson 1/ }).click();
  await page.getByRole('button', { name: 'Add checkpoint' }).click();
  await page.getByLabel('Checkpoint title').fill('Half written');
  await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.getByLabel('Checkpoint title').inputValue(), 'Half written');
  assert.equal(await card().count(), 0);
  await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave and start walkthrough' }).click();
  await atStep(1);
  await closeTour();
});

test('it works on a phone: the box fits and the explanation stays on screen', async () => {
  await open('phone', { viewport: { width: 360, height: 640 }, mobile: true });
  await card().waitFor();
  for (let i = 1; i <= TOTAL; i++) {
    await settle();
    const fit = await page.evaluate(() => {
      const c = document.querySelector('[data-testid=tour-card]').getBoundingClientRect();
      const box = document.querySelector('[data-testid=tour-box]')?.getBoundingClientRect();
      return {
        card: c.top >= 0 && c.left >= 0 && c.bottom <= innerHeight && c.right <= innerWidth,
        box: !box || (box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight),
        over: document.documentElement.scrollWidth - innerWidth,
      };
    });
    assert.ok(fit.card, `step ${i}: the explanation is on screen`);
    assert.ok(fit.box, `step ${i}: the box is on screen`);
    assert.ok(fit.over <= 0, `step ${i}: no sideways scrolling`);
    if (i === 2 || i === 5 || i === 12) await page.screenshot({ path: path.join(shots, `tour-phone-${i}.png`) });
    if (i < TOTAL) await next();
  }
  await press('Finish');
  await card().waitFor({ state: 'detached' });
});

test('during a hands-on step, only the highlighted part works', async () => {
  await open('hands-on');
  await card().waitFor();
  for (let i = 1; i < numberOf('courses'); i++) await next();
  assert.equal(await card().getAttribute('data-step'), 'courses');
  await page.getByTestId('tour-try').waitFor();
  await settle();
  await page.screenshot({ path: path.join(shots, 'tour-hands-on.png') });
  const hits = await page.evaluate(() => {
    const at = (el) => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    };
    const input = document.querySelector('[data-tour=add-course] input');
    return { field: at(input) === input, navBlocked: at(document.querySelector('.nav-links a')).className, top: at(document.querySelector('.topbar .button')).className };
  });
  assert.equal(hits.field, true, 'the highlighted form can be used');
  assert.match(hits.navBlocked, /tour-blocker/);
  assert.match(hits.top, /tour-blocker/);
  await page.mouse.click(60, 190);
  await page.waitForTimeout(150);
  assert.ok(new URL(page.url()).hash.endsWith('/courses'), 'the sidebar still can\'t be clicked');
  // An empty name doesn't count.
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByText('Enter a course name.').waitFor();
  assert.equal(await card().getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
  // Pausing and returning keeps the same step, still locked.
  await page.reload();
  await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await atStep(numberOf('courses'));
  await page.getByTestId('tour-try').waitFor();
  await page.getByLabel('Course name').fill('Biology');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByTestId('tour-done').waitFor();
  assert.equal(await page.evaluate(() => document.getElementById('root').hasAttribute('inert')), true, 'everything is locked again');
  await next();
  // Their work is real and stays.
  await closeTour();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Courses', exact: true }).click();
  await page.getByRole('link', { name: /Biology/ }).waitFor();
});

test('work already done is not asked for again', async () => {
  await open('already', { auto: false });
  await page.getByLabel('Course name').fill('Existing');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Existing' }).waitFor();
  await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await atStep(1);
  for (let i = 1; i < 5; i++) await next();
  assert.equal(await card().getAttribute('data-step'), 'courses');
  await page.getByTestId('tour-done').waitFor();
  assert.equal(await page.getByTestId('tour-try').count(), 0);
  assert.equal(await card().getByRole('button', { name: 'Next', exact: true }).isDisabled(), false);
  await closeTour();
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
