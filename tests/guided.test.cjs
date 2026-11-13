// Guided Study acceptance tests, in a real browser, following the spec's rules.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const URL_BASE = 'http://localhost:4178/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-guided-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
const NO_PICKER = 'delete window.showSaveFilePicker;';
let server;
let context;
let page;
const pageErrors = [];
let backupFile;

async function open(profile = 'main') {
  await context?.close().catch(() => undefined);
  context = await chromium.launchPersistentContext(path.join(work, profile), { acceptDownloads: true, viewport: { width: 1280, height: 800 } });
  await returningStudent(context);
  await context.addInitScript(NO_PICKER);
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
}
const nav = (name) => page.getByRole('navigation', { name: name === 'Settings' ? 'Account' : 'Main' }).getByRole('link', { name, exact: true }).click();
const submit = () => page.getByRole('button', { name: 'Submit answer' });
const proceed = (name = 'Continue') => page.getByRole('button', { name, exact: true }).click();
const question = () => page.getByTestId('question');
const attempt = () => question().getAttribute('data-attempt');
const choose = (text) => page.getByRole('radio', { name: text, exact: true }).check();
const lessonProgress = () => page.getByTestId('lesson-progress').textContent();
const courseProgress = () => page.getByTestId('course-progress').textContent();
const statusText = () => page.getByTestId('status').textContent();

/** Moves one teaching step forward and waits for it to appear. Returns false on the last step. */
async function nextStep() {
  const text = await page.locator('.step-count').textContent();
  const [, current, total] = text.match(/step (\d+) of (\d+)/);
  if (current === total) return false;
  await proceed();
  await page.locator('.step-count', { hasText: `step ${Number(current) + 1} of ${total}` }).waitFor();
  return true;
}
async function throughTeaching() {
  await page.getByTestId('teaching').waitFor();
  while (await nextStep());
  await proceed('Start practice');
}
async function answerChoice(text) {
  await question().waitFor();
  await choose(text);
  await submit().click();
  await page.getByTestId('feedback').waitFor();
}
async function explain(ratings) {
  await page.getByLabel('Your explanation').fill('In my own words with imperfect grammer');
  await page.getByRole('button', { name: 'Check my explanation' }).click();
  const points = page.locator('.key-point');
  await points.first().waitFor();
  const count = await points.count();
  for (let i = 0; i < count; i++) await points.nth(i).getByRole('radio', { name: ratings[i] ?? ratings[0] }).check();
  await proceed('Finish check');
}

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4178', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await open();
});

after(async () => {
  await context?.close().catch(() => undefined);
  if (server) process.kill(-server.pid);
  fs.rmSync(work, { recursive: true, force: true });
});

test('a new topic teaches first, in simple steps, and shows no question', async () => {
  await nav('Study');
  await page.getByRole('button', { name: 'Add sample lesson' }).click();
  await page.getByRole('link', { name: 'The accounting equation', exact: true }).click();
  await page.getByTestId('teaching').waitFor();
  assert.equal(await question().count(), 0);
  assert.equal(await page.getByRole('radio').count(), 0);
  assert.match(await statusText(), /Not started/);
  await page.screenshot({ path: path.join(shots, 'guided-teach.png') });
  await proceed();
  await page.getByRole('heading', { name: 'What it means' }).waitFor();
  assert.match(await statusText(), /Learning/);
  await proceed('Back');
  await page.getByRole('heading', { name: 'The accounting equation' }).waitFor();
  const steps = [];
  do steps.push(await page.locator('.session-card h2').textContent()); while (await nextStep());
  assert.deepEqual(steps, ['The accounting equation', 'What it means', 'Why it matters', 'The parts', 'A realistic example', 'Walk through it', 'The most important idea']);
});

test('clicking through teaching earns nothing', async () => {
  assert.match(await lessonProgress(), /0\/2 checkpoints mastered/);
  assert.match(await courseProgress(), /0\/1 lessons completed/);
  await proceed('Start practice');
  await question().waitFor();
  assert.match(await lessonProgress(), /0\/2 checkpoints mastered/);
});

