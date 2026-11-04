// Real-browser tests. Run with: npm test
// They use a real profile folder, so "close the browser and reopen it" is genuinely tested.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const URL_BASE = 'http://localhost:4173/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-'));
const profile = path.join(work, 'profile');
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
let server;
let context;
let page;
const pageErrors = [];

function makePdf(pages) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(' ')}] >>`,
  ];
  for (let i = 0; i < pages; i++) {
    const stream = `BT /F1 24 Tf 72 700 Td (Accounting notes page ${i + 1}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { out += `${String(o).padStart(10, '0')} 00000 n \n`; });
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const fixture = (name, data) => {
  const file = path.join(work, name);
  fs.writeFileSync(file, data);
  return file;
};

const pdfFile = fixture('accounting-notes.pdf', makePdf(3));
const textFile = fixture('reading-list.txt', 'Chapter 1: The accounting equation\nAssets = Liabilities + Equity\n');
const brokenVideo = fixture('broken.mp4', Buffer.from('this is not really a video'));
const brokenPdf = fixture('broken.pdf', Buffer.from('this is not really a pdf'));
const extraFile = fixture('extra-note.txt', 'One more note, unlike the others.\n');
const slides = fixture('slides.pptx', Buffer.from('fake slides'));
const largeFile = fixture('large-lecture.bin', Buffer.alloc(300 * 1024 * 1024, 7));
const audioFile = path.join(work, 'lecture.wav');
const videoFile = path.join(work, 'clip.webm');
execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', audioFile]);
execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10:duration=2', '-c:v', 'libvpx', videoFile]);

async function open() {
  context = await chromium.launchPersistentContext(profile, { acceptDownloads: true, viewport: { width: 1280, height: 800 } });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
}

const addFiles = (files, scope = page) => scope.getByTestId('file-input').first().setInputFiles(files);
const saved = (name) => page.locator('.save-panel li', { hasText: name }).getByText('Saved', { exact: true });
const clearPanel = async () => {
  const clear = page.getByRole('button', { name: 'Clear finished' });
  if (await clear.count()) await clear.click();
};

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await open();
});

after(async () => {
  await context?.close();
  if (server) process.kill(-server.pid);
  fs.rmSync(work, { recursive: true, force: true });
});

test('a new student is asked to create a course', async () => {
  await page.getByRole('heading', { name: 'Start with one course' }).waitFor();
  await page.screenshot({ path: path.join(shots, 'welcome.png') });
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByText('Enter a course name.').waitFor();
});

test('buttons are blue bubbles, with no yellow left on the page', async () => {
  await page.mouse.move(0, 0); // A button under the mouse shows its lighter hover color.
  await page.waitForTimeout(300);
  const look = await page.getByRole('button', { name: 'Create course' }).evaluate((el) => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, radius: parseFloat(style.borderTopLeftRadius), height: el.offsetHeight };
  });
  assert.equal(look.background, 'rgb(125, 211, 252)');
  assert.ok(look.radius >= look.height / 2, 'fully rounded');
  const yellow = await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => {
    const style = getComputedStyle(el);
    return [style.color, style.backgroundColor, style.borderTopColor].some((value) => value === 'rgb(232, 185, 79)');
  }).length);
  assert.equal(yellow, 0);
});

test('create a course and a topic', async () => {
  await page.getByLabel('Course name').fill('Financial Accounting');
  await page.getByLabel('Course code').fill('ACC 211');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Financial Accounting' }).waitFor();
  await page.getByLabel('New topic').fill('Chapter 1');
  await page.getByRole('button', { name: 'Add topic' }).click();
  await page.getByRole('heading', { name: 'Chapter 1' }).waitFor();
});

test('save files with visible results', async () => {
  await addFiles([pdfFile, textFile, audioFile, videoFile, brokenVideo, brokenPdf, slides]);
  for (const file of [pdfFile, textFile, audioFile, videoFile, brokenVideo, brokenPdf, slides]) {
    await saved(path.basename(file)).waitFor({ timeout: 20000 });
  }
  await clearPanel();
});

