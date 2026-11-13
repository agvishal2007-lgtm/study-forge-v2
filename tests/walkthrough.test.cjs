// The walkthrough, in a real browser, on the real screens.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const URL_BASE = 'http://localhost:4180/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-tour-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
/**
 * The walkthrough's own steps, in order, read from the source rather than copied here. The list
 * below only names the steps worth checking a screen for, so it cannot be used to count positions.
 */
const STEP_IDS = [...fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'walkthrough', 'steps.ts'), 'utf8')
  .matchAll(/^\s{4}id: '([^']+)'/gm)].map((found) => found[1]);
const TOTAL = STEP_IDS.length;
/** Where a step sits, by name, so adding a step never moves these tests. */
const numberOf = (id) => {
  const at = STEP_IDS.indexOf(id);
  if (at < 0) throw new Error(`no walkthrough step called ${id}`);
  return at + 1;
};
let server;
let context;
let page;
const pageErrors = [];

async function open(profile, { auto = true, viewport = { width: 1280, height: 800 }, mobile = false } = {}) {
  await context?.close().catch(() => undefined);
  context = await chromium.launchPersistentContext(path.join(work, profile), { viewport, isMobile: mobile, hasTouch: mobile });
  await returningStudent(context);
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
  if (auto) {
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    await page.getByRole('menuitem', { name: /Take the walkthrough/ }).click();
  }
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
  // Steady means the box and the page under it have both stopped moving.
  const scrollers = [document.scrollingElement, document.querySelector('main'), document.getElementById('content')].map((node) => node?.scrollTop ?? 0);
  const now = JSON.stringify([el.getBoundingClientRect(), scrollers]);
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
  const help = await page.getByRole('button', { name: 'Help', exact: true }).boundingBox();
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

// The first selector present is the part the step should highlight, as in steps.ts.
const EXPECTED = [
  ['sections', '#/', '.nav-links'],
  ['add', '#/', '[data-tour=smart-add]'],
  ['account', '#/', '[data-tour=account]'],
  ['today', '#/', '[data-testid=start-studying], #content .page h1'],
  ['courses', '#/courses', '[data-tour=add-course]'],
  ['library', '#/library', '[data-tour=add-files]'],
  ['viewer', '#/library', '#content .files, #content .page h1'],
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
  ['backup', '#/settings', '[data-tour=backup-actions]'],
  ['sync-files', '#/settings', '[data-testid=drive-backup], [data-tour=account]'],
  ['offline', '#/settings', '[data-tour=offline]'],
  ['appearance', '#/settings', '.segmented[aria-labelledby=appearance-heading]'],
  ['permissions', '#/settings', '[data-testid=permission-notifications]'],
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
    const fit = await page.evaluate((targets) => {
      const box = document.querySelector('[data-testid=tour-box]').getBoundingClientRect();
      const found = targets.split(', ').map((one) => document.querySelector(one)).find((el) => el && el.getClientRects().length);
      const element = found.getBoundingClientRect();
      const panel = found.closest('main')?.getBoundingClientRect();
      const top = Math.max(element.top, panel?.top ?? 0, 0);
      const bottom = Math.min(element.bottom, panel?.bottom ?? innerHeight, innerHeight);
      const left = Math.max(element.left, 0);
      const right = Math.min(element.right, innerWidth);
      const c = document.querySelector('[data-testid=tour-card]').getBoundingClientRect();
      return {
        // The ring hugs what the part actually shows: never wider than the part plus a small
        // margin, and never empty. A row with one button in it gets a ring around the button.
        surrounds: box.width > 20 && box.height > 20 && box.left + box.width / 2 >= left && box.left + box.width / 2 <= right
          && box.top + box.height / 2 >= top - 2 && box.top + box.height / 2 <= bottom + 2,
        close: box.top >= top - 12 && box.bottom <= bottom + 12 && box.left >= left - 12 && box.right <= right + 12,
        visible: bottom - top,
        debug: JSON.stringify({ box: [box.left, box.top, box.width, box.height], el: [left, top, right, bottom] }),
        cardOnScreen: c.top >= 0 && c.left >= 0 && c.bottom <= innerHeight && c.right <= innerWidth,
      };
    }, selector);
    assert.ok(fit.surrounds, `${id}: the box surrounds the section ${fit.debug}`);
    assert.ok(fit.close, `${id}: the box fits the section`);
    assert.ok(fit.visible > 10, `${id}: the section is scrolled into view`);
    assert.ok(fit.cardOnScreen, `${id}: the explanation is fully on screen`);
    if (['courses', 'study', 'record-type', 'backup'].includes(id)) await page.screenshot({ path: path.join(shots, `tour-${id}.png`) });
  }
});

