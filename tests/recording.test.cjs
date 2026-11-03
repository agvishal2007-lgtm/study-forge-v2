// Recording tests, using the browser's simulated microphone (it plays regular beeps).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const URL_BASE = 'http://localhost:4174/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-rec-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
const ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
let server;
let context;
let page;
const pageErrors = [];

async function open(profile = 'main', init) {
  context = await chromium.launchPersistentContext(path.join(work, profile), { args: ARGS, viewport: { width: 1280, height: 800 } });
  if (init) await context.addInitScript(init);
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
}

const nav = (name) => page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
const savedPieces = () => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('study-forge');
  request.onerror = reject;
  request.onsuccess = () => {
    const count = request.result.transaction('recordingChunks').objectStore('recordingChunks').count();
    count.onsuccess = () => { request.result.close(); resolve(count.result); };
  };
}));
const waitForPieces = (n) => page.waitForFunction(() => /[1-9]\.?\d* ?(KB|MB)/.test(document.body.innerText)).then(async () => {
  const deadline = Date.now() + 15000;
  while ((await savedPieces()) < n) {
    assert.ok(Date.now() < deadline, `expected ${n} saved pieces`);
    await page.waitForTimeout(250);
  }
});
const assertPlays = async () => {
  const player = page.getByTestId('audio-player');
  await player.waitFor();
  await page.waitForFunction(() => {
    const audio = document.querySelector('audio');
    return audio && Number.isFinite(audio.duration) && audio.duration > 0 && audio.currentTime < 1;
  });
  const result = await player.evaluate(async (audio) => {
    audio.muted = true;
    await audio.play();
    await new Promise((resolve) => setTimeout(resolve, 500));
    audio.pause();
    return { time: audio.currentTime, duration: audio.duration };
  });
  assert.ok(result.time > 0, 'playback should advance');
  return result;
};

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
});

after(async () => {
  await context?.close().catch(() => undefined);
  if (server) process.kill(-server.pid);
  fs.rmSync(work, { recursive: true, force: true });
});

test('existing students keep their courses when the site updates', async () => {
  const profile = 'upgrade';
  context = await chromium.launchPersistentContext(path.join(work, profile), { args: ARGS });
  page = context.pages()[0] ?? (await context.newPage());
  await page.route('**/blank.html', (route) => route.fulfill({ contentType: 'text/html', body: '<title>blank</title>' }));
  await page.goto(`${URL_BASE}blank.html`);
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('study-forge', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('courses', { keyPath: 'id' });
      db.createObjectStore('topics', { keyPath: 'id' }).createIndex('courseId', 'courseId');
      const materials = db.createObjectStore('materials', { keyPath: 'id' });
      materials.createIndex('hash', 'hash');
      materials.createIndex('createdAt', 'createdAt');
      db.createObjectStore('blobs');
    };
    request.onerror = reject;
    request.onsuccess = () => {
      const tx = request.result.transaction('courses', 'readwrite');
      tx.objectStore('courses').put({ id: 'old', name: 'Saved Before Update', code: '', color: '#E8B94F', createdAt: 1 });
      tx.oncomplete = () => { request.result.close(); resolve(); };
    };
  }));
  await page.goto(URL_BASE);
  await page.getByRole('link', { name: /Saved Before Update/ }).waitFor();
  await nav('Record');
  await page.getByRole('button', { name: 'Start recording' }).waitFor();
  await context.close();
});

test('record across screens, pause, stop, and replay in the right course', async () => {
  await open();
  await page.getByLabel('Course name').fill('Biology');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByLabel('New topic').fill('Cells');
  await page.getByRole('button', { name: 'Add topic' }).click();
  await page.getByRole('heading', { name: 'Cells' }).waitFor();
  await page.getByRole('link', { name: 'Record a lecture for this course' }).click();

  await page.getByLabel('Recording name').fill('Cell biology lecture');
  assert.equal(await page.getByLabel('Course').inputValue() !== '', true);
  await page.getByLabel('Topic').selectOption({ label: 'Cells' });
  await page.screenshot({ path: path.join(shots, 'record-setup.png') });
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('button', { name: 'Stop and save' }).waitFor();

  await page.waitForFunction(() => Number(document.querySelector('[data-testid=level]')?.dataset.level) > 0, null, { timeout: 8000 });
  await waitForPieces(1);
  await page.screenshot({ path: path.join(shots, 'record-running.png') });

  // Still running on another screen.
  await nav('Library');
  await page.getByTestId('recording-bar').waitFor();
  await page.screenshot({ path: path.join(shots, 'record-bar.png') });
  await page.getByRole('link', { name: 'Go to recording' }).click();

  // The clock stands still while paused.
  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await page.getByTestId('clock').textContent();
  await page.waitForTimeout(1800);
  assert.equal(await page.getByTestId('clock').textContent(), paused);
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForTimeout(1200);
  assert.notEqual(await page.getByTestId('clock').textContent(), paused);

  await page.getByRole('button', { name: 'Stop and save' }).click();
  await page.getByText('Saved “Cell biology lecture').waitFor();
  assert.equal(await savedPieces(), 0, 'pieces are removed after the file is stored');
  await page.getByRole('link', { name: 'Play it' }).click();
  const { duration } = await assertPlays();
  assert.ok(duration > 4 && duration < 30, `duration was ${duration}`);
  assert.equal(await page.getByLabel('Topic').locator('option:checked').textContent(), 'Cells');

  // The saved file must hold real sound throughout, not silence or only its first piece.
  const sound = await page.evaluate(async () => {
    const id = location.hash.split('/').pop();
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('materials');
    const file = await (await dir.getFileHandle(id)).getFile();
    const audio = await new AudioContext().decodeAudioData(await file.arrayBuffer());
    const data = audio.getChannelData(0);
    const peakOf = (from, to) => {
      let peak = 0;
      for (let i = Math.floor(from * data.length); i < Math.floor(to * data.length); i++) peak = Math.max(peak, Math.abs(data[i]));
      return peak;
    };
    return { seconds: audio.duration, firstHalf: peakOf(0, 0.5), secondHalf: peakOf(0.5, 1) };
  });
  assert.ok(sound.seconds > 4, `decoded ${sound.seconds}s`);
  assert.ok(sound.firstHalf > 0.01 && sound.secondHalf > 0.01, `peaks ${sound.firstHalf}, ${sound.secondHalf}`);

  // It stays after a reload, and the recording is in its course.
  await page.reload();
  await assertPlays();
  await nav('Courses');
  await page.getByRole('link', { name: /Biology/ }).click();
  await page.locator('.topic', { hasText: 'Cells' }).getByRole('link', { name: /Cell biology lecture/ }).waitFor();
});

