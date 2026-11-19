// The per-feature study settings, checked by their effect rather than by the switch moving. A
// setting that changes nothing is the failure this file exists to catch.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4238;
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
  await returningStudent(page);
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await browser?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
});

const choose = async (setting, label) => {
  await page.goto(`${URL_BASE}#/settings/tools`);
  await page.getByTestId(`setting-${setting}`).getByRole('radio', { name: label }).check();
  await page.waitForTimeout(150);
};

test('every setting says what it does, not just what it is called', async () => {
  await page.goto(`${URL_BASE}#/settings/tools`);
  await page.getByTestId('study-tools').waitFor();
  for (const setting of ['cardOrder', 'cardSide', 'practiceOrder', 'explanations', 'noteStart', 'autoTranscript']) {
    const effect = await page.getByTestId(`effect-${setting}`).innerText();
    assert.ok(effect.trim().length > 15, `${setting} has no sentence saying what it does`);
  }
  // And it says plainly what is missing rather than offering a switch with nothing behind it.
  await page.getByTestId('tools-missing').filter({ hasText: 'no timed study session' }).waitFor();
});

test('which side of a card shows first really changes', async () => {
  // A deck with one unmistakable card.
  await page.goto(`${URL_BASE}#/cards`);
  await page.getByLabel('New deck').fill('Biology terms');
  await page.getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('heading', { name: 'Biology terms' }).waitFor();
  await page.getByLabel('Front', { exact: true }).fill('Mitochondrion');
  await page.getByLabel('Back', { exact: true }).fill('Makes most of a cell energy');
  await page.getByRole('button', { name: 'Add card' }).click();
  await page.getByTestId('card-row').filter({ hasText: 'Mitochondrion' }).waitFor();

  const deckUrl = page.url();
  const deckId = deckUrl.split('/cards/')[1];

  await choose('cardSide', 'The front');
  await page.goto(`${URL_BASE}#/cards/review?deck=${deckId}&mode=practice`);
  await page.getByTestId('flashcard').waitFor();
  assert.match(await page.getByTestId('flashcard').innerText(), /^Front\s+Mitochondrion/);

  await choose('cardSide', 'The back');
  await page.goto(`${URL_BASE}#/cards/review?deck=${deckId}&mode=practice`);
  await page.getByTestId('flashcard').waitFor();
  // The definition now comes first, and the term is what is hidden.
  assert.match(await page.getByTestId('flashcard').innerText(), /^Back\s+Makes most of a cell energy/);
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByTestId('card-front').filter({ hasText: 'Mitochondrion' }).waitFor();
});

test('a note opens the way the student asked, unless there is nothing in it', async () => {
  await choose('noteStart', 'Showing how it reads');
  // A note with something in it opens in preview.
  await page.goto(`${URL_BASE}#/notes`);
  await page.getByRole('button', { name: /New note|Write a note/ }).first().click();
  await page.getByRole('button', { name: 'Write', exact: true }).waitFor();
  // Brand new and empty: ready to write, whatever the setting says.
  assert.equal(await page.getByRole('button', { name: 'Write', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByLabel('Your note').fill('Cells make energy in the mitochondria.');
  await page.waitForTimeout(400);
  const url = page.url();
  await page.goto(`${URL_BASE}#/notes`);
  await page.goto(url);
  // Reopened with content, it honours the choice.
  await page.waitForFunction(() => document.querySelector('[aria-pressed="true"]')
    && [...document.querySelectorAll('button')].some((one) => one.textContent === 'Preview' && one.getAttribute('aria-pressed') === 'true'));

  await choose('noteStart', 'Ready to write');
  await page.goto(url);
  await page.waitForFunction(() => [...document.querySelectorAll('button')]
    .some((one) => one.textContent === 'Write' && one.getAttribute('aria-pressed') === 'true'));
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
