// Virtual lecture tests. The browser's simulated screen and sound stand in for a real lecture.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const URL_BASE = 'http://localhost:4175/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-screen-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
const ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--auto-select-desktop-capture-source=Entire screen'];
let server;
let context;
let page;
let profiles = 0;
const pageErrors = [];

// Page scripts that replace one sound source with silence or a tone, to prove each one reaches the file.
const SOUND = `
  const toneTrack = (gainValue) => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    const out = ctx.createMediaStreamDestination();
    osc.connect(gain).connect(out);
    osc.start();
    return out.stream.getAudioTracks()[0];
  };
  const realDisplay = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  const realMic = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
`;
const withDisplaySound = (gain) => `${SOUND}
  navigator.mediaDevices.getDisplayMedia = async (o) => {
    const s = await realDisplay(o);
    s.getAudioTracks().forEach((t) => { s.removeTrack(t); t.stop(); });
    s.addTrack(toneTrack(${gain}));
    return s;
  };`;
const withMicSound = (gain) => `
  navigator.mediaDevices.getUserMedia = async () => new MediaStream([toneTrack(${gain})]);`;

async function open(init) {
  await context?.close().catch(() => undefined);
  profiles += 1;
  context = await chromium.launchPersistentContext(path.join(work, `p${profiles}`), { args: ARGS, viewport: { width: 1280, height: 800 } });
  if (init) await context.addInitScript(init);
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${URL_BASE}#/record`);
  await page.getByRole('heading', { name: 'Record a lecture' }).waitFor();
}

const chooseVirtual = () => page.getByRole('radio', { name: /Virtual/ }).check();
const begin = async () => {
  await page.getByRole('button', { name: 'Choose screen and start' }).click();
  await page.getByRole('button', { name: 'Stop and save' }).waitFor();
};
const pieces = () => page.evaluate(() => new Promise((resolve) => {
  const request = indexedDB.open('study-forge');
  request.onsuccess = () => {
    const count = request.result.transaction('recordingChunks').objectStore('recordingChunks').count();
    count.onsuccess = () => { request.result.close(); resolve(count.result); };
  };
}));
const waitForPiece = async () => {
  const deadline = Date.now() + 15000;
  while ((await pieces()) < 1) {
    assert.ok(Date.now() < deadline, 'a piece should be saved');
    await page.waitForTimeout(200);
  }
};
const stopAndOpen = async () => {
  await page.getByRole('button', { name: 'Stop and save' }).click();
  await page.getByRole('link', { name: 'Play it' }).click();
};

/** Measures the file itself: real picture in the video player, and how loud its sound is. */
async function inspectSaved() {
  await page.getByTestId('video-player').waitFor();
  await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return v && Number.isFinite(v.duration) && v.duration > 0 && v.currentTime < 1 && v.videoWidth > 0;
  });
  return page.evaluate(async () => {
    const video = document.querySelector('video');
    video.muted = true;
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 500));
    video.pause();
    const id = location.hash.split('/').pop();
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('materials');
    const file = await (await dir.getFileHandle(id)).getFile();
    const audio = await new AudioContext().decodeAudioData(await file.arrayBuffer()).catch(() => null);
    let peak = 0;
    if (audio) for (const sample of audio.getChannelData(0)) peak = Math.max(peak, Math.abs(sample));
    const played = await (await fetch(video.src)).blob();
    const name = document.querySelector('h1').textContent;
    return { width: video.videoWidth, time: video.currentTime, duration: video.duration, type: played.type, name, peak };
  });
}

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4175', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
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

test('a virtual lecture saves real picture and sound, and replays', async () => {
  await open();
  await chooseVirtual();
  await page.screenshot({ path: path.join(shots, 'virtual-setup.png'), fullPage: true });
  await begin();
  await waitForPiece();
  await page.screenshot({ path: path.join(shots, 'virtual-running.png') });
  await stopAndOpen();
  const saved = await inspectSaved();
  assert.ok(saved.width > 0, 'has a picture');
  assert.ok(saved.time > 0, 'playback advances');
  assert.ok(saved.duration > 4, `duration ${saved.duration}`);
  assert.ok(saved.peak > 0.01, `sound peak ${saved.peak}`);
  assert.equal(saved.type, 'video/webm');
  assert.match(saved.name, /\.webm$/);
  await page.screenshot({ path: path.join(shots, 'virtual-playback.png') });
});

test('the lecture sound reaches the file when the microphone is also on and silent', async () => {
  await open(withDisplaySound(0.5) + withMicSound(0));
  await chooseVirtual();
  await page.getByLabel(/Also record my microphone/).check();
  await begin();
  await waitForPiece();
  await stopAndOpen();
  const saved = await inspectSaved();
  assert.ok(saved.peak > 0.05, `lecture sound peak ${saved.peak}`);
});

