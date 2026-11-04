// Exam Hall's rules, then mock exams and Cram Mode in a real browser.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const rules = () => import('../src/data/examRules.ts');

test('picking questions never repeats, and honors the count', async () => {
  const { pickQuestions } = await rules();
  const all = [1, 2, 3, 4, 5];
  assert.deepEqual([...pickQuestions(all, null)].sort(), all);
  assert.equal(pickQuestions(all, 3).length, 3);
  assert.equal(new Set(pickQuestions(all, 3)).size, 3);
  assert.equal(pickQuestions(all, 50).length, 5);
  assert.deepEqual(all, [1, 2, 3, 4, 5], 'the original list is left alone');
});

test('there is no score until written answers are checked', async () => {
  const { examScore, pendingChecks } = await rules();
  assert.equal(examScore([]), null);
  assert.equal(examScore([{ result: 'correct' }, { result: null }]), null);
  assert.equal(pendingChecks([{ result: 'correct' }, { result: null }]), 1);
  assert.equal(examScore([{ result: 'correct' }, { result: 'partial' }, { result: 'wrong' }, { result: 'wrong' }]), 38);
  assert.equal(examScore([{ result: 'wrong' }]), 0);
});

test('improvement needs two scored exams, and unscored ones are left out', async () => {
  const { improvement } = await rules();
  const exam = (finishedAt, result) => ({ finishedAt, items: [{ result }] });
  assert.equal(improvement([exam(1, 'correct')]), null);
  assert.equal(improvement([exam(1, 'correct'), exam(2, null)]), null);
  assert.deepEqual(improvement([exam(5, 'correct'), exam(1, 'wrong'), exam(3, null)]), { first: 0, latest: 100, count: 2 });
});

test('the clock reads plainly', async () => {
  const { formatClock } = await rules();
  assert.equal(formatClock(90_000), '1:30');
  assert.equal(formatClock(500), '0:01');
  assert.equal(formatClock(-5), '0:00');
  assert.equal(formatClock(3_660_000), '1:01:00');
});

test('the checklist follows saved work', async () => {
  const { revisionChecklist } = await rules();
  const blank = revisionChecklist({ total: 0, answered: 0, mistakes: 0, weakTopics: 0, cardsDue: 0, mockExams: 0 });
  assert.deepEqual(blank.map((item) => item.done), [false, false, false, true, false], 'nothing is claimed done without evidence');
  const finished = revisionChecklist({ total: 2, answered: 2, mistakes: 0, weakTopics: 0, cardsDue: 0, mockExams: 1 });
  assert.ok(finished.every((item) => item.done));
  assert.match(revisionChecklist({ total: 3, answered: 1, mistakes: 1, weakTopics: 2, cardsDue: 4, mockExams: 0 })[0].detail, /1 of 3 questions/);
});

test('cram plans fit the time, in priority order, and skip what is empty', async () => {
  const { cramPlan } = await rules();
  const input = { course: '', mistakes: 5, weakTopics: [{ label: 'Accruals', questions: 4 }], definitions: 3, formulas: 2, cardsDue: 10, notes: 2, total: 20 };
  const tomorrow = cramPlan('tomorrow', input);
  assert.deepEqual(tomorrow.steps.map((step) => step.title), ['Fix your mistakes', 'Weak topic: Accruals', 'Key definitions', 'Important formulas', 'Flashcards due', 'Skim your notes', 'Take a timed mock exam']);
  assert.equal(cramPlan('weak', input).steps[0].title, 'Weak topic: Accruals');
  assert.deepEqual(cramPlan('quick', input).steps.map((step) => step.title), ['Key definitions', 'Important formulas', 'Flashcards due']);
  const tight = cramPlan('quick', { ...input, definitions: 8, formulas: 8 });
  assert.ok(tight.minutes <= 20, 'it stays within 20 minutes');
  assert.ok(tight.leftOut >= 1, 'and says what it left out');
  assert.deepEqual(cramPlan('hour', { course: '', mistakes: 0, weakTopics: [], definitions: 0, formulas: 0, cardsDue: 0, notes: 0, total: 0 }).steps, []);
  assert.match(cramPlan('weak', { ...input, course: 'c1' }).steps[0].to, /course=c1/);
  assert.match(cramPlan('hour', { ...input, course: 'c1' }).steps.at(-1).to, /review\?course=c1/);
});

const URL_BASE = 'http://localhost:4187/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-exam-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
let server;
let context;
let page;
let backupFile;
const pageErrors = [];