test('one question at a time, nothing preselected, nothing revealed, no auto-submit', async () => {
  assert.equal(await question().count(), 1);
  assert.equal(await page.getByRole('radio').count(), 4);
  assert.equal(await page.getByRole('radio', { checked: true }).count(), 0);
  assert.equal(await submit().isDisabled(), true);
  const html = await page.content();
  assert.ok(!html.includes('A liability is something the business owes'), 'the explanation must not be in the page yet');
  assert.ok(!/data-correct/.test(html), 'nothing marks the right answer');
  await page.screenshot({ path: path.join(shots, 'guided-question.png') });
  await choose('A loan the business must repay');
  await page.waitForTimeout(300);
  await question().waitFor();
  assert.equal(await page.getByTestId('feedback').count(), 0, 'choosing alone must not submit');
  assert.equal(await submit().isDisabled(), false);
});

test('submitting shows feedback, and the next question starts with nothing selected', async () => {
  await submit().click();
  await page.getByTestId('feedback').waitFor();
  await page.getByText("That's right.").waitFor();
  await page.getByText('A liability is something the business owes').waitFor();
  assert.match(await page.getByTestId('answer-counts').textContent(), /1 answered: 1 right, 0 wrong/);
  await proceed();
  await question().waitFor();
  assert.equal(await page.getByRole('radio', { checked: true }).count(), 0);
  assert.equal(await submit().isDisabled(), true);
  await page.getByText('What is equity?').waitFor();
});

test('reloading mid-question keeps the same question and counts nothing twice', async () => {
  const before = await attempt();
  await page.reload();
  await question().waitFor();
  assert.equal(await attempt(), before);
  assert.equal(await page.getByRole('radio', { checked: true }).count(), 0);
  assert.match(await page.getByTestId('answer-counts').textContent(), /1 answered/);
  await page.getByRole('radio', { name: '$6,000', exact: true }).check();
  await submit().dblclick();
  await page.getByTestId('feedback').waitFor();
  await page.waitForTimeout(200);
  assert.match(await page.getByTestId('answer-counts').textContent(), /2 answered: 2 right/);
  await page.reload();
  await page.getByTestId('feedback').waitFor();
  assert.match(await page.getByTestId('answer-counts').textContent(), /2 answered: 2 right/);
  await proceed();
});

test('a typed answer keeps its draft through a reload, and an exact match grades itself', async () => {
  await page.getByLabel('Your answer').waitFor();
  assert.equal(await submit().isDisabled(), true);
  await page.getByLabel('Your answer').fill('$12,0');
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByLabel('Your answer').waitFor();
  assert.equal(await page.getByLabel('Your answer').inputValue(), '$12,0');
  assert.match(await page.getByTestId('answer-counts').textContent(), /2 answered/, 'a draft is not an answer');
  await page.getByLabel('Your answer').fill('$12,000');
  await submit().click();
  await page.getByText("That's right.").waitFor();
  assert.match(await page.getByTestId('answer-counts').textContent(), /3 answered: 3 right/);
  await proceed();
});

test('a miss reteaches with a different example, then gives a new question', async () => {
  const missed = await attempt();
  await answerChoice('Assets go up by $500');
  await page.getByText('Not quite.').waitFor();
  await page.getByText('Cash goes down by $500').waitFor();
  await proceed();
  await page.getByTestId('reteach').waitFor();
  await page.getByText('A different example:').waitFor();
  await page.getByText('Using $50 of cash to buy textbooks').waitFor();
  await page.screenshot({ path: path.join(shots, 'guided-reteach.png') });
  await proceed('Try another question');
  await question().waitFor();
  assert.notEqual(await attempt(), missed);
  await page.getByText('buys a $1,000 mixer on credit').waitFor();
  assert.equal(await page.getByText('buys a $500 oven').count(), 0, 'not the question just missed');
});

test('missing the same idea twice is Needs Review, with choices and no dead end', async () => {
  await answerChoice('Nothing changes until she pays');
  await proceed();
  await page.getByTestId('stuck').waitFor();
  await page.screenshot({ path: path.join(shots, 'guided-stuck.png') });
  assert.match(await statusText(), /Needs review/);
  assert.match(await lessonProgress(), /0\/2 checkpoints mastered/);
  await page.getByRole('link', { name: 'Move on and return later' }).waitFor();
  await nav('Study');
  await page.getByRole('heading', { name: 'Needs review' }).waitFor();
  await page.getByRole('link', { name: 'The accounting equation', exact: true }).first().click();
  await page.getByTestId('stuck').waitFor();
  await proceed('Try another example');
  await page.getByTestId('reteach').waitFor();
  await proceed('Try another question');
  await question().waitFor();
});

