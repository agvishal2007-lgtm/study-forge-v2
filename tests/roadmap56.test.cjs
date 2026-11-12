// Roadmap 5 and 6: assignment steps and study suggestions.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const URL_BASE = 'http://localhost:4229/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-roadmap56-'));
let server;
let browser;
let context;
let page;
const pageErrors = [];

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4229', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await returningStudent(context);
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
});

after(async () => {
  await context?.close();
  await browser?.close();
  try { if (server) process.kill(-server.pid); } catch { /* stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('step rules: suggested steps, even target dates, and the due date is never touched', async () => {
  const { addSuggested, addStep, spreadTargets, stepProgress, describeProgress, cleanSteps, moveStep, SUGGESTED_STEPS } = await import('../src/data/stepRules.ts');
  let n = 0;
  const id = () => `s${n++}`;
  let steps = addSuggested(addStep([], 'Research', 'mine'), id);
  assert.deepEqual(steps.map((s) => s.title), ['Research', ...SUGGESTED_STEPS.filter((t) => t !== 'Research')], 'no duplicate of a step already there');
  assert.equal(addSuggested(steps, id).length, steps.length, 'adding twice adds nothing');
  assert.equal(spreadTargets(steps, '2026-11-12', '').problem, 'Add a due date first, then target dates can be suggested.');
  assert.match(spreadTargets(steps, '2026-11-12', '2026-11-01').problem, /passed/);
  steps = steps.map((s, i) => (i === 0 ? { ...s, done: true } : s));
  const spread = spreadTargets(steps, '2026-11-12', '2026-11-22');
  assert.equal(spread.problem, '');
  assert.equal(spread.steps[0].targetDate, '', 'a finished step gets no target');
  const dates = spread.steps.slice(1).map((s) => s.targetDate);
  assert.deepEqual(dates, ['2026-11-14', '2026-11-16', '2026-11-18', '2026-11-20', '2026-11-22']);
  assert.ok(dates.every((d) => d <= '2026-11-22'), 'no target after the due date');
  const progress = stepProgress(spread.steps, '2026-11-15');
  assert.deepEqual([progress.done, progress.total, progress.next.title, progress.lateTargets], [1, 6, 'Choose a topic', 1]);
  assert.equal(describeProgress(progress, (d) => d), '1 of 6 steps done. Next: Choose a topic (target 2026-11-14)');
  assert.equal(stepProgress([], '2026-11-15'), null);
  assert.deepEqual(moveStep(spread.steps, 'mine', -1), spread.steps, 'the first step cannot move up');
  assert.deepEqual(cleanSteps([{ id: 'a', title: ' A ', done: 'yes', targetDate: 'soon' }, { id: 'a', title: 'dup' }, { title: 'no id' }, null]), [{ id: 'a', title: 'A', done: false, targetDate: '' }]);
});

test('an assignment breaks into steps on its page and shows progress in the Planner, with the due date unchanged', async () => {
  await page.goto(`${URL_BASE}#/planner/new`);
  await page.getByLabel('Name').fill('History essay');
  await page.getByLabel('Due date').fill('2030-05-20');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('link', { name: 'History essay' }).click();
  const steps = page.getByTestId('assignment-steps');
  await steps.getByRole('button', { name: 'Add suggested steps' }).click();
  await steps.getByText('Choose a topic', { exact: true }).waitFor();
  await steps.getByLabel('Add a step').fill('Ask about sources');
  await steps.getByRole('button', { name: 'Add step' }).click();
  await steps.getByText('Ask about sources', { exact: true }).waitFor();
  await steps.getByRole('button', { name: 'Move Ask about sources up' }).click();
  await steps.getByRole('button', { name: 'Suggest target dates' }).click();
  await steps.getByTestId('steps-message').filter({ hasText: 'the due date didn’t change' }).waitFor();
  await page.waitForFunction(() => document.querySelector('[aria-label="Target date for Submit"]')?.value === '2030-05-20', null, { timeout: 5000 });
  await steps.getByLabel('Choose a topic', { exact: true }).check();
  await steps.getByTestId('step-progress').filter({ hasText: '1 of 7 steps done. Next: Research' }).waitFor();
  await steps.getByRole('button', { name: 'Remove step Ask about sources' }).click();
  await steps.getByTestId('step-progress').filter({ hasText: '1 of 6' }).waitFor();
  assert.equal(await page.getByLabel('Due date').inputValue(), '2030-05-20');
  // Editing the item's other fields keeps its steps.
  await page.getByLabel('Name').fill('History essay final');
  await page.getByRole('button', { name: 'Save item' }).click();
  const row = page.getByTestId('planner-row').filter({ hasText: 'History essay final' });
  await row.getByTestId('row-steps').filter({ hasText: '1 of 6 steps done. Next: Research' }).waitFor();
  // Finishing every step offers to complete the item; it doesn't do it by itself.
  await row.getByRole('link', { name: 'History essay final' }).click();
  for (const name of ['Research', 'Outline', 'Draft', 'Revise', 'Submit']) {
    await page.getByTestId('assignment-steps').getByLabel(name, { exact: true }).check();
  }
  await page.getByTestId('steps-all-done').waitFor();
  assert.equal(await page.getByLabel('Status').inputValue(), 'Not Started', 'still not completed until the student says so');
  await page.getByRole('button', { name: 'Mark the item Completed' }).click();
  await page.getByTestId('steps-message').filter({ hasText: 'Marked as Completed.' }).waitFor();
  assert.deepEqual(pageErrors, []);
});

test('steps fit a phone', async () => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.reload();
  await page.getByTestId('assignment-steps').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scrolling');
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('suggestion rules: explain why, never repeat Start studying, honour hiding, and claim no mastery', async () => {
  const { allSuggestions, pickSuggestions, MAX_SUGGESTIONS } = await import('../src/data/suggestionRules.ts');
  const base = {
    today: '2026-11-12', primaryTo: '/cards/review', pausedPractice: null, pausedReview: null, cardsDue: 4,
    tests: [{ id: 'e1', title: 'Bio exam', dueDate: '2026-11-14' }, { id: 'e2', title: 'Far exam', dueDate: '2026-12-30' }, { id: 'e3', title: 'Past quiz', dueDate: '2026-11-01' }],
    hasPracticeQuestions: true, savedQuestions: 2, mistakes: 3, weakTopic: { label: 'Cells', answered: 5, percent: 40 },
    lessonsToReview: 1, nextCheckpoint: { id: 'c1', title: 'Mitosis' },
    steps: [{ itemId: 'p1', itemTitle: 'Essay', stepId: 's1', stepTitle: 'Outline', targetDate: '2026-11-10' }, { itemId: 'p2', itemTitle: 'Lab', stepId: 's2', stepTitle: 'Data', targetDate: '2026-11-20' }],
    dismissed: new Set(),
  };
  const all = allSuggestions(base);
  assert.deepEqual(all.map((s) => s.label).slice(0, 3), ['Outline for Essay', 'Practise for Bio exam', 'Review 4 flashcards'], 'time-sensitive first');
  assert.ok(!all.some((s) => /Far exam|Past quiz|Data for Lab/.test(s.label)), 'only tests within a week, and step targets that have arrived');
  assert.match(all[0].reason, /due date is unchanged/);
  assert.equal(all.find((s) => s.label === 'Practise for Bio exam').reason, 'It is in 2 days, by your Planner.');
  assert.ok(all.every((s) => s.reason && !/master|weak|struggl|know|understand/i.test(s.reason + s.label)), 'reasons report records, not judgements');
  const picked = pickSuggestions(base);
  assert.equal(picked.shown.length, MAX_SUGGESTIONS);
  assert.ok(!picked.shown.some((s) => s.to === '/cards/review'), 'Start studying is not repeated');
  const hiding = pickSuggestions({ ...base, dismissed: new Set([picked.shown[0].id]) });
  assert.equal(hiding.hidden, 1);
  assert.ok(!hiding.shown.some((s) => s.id === picked.shown[0].id));
  const quiet = pickSuggestions({ ...base, cardsDue: 0, tests: [], savedQuestions: 0, mistakes: 0, weakTopic: null, lessonsToReview: 0, nextCheckpoint: null, steps: [] });
  assert.deepEqual(quiet, { shown: [], hidden: 0 });
});

test('Today shows suggestions with reasons beside Start studying, and one can be hidden for today', async () => {
  await page.goto(`${URL_BASE}#/planner/new`);
  await page.getByLabel('Name').fill('Chem quiz');
  await page.getByLabel('Type').selectOption('Quiz');
  const soon = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 2); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await page.getByLabel('Due date').fill(soon);
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('link', { name: 'Chem quiz' }).waitFor();
  await page.goto(`${URL_BASE}#/planner/new`);
  await page.getByLabel('Name').fill('Lab report');
  await page.getByLabel('Due date').fill('2030-06-01');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.getByRole('link', { name: 'Lab report' }).click();
  await page.getByTestId('assignment-steps').getByLabel('Add a step').fill('Collect data');
  await page.getByRole('button', { name: 'Add step' }).click();
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await page.getByLabel('Target date for Collect data').fill(today);
  await page.getByTestId('step-progress').waitFor();
  await page.goto(`${URL_BASE}#/`);
  const box = page.getByTestId('study-suggestions');
  await box.waitFor();
  const start = await page.getByTestId('start-studying').getByRole('link').getAttribute('href');
  const rows = box.getByTestId('suggestion');
  const texts = await rows.allInnerTexts();
  assert.ok(texts.length >= 1);
  assert.ok(texts.every((text) => text.includes('Why:')), 'every suggestion says why');
  const hrefs = await rows.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  assert.ok(!hrefs.includes(start), 'nothing repeats Start studying');
  assert.ok(texts.some((text) => text.includes('Collect data for Lab report')) || start.includes('Lab'), 'a step whose target is today is suggested');
  await assert.doesNotReject(box.getByText('No AI is used.', { exact: false }).waitFor());
  const first = (await rows.first().getByRole('link').innerText()).trim();
  await rows.first().getByRole('button', { name: /^Hide .* for today$/ }).click();
  await box.getByText('1 hidden for today.', { exact: false }).waitFor();
  await page.reload();
  await page.getByTestId('study-suggestions').getByText('1 hidden for today.', { exact: false }).waitFor();
  assert.ok(!(await page.getByTestId('study-suggestions').getByTestId('suggestion').allInnerTexts()).some((text) => text.startsWith(first)), 'stays hidden after a reload');
  await page.getByTestId('study-suggestions').getByRole('button', { name: 'Show them' }).click();
  await page.getByTestId('study-suggestions').getByRole('link', { name: first }).waitFor();
  assert.deepEqual(pageErrors, []);
});