test('the student voice reaches the file when the lecture is silent', async () => {
  await open(withDisplaySound(0) + withMicSound(0.5));
  await chooseVirtual();
  await page.getByLabel(/Also record my microphone/).check();
  await begin();
  await waitForPiece();
  await stopAndOpen();
  const saved = await inspectSaved();
  assert.ok(saved.peak > 0.05, `microphone peak ${saved.peak}`);
});

const NO_DISPLAY_AUDIO = `
  const real = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getDisplayMedia = async (o) => {
    const s = await real(o);
    s.getAudioTracks().forEach((t) => { s.removeTrack(t); t.stop(); });
    return s;
  };`;

test('forgetting to share audio gives an unmissable warning', async () => {
  await open(NO_DISPLAY_AUDIO);
  await chooseVirtual();
  await begin();
  await page.getByTestId('no-audio').getByText('No sound is being recorded').waitFor();
  await page.screenshot({ path: path.join(shots, 'virtual-no-audio.png') });
  await waitForPiece();
  await stopAndOpen();
  const saved = await inspectSaved();
  assert.ok(saved.width > 0, 'the picture still saves');
});

test('missing lecture audio with the microphone on says exactly that', async () => {
  await open(NO_DISPLAY_AUDIO);
  await chooseVirtual();
  await page.getByLabel(/Also record my microphone/).check();
  await begin();
  await page.getByTestId('no-audio').getByText("The lecture's sound isn't being recorded, only your microphone").waitFor();
  await page.getByRole('button', { name: 'Stop and save' }).click();
  await page.getByText(/^Saved “/).waitFor();
});

test('a blocked microphone still records the lecture and says so', async () => {
  await open(`navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('x', 'NotAllowedError'));`);
  await chooseVirtual();
  await page.getByLabel(/Also record my microphone/).check();
  await begin();
  await page.getByText("your own voice won't be in this recording").waitFor();
  await page.getByRole('button', { name: 'Stop and save' }).click();
  await page.getByText(/^Saved “/).waitFor();
});

test('cancelling the share picker records nothing and explains', async () => {
  await open(`navigator.mediaDevices.getDisplayMedia = () => Promise.reject(new DOMException('x', 'NotAllowedError'));`);
  await chooseVirtual();
  await page.getByRole('button', { name: 'Choose screen and start' }).click();
  await page.getByText('Screen sharing was cancelled, so nothing was recorded').waitFor();
  await page.getByRole('button', { name: 'Choose screen and start' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Interrupted recordings' }).count(), 0);
});

test("the browser's Stop sharing button saves the recording", async () => {
  await open(`
    const real = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async (o) => (window.__display = await real(o));`);
  await chooseVirtual();
  await begin();
  await waitForPiece();
  await page.evaluate(() => {
    const [track] = window.__display.getVideoTracks();
    track.stop();
    track.dispatchEvent(new Event('ended'));
  });
  await page.getByText('You stopped sharing your screen').waitFor();
  await page.getByRole('link', { name: 'Play it' }).click();
  assert.ok((await inspectSaved()).width > 0);
});

test('closing the browser during a virtual lecture keeps it', async () => {
  await open();
  await chooseVirtual();
  await begin();
  await waitForPiece();
  const profile = path.join(work, `p${profiles}`);
  await context.close();
  context = await chromium.launchPersistentContext(profile, { args: ARGS, viewport: { width: 1280, height: 800 } });
  page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${URL_BASE}#/record`);
  await page.getByRole('button', { name: 'Save recording' }).click();
  await page.getByRole('heading', { name: 'Interrupted recordings' }).waitFor({ state: 'detached' });
  await page.getByRole('navigation').getByRole('link', { name: 'Library' }).click();
  await page.getByRole('link', { name: /Lecture/ }).click();
  assert.ok((await inspectSaved()).width > 0);
});

test('devices that cannot share a screen explain why, and in-person still works', async () => {
  await open('delete MediaDevices.prototype.getDisplayMedia;');
  await page.getByRole('radio', { name: /Virtual/ }).isDisabled();
  assert.equal(await page.getByRole('radio', { name: /Virtual/ }).isDisabled(), true);
  await page.getByText("Needs Chrome or Edge on a computer").waitFor();
  await page.setViewportSize({ width: 375, height: 700 });
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main');
    return Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth);
  });
  assert.ok(overflow <= 0, `overflow ${overflow}`);
  await page.screenshot({ path: path.join(shots, 'phone-record-choice.png'), fullPage: true });
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('button', { name: 'Stop and save' }).waitFor();
  await page.getByRole('button', { name: 'Stop and save' }).click();
  await page.getByText(/^Saved “/).waitFor();
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