test('closing the browser during a recording keeps the audio', async () => {
  await nav('Record');
  await page.getByLabel('Recording name').fill('Crash test lecture');
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('button', { name: 'Stop and save' }).waitFor();
  await waitForPieces(1);
  await context.close(); // No stop button, no goodbye.

  await open();
  await page.getByText('A recording was interrupted').waitFor();
  await page.getByRole('link', { name: 'Save or discard it' }).click();
  await page.getByRole('heading', { name: 'Interrupted recordings' }).waitFor();
  await page.screenshot({ path: path.join(shots, 'record-interrupted.png') });
  await page.getByRole('button', { name: 'Save recording' }).click();
  await page.getByRole('heading', { name: 'Interrupted recordings' }).waitFor({ state: 'detached' });
  await nav('Library');
  await page.getByRole('link', { name: /Crash test lecture/ }).click();
  await assertPlays();
});

test('discarding an interrupted recording asks first', async () => {
  await nav('Record');
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('button', { name: 'Stop and save' }).waitFor();
  await waitForPieces(1);
  await context.close();
  await open();
  await nav('Record');
  await page.getByRole('button', { name: 'Discard' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  assert.ok((await savedPieces()) >= 1, 'cancelling keeps it');
  await page.getByRole('button', { name: 'Discard' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard recording' }).click();
  await page.getByRole('heading', { name: 'Interrupted recordings' }).waitFor({ state: 'detached' });
  assert.equal(await savedPieces(), 0);
});

test('a second tab does not treat a live recording as interrupted', async () => {
  await nav('Record');
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('button', { name: 'Stop and save' }).waitFor();
  await waitForPieces(1);
  const other = await context.newPage();
  await other.goto(`${URL_BASE}#/record`);
  await other.getByRole('button', { name: 'Start recording' }).waitFor();
  await other.waitForTimeout(500);
  assert.equal(await other.getByRole('heading', { name: 'Interrupted recordings' }).count(), 0);
  await other.close();
  await page.getByRole('button', { name: 'Stop and save' }).click();
  await page.getByText(/^Saved /).waitFor();
});

test('losing the microphone saves what was captured and says so', async () => {
  await context.close();
  await open('lost-mic', () => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (options) => (window.__stream = await original(options));
  });
  await nav('Record');
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('button', { name: 'Stop and save' }).waitFor();
  await waitForPieces(1);
  await page.evaluate(() => {
    const [track] = window.__stream.getAudioTracks();
    track.stop();
    track.dispatchEvent(new Event('ended'));
  });
  await page.getByText('The microphone was disconnected or turned off').waitFor();
  await page.getByText(/^Saved /).waitFor();
});

for (const [name, message] of [
  ['NotAllowedError', "doesn't have permission to use your microphone"],
  ['NotFoundError', 'No microphone was found'],
]) {
  test(`${name} gives a clear message and leaves the page working`, async () => {
    await context.close();
    await open(`mic-${name}`, `navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('x', '${name}'));`);
    await nav('Record');
    await page.getByRole('button', { name: 'Start recording' }).click();
    await page.getByText(message).waitFor();
    await page.getByRole('button', { name: 'Start recording' }).waitFor();
  });
}

test('a browser without recording points to adding a file instead', async () => {
  await context.close();
  await open('no-recorder', 'delete window.MediaRecorder;');
  await nav('Record');
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByText("This browser can't record audio").waitFor();
  await page.getByRole('button', { name: 'Add files' }).waitFor();
});

test('recording works at phone size without sideways scrolling', async () => {
  await context.close();
  await open('phone');
  await page.setViewportSize({ width: 375, height: 700 });
  await nav('Record');
  const overflow = () => page.evaluate(() => {
    const main = document.querySelector('main');
    return Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth);
  });
  assert.ok((await overflow()) <= 0);
  await page.screenshot({ path: path.join(shots, 'phone-record.png') });
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('button', { name: 'Stop and save' }).waitFor();
  assert.ok((await overflow()) <= 0);
  await page.screenshot({ path: path.join(shots, 'phone-recording.png') });
  await nav('Today');
  await page.getByTestId('recording-bar').waitFor();
  assert.ok((await overflow()) <= 0);
  await page.getByRole('link', { name: 'Go to recording' }).click();
  await page.getByRole('button', { name: 'Stop and save' }).click();
  await page.getByText(/^Saved /).waitFor();
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