test('recovering works, and right answers alone do not produce mastery', async () => {
  // Earlier right answers were kept: only the missed questions come back.
  await page.getByText('buys a $').waitFor();
  const text = await question().textContent();
  await answerChoice(text.includes('oven') ? 'One asset goes down and another goes up, so total assets stay the same' : 'Assets and liabilities both go up by $1,000');
  await proceed();
  await page.waitForTimeout(100);
  if (await question().count()) {
    const second = await question().textContent();
    await answerChoice(second.includes('oven') ? 'One asset goes down and another goes up, so total assets stay the same' : 'Assets and liabilities both go up by $1,000');
    await proceed();
  }
  await page.getByLabel('Your explanation').waitFor();
  assert.notEqual(await page.getByTestId('mastered').count(), 1);
  assert.doesNotMatch(await statusText(), /Mastered/);
  assert.match(await lessonProgress(), /0\/2 checkpoints mastered/);
});

test('a weak explanation shows what is missing and allows another try', async () => {
  assert.equal(await page.getByRole('button', { name: 'Check my explanation' }).isDisabled(), true);
  await explain(['I included this', 'Partly', 'I missed this']);
  await page.getByTestId('explain-result').waitFor();
  await page.getByRole('heading', { name: 'Almost there' }).waitFor();
  await page.getByText('Assets always equal liabilities plus equity').waitFor();
  await page.screenshot({ path: path.join(shots, 'guided-explain.png') });
  assert.match(await lessonProgress(), /0\/2 checkpoints mastered/);
  await proceed('Try explaining again');
});

test('full evidence earns mastery, counts rise, and the next checkpoint teaches first', async () => {
  await explain(['I included this']);
  await page.getByTestId('mastered').waitFor();
  await page.screenshot({ path: path.join(shots, 'guided-mastered.png') });
  await page.getByText('You checked your explanation yourself').waitFor();
  assert.match(await lessonProgress(), /1\/2 checkpoints mastered/);
  assert.match(await courseProgress(), /0\/1 lessons completed/, 'a partly finished lesson does not count');
  await proceed('Next checkpoint');
  await page.getByTestId('teaching').waitFor();
  await page.getByRole('heading', { name: 'Cash basis and accrual basis' }).waitFor();
  assert.equal(await question().count(), 0);
});

test('"I already know this" is shorter but still requires evidence', async () => {
  await proceed('I already know this');
  await question().waitFor();
  assert.match(await lessonProgress(), /1\/2 checkpoints mastered/);
  await context.setOffline(true); // The rest of this session runs with no internet.
  await answerChoice('When the customer pays');
  await proceed();
  await answerChoice("When it's incurred, even if it isn't paid yet");
  await proceed();
  await answerChoice('May');
  await proceed();
  await answerChoice('January');
  await proceed();
  await explain(['I included this']);
  await page.getByTestId('mastered').waitFor();
  await context.setOffline(false);
  assert.match(await lessonProgress(), /2\/2 checkpoints mastered/);
  assert.match(await courseProgress(), /1\/1 lessons completed/);
});

test('progress survives closing the browser', async () => {
  await open();
  await nav('Study');
  await page.getByText('1 of 1 lesson completed').waitFor();
  await page.getByText('2 of 2 checkpoints mastered').waitFor();
  await page.screenshot({ path: path.join(shots, 'guided-study.png'), fullPage: true });
});

