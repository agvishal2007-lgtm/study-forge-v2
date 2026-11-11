// Recordings can leave Study Forge in widely supported formats. Every file offered is checked with
// ffprobe: a format is only offered when this browser can genuinely make it, and what comes out
// must be a real, playable file of the right length.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4222;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let browser;
let context;
let page;
let work;
const pageErrors = [];

/** What's really inside a file, according to ffprobe. */
function probe(file) {
  const out = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=format_name,duration:stream=codec_name,codec_type', '-of', 'json', file]).toString());
  return { format: out.format.format_name, duration: Number(out.format.duration), streams: out.streams.map((stream) => `${stream.codec_type}:${stream.codec_name}`) };
}

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-export-'));
  // Recordings like the ones browsers make: Chrome and Firefox record WebM with Opus (and VP8 for
  // video); Safari records MP4/M4A with AAC.
  const make = (args, name) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args, path.join(work, name)]);
  make(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:a', 'libopus', '-b:a', '64k'], 'lecture.webm');
  make(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=24:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=4', '-c:v', 'libvpx', '-b:v', '300k', '-c:a', 'libopus', '-shortest'], 'screen.webm');
  make(['-f', 'lavfi', '-i', 'sine=frequency=500:duration=3', '-c:a', 'aac'], 'phone.m4a');
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await returningStudent(context);
  page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${URL_BASE}#/library`);
  await page.getByTestId('file-input').first().setInputFiles(['lecture.webm', 'screen.webm', 'phone.m4a'].map((name) => path.join(work, name)));
  for (const name of ['lecture.webm', 'screen.webm', 'phone.m4a']) await page.getByRole('link', { name }).waitFor();
  await page.getByRole('button', { name: 'Clear finished' }).click().catch(() => {});
});

after(async () => {
  await browser?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

async function openExport(name) {
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name }).click();
  const box = page.getByTestId('recording-export');
  await box.waitFor();
  await box.getByText('Checking which formats').waitFor({ state: 'detached' });
  return box;
}

async function download(box, label) {
  const [file] = await Promise.all([page.waitForEvent('download'), box.getByRole('button', { name: label, exact: true }).click()]);
  const saved = path.join(work, `out-${Date.now()}-${file.suggestedFilename()}`);
  await file.saveAs(saved);
  return { name: file.suggestedFilename(), info: probe(saved) };
}

test('an audio recording downloads as a real MP3 by default, named after the recording', async () => {
  const box = await openExport('lecture.webm');
  // A .webm with only sound is treated as audio, so MP3 is the main choice.
  const { name, info } = await download(box, 'Download MP3');
  assert.equal(name, 'lecture.mp3');
  assert.equal(info.format, 'mp3');
  assert.deepEqual(info.streams, ['audio:mp3']);
  assert.ok(Math.abs(info.duration - 6) < 0.3, `the MP3 lasts ${info.duration}s, not 6s`);
});

test('every other format offered for audio is a genuine file, and the original is unchanged', async () => {
  const box = await openExport('lecture.webm');
  await box.getByText('More export options').click();
  const offered = await box.locator('.export-list button').allInnerTexts();
  assert.ok(offered.includes('WAV'));
  assert.ok(offered.some((label) => label.startsWith('Original')));
  for (const label of offered) {
    const { name, info } = await download(box, label);
    assert.ok(info.streams.length > 0, `${label} came out empty`);
    assert.ok(Math.abs(info.duration - 6) < 0.3, `${label} lasts ${info.duration}s`);
    if (label === 'WAV') assert.deepEqual([name, info.format, info.streams[0]], ['lecture.wav', 'wav', 'audio:pcm_s16le']);
    if (label.startsWith('Original')) assert.deepEqual([name, info.streams[0]], ['lecture.webm', 'audio:opus']);
  }
});

test('a lecture video offers MP4 only where this browser can make it, and everything offered plays', async () => {
  const box = await openExport('screen.webm');
  const canMp4 = (await box.getByRole('button', { name: 'Download MP4' }).count()) > 0;
  if (canMp4) {
    const { name, info } = await download(box, 'Download MP4');
    assert.equal(name, 'screen.mp4');
    assert.deepEqual(info.streams.sort(), ['audio:aac', 'video:h264']);
  } else {
    // This browser has no H.264 encoder, so it says so instead of offering a broken file.
    await box.getByText("This browser can't make an MP4").waitFor();
  }
  await box.getByText('More export options').click();
  for (const label of await box.locator('.export-list button').allInnerTexts()) {
    const { info } = await download(box, label);
    assert.ok(Math.abs(info.duration - 4) < 0.3, `${label} lasts ${info.duration}s`);
    if (label === 'WebM' || label.startsWith('Original')) assert.ok(info.streams.includes('video:vp8') || info.streams.includes('video:vp9'), `${label} lost its picture`);
    if (label === 'Audio only (MP3)') assert.deepEqual(info.streams, ['audio:mp3']);
  }
});

test('a recording that is already in a format downloads as it is, without converting', async () => {
  const box = await openExport('phone.m4a');
  await box.getByText('More export options').click();
  await box.getByText('Already in this format, so it downloads as it is.').waitFor();
  const { name, info } = await download(box, 'M4A (AAC)');
  assert.equal(name, 'phone.m4a');
  assert.deepEqual(info.streams, ['audio:aac']);
});

test('a conversion can be stopped, and nothing is saved', async () => {
  const box = await openExport('lecture.webm');
  await box.getByText('More export options').click();
  await box.getByRole('button', { name: 'WAV', exact: true }).click();
  // Either it was quick enough to finish, or stopping leaves things as they were; never half a file.
  const stop = box.getByRole('button', { name: 'Stop' });
  if (await stop.count()) {
    await stop.click();
    await box.getByText('Stopped. Nothing was saved, and the recording is unchanged.').waitFor();
  } else {
    await box.getByText('lecture.wav is downloading.').waitFor();
  }
});

test('downloading works on a phone', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await openExport('lecture.webm');
  const { info } = await download(box, 'Download MP3');
  assert.equal(info.format, 'mp3');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
