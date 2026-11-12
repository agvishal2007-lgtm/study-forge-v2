// Prompt 9: a real file over 2 GB is saved whole on the device, checked, and only then called Saved.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const PORT = 4224;
const URL_BASE = `http://localhost:${PORT}/`;
const SIZE = 2 * 1024 * 1024 * 1024 + 5 * 1024 * 1024; // 2 GB and a bit
let server;
let context;
let page;
let work;
let big;
const pageErrors = [];

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-large-'));
  big = path.join(work, 'whole-semester-lectures.mp4');
  // Real bytes throughout, with a marker every 64 MB, so a lost or repeated piece would show.
  const handle = fs.openSync(big, 'w');
  const block = Buffer.alloc(64 * 1024 * 1024, 0x2a);
  for (let written = 0, n = 0; written < SIZE; n++) {
    const size = Math.min(block.length, SIZE - written);
    block.write(`piece ${n} `, 0);
    fs.writeSync(handle, block, 0, size);
    written += size;
  }
  fs.closeSync(handle);
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  context = await chromium.launchPersistentContext(path.join(work, 'profile'), { viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await returningStudent(context);
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${URL_BASE}#/library`);
});

after(async () => {
  await context?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('a file over 2 GB saves whole, with progress, and its fingerprint matches the original', { timeout: 15 * 60_000 }, async () => {
  const started = Date.now();
  await page.getByTestId('file-input').first().setInputFiles(big);
  const row = page.locator('.save-panel li').first();
  // Progress is shown while it works.
  await row.getByRole('progressbar').waitFor();
  await page.locator('.save-panel li[data-phase=saved]').waitFor({ timeout: 14 * 60_000 });
  const seconds = Math.round((Date.now() - started) / 1000);
  const stored = await page.evaluate(async () => {
    const request = indexedDB.open('study-forge');
    const db = await new Promise((resolve) => { request.onsuccess = () => resolve(request.result); });
    const all = await new Promise((resolve) => { const get = db.transaction('materials').objectStore('materials').getAll(); get.onsuccess = () => resolve(get.result); });
    db.close();
    const material = all.find((entry) => entry.name === 'whole-semester-lectures.mp4');
    const root = await navigator.storage.getDirectory();
    let file = null;
    for await (const [name, handle] of root.entries()) {
      if (handle.kind !== 'directory') continue;
      try { file = await (await handle.getFileHandle(material.id)).getFile(); break; } catch { /* not this folder */ }
    }
    const tail = file ? new TextDecoder().decode(await file.slice(32 * 64 * 1024 * 1024, 32 * 64 * 1024 * 1024 + 9).arrayBuffer()) : '';
    return { size: material.size, hash: material.hash, storedSize: file?.size ?? null, tail };
  });
  const expected = await new Promise((resolve, reject) => {
    const hasher = crypto.createHash('sha256');
    fs.createReadStream(big).on('data', (chunk) => hasher.update(chunk)).on('end', () => resolve(hasher.digest('hex'))).on('error', reject);
  });
  console.log(`2 GB file saved in ${seconds}s`);
  assert.equal(stored.size, SIZE);
  assert.equal(stored.storedSize, SIZE, 'every byte is on the device');
  assert.equal(stored.hash, expected, 'the fingerprint matches the original');
  assert.equal(stored.tail, 'piece 32 ', 'pieces are in the right place');
  assert.match(await page.locator('.save-panel li[data-phase=saved]').innerText(), /Saved/);
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