// The step just before Search, read from the real order so adding a step changes nothing here.
const BEFORE_SEARCH = STEP_IDS[STEP_IDS.indexOf('search') - 1];

test('Back returns to the earlier section', async () => {
  await press('Back');
  await atStep(numberOf(BEFORE_SEARCH));
  assert.equal(await card().getAttribute('data-step'), BEFORE_SEARCH);
  await page.locator('[data-testid=tour-card]').getByRole('button', { name: 'Back' }).waitFor();
  assert.match(await count(), new RegExp(`${Math.round((STEP_IDS.indexOf(BEFORE_SEARCH) / TOTAL) * 100)}% complete`));
});

test('a reload closes it, and the button picks up at the same step, on the right screen', async () => {
  // The place is saved a moment after the tap, so give that time to land before reloading.
  await page.waitForFunction((want) => new Promise((resolve) => {
    const request = indexedDB.open('study-forge');
    request.onsuccess = () => {
      const read = request.result.transaction('meta').objectStore('meta').get('walkthrough');
      read.onsuccess = () => { request.result.close(); resolve(read.result?.step === want); };
    };
  }), STEP_IDS.indexOf(BEFORE_SEARCH) - 1);
  await page.reload();
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await page.waitForTimeout(300);
  assert.equal(await card().count(), 0);
  await page.getByRole('button', { name: 'Help', exact: true }).click(); await page.getByRole('menuitem', { name: /Take the walkthrough/ }).click();
  await atStep(numberOf(BEFORE_SEARCH));
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
  await page.getByRole('button', { name: 'Help', exact: true }).click(); await page.getByRole('menuitem', { name: /Take the walkthrough/ }).click();
  await atStep(numberOf(BEFORE_SEARCH));
  await page.keyboard.press('Escape');
  await card().waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Help', exact: true }).click(); await page.getByRole('menuitem', { name: /Take the walkthrough/ }).click();
  await atStep(numberOf(BEFORE_SEARCH));
});

test('tapping the button the moment the page opens still resumes at the saved step', async () => {
  await closeTour();
  await card().waitFor({ state: 'detached' });
  await page.waitForTimeout(200);
  await page.reload();
  await page.getByRole('button', { name: 'Help', exact: true }).click(); await page.getByRole('menuitem', { name: /Take the walkthrough/ }).click();
  await atStep(numberOf(BEFORE_SEARCH));
});

test('Start over returns to the beginning at 0%', async () => {
  await press('Start over');
  await atStep(1);
  assert.match(await count(), /0% complete/);
  assert.equal(new URL(page.url()).hash || '#/', '#/');
});

test('finishing reaches the last step, cleans up, and does not repeat', async () => {
  for (let i = 1; i < TOTAL; i++) await next();
  await page.getByRole('heading', { name: /^You.re ready$/ }).waitFor();
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
  await page.getByRole('button', { name: 'Help', exact: true }).click(); await page.getByRole('menuitem', { name: /Take the walkthrough/ }).click();
  await atStep(1);
  await closeTour();
});