test('files and courses survive closing the browser completely', async () => {
  const before = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('materials');
    let count = 0;
    for await (const _ of dir.values()) count++;
    return count;
  });
  assert.equal(before, 7);
  await context.close();
  await open();
  await page.getByRole('link', { name: /Financial Accounting/ }).first().waitFor();
  await page.screenshot({ path: path.join(shots, 'today.png') });
  await page.getByRole('navigation').getByRole('link', { name: 'Library' }).click();
  await page.getByRole('link', { name: 'accounting-notes.pdf' }).click();
  await page.getByText('Page 1 of 3').waitFor();
  await page.waitForSelector('[data-rendered-page="1"]');
});

test('the same PDF renders real ink and moves between pages', async () => {
  const inked = () => page.getByTestId('pdf-canvas').evaluate((canvas) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.length; i += 4) if (data[i] < 100) return true;
    return false;
  });
  assert.equal(await inked(), true);
  await page.screenshot({ path: path.join(shots, 'pdf.png') });
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.waitForSelector('[data-rendered-page="2"]');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByText('125%').waitFor();
  await page.getByRole('button', { name: 'Full screen' }).click();
  await page.getByRole('button', { name: 'Exit full screen' }).click();
  await page.getByRole('button', { name: 'Full screen' }).waitFor();
});

test('download returns the identical original file', async () => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download', exact: true }).click()]);
  const copy = await download.path();
  assert.equal(download.suggestedFilename(), 'accounting-notes.pdf');
  assert.deepEqual(fs.readFileSync(copy), fs.readFileSync(pdfFile));
});

async function openFile(name) {
  await page.getByRole('navigation').getByRole('link', { name: 'Library' }).click();
  await page.getByRole('link', { name, exact: true }).click();
}

test('text opens, audio and video really play', async () => {
  await openFile('reading-list.txt');
  await page.getByText('Assets = Liabilities + Equity').waitFor();
  for (const [name, id] of [['lecture.wav', 'audio-player'], ['clip.webm', 'video-player']]) {
    await openFile(name);
    const duration = await page.getByTestId(id).evaluate(async (media) => {
      media.muted = true;
      await media.play();
      await new Promise((resolve) => setTimeout(resolve, 400));
      media.pause();
      if (!(media.currentTime > 0)) throw new Error('did not advance');
      return media.duration;
    });
    assert.ok(duration > 1.5);
  }
});

test('files that cannot display offer a download, not a crash', async () => {
  for (const name of ['broken.mp4', 'broken.pdf', 'slides.pptx']) {
    await openFile(name);
    await page.getByTestId('viewer-fallback').waitFor();
    await page.getByRole('link', { name: `Download ${name}` }).waitFor();
  }
});

test('a duplicate is caught, and can be moved instead of saved twice', async () => {
  await page.getByRole('navigation').getByRole('link', { name: 'Courses' }).click();
  await page.getByRole('link', { name: /Financial Accounting/ }).click();
  await page.getByRole('heading', { name: 'Financial Accounting' }).waitFor();
  const topic = page.locator('.topic', { hasText: 'Chapter 1' });
  assert.equal(await topic.locator('.files li').count(), 0);
  await addFiles([textFile], topic);
  await page.getByText('You already saved this file').waitFor();
  await page.getByRole('button', { name: 'Move it here' }).click();
  await topic.getByRole('link', { name: 'reading-list.txt' }).waitFor();
  await page.screenshot({ path: path.join(shots, 'course.png') });
  await page.getByRole('navigation').getByRole('link', { name: 'Library' }).click();
  await page.getByRole('heading', { name: 'Library' }).waitFor();
  await page.locator('.files li', { hasText: 'accounting-notes.pdf' }).waitFor();
  assert.equal(await page.locator('.files li', { hasText: 'reading-list.txt' }).count(), 1);
});

test('progress is real and cancelling a large save keeps nothing', async () => {
  await addFiles([largeFile]);
  await page.locator('[role=progressbar]').waitFor();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('.save-panel li', { hasText: 'large-lecture.bin' }).getByText('Cancelled').waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Library' }).waitFor();
  await page.getByRole('link', { name: 'accounting-notes.pdf' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'large-lecture.bin' }).count(), 0);
  await addFiles([largeFile]);
  await saved('large-lecture.bin').waitFor({ timeout: 60000 });
  await clearPanel();
  await page.getByRole('link', { name: 'large-lecture.bin' }).click();
  await page.getByTestId('viewer-fallback').waitFor();
});

