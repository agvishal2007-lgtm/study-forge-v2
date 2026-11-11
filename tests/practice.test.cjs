// Practice's rules, then the whole Practice flow in a real browser.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const rules = () => import('../src/data/practiceRules.ts');
const attempt = (id, questionId, result, at) => ({ id, questionId, result, at });
const question = (id, topic = '') => ({ id, topic });

test('accuracy uses the latest answer to each question, and partly right counts as half', async () => {
  const { accuracyOf, latestAnswers } = await rules();
  assert.equal(accuracyOf([]), null, 'no answers means no number at all');
  assert.equal(accuracyOf([{ result: 'correct' }, { result: 'partial' }, { result: 'wrong' }, { result: 'correct' }]), 63);
  const latest = latestAnswers([attempt('a', 'q', 'wrong', 1), attempt('b', 'q', 'correct', 3), attempt('c', 'q', 'partial', 2)]);
  assert.equal(latest.get('q').result, 'correct', 'fixing a mistake counts');
});

test('mistakes and weak topics follow the latest answers', async () => {
  const { mistakesIn, weakTopics } = await rules();
  const questions = [question('fixed', 'Accruals'), question('wrong', 'Accruals'), question('partial', 'Equity'), question('fine', 'Equity'), question('new', 'Cash'), question('strong', 'Revenue')];
  const attempts = [
    attempt('1', 'fixed', 'wrong', 1), attempt('2', 'fixed', 'correct', 5),
    attempt('3', 'wrong', 'wrong', 4), attempt('4', 'partial', 'partial', 2),
    attempt('5', 'fine', 'correct', 3), attempt('6', 'strong', 'correct', 3),
  ];
  assert.deepEqual(mistakesIn(questions, attempts).map((entry) => entry.id), ['partial', 'wrong'], 'oldest first, and fixed or unanswered ones left out');
  const weak = weakTopics(questions, attempts, (entry) => entry.topic);
  assert.deepEqual(weak.map((topic) => [topic.label, topic.percent, topic.answered]), [['Accruals', 50, 2]], 'Equity is exactly 75%, and new or strong topics are left out');
  assert.deepEqual(weakTopics([question('x', 'Low')], [attempt('1', 'x', 'partial', 1)], (entry) => entry.topic)[0].percent, 50);
});

test('feedback tells apart right, partly right, missing, and a likely misunderstanding', async () => {
  const { feedbackFor } = await rules();
  assert.equal(feedbackFor('correct', null).title, 'Correct');
  assert.match(feedbackFor('correct', 'Guessing').detail, /guessing/);
  assert.equal(feedbackFor('partial', 'Sure').title, 'Partly right');
  assert.equal(feedbackFor('wrong', 'Sure').title, 'Likely misunderstanding');
  assert.equal(feedbackFor('wrong', 'Guessing').title, 'Not quite');
  assert.equal(feedbackFor('wrong', null).title, 'Not quite');
});

test('a question needs enough to check an answer against', async () => {
  const { questionProblems } = await rules();
  const form = { kind: 'multiple', prompt: 'Q', optionsText: 'A\nB', correct: '1', acceptedText: '', modelAnswer: '' };
  assert.deepEqual(questionProblems(form), []);
  assert.match(questionProblems({ ...form, prompt: ' ' })[0], /Enter the question/);
  assert.match(questionProblems({ ...form, optionsText: 'A', correct: '0' })[0], /at least two/);
  assert.match(questionProblems({ ...form, optionsText: 'A\nA' })[0], /different/);
  assert.match(questionProblems({ ...form, correct: '' })[0], /Choose which/);
  assert.match(questionProblems({ ...form, correct: '5' })[0], /Choose which/);
  assert.match(questionProblems({ ...form, kind: 'short' })[0], /model answer/);
  assert.deepEqual(questionProblems({ ...form, kind: 'short', modelAnswer: 'M' }), []);
  assert.deepEqual(questionProblems({ ...form, kind: 'blank', acceptedText: 'Equity' }), []);
});

const URL_BASE = 'http://localhost:4184/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-practice-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
let server;
let context;
let page;
let backupFile;
let tick = 0;
const pageErrors = [];