const nav = (name) => page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
const form = () => page.getByTestId('question-form');
async function addChoice(prompt, topic) {
  await page.getByLabel('Question', { exact: true }).fill(prompt);
  await page.getByLabel('Answer choices').fill('Right\nWrong');
  await page.getByLabel('Correct answer').selectOption({ label: 'Right' });
  await page.getByLabel('Topic (optional)').fill(topic);
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByTestId('question-row').filter({ hasText: prompt }).waitFor();
}
async function addWritten(prompt, kind, topic) {
  await form().locator('select').first().selectOption({ label: kind });
  await page.getByLabel('Question', { exact: true }).fill(prompt);
  await page.getByLabel('Model answer').fill(`Model answer for ${prompt}`);
  await page.getByLabel('Topic (optional)').fill(topic);
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByTestId('question-row').filter({ hasText: prompt }).waitFor();
  await form().locator('select').first().selectOption({ label: 'Multiple choice' });
}
const prompt = () => page.getByTestId('exam-question').locator('h2').innerText();
async function answerCurrent(right) {
  const text = await prompt();
  if (text.startsWith('Choice')) await page.getByRole('radio', { name: right ? 'Right' : 'Wrong', exact: true }).check();
  else await page.getByLabel('Your answer').fill(right ? 'My written answer' : 'Not sure');
}
const startExam = async (minutes) => {
  await page.getByLabel('Time limit').selectOption({ label: minutes });
  await page.getByRole('button', { name: 'Start mock exam' }).click();
  await page.getByTestId('exam-question').waitFor();
};

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4187', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  context = await chromium.launchPersistentContext(path.join(work, 'main'), { acceptDownloads: true, viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await context.addInitScript('delete window.showSaveFilePicker;');
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await context?.close().catch(() => undefined);
  try { if (server) process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('with nothing saved, Exam Hall claims nothing', async () => {
  await page.getByLabel('Course name').fill('Accounting');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Accounting' }).waitFor();
  await nav('Exam Hall');
  await page.getByRole('heading', { name: 'Exam Hall' }).waitFor();
  assert.equal(await page.getByTestId('evidence-accuracy').innerText(), '—');
  await page.getByText('No questions yet').waitFor();
  await page.getByText("doesn't give a readiness score").waitFor();
  assert.doesNotMatch(await page.getByTestId('revision-checklist').innerText(), /Done: Take a mock exam/);
  await page.getByRole('link', { name: 'Exam Tomorrow' }).click();
  await page.getByTestId('cram-empty').waitFor();
});

test('an exam shows one question at a time, nothing selected, and no answers', async () => {
  await nav('Practice');
  await page.getByLabel('New practice set').fill('Unit 1');
  await page.getByRole('button', { name: 'Create set' }).click();
  await page.getByRole('heading', { name: 'Unit 1' }).waitFor();
  await page.getByRole('button', { name: 'Edit set' }).click();
  await page.getByLabel('Course').selectOption({ label: 'Accounting' });
  await page.getByRole('button', { name: 'Save set' }).click();
  await page.getByRole('button', { name: 'Save set' }).waitFor({ state: 'detached' });
  await addChoice('Choice one', 'Equation');
  await addChoice('Choice two', 'Equation');
  await addWritten('Written definition', 'Definition', 'Terms');
  await addWritten('Written formula', 'Formula application', 'Ratios');
  await nav('Exam Hall');
  await page.getByLabel('Course').selectOption({ label: 'Accounting' });
  await page.screenshot({ path: path.join(shots, 'exam-hall.png'), fullPage: false });
  await startExam('30 minutes');
  assert.equal(await page.getByTestId('exam-question').count(), 1);
  assert.equal(await page.locator('input[type=radio]:checked').count(), 0);
  assert.match(await page.getByTestId('exam-position').innerText(), /^Question 1 of 4/);
  assert.match(await page.getByTestId('exam-clock').innerText(), /^(30:00|29:5\d)$/);
  assert.doesNotMatch(await page.content(), /Model answer for/, 'answers are not in the page');
  await page.screenshot({ path: path.join(shots, 'exam-run.png') });
});

test('answers and the clock survive a reload, and only one exam runs at a time', async () => {
  await answerCurrent(true);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(80);
  const first = await page.getByRole('button', { name: 'Question 1, answered' }).count();
  assert.equal(first, 1);
  await page.reload();
  await page.getByTestId('exam-question').waitFor();
  assert.match(await page.getByTestId('exam-position').innerText(), /^Question 2 of 4/, 'the place is kept');
  assert.match(await page.getByTestId('exam-clock').innerText(), /^(29:[345]\d|30:00)$/, 'the clock did not restart');
  await page.getByRole('button', { name: 'Question 1, answered' }).waitFor();
  await nav('Exam Hall');
  await page.getByTestId('exam-in-progress').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Start mock exam' }).isDisabled(), true);
  await page.getByRole('link', { name: 'Go back to it' }).click();
  await page.getByTestId('exam-question').waitFor();
});

test('finishing warns about blanks, and written answers wait to be checked', async () => {
  await page.getByRole('button', { name: 'Finish exam' }).click();
  await page.getByRole('dialog').getByText('3 unanswered questions').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  for (let i = 1; i < 4; i++) {
    await page.getByRole('button', { name: new RegExp(`^Question ${i + 1},`) }).click();
    await page.waitForTimeout(40);
    const text = await prompt();
    if (text === 'Written formula') continue;
    await answerCurrent(!text.startsWith('Choice'));
  }
  await page.waitForTimeout(40);
  await page.getByRole('button', { name: 'Finish exam' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finish exam' }).click();
  await page.getByRole('heading', { name: /Accounting,/ }).waitFor();
  const items = page.getByTestId('exam-item');
  await items.first().waitFor();
  await page.screenshot({ path: path.join(shots, 'exam-result.png'), fullPage: false });
  const tallyText = await page.getByTestId('exam-tally').innerText();
  assert.match(tallyText, /out of 4/);
  assert.ok((await page.getByTestId('exam-pending').count()) === 1 || (await page.getByTestId('exam-score').count()) === 1);
});

test('checking written answers reveals the score, and the results feed Practice', async () => {
  for (let guard = 0; guard < 4 && (await page.getByTestId('exam-pending').count()) > 0; guard++) {
    const pending = page.locator('[data-testid=exam-item][data-result=pending]').first();
    await pending.getByRole('button', { name: /^Partly right/ }).click();
    await page.waitForTimeout(120);
  }
  await page.getByTestId('exam-score').waitFor();
  const score = await page.getByTestId('exam-score').innerText();
  assert.match(score, /^\d+%$/);
  await page.reload();
  assert.equal(await page.getByTestId('exam-score').innerText(), score, 'the score is saved');
  await page.getByRole('link', { name: 'Practice your mistakes' }).click();
  await page.getByTestId('practice-left').waitFor();
  await page.getByRole('link', { name: 'Stop for now' }).click();
  await nav('Exam Hall');
  await page.getByTestId('exam-scores').getByText(score).waitFor();
  await page.getByTestId('revision-checklist').getByText('Done: Take a mock exam').waitFor();
  assert.notEqual(await page.getByTestId('evidence-accuracy').innerText(), '—');
  await page.getByRole('link', { name: 'Practice your mistakes' }).count();
});

test('when time runs out the exam submits itself, even if the page was closed', async () => {
  await page.clock.install();
  await page.reload();
  await page.getByRole('button', { name: 'Start mock exam' }).waitFor();
  await page.getByLabel('Time limit').selectOption({ label: '15 minutes' });
  await page.getByRole('button', { name: 'Start mock exam' }).click();
  await page.getByTestId('exam-question').waitFor();
  await answerCurrent(true);
  await page.clock.fastForward(16 * 60 * 1000);
  await page.getByText('Time ran out, so it was submitted for you').waitFor();
  assert.equal(await page.locator('[data-testid=exam-item] >> text=No answer').count() >= 1, true, 'questions left blank are marked');
  await page.reload();
  await page.getByText('Time ran out').waitFor();
});

test('no time limit shows no clock, and improvement appears once there are two scores', async () => {
  await context.close();
  context = await chromium.launchPersistentContext(path.join(work, 'main'), { acceptDownloads: true, viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await context.addInitScript('delete window.showSaveFilePicker;');
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${URL_BASE}#/exams`);
  await page.getByRole('heading', { name: 'Exam Hall' }).waitFor();
  await startExam('No time limit');
  assert.equal(await page.getByTestId('exam-clock').count(), 0);
  await page.getByRole('button', { name: 'Finish exam' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finish exam' }).click();
  await page.getByTestId('exam-tally').waitFor();
  assert.equal(await page.getByTestId('exam-pending').count(), 0, 'blank answers need no checking');
  assert.equal(await page.getByTestId('exam-score').innerText(), '0%');
  await page.getByRole('link', { name: 'Back to Exam Hall' }).click();
  await page.getByTestId('exam-scores').waitFor();
});

test('quitting asks first and saves nothing', async () => {
  await page.getByTestId('exam-scores').locator('li').first().waitFor();
  const before = await page.getByTestId('exam-scores').locator('li').count();
  await startExam('15 minutes');
  await page.getByRole('button', { name: 'Quit without saving' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByTestId('exam-question').waitFor();
  await page.getByRole('button', { name: 'Quit without saving' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Quit without saving' }).click();
  await page.getByRole('heading', { name: 'Exam Hall' }).waitFor();
  await page.getByTestId('exam-scores').locator('li').first().waitFor();
  assert.equal(await page.getByTestId('exam-scores').locator('li').count(), before);
  assert.equal(await page.getByTestId('exam-in-progress').count(), 0);
});

test('Cram Mode builds plans from saved work, and each step opens', async () => {
  await page.getByRole('link', { name: 'Last Hour' }).click();
  const plan = page.getByTestId('cram-plan');
  await plan.waitFor();
  const text = await plan.innerText();
  assert.match(text, /Fix your mistakes/);
  assert.match(await page.getByTestId('cram-total').innerText(), /^About \d+ minutes/);
  await page.screenshot({ path: path.join(shots, 'cram.png') });
  await page.getByRole('link', { name: 'Start Fix your mistakes' }).click();
  await page.getByTestId('practice-left').waitFor();
  await page.getByRole('link', { name: 'Stop for now' }).click();
  await nav('Exam Hall');
  await page.getByRole('link', { name: 'Quick Review' }).click();
  await page.getByRole('link', { name: 'Start Key definitions' }).click();
  await page.getByTestId('practice-left').getByText(/Definition/).waitFor();
  await page.getByRole('link', { name: 'Stop for now' }).click();
});

test('Exam Hall can be limited to one course', async () => {
  await nav('Courses');
  await page.getByLabel('Course name').fill('Biology');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Biology' }).waitFor();
  await nav('Exam Hall');
  await page.getByLabel('Course').selectOption({ label: 'Biology' });
  assert.equal(await page.getByTestId('evidence-answered').innerText(), '0/0');
  await page.getByTestId('exam-scores').getByText('No mock exams yet').waitFor();
  await page.getByLabel('Course').selectOption({ label: 'All courses' });
  await page.getByText('Biology').count();
});

test('a backup restores saved scores, and deleting a score leaves practice alone', async () => {
  await nav('Settings');
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create backup' }).click()]);
  await page.getByTestId('backup-result').waitFor();
  backupFile = path.join(work, 'exam-backup.zip');
  await file.saveAs(backupFile);
  await nav('Exam Hall');
  await page.getByTestId('exam-scores').locator('li').first().waitFor();
  const count = await page.getByTestId('exam-scores').locator('li').count();
  await page.getByTestId('exam-scores').locator('li a').first().click();
  await page.getByRole('button', { name: 'Delete exam' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete exam' }).click();
  await page.getByRole('heading', { name: 'Exam Hall' }).waitFor();
  await page.getByTestId('exam-scores').locator('li').first().waitFor();
  assert.equal(await page.getByTestId('exam-scores').locator('li').count(), count - 1);
  await nav('Settings');
  await page.getByTestId('restore-input').setInputFiles(backupFile);
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await page.getByTestId('restore-report').getByText('1 mock exam').waitFor();
  await nav('Exam Hall');
  await page.getByTestId('exam-scores').locator('li').first().waitFor();
  assert.equal(await page.getByTestId('exam-scores').locator('li').count(), count);
});

test('on a phone it fits, and its one button is in the bar', async () => {
  await page.setViewportSize({ width: 360, height: 700 });
  const overflow = () => page.evaluate(() => {
    const main = document.querySelector('main');
    return Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth);
  });
  assert.ok((await overflow()) <= 0);
  await page.locator('.nav-links a[href="#/exams"]').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.nav-links a[href="#/exams"]').isVisible(), true, 'the bottom bar slides to it');
  await page.locator('.nav-links').getByRole('link', { name: 'Today', exact: true }).click();
  await page.getByRole('heading', { name: /^Today:/ }).waitFor();
  assert.equal(await page.getByRole('main').getByRole('link', { name: 'Exam Hall' }).count(), 0, 'the bar is the one way there');
  await page.locator('.nav-links').getByRole('link', { name: 'Practice', exact: true }).click();
  await page.getByRole('heading', { name: 'Practice', exact: true }).waitFor();
  assert.equal(await page.getByRole('main').getByRole('link', { name: 'Exam Hall' }).count(), 0, 'the bar is the one way there');
  await page.locator('.nav-links').getByRole('link', { name: 'Exam Hall', exact: true }).click();
  await page.getByRole('heading', { name: 'Exam Hall' }).waitFor();
  await startExam('15 minutes');
  assert.ok((await overflow()) <= 0);
  await page.screenshot({ path: path.join(shots, 'phone-exam.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