test('a section that is missing never crashes it', async () => {
  await page.getByRole('button', { name: 'Help', exact: true }).click(); await page.getByRole('menuitem', { name: /Take the walkthrough/ }).click();
  await atStep(1);
  await page.addStyleTag({ content: '[data-tour="add-files"] { display: none !important; }' });
  for (let i = 1; i < numberOf('library'); i++) await next();
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
  await page.getByRole('button', { name: 'Help', exact: true }).click(); await page.getByRole('menuitem', { name: /Take the walkthrough/ }).click();
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
  await page.getByRole('button', { name: 'Help', exact: true }).click(); await page.getByRole('menuitem', { name: /Take the walkthrough/ }).click();
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
  await page.getByRole('button', { name: 'Help', exact: true }).click(); await page.getByRole('menuitem', { name: /Take the walkthrough/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.getByLabel('Checkpoint title').inputValue(), 'Half written');
  assert.equal(await card().count(), 0);
  await page.getByRole('button', { name: 'Help', exact: true }).click(); await page.getByRole('menuitem', { name: /Take the walkthrough/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave and start walkthrough' }).click();
  await atStep(1);
  await closeTour();
});

test('the ring fits the control it points at, in the control\'s own shape', async () => {
  await open('snug');
  await card().waitFor();
  for (let i = 1; i < numberOf('add'); i++) await next();
  await settle();
  const plus = await page.evaluate(() => {
    const box = document.querySelector('[data-testid=tour-box]');
    const b = box.getBoundingClientRect();
    const button = document.querySelector('[data-tour=smart-add]').getBoundingClientRect();
    return { extraW: b.width - button.width, extraH: b.height - button.height, radius: parseFloat(box.style.borderRadius), height: b.height };
  });
  assert.ok(plus.extraW <= 14 && plus.extraH <= 14, `the + ring is snug (${plus.extraW} by ${plus.extraH} px around it)`);
  assert.ok(plus.radius >= plus.height / 2 - 1, 'a round button gets a round ring');
  assert.equal(await page.locator('#tour-title').textContent(), 'Create or Add Something');
  assert.match(await page.locator('#tour-body').textContent(), /^Use the \+ button to add study materials/);
  for (let i = numberOf('add'); i < numberOf('planner'); i++) await next();
  await settle();
  const planner = await page.evaluate(() => {
    const b = document.querySelector('[data-testid=tour-box]').getBoundingClientRect();
    const button = document.querySelector('[data-tour=add-planner] button').getBoundingClientRect();
    return { extraW: b.width - button.width };
  });
  assert.ok(planner.extraW <= 14, 'a full-width row with one button gets a ring around the button, not the row');
  await closeTour();
});

test('on a phone turned sideways, the explanation sits beside the part instead of over it', async () => {
  await open('landscape', { viewport: { width: 844, height: 390 }, mobile: true });
  await card().waitFor();
  for (let i = 1; i <= TOTAL; i++) {
    await settle();
    const fit = await page.evaluate(() => {
      const c = document.querySelector('[data-testid=tour-card]').getBoundingClientRect();
      const box = document.querySelector('[data-testid=tour-box]')?.getBoundingClientRect();
      const actions = document.querySelector('.tour-actions').getBoundingClientRect();
      const overlap = box ? Math.max(0, Math.min(c.right, box.right) - Math.max(c.left, box.left)) * Math.max(0, Math.min(c.bottom, box.bottom) - Math.max(c.top, box.top)) / (box.width * box.height) : 0;
      return { onScreen: c.top >= 0 && c.bottom <= innerHeight && c.left >= 0 && c.right <= innerWidth, overlap, buttons: actions.bottom <= c.bottom + 1 && actions.top >= c.top };
    });
    assert.ok(fit.onScreen, `step ${i}: the explanation is on screen`);
    assert.ok(fit.buttons, `step ${i}: Next and Back stay visible`);
    assert.ok(fit.overlap < 0.05, `step ${i}: the explanation covers ${Math.round(fit.overlap * 100)}% of the part`);
    if (i < TOTAL) await next();
  }
  await press('Finish');
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
  await page.getByRole('button', { name: 'Help', exact: true }).click(); await page.getByRole('menuitem', { name: /Take the walkthrough/ }).click();
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
  await page.getByRole('button', { name: 'Help', exact: true }).click(); await page.getByRole('menuitem', { name: /Take the walkthrough/ }).click();
  await atStep(1);
  for (let i = 1; i < numberOf('courses'); i++) await next();
  assert.equal(await card().getAttribute('data-step'), 'courses');
  await page.getByTestId('tour-done').waitFor();
  assert.equal(await page.getByTestId('tour-try').count(), 0);
  assert.equal(await card().getByRole('button', { name: 'Next', exact: true }).isDisabled(), false);
  await closeTour();
});

test('one tap on Create course always works, even if it lands on the dimmed area while the page moves', async () => {
  for (const [viewport, mobile] of [[{ width: 1280, height: 800 }, false], [{ width: 390, height: 844 }, true]]) {
    await open(`one-tap-${mobile ? 'phone' : 'desk'}`, { viewport, mobile });
    for (let i = 1; i < numberOf('courses'); i++) await next();
    await page.getByTestId('tour-try').waitFor();
    await page.getByLabel('Course name').fill('One tap class');
    const button = page.getByRole('button', { name: 'Create course' });
    const box = await button.boundingBox();
    // The tap arrives on the dimmed area, as it can on a phone while the keyboard closes.
    await page.evaluate(({ x, y }) => {
      document.querySelector('[data-testid=tour-blocker]').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await page.getByTestId('tour-done').waitFor({ timeout: 5000 });
    // A tap on the dimmed area away from the highlighted part still does nothing.
    await page.evaluate(() => document.querySelector('[data-testid=tour-blocker]').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 })));
    const courses = await page.evaluate(async () => {
      const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n.startsWith('study-forge'));
      return new Promise((done) => { const r = indexedDB.open(name); r.onsuccess = () => { const q = r.result.transaction('courses').objectStore('courses').getAll(); q.onsuccess = () => done(q.result.filter((c) => c.name === 'One tap class').length); }; });
    });
    assert.equal(courses, 1, 'exactly one course, no duplicates');
  }
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});

test('Study Forge Academy explains every feature in the same order of questions, and can be searched', async () => {
  await open('academy', { auto: false });
  await page.goto(`${URL_BASE}#/settings`);
  await page.getByRole('link', { name: 'Study Forge Academy' }).click();
  await page.getByRole('heading', { name: 'Study Forge Academy', level: 1 }).waitFor();
  // Lessons come first; the full details are one tap away in the reference guide.
  await page.getByRole('link', { name: 'Open the reference guide' }).click();
  await page.getByRole('heading', { name: 'Academy reference guide', level: 1 }).waitFor();
  const topics = page.locator('.academy-topic');
  assert.ok(await topics.count() >= 15, 'every major feature has a section');
  for (const title of ['Getting started', 'Research links, portals and online textbooks', 'Files and reading them inside Study Forge', 'Study Forge Calendar', 'Assignments, grades and priorities', 'The calculator', 'Adding, organizing, Undo and Trash', 'Permissions and notifications']) {
    const section = page.locator('.academy-topic', { has: page.getByRole('heading', { name: title, exact: true }) });
    const text = await section.innerText();
    for (const part of ['What it does.', 'Why it helps.', 'Where to find it.', 'How to use it', 'What you’ll see.', 'Good to know', 'Works with.']) assert.ok(text.includes(part), `${title}: ${part}`);
  }
  // Honest about limits, and never the old wording.
  const all = await page.getByTestId('academy').innerText();
  assert.match(all, /Save Link is not the same as Preview or Import/);
  assert.match(all, /not an officially approved examination calculator/);
  assert.match(all, /older \.doc, \.xls and \.ppt/);
  assert.doesNotMatch(all, /gray calendar/i);
  await page.getByLabel('Search the Academy').fill('intersect');
  assert.equal(await topics.count(), 1);
  assert.match(await topics.first().innerText(), /The calculator/);
  await page.getByLabel('Search the Academy').fill('zzzz nothing');
  await page.getByText('Nothing in the Academy matches that').waitFor();
  await page.getByLabel('Search the Academy').fill('');
  await page.getByRole('link', { name: '← Academy lessons' }).click();
  await page.getByRole('button', { name: 'Take the short walkthrough' }).click();
  await card().waitFor();
  await closeTour();
});

test('the ? button offers both kinds of help: the quick walkthrough or the Academy', async () => {
  await open('help-menu', { auto: false });
  await page.goto(`${URL_BASE}#/notes`);
  const help = page.getByRole('button', { name: 'Help', exact: true });
  await help.click();
  const menu = page.getByRole('menu', { name: 'Help' });
  assert.deepEqual((await menu.getByRole('menuitem').allInnerTexts()).map((t) => t.split('\n')[0]), ['Take the walkthrough', 'Study Forge Academy']);
  assert.equal(await help.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await menu.count(), 0, 'Escape closes it');
  await help.click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Study Forge Academy', level: 1 }).waitFor();
  await help.click();
  await page.getByRole('menuitem', { name: /Take the walkthrough/ }).click();
  await card().waitFor();
  await closeTour();
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await help.click();
    const box = await menu.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width, `the menu fits a ${width}px phone`);
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 1280, height: 800 });
});