async function open(profile, viewport = { width: 1280, height: 800 }) {
  await context?.close().catch(() => undefined);
  context = await chromium.launchPersistentContext(path.join(work, profile), { acceptDownloads: true, viewport });
  await context.addInitScript('delete window.showSaveFilePicker;');
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
}
const nav = (name) => page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
async function addChoice(prompt, topic = '') {
  await page.getByLabel('Question', { exact: true }).fill(prompt);
  await page.getByLabel('Answer choices').fill('Assets\nEquity\nRevenue');
  await page.getByLabel('Correct answer').selectOption({ label: 'Equity' });
  await page.getByLabel('Explanation', { exact: true }).fill('Assets equal liabilities plus equity.');
  await page.getByLabel('Topic (optional)').fill(topic);
  await page.getByLabel('Source (optional)').fill('Chapter 1, page 12');
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByTestId('question-row').filter({ hasText: prompt }).waitFor();
  tick += 1;
  await page.waitForTimeout(5);
}
async function addTyped(kind, prompt, model, accepted, topic) {
  await page.getByTestId('question-form').locator('select').first().selectOption({ label: kind });
  await page.getByLabel('Question', { exact: true }).fill(prompt);
  await page.getByLabel('Model answer').fill(model);
  await page.getByLabel('Accepted answers').fill(accepted);
  await page.getByLabel('Topic (optional)').fill(topic);
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByTestId('question-row').filter({ hasText: prompt }).waitFor();
  await page.waitForTimeout(5);
  await page.getByTestId('question-form').locator('select').first().selectOption({ label: 'Multiple choice' });
}
const submit = () => page.getByRole('button', { name: 'Submit answer' }).click();
const nextQuestion = () => page.getByRole('button', { name: /Next question|See results/ }).click();

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4184', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await open('main');
});

