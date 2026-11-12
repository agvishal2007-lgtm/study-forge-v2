// Genio-style notes: pin notes to exact moments of a lecture while it records and transcribes, without
// ever pausing either, then click a note to hear that moment again. Uses the test build, where the
// speech model is replaced by a stand-in that produces a passage every couple of seconds.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4225;
const URL_BASE = `http://localhost:${PORT}/`;
const ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
let server;
let context;
let page;
let work;
const pageErrors = [];

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-genio-'));
  server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-account', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  context = await chromium.launchPersistentContext(path.join(work, 'profile'), { args: ARGS, viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  await returningStudent(context);
  await context.addInitScript(() => {
    window.__testLiveTranscript = [
      'Today we cover the cell cycle and why it matters.',
      'Mitosis has four phases starting with prophase.',
      'During metaphase the chromosomes line up in the middle.',
      'Anaphase pulls the sister chromatids apart.',
      'Telophase finishes the division into two nuclei.',
    ];
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${URL_BASE}#/record`);
});

after(async () => {
  await context?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

const segments = () => page.locator('[data-testid=live-transcript] .transcript-segment');
const clock = async () => page.getByTestId('clock').textContent();

test('the timestamp rules', async () => {
  const { formatStamp, segmentAt, segmentForNote, momentOfSelection, exportMoments } = await import('../src/data/momentRules.ts');
  assert.equal(formatStamp(7000), '0:07');
  assert.equal(formatStamp(725000), '12:05');
  assert.equal(formatStamp(3729000), '1:02:09');
  const parts = [{ id: 'a', startMs: 0, endMs: 10000, text: 'first part here' }, { id: 'b', startMs: 10000, endMs: 20000, text: 'second part here' }];
  assert.equal(segmentAt(parts, 12000).id, 'b');
  assert.equal(segmentForNote({ atMs: 3000, segmentId: 'gone' }, parts).id, 'a', 'a remade transcript still finds the right passage by time');
  assert.equal(segmentForNote({ atMs: 3000, segmentId: 'b' }, parts).id, 'b');
  assert.equal(momentOfSelection(parts[1], parts[1].text, 'here'), 10000 + Math.round(10000 * (12 / 16)));
  const text = exportMoments('Bio', [{ id: 'n', atMs: 12000, quote: 'second part', body: 'Important', createdAt: 1, updatedAt: 1, title: '', courseId: null, topicId: null, materialId: 'm' }], parts, 'md');
  assert.match(text, /## 0:12\n> second part\nImportant/);
});

test('notes pinned to transcript words while recording never pause the recording or the transcript', async () => {
  await page.getByLabel('Recording name').fill('Cell cycle lecture');
  assert.equal(await page.getByLabel(/Live transcript while it records/).isChecked(), true);
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.locator('[data-testid=live-status][data-status=listening]').waitFor();
  await segments().nth(1).waitFor();

  // Select words in the second passage and add a note about exactly them.
  await page.evaluate(() => {
    const span = document.querySelectorAll('[data-testid=live-transcript] .segment-text')[1];
    const range = document.createRange();
    const node = span.firstChild;
    const at = node.textContent.indexOf('prophase');
    range.setStart(node, at);
    range.setEnd(node, at + 'prophase'.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByTestId('picked-bar').getByRole('button', { name: 'Add note' }).click();
  const card = page.getByTestId('moment-note').first();
  await card.waitFor();
  assert.match(await card.locator('.moment-quote').innerText(), /^prophase$/);
  // Picking stopped the view from jumping, but the transcript itself keeps growing.
  await page.getByTestId('return-live').waitFor();
  const before = await segments().count();
  const clockBefore = await clock();
  const box = card.getByRole('textbox');
  await box.pressSequentially('Prophase: chromosomes condense and the spindle forms', { delay: 40 });
  await page.waitForFunction((count) => document.querySelectorAll('[data-testid=live-transcript] .transcript-segment').length > count, before);
  assert.notEqual(await clock(), clockBefore, 'the recording kept going');
  assert.equal(await box.inputValue(), 'Prophase: chromosomes condense and the spindle forms', 'new words never disturbed the note');
  assert.equal(await page.getByRole('button', { name: 'Stop and save' }).isVisible(), true);
  await page.getByTestId('return-live').click();
  await page.getByTestId('return-live').waitFor({ state: 'detached' });

  // A note on a moment, with no words chosen, and one from a passage's + Note.
  await page.waitForTimeout(1500);
  const count = (n) => page.waitForFunction((want) => document.querySelectorAll('[data-testid=lecture-notes] [data-testid=moment-note]').length === want, n);
  await page.getByTestId('note-now').click();
  await count(2);
  await page.getByTestId('moment-note').nth(1).getByRole('textbox').fill('Ask about checkpoints');
  await segments().first().getByRole('button', { name: /Add a note at/ }).click();
  await count(3);
  await page.getByTestId('moment-note').first().getByRole('textbox').fill('Intro: why the cell cycle matters');
  await page.waitForTimeout(800); // let the last typing save
  await page.getByRole('button', { name: 'Stop and save' }).click();
  await page.getByText(/Saved “Cell cycle lecture/).waitFor();
});

test('after the lecture, a note plays its moment and shows its passage, and a passage shows its note', async () => {
  await page.getByRole('link', { name: /Play it|Open it with your notes/ }).click();
  const review = page.getByTestId('recording-notes');
  await review.waitFor();
  const notes = review.getByTestId('moment-note');
  await notes.nth(2).waitFor();
  // In lecture order: the intro (first passage), prophase (second), then the later moment.
  const order = await notes.evaluateAll((items) => items.map((item) => item.querySelector('textarea').value));
  assert.deepEqual(order, ['Intro: why the cell cycle matters', 'Prophase: chromosomes condense and the spindle forms', 'Ask about checkpoints']);
  const prophase = notes.nth(1);
  const at = Number(await prophase.getAttribute('data-at'));
  await prophase.getByRole('button', { name: /Play from/ }).click();
  await page.waitForFunction((ms) => Math.abs(document.querySelector('[data-testid=audio-player]').currentTime * 1000 - ms) < 1500, at);
  assert.match(await review.locator('.transcript-segment[data-highlight=true]').innerText(), /prophase/);
  // Clicking an annotated passage shows its note.
  await review.locator('.transcript-segment[data-annotated=true]').first().locator('.segment-stamp').click();
  await review.locator('[data-testid=moment-note][data-active=true]').first().waitFor();
  // Notes can be added while reviewing too, and edited and deleted.
  await review.getByTestId('note-current').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=recording-notes] [data-testid=moment-note]').length === 4);
  const empty = await notes.evaluateAll((items) => items.findIndex((item) => item.querySelector('textarea').value === ''));
  const last = notes.nth(empty);
  await last.getByRole('button', { name: 'Delete note' }).click();
  await last.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=recording-notes] [data-testid=moment-note]').length === 3);
});

test('making the transcript again keeps every note at its moment', async () => {
  const review = page.getByTestId('recording-notes');
  const read = () => review.getByTestId('moment-note').evaluateAll((items) => items.map((item) => [item.dataset.at, item.querySelector('.moment-quote')?.textContent ?? '', item.querySelector('textarea').value]));
  const before = await read();
  await page.evaluate(() => { window.__testTranscript = 'A remade first sentence. A remade second sentence about prophase. A third one.'; });
  await page.getByRole('button', { name: 'Make it again' }).click();
  await review.locator('.transcript-segment', { hasText: 'A remade first sentence' }).waitFor();
  const after = await read();
  // Every note keeps its time and its words. Notes pinned to chosen words or a passage keep those
  // exact words; a note pinned only to a moment shows whatever the new transcript says there.
  assert.deepEqual(after.map(([at, , body]) => [at, body]), before.map(([at, , body]) => [at, body]), 'same times, same notes');
  assert.deepEqual(after.slice(0, 2).map(([, quote]) => quote), before.slice(0, 2).map(([, quote]) => quote), 'chosen words are kept as they were');
  assert.ok(await review.locator('.transcript-segment[data-annotated=true]').count() > 0, 'notes find their passages in the new transcript');
});

test('notes download with their timestamps and the words they were attached to', async () => {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download notes (.md)' }).click()]);
  const saved = path.join(work, file.suggestedFilename());
  await file.saveAs(saved);
  const text = fs.readFileSync(saved, 'utf8');
  assert.match(text, /^# Cell cycle lecture/);
  assert.match(text, /## \d+:\d\d\n> prophase\nProphase: chromosomes condense/);
  assert.match(text, /Ask about checkpoints/);
});

test('it works on a phone, with notes under the transcript', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${URL_BASE}#/record`);
  await page.getByRole('button', { name: 'Start recording' }).click();
  await segments().first().waitFor();
  const transcript = await page.getByTestId('live-transcript').boundingBox();
  const notes = await page.getByTestId('lecture-notes').boundingBox();
  assert.ok(notes.y > transcript.y);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  await page.getByTestId('note-now').click();
  await page.getByTestId('moment-note').first().getByRole('textbox').fill('Phone note');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Stop and save' }).click();
  await page.getByText(/Saved “/).waitFor();
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('a recording without a transcript still takes notes at moments', async () => {
  await page.evaluate(() => { window.__testTranscriberBroken = true; });
  await page.goto(`${URL_BASE}#/record`);
  await page.getByLabel('Recording name').fill('No transcript lecture');
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.locator('[data-testid=live-status][data-status=unavailable]').waitFor();
  await page.waitForTimeout(1200);
  await page.getByTestId('note-now').click();
  await page.getByTestId('moment-note').first().getByRole('textbox').fill('Still noted');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Stop and save' }).click();
  await page.getByRole('link', { name: /Play it|Open it with your notes/ }).click();
  await page.getByTestId('recording-notes').getByText('No timed transcript yet').waitFor();
  assert.equal(await page.getByTestId('recording-notes').getByTestId('moment-note').count(), 1);
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