test('students can write a lesson using chapters, with clear checks before saving', async () => {
  await page.getByLabel('Lesson title').fill('Chapter 3: Depreciation');
  await page.getByLabel('Called a').selectOption('Chapter');
  await page.getByRole('button', { name: 'Create lesson' }).click();
  await page.getByRole('heading', { name: 'Chapter 3: Depreciation' }).waitFor();
  await page.getByRole('button', { name: 'Add checkpoint' }).click();
  await page.getByRole('heading', { name: 'New checkpoint' }).waitFor();
  await page.getByRole('button', { name: 'Save checkpoint' }).click();
  await page.getByTestId('editor-problems').getByText('Enter a checkpoint title').waitFor();
  await page.getByTestId('editor-problems').getByText('Question 1 needs a question').waitFor();
  await page.getByLabel('Checkpoint title').fill('Unfinished idea');
  await page.getByRole('button', { name: 'Remove question 1' }).click();
  await page.getByRole('button', { name: 'Save checkpoint' }).click();
  await page.getByRole('link', { name: 'Unfinished idea', exact: true }).click();
  await page.getByTestId('not-ready').waitFor();
  assert.equal(await question().count(), 0, 'never quiz on something untaught');
  await page.getByRole('link', { name: "Add what's missing" }).click();

  await page.getByLabel('The most important idea').fill('Depreciation spreads a cost over time.');
  await page.getByLabel('What it means, in simple words').fill('Depreciation spreads the cost of equipment across its useful life.');
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.locator('.editor-question select').first().selectOption('short');
  await page.getByLabel('Question', { exact: true }).fill('Why spread the cost?');
  await page.getByLabel('Why this is the answer').fill('It matches the cost to the years it helps.');
  await page.getByRole('button', { name: 'Save checkpoint' }).click();
  await page.getByTestId('editor-problems').getByText('Question 1 needs a model answer').waitFor();
  await page.getByLabel(/Model answer/).fill('To match the cost to the years it is used.');
  await page.getByLabel(/Key points a good explanation/).fill('It spreads a cost over time.');
  await page.getByRole('button', { name: 'Add question' }).click();
  const second = page.locator('.editor-question').nth(1);
  await second.getByLabel('Question', { exact: true }).fill('A $10,000 van lasts 5 years. How much per year?');
  await second.getByLabel(/Answer choices/).fill('$2,000\n$5,000');
  await page.getByRole('button', { name: 'Save checkpoint' }).click();
  await page.getByTestId('editor-problems').getByText('Question 2 needs the number of its correct choice').waitFor();
  await second.getByLabel(/Which choice is correct/).fill('1');
  await page.getByRole('button', { name: 'Save checkpoint' }).click();
  await page.getByRole('heading', { name: 'Chapter 3: Depreciation' }).waitFor();
});

test('a student-written typed answer is self-checked and labeled that way', async () => {
  await page.getByRole('link', { name: 'Unfinished idea', exact: true }).click();
  await throughTeaching();
  await page.getByLabel('Your answer').fill('so the cost lines up with when its used');
  await submit().click();
  await page.getByTestId('self-check').waitFor();
  await page.getByText('To match the cost to the years it is used.').waitFor();
  assert.equal(await page.getByTestId('answer-counts').count(), 0, 'nothing is counted before the student marks it');
  await proceed('Yes, I got it');
  await page.getByTestId('feedback').getByText('which you checked yourself').waitFor();
  await page.reload();
  await page.getByTestId('feedback').waitFor();
  await proceed();
  await answerChoice('$2,000');
  await proceed();
  await explain(['I included this']);
  await page.getByTestId('mastered').waitFor();
  await page.getByRole('link', { name: 'Back to lesson' }).click();
  assert.match(await page.getByTestId('lesson-count').textContent(), /1 of 1 checkpoints mastered\. Lesson completed/);
});