after(async () => {
  await context?.close().catch(() => undefined);
  try { if (server) process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('a set and questions can be made, and incomplete ones are refused', async () => {
  await page.getByLabel('Course name').fill('Accounting');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Accounting' }).waitFor();
  await nav('Practice');
  await page.getByText('No practice sets yet').waitFor();
  await page.getByRole('button', { name: 'Create set' }).click();
  await page.getByRole('alert').getByText('Enter a name').waitFor();
  await page.getByLabel('New practice set').fill('Chapter 1');
  await page.getByRole('button', { name: 'Create set' }).click();
  await page.getByRole('heading', { name: 'Chapter 1' }).waitFor();
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByTestId('question-problems').getByText('Enter the question').waitFor();
  await page.getByLabel('Question', { exact: true }).fill('Kept text');
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByTestId('question-problems').getByText('at least two').waitFor();
  assert.equal(await page.getByLabel('Question', { exact: true }).inputValue(), 'Kept text');
  await addChoice('Assets = Liabilities + what?', 'Equation');
  await addChoice('What does owners\' claim mean?', 'Equation');
  await addTyped('Fill in the blank', 'Revenue minus expenses is ____', 'Net income', 'net income\nprofit', 'Income');
  await addTyped('Concept explanation', 'Explain accruals', 'Recording when earned, not when paid', '', 'Accruals');
  await page.screenshot({ path: path.join(shots, 'practice-set.png'), fullPage: true });
  assert.equal(await page.getByTestId('question-row').count(), 4);
});

test('nothing is selected at the start, and the answer is not in the page before submitting', async () => {
  await page.getByRole('link', { name: 'Start practice' }).click();
  await page.getByTestId('practice-question').waitFor();
  assert.equal(await page.locator('input[type=radio]:checked').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Submit answer' }).isDisabled(), true, 'it cannot be submitted empty');
  assert.doesNotMatch(await page.getByTestId('practice-question').innerText(), /Assets equal liabilities/);
  assert.doesNotMatch(await page.content(), /Assets equal liabilities|Chapter 1, page 12/);
  assert.match(await page.getByTestId('practice-left').innerText(), /^4 left\. Multiple choice, Equation/);
  await page.screenshot({ path: path.join(shots, 'practice-question.png') });
});

test('a right multiple choice answer gets feedback with the explanation and source', async () => {
  await page.getByRole('radio', { name: 'Equity', exact: true }).check();
  await page.getByRole('radio', { name: 'Sure', exact: true }).check();
  await submit();
  await page.getByTestId('practice-feedback').waitFor();
  assert.match(await page.getByTestId('verdict').innerText(), /^Correct/);
  const text = await page.getByTestId('practice-feedback').innerText();
  assert.match(text, /Assets equal liabilities plus equity/);
  assert.match(text, /Source: Chapter 1, page 12/);
  await page.screenshot({ path: path.join(shots, 'practice-feedback.png') });
});

test('a reload keeps the place, and answering again cannot count twice', async () => {
  await page.reload();
  await page.getByTestId('practice-feedback').waitFor();
  assert.match(await page.getByTestId('practice-left').innerText(), /^4 left/);
  const stored = () => page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('study-forge');
    open.onsuccess = () => {
      const read = open.result.transaction('practiceAttempts').objectStore('practiceAttempts').getAll();
      read.onsuccess = () => { open.result.close(); resolve(read.result); };
    };
  }));
  assert.equal((await stored()).length, 1);
  await nextQuestion();
  await page.getByTestId('practice-question').waitFor();
  assert.equal(await page.locator('input[type=radio]:checked').count(), 0, 'the next question starts clear');
});

test('being sure and wrong is called out as a likely misunderstanding', async () => {
  await page.getByRole('radio', { name: 'Assets', exact: true }).check();
  await page.getByRole('radio', { name: 'Sure', exact: true }).check();
  await submit();
  await page.getByTestId('verdict').getByText('Likely misunderstanding').waitFor();
  assert.equal(await page.getByTestId('correct-answer').innerText(), 'Equity');
  await nextQuestion();
});

test('a typed answer matching an accepted one is marked right, ignoring capitals', async () => {
  await page.getByLabel('Your answer').fill('NET INCOME');
  await submit();
  await page.getByTestId('verdict').getByText('Correct').waitFor();
  assert.doesNotMatch(await page.getByTestId('verdict').innerText(), /self-checked/);
  await nextQuestion();
});

test('other typed answers keep their draft through a reload and are self-checked honestly', async () => {
  await page.getByLabel('Your answer').fill('When the money comes in');
  await page.waitForTimeout(100);
  await page.reload();
  await page.getByTestId('practice-question').waitFor();
  assert.equal(await page.getByLabel('Your answer').inputValue(), 'When the money comes in', 'a draft is restored');
  assert.equal(await page.getByTestId('practice-feedback').count(), 0, 'a draft is not a submission');
  await submit();
  await page.getByTestId('practice-check').waitFor();
  assert.equal(await page.getByTestId('model-answer').innerText(), 'Recording when earned, not when paid');
  await page.getByRole('button', { name: 'Partly right' }).click();
  await page.getByTestId('verdict').getByText('Partly right (self-checked)').waitFor();
  await page.getByRole('button', { name: 'See results' }).click();
  assert.match(await page.getByTestId('practice-summary').innerText(), /2 correct, 1 partly right, 1 wrong/);
});

test('mistakes and weak topics show up, and fixing a mistake clears it', async () => {
  await page.getByRole('link', { name: 'Practice what you missed' }).click();
  await page.getByTestId('practice-left').waitFor();
  assert.match(await page.getByTestId('practice-left').innerText(), /^2 left/);
  await page.getByRole('radio', { name: 'Equity', exact: true }).check();
  await submit();
  await page.getByTestId('verdict').getByText('Correct').waitFor();
  await nextQuestion();
  await page.getByRole('link', { name: 'Stop for now' }).click();
  await page.getByRole('button', { name: 'Add question' }).waitFor();
  await nav('Practice');
  await page.getByTestId('resume-practice').waitFor();
  assert.equal((await page.getByTestId('practice-accuracy').locator('b').innerText()).trim(), '88%', '(1 + 1 + 1 + 0.5) / 4');
  assert.equal((await page.getByTestId('practice-mistakes').locator('b').innerText()).trim(), '1');
  await page.getByTestId('weak-topics').getByText('Accruals').waitFor();
  assert.doesNotMatch(await page.getByTestId('weak-topics').innerText(), /Equation/);
  await page.screenshot({ path: path.join(shots, 'practice-home.png'), fullPage: true });
  await page.getByRole('link', { name: 'Practice Accruals' }).click();
  await page.getByTestId('practice-left').waitFor();
  assert.match(await page.getByTestId('practice-left').innerText(), /^1 left\. Concept explanation, Accruals/);
  await page.getByRole('link', { name: 'Stop for now' }).click();
});

test('questions can be chosen by type, edited, and deleted after asking', async () => {
  await nav('Practice');
  await page.getByTestId('set-row').getByRole('link', { name: 'Chapter 1', exact: true }).click();
  await page.getByLabel('Question type').selectOption({ label: 'Fill in the blank' });
  await page.getByRole('link', { name: 'Start practice' }).click();
  await page.getByTestId('practice-left').getByText(/^1 left\. Fill in the blank/).waitFor();
  await page.getByRole('link', { name: 'Stop for now' }).click();
  await page.getByRole('button', { name: 'Edit Explain accruals' }).click();
  const form = page.getByTestId('question-row').or(page.getByTestId('question-form')).last();
  await page.getByLabel('Question', { exact: true }).last().fill('Explain accruals simply');
  await page.getByRole('button', { name: 'Save question' }).click();
  await page.getByTestId('question-row').filter({ hasText: 'Explain accruals simply' }).waitFor();
  assert.ok(form);
  assert.match(await page.getByTestId('question-row').filter({ hasText: 'Explain accruals simply' }).innerText(), /Last answer: partly right/, 'editing keeps the history');
  await page.getByRole('button', { name: 'Delete Explain accruals simply' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.getByTestId('question-row').count(), 4);
});

test('Today shows the accuracy and weak topics', async () => {
  await nav('Today');
  await page.getByTestId('tile-practice').waitFor();
  assert.equal((await page.getByTestId('tile-practice').locator('b').innerText()).trim(), '88%');
  await page.getByTestId('today-practice').getByRole('link', { name: 'Accruals' }).waitFor();
  await page.getByTestId('today-practice').getByRole('link', { name: 'Review 1 mistake' }).waitFor();
  await page.screenshot({ path: path.join(shots, 'dashboard-practice.png') });
});

test('a backup restores sets, questions, and answers', async () => {
  await nav('Settings');
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create backup' }).click()]);
  await page.getByTestId('backup-result').waitFor();
  backupFile = path.join(work, 'practice-backup.zip');
  await file.saveAs(backupFile);
  await open('fresh');
  await nav('Settings');
  await page.getByTestId('restore-input').setInputFiles(backupFile);
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await page.getByTestId('restore-report').getByText('4 practice questions').waitFor();
  await nav('Practice');
  assert.equal((await page.getByTestId('practice-accuracy').locator('b').innerText()).trim(), '88%');
  await nav('Settings');
  await page.getByTestId('restore-input').setInputFiles(backupFile);
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await page.getByTestId('restore-report').getByText('0 practice questions').waitFor();
  await nav('Practice');
  assert.equal((await page.getByTestId('practice-accuracy').locator('b').innerText()).trim(), '88%', 'nothing counted twice');
});

test('deleting a course keeps its sets, and deleting a set removes its questions and answers', async () => {
  await nav('Courses');
  await page.getByRole('link', { name: /Accounting/ }).click();
  await page.getByRole('button', { name: 'Move to bin' }).click();
  await page.getByRole('heading', { name: 'Courses', exact: true }).waitFor();
  await page.goto(`${URL_BASE}#/bin`);
  await page.getByTestId('bin-courses').waitFor();
  await page.getByRole('button', { name: /for good$/ }).first().click();
  await page.getByRole('dialog').getByText('any practice sets stay').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  // Changed our mind: put the course back in use.
  await page.getByRole('button', { name: /^Restore / }).first().click();
  await nav('Practice');
  await page.getByTestId('set-row').getByRole('link', { name: 'Chapter 1', exact: true }).click();
  await page.getByRole('button', { name: 'Delete set' }).click();
  await page.getByRole('dialog').getByText('its 4 questions').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete set' }).click();
  await page.getByText('No practice sets yet').waitFor();
  const left = await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('study-forge');
    open.onsuccess = () => {
      const tx = open.result.transaction(['practiceQuestions', 'practiceAttempts']);
      const questions = tx.objectStore('practiceQuestions').count();
      const attempts = tx.objectStore('practiceAttempts').count();
      tx.oncomplete = () => { open.result.close(); resolve([questions.result, attempts.result]); };
    };
  }));
  assert.deepEqual(left, [0, 0]);
});