test('a save cut off by a reload leaves nothing behind', async () => {
  const entries = () => page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('materials');
    let count = 0;
    for await (const _ of dir.keys()) count++;
    return count;
  });
  const before = await entries();
  await page.evaluate(async () => {
    // What an interrupted save leaves: an entry with no file record.
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('materials');
    await dir.getFileHandle('leftover-from-a-crash', { create: true });
  });
  assert.equal(await entries(), before + 1);
  await page.reload();
  await page.getByRole('heading', { name: 'large-lecture.bin' }).waitFor();
  const deadline = Date.now() + 5000;
  while ((await entries()) !== before) {
    assert.ok(Date.now() < deadline, 'the leftover should be removed');
    await page.waitForTimeout(100);
  }
  // Real files are untouched, including the one on screen.
  await page.getByTestId('viewer-fallback').waitFor();
});

test('deleting needs confirmation, and only then removes the file', async () => {
  await page.getByRole('button', { name: 'Delete file' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.reload();
  await page.getByRole('heading', { name: 'large-lecture.bin' }).waitFor();
  await page.getByRole('button', { name: 'Delete file' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete file' }).click();
  await page.getByRole('heading', { name: 'Library' }).waitFor();
  await page.getByRole('link', { name: 'accounting-notes.pdf' }).waitFor();
  assert.match(page.url(), /#\/library$/);
  assert.equal(await page.getByRole('link', { name: 'large-lecture.bin' }).count(), 0);
  const left = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('materials');
    let count = 0;
    for await (const _ of dir.values()) count++;
    return count;
  });
  assert.equal(left, 7);
});

test('moving to another screen during a delete does not get overridden', async () => {
  await addFiles([extraFile]);
  await saved('extra-note.txt').waitFor();
  await clearPanel();
  await page.getByRole('link', { name: 'extra-note.txt' }).click();
  await page.getByRole('button', { name: 'Delete file' }).click();
  await page.evaluate(() => {
    // Leave at the same moment the delete is confirmed.
    [...document.querySelectorAll('dialog button')].find((b) => b.textContent === 'Delete file').click();
    location.hash = '#/settings';
  });
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await page.waitForTimeout(500);
  assert.match(page.url(), /#\/settings$/);
  await page.getByRole('navigation').getByRole('link', { name: 'Library' }).click();
  await page.getByRole('link', { name: 'accounting-notes.pdf' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'extra-note.txt' }).count(), 0);
});

test('deleting a course keeps its files in the Library', async () => {
  await page.getByRole('navigation').getByRole('link', { name: 'Courses' }).click();
  await page.getByRole('link', { name: /Financial Accounting/ }).click();
  await page.getByRole('button', { name: 'Delete course' }).click();
  await page.getByRole('dialog').getByText('7 files stay').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete course' }).click();
  await page.getByRole('heading', { name: 'Courses' }).waitFor();
  await page.getByRole('navigation').getByRole('link', { name: 'Library' }).click();
  await page.getByRole('link', { name: 'accounting-notes.pdf' }).waitFor();
  assert.equal(await page.locator('.files li').count(), 7);
  // The files themselves must still open, not just their names.
  await page.getByRole('link', { name: 'reading-list.txt' }).click();
  await page.getByText('Assets = Liabilities + Equity').waitFor();
});

test('phone layout has no sideways scrolling and keeps every destination', async () => {
  await page.setViewportSize({ width: 375, height: 700 });
  for (const [label, heading] of [['Today', 'Today'], ['Courses', 'Courses'], ['Library', 'Library'], ['Settings', 'Settings']]) {
    await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
    await page.getByRole('heading', { name: heading, exact: true }).first().waitFor();
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main');
      return Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth);
    });
    assert.ok(overflow <= 0, `${label} overflows by ${overflow}px`);
    await page.screenshot({ path: path.join(shots, `phone-${label.toLowerCase()}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
