// SAT and PSAT practice as a student uses it: the honest limits said on the screen, questions with
// the working shown, and a score log that only accepts scores the test could actually report.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4233;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let browser;
let page;
const pageErrors = [];

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.clock.setFixedTime(new Date('2026-11-04T14:30:00-05:00'));
  await returningStudent(page);
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await browser?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
});

test('it is reachable from Practice, and says plainly what it is and is not', async () => {
  await page.goto(`${URL_BASE}#/practice`);
  await page.getByTestId('prep-link').getByRole('link', { name: 'SAT and PSAT practice' }).click();
  await page.getByRole('heading', { name: 'SAT and PSAT practice', level: 1 }).waitFor();
  const honesty = await page.getByTestId('prep-honesty').innerText();
  assert.match(honesty, /not College Board questions/);
  assert.match(honesty, /cannot tell you what you would score/);
  await page.getByTestId('prep-trademark').filter({ hasText: 'trademarks of the College Board' }).waitFor();
});

test('each test carries its own published scale, and only one has a Selection Index', async () => {
  await page.goto(`${URL_BASE}#/test-prep`);
  await page.getByTestId('prep-scale').filter({ hasText: 'total 400 to 1600' }).waitFor();
  await page.getByTestId('prep-scale').filter({ hasText: 'each section 200 to 800' }).waitFor();
  assert.ok(!(await page.getByTestId('prep-scale').innerText()).includes('Selection Index'), 'the SAT has no Selection Index');

  await page.getByTestId('prep-test').selectOption('psat-nmsqt');
  await page.getByTestId('prep-scale').filter({ hasText: 'total 320 to 1520' }).waitFor();
  await page.getByTestId('prep-scale').filter({ hasText: 'Selection Index' }).waitFor();

  await page.getByTestId('prep-test').selectOption('psat-8-9');
  await page.getByTestId('prep-scale').filter({ hasText: 'total 240 to 1440' }).waitFor();
  // The hardest questions are left out of the youngest test, and it says so.
  await page.getByTestId('prep-level-note').waitFor();
  await page.getByTestId('prep-test').selectOption('psat-nmsqt');
});

test('a test date gives a countdown, and a date gone by is not still coming', async () => {
  await page.goto(`${URL_BASE}#/test-prep`);
  await page.getByTestId('prep-date').fill('2026-12-06');
  await page.getByTestId('prep-countdown').filter({ hasText: '32 days to go' }).waitFor();
  await page.getByTestId('prep-date').fill('2026-11-01');
  await page.getByTestId('prep-countdown').filter({ hasText: 'was 3 days ago' }).waitFor();
  await page.getByTestId('prep-date').fill('2026-12-06');
  await page.getByTestId('prep-countdown').filter({ hasText: '32 days to go' }).waitFor();
});

test('practising a topic shows the working, right or wrong, and counts the answer', async () => {
  await page.goto(`${URL_BASE}#/test-prep`);
  await page.getByTestId('practise-conventions').click();
  await page.getByTestId('prep-runner').waitFor();
  // Nothing is marked until the student commits.
  await page.getByTestId('prep-check').click();
  await page.getByText('Choose an answer first.').waitFor();
  assert.equal(await page.getByTestId('prep-answer').count(), 0);

  // Deliberately wrong first: the working has to be there whether or not they got it.
  const choices = page.getByTestId('prep-choices').locator('input[type=radio]');
  await page.getByTestId('prep-runner').filter({ hasText: 'Question 1 of' }).waitFor();
  await choices.nth(0).check();
  await page.getByTestId('prep-check').click();
  await page.getByTestId('prep-answer').filter({ hasText: 'Not this time.' }).waitFor();
  const why = await page.getByTestId('prep-why').innerText();
  assert.ok(why.length > 30, 'an explanation should actually explain');
  // Answers are locked once marked, so a wrong answer cannot be quietly swapped.
  assert.equal(await choices.nth(1).isDisabled(), true);

  // On to the next one. Several questions in a topic share the same instruction line, so the count
  // is what says the session moved, not the wording.
  await page.getByTestId('prep-next').click();
  await page.getByTestId('prep-runner').filter({ hasText: 'Question 2 of' }).waitFor();
  await page.getByTestId('prep-choices').waitFor();
  assert.equal(await page.getByTestId('prep-answer').count(), 0, 'the next question starts unmarked');
});

test('working through a topic ends with a count, and never with a predicted score', async () => {
  // Away and back, so this starts on the page itself rather than inside the previous session.
  await page.goto(`${URL_BASE}#/practice`);
  await page.goto(`${URL_BASE}#/test-prep`);
  await page.getByTestId('practise-geometry').click();
  await page.getByTestId('prep-runner').waitFor();
  // Answer everything in the topic, however many there are.
  for (let guard = 0; guard < 20; guard++) {
    if (await page.getByTestId('prep-done').count()) break;
    const typed = page.getByTestId('prep-typed');
    if (await typed.count()) await typed.fill('10');
    else await page.getByTestId('prep-choices').locator('input[type=radio]').first().check();
    await page.getByTestId('prep-check').click();
    await page.getByTestId('prep-next').click();
  }
  await page.getByTestId('prep-done').waitFor();
  const done = await page.getByTestId('prep-done').innerText();
  assert.match(done, /\d+ of \d+ right/);
  assert.match(done, /not a prediction/);
  await page.getByRole('button', { name: 'Back to practice' }).click();
  await page.getByRole('heading', { name: 'SAT and PSAT practice', level: 1 }).waitFor();
  // What was answered is counted against its topic, from real work and nothing else.
  await page.getByTestId('prep-focus').waitFor();
});

test('the score log takes only scores the test could report, and works out the rest', async () => {
  await page.goto(`${URL_BASE}#/practice`);
  await page.goto(`${URL_BASE}#/test-prep`);
  // A score that is not a step of ten is refused, with the reason given.
  await page.getByTestId('score-rw').fill('685');
  await page.getByTestId('score-math').fill('700');
  await page.getByRole('button', { name: 'Add this score' }).click();
  await page.getByText(/in steps of ten/).waitFor();
  assert.equal(await page.getByTestId('score-list').count(), 0);

  // A real one: the total and the Selection Index follow from the two sections.
  await page.getByTestId('score-source').fill('Official practice 2');
  await page.getByTestId('score-rw').fill('680');
  await page.getByTestId('score-math').fill('700');
  await page.getByRole('button', { name: 'Add this score' }).click();
  const list = page.getByTestId('score-list');
  await list.filter({ hasText: '1380' }).waitFor();
  await list.filter({ hasText: 'Selection Index 206' }).waitFor();

  // A second, higher score: change is reported, and nothing is forecast from it.
  await page.getByTestId('score-date').fill('2026-11-02');
  await page.getByTestId('score-rw').fill('700');
  await page.getByTestId('score-math').fill('720');
  await page.getByRole('button', { name: 'Add this score' }).click();
  await list.filter({ hasText: '1420' }).waitFor();
  const progress = await page.getByTestId('prep-progress').innerText();
  assert.match(progress, /Latest: 1380/, 'the latest is by date, not by what was typed last');
  assert.match(progress, /Best: 1420/);
  assert.match(progress, /Down 40 since your first/);
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