test('someone already using the site keeps everything when Practice arrives', async () => {
  await context.close();
  context = await chromium.launchPersistentContext(path.join(work, 'older-student'), { viewport: { width: 1280, height: 800 } });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(`${URL_BASE}blank.html`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' }));
  await page.goto(`${URL_BASE}blank.html`);
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('study-forge', 8);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('courses', { keyPath: 'id' });
      db.createObjectStore('topics', { keyPath: 'id' }).createIndex('courseId', 'courseId');
      const materials = db.createObjectStore('materials', { keyPath: 'id' });
      materials.createIndex('hash', 'hash');
      materials.createIndex('createdAt', 'createdAt');
      db.createObjectStore('blobs');
      db.createObjectStore('recordings', { keyPath: 'id' });
      db.createObjectStore('recordingChunks');
      db.createObjectStore('notes', { keyPath: 'id' });
      db.createObjectStore('meta');
      db.createObjectStore('lessons', { keyPath: 'id' });
      db.createObjectStore('checkpoints', { keyPath: 'id' }).createIndex('lessonId', 'lessonId');
      db.createObjectStore('checkpointProgress', { keyPath: 'checkpointId' });
      db.createObjectStore('syncMeta');
      db.createObjectStore('plannerItems', { keyPath: 'id' });
      db.createObjectStore('decks', { keyPath: 'id' });
      db.createObjectStore('cards', { keyPath: 'id' }).createIndex('deckId', 'deckId');
      db.createObjectStore('cardProgress', { keyPath: 'cardId' });
      request.transaction.objectStore('decks').put({ id: 'old-deck', name: 'Older deck', courseId: null, topicId: null, createdAt: 1000, updatedAt: 1000 });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { request.result.close(); resolve(); };
  }));
  await page.goto(URL_BASE);
  await page.getByRole('heading', { name: /^Today:/ }).waitFor();
  await nav('Flashcards');
  await page.getByTestId('deck-row').getByText('Older deck').waitFor();
  await nav('Practice');
  await page.getByLabel('New practice set').fill('First set after updating');
  await page.getByRole('button', { name: 'Create set' }).click();
  await page.getByRole('heading', { name: 'First set after updating' }).waitFor();
});

