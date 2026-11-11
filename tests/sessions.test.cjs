// Prompt 7: study sessions that survive stopping, reloading and changing questions, with honest
// results at the end.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4221;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let work;
const pageErrors = [];

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-sessions-'));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  context = await chromium.launchPersistentContext(path.join(work, 'main'), { viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await returningStudent(context);
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await context?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

const left = async () => Number((await page.getByTestId('practice-left').innerText()).match(/^(\d+) left/)[1]);
const answer = async (option = 'Equity') => {
  await page.getByTestId('practice-question').getByLabel(option).check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await page.getByTestId('practice-feedback').waitFor();
};

test('a set of seven questions is made', async () => {
  await page.goto(`${URL_BASE}#/practice`);
  await page.getByLabel('New practice set').fill('Chapter 1');
  await page.getByRole('button', { name: 'Create set' }).click();
  await page.getByRole('heading', { name: 'Chapter 1' }).waitFor();
  for (let n = 1; n <= 7; n++) {
    await page.getByLabel('Question', { exact: true }).fill(`Question ${n}`);
    await page.getByLabel('Answer choices').fill('Assets\nEquity\nRevenue');
    await page.getByLabel('Correct answer').selectOption({ label: 'Equity' });
    await page.getByLabel('Topic (optional)').fill(n <= 3 ? 'Basics' : 'Equations');
    await page.getByRole('button', { name: 'Add question' }).click();
    await page.getByTestId('question-row').filter({ hasText: `Question ${n}` }).waitFor();
  }
});

test('a long set asks how many, and offers 5 or all', async () => {
  await page.getByRole('link', { name: 'Start practice' }).click();
  const lengths = page.getByTestId('practice-length');
  await lengths.waitFor();
  assert.deepEqual(await lengths.getByRole('button').allInnerTexts(), ['5 questions', 'All 7']);
  await lengths.getByRole('button', { name: '5 questions' }).click();
  await page.getByTestId('practice-question').waitFor();
  assert.equal(await left(), 5);
});

test('answers, a saved question and how hard it felt are kept apart from the score', async () => {
  await page.getByRole('button', { name: 'Save for later' }).click();
  await page.getByRole('button', { name: 'Saved for later ✓' }).waitFor();
  await answer('Equity');
  await page.getByTestId('difficulty').getByLabel('Hard').check();
  // Feeling hard changes nothing about being right.
  assert.equal(await page.getByTestId('practice-feedback').getAttribute('data-result'), 'correct');
  await page.getByRole('button', { name: 'Next question' }).click();
  await answer('Assets');
  await page.getByRole('button', { name: 'Next question' }).click();
  assert.equal(await left(), 3);
});

test('closing and coming back picks up at the same question', async () => {
  await page.reload();
  await page.getByTestId('practice-question').waitFor();
  assert.equal(await left(), 3);
  await page.goto(`${URL_BASE}#/practice`);
  await page.getByTestId('resume-practice').waitFor();
  await page.getByText('Question 3 of 5').waitFor();
  await page.getByTestId('saved-questions').getByText('Saved for later (1)').waitFor();
});

test('a question deleted mid-session is skipped and said so, and the answers so far stay', async () => {
  // Delete one of the questions this session still has to come.
  await page.getByRole('link', { name: 'Chapter 1', exact: true }).click();
  const upcoming = await page.evaluate(async () => {
    const request = indexedDB.open('study-forge');
    const db = await new Promise((resolve) => { request.onsuccess = () => resolve(request.result); });
    const session = await new Promise((resolve) => {
      const get = db.transaction('meta').objectStore('meta').get('practiceSession');
      get.onsuccess = () => resolve(get.result);
    });
    const id = session.questionIds[session.questionIds.length - 1];
    const question = await new Promise((resolve) => {
      const get = db.transaction('practiceQuestions').objectStore('practiceQuestions').get(id);
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return question.prompt;
  });
  await page.getByRole('button', { name: `Delete ${upcoming}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Delete/ }).click();
  await page.getByTestId('question-row').filter({ hasText: upcoming }).waitFor({ state: 'detached' });
  await page.goto(`${URL_BASE}#/practice`);
  await page.getByTestId('resume-practice').click();
  await page.getByText(/1 question in this session was removed since/).waitFor();
  assert.equal(await left(), 2);
});

test('finishing early shows what really happened, and says it is not mastery', async () => {
  await answer('Equity');
  await page.getByRole('button', { name: 'Finish now' }).click();
  const summary = page.getByTestId('practice-summary');
  await summary.waitFor();
  const text = (await summary.innerText()).replace(/\s+/g, ' ');
  assert.match(text, /Answered 3 \(1 not reached\)/);
  assert.match(text, /2 correct, 0 partly right, 1 wrong/);
  assert.match(text, /How it felt 0 easy, 0 medium, 1 hard/);
  assert.match(text, /Topics/);
  assert.match(text, /Saved for later 1/);
  await page.getByText('1 question was removed after this session began').waitFor();
  await page.getByText(/This counts answers, not mastery/).waitFor();
  // A stopped session is finished: there's nothing to pick up any more.
  await page.getByRole('link', { name: 'Done' }).click();
  await page.goto(`${URL_BASE}#/practice`);
  await page.getByTestId('saved-questions').waitFor();
  assert.equal(await page.getByTestId('resume-practice').count(), 0);
});

test('saved questions can be practised on their own, from their original set', async () => {
  await page.getByTestId('saved-questions').click();
  await page.getByTestId('practice-question').waitFor();
  assert.equal(await left(), 1);
  await page.getByRole('button', { name: 'Saved for later ✓' }).waitFor();
});

test('a flashcard review left part-way picks up where it stopped', async () => {
  await page.goto(`${URL_BASE}#/cards`);
  await page.getByLabel('New deck').fill('Terms');
  await page.getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('heading', { name: 'Terms' }).waitFor();
  for (const [front, back] of [['Asset', 'Something owned'], ['Liability', 'Something owed'], ['Equity', 'What is left']]) {
    await page.getByLabel('Front', { exact: true }).fill(front);
    await page.getByLabel('Back', { exact: true }).fill(back);
    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByTestId('card-row').filter({ hasText: front }).waitFor();
  }
  await page.getByRole('link', { name: 'Practice all', exact: true }).click();
  await page.getByTestId('flashcard').waitFor();
  const first = await page.getByTestId('card-front').innerText();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByRole('button', { name: /^Good/ }).click();
  const second = await page.getByTestId('card-front').innerText();
  assert.notEqual(first, second);
  await page.reload();
  await page.getByTestId('flashcard').waitFor();
  assert.equal(await page.getByTestId('card-front').innerText(), second, 'the review started over');
});

test('practice works on a phone', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${URL_BASE}#/practice/session?mode=saved`);
  await page.getByTestId('practice-question').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