test('starting over clears only progress, and deleting asks first', async () => {
  await page.getByRole('button', { name: 'Start Unfinished idea over' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  assert.match(await page.getByTestId('lesson-count').textContent(), /1 of 1/);
  await page.getByRole('button', { name: 'Start Unfinished idea over' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear my progress' }).click();
  await page.locator('[data-testid=lesson-count]', { hasText: '0 of 1' }).waitFor();
  await page.getByRole('link', { name: 'Unfinished idea', exact: true }).waitFor();
  await page.getByText('2 practice questions').waitFor();
  await page.getByRole('button', { name: 'Delete Unfinished idea' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('link', { name: 'Unfinished idea', exact: true }).waitFor();
});

test('Today recommends what to study next, with the reason', async () => {
  await nav('Today');
  await page.getByTestId('next-up').getByRole('link', { name: 'Unfinished idea', exact: true }).waitFor();
  await page.getByTestId('next-up').getByText('This is next in order').waitFor();
  await page.screenshot({ path: path.join(shots, 'today-next.png') });
});

test('a failed save says so and loses nothing', async () => {
  await page.getByTestId('next-up').getByRole('link', { name: 'Unfinished idea', exact: true }).click();
  await page.getByTestId('teaching').waitFor();
  await page.evaluate(() => {
    window.__put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = () => { throw new DOMException('disk trouble', 'UnknownError'); };
  });
  await page.getByRole('button', { name: /Start practice|Continue/ }).first().click();
  await page.getByRole('alert').getByText("That wasn't saved").waitFor();
  await page.getByTestId('teaching').waitFor();
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.__put; });
  await page.getByRole('button', { name: /Start practice|Continue/ }).first().click();
  await page.getByRole('alert').waitFor({ state: 'detached' });
});

test('backup restores lessons and progress into a fresh browser', async () => {
  await nav('Settings');
  await page.getByTestId('backup-summary').getByText('2 lessons').waitFor();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create backup' }).click()]);
  await page.getByTestId('backup-result').waitFor();
  backupFile = path.join(work, 'backup.zip');
  await file.saveAs(backupFile);
  await open('fresh');
  await nav('Settings');
  await page.getByTestId('restore-input').setInputFiles(backupFile);
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await page.getByTestId('restore-report').getByText('2 lessons').waitFor();
  await nav('Study');
  await page.getByText('2 of 2 checkpoints mastered').waitFor();
  await page.getByRole('link', { name: 'Lesson 1: How accounting keeps score' }).click();
  await page.locator('[data-testid=lesson-count]', { hasText: 'Lesson completed' }).waitFor();
  await page.getByRole('link', { name: 'Cash basis and accrual basis', exact: true }).click();
  await page.getByTestId('mastered').waitFor();
  await nav('Settings');
  await page.getByTestId('restore-input').setInputFiles(backupFile);
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await page.getByTestId('restore-report').getByText('0 lessons').waitFor();
});

test('deleting a lesson asks first, and deleting a course keeps its lessons', async () => {
  await nav('Courses');
  await page.getByRole('link', { name: /Sample: Accounting Basics/ }).click();
  await page.getByRole('button', { name: 'Move to Trash' }).click();
  await page.getByRole('heading', { name: 'Courses', exact: true }).waitFor();
  await page.goto(`${URL_BASE}#/trash`);
  await page.getByTestId('trash-list').waitFor();
  await page.getByRole('button', { name: /^Permanently delete / }).first().click();
  await page.getByRole('dialog').getByText('any lessons stay in Study').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Permanently delete' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Trash is empty'));
  await nav('Study');
  await page.getByRole('heading', { name: 'No course' }).waitFor();
  await page.getByRole('link', { name: 'Lesson 1: How accounting keeps score' }).click();
  await page.getByRole('button', { name: 'Delete lesson' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete lesson' }).click();
  await page.getByRole('heading', { name: 'Study', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Lesson 1: How accounting keeps score' }).count(), 0);
});

test('phone layout works with all seven destinations, including during study', async () => {
  await page.setViewportSize({ width: 360, height: 700 });
  const overflow = () => page.evaluate(() => {
    const main = document.querySelector('main');
    const nav = document.querySelector('nav');
    return Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth, nav.scrollWidth - nav.clientWidth);
  });
  for (const name of ['Today', 'Courses', 'Library', 'Study', 'Notes', 'Record', 'Settings']) {
    await nav(name);
    await page.waitForTimeout(100);
    assert.ok((await overflow()) <= 0, `${name} overflows`);
  }
  await nav('Study');
  await page.getByRole('button', { name: 'Add sample lesson' }).click();
  await page.getByRole('link', { name: 'The accounting equation', exact: true }).click();
  await page.getByTestId('teaching').waitFor();
  assert.ok((await overflow()) <= 0);
  await page.screenshot({ path: path.join(shots, 'phone-guided-teach.png') });
  await proceed('I already know this');
  await question().waitFor();
  assert.ok((await overflow()) <= 0);
  await page.screenshot({ path: path.join(shots, 'phone-guided-question.png'), fullPage: true });
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