test('it works on a phone, with every destination in reach', async () => {
  await open('phone', { width: 360, height: 700 });
  const overflow = () => page.evaluate(() => {
    const main = document.querySelector('main');
    const nav = document.querySelector('nav');
    return Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth, nav.scrollWidth - nav.clientWidth);
  });
  await nav('Practice');
  await page.getByLabel('New practice set').fill('Phone set');
  await page.getByRole('button', { name: 'Create set' }).click();
  await page.getByRole('heading', { name: 'Phone set' }).waitFor();
  await page.screenshot({ path: path.join(shots, 'phone-practice-set.png') });
  await page.getByLabel('Question', { exact: true }).fill('A long question '.repeat(10));
  await page.getByLabel('Answer choices').fill(`${'A long choice '.repeat(8)}\nShort`);
  await page.getByLabel('Correct answer').selectOption({ label: 'Short' });
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByTestId('question-row').waitFor();
  assert.ok((await overflow()) <= 0);
  await page.getByRole('link', { name: 'Start practice' }).click();
  await page.getByTestId('practice-question').waitFor();
  assert.ok((await overflow()) <= 0);
  await page.screenshot({ path: path.join(shots, 'phone-practice.png') });
  const links = await page.locator('nav.nav .nav-links a:visible').all();
  for (const link of links) {
    await link.scrollIntoViewIfNeeded();
    const box = await link.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 360, 'every section button can be slid onto the screen');
  }
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
