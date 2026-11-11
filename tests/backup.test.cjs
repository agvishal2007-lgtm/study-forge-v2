// Backup tests: a real browser makes a real zip, then a fresh browser restores it.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const URL_BASE = 'http://localhost:4177/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-backup-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
const ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
const NO_PICKER = 'delete window.showSaveFilePicker;';
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const python = (script, ...args) => execFileSync('python3', ['-I', '-c', script, ...args], { encoding: 'utf8' });

const fixture = (name, data) => {
  const dir = fs.mkdtempSync(path.join(work, 'f-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, data);
  return file;
};
const big = crypto.randomBytes(40 * 1024 * 1024);
const FILES = {
  big: fixture('large lecture.bin', big),
  unicode: fixture('Résumé — 第1章.txt', 'Non-English file name\n'),
  hostile: fixture('a..b;c.txt', 'Odd file name\n'),
  sameA: fixture('notes.txt', 'First file named notes\n'),
  sameB: fixture('notes.txt', 'Second file named notes\n'),
};
const huge = fixture('huge.bin', Buffer.alloc(350 * 1024 * 1024, 3));

let server;
let context;
let page;
let profiles = 0;
const pageErrors = [];
let backupPath;
let original = {};

async function open(init = NO_PICKER, keepProfile) {
  await context?.close().catch(() => undefined);
  if (!keepProfile) profiles += 1;
  context = await chromium.launchPersistentContext(path.join(work, `p${profiles}`), { args: ARGS, acceptDownloads: true, viewport: { width: 1280, height: 800 }, env: { ...process.env, LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' } });
  await context.addInitScript(init);
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
}
const nav = (name) => page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
const clearPanel = async () => {
  const clear = page.getByRole('button', { name: 'Clear finished' });
  if (await clear.count()) await clear.click();
};
const download = async () => {
  await nav('Settings');
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByRole('button', { name: 'Create backup' }).click()]);
  await page.getByTestId('backup-result').waitFor();
  const target = path.join(fs.mkdtempSync(path.join(work, 'b-')), file.suggestedFilename());
  await file.saveAs(target);
  return target;
};
const restore = async (file) => {
  await nav('Settings');
  await page.getByTestId('restore-input').setInputFiles(file);
  await page.getByRole('heading', { name: 'Restore this backup?' }).waitFor();
  await page.screenshot({ path: path.join(shots, 'restore-confirm.png') });
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  const report = page.getByTestId('restore-report');
  await report.waitFor({ timeout: 120000 });
  return report.textContent();
};
const savedFiles = () => page.evaluate(async () => {
  const records = await new Promise((resolve, reject) => {
    const request = indexedDB.open('study-forge');
    request.onerror = reject;
    request.onsuccess = () => {
      const all = request.result.transaction('materials').objectStore('materials').getAll();
      all.onsuccess = () => { request.result.close(); resolve(all.result); };
    };
  });
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('materials');
  const out = [];
  for (const record of records) {
    const file = await (await dir.getFileHandle(record.id)).getFile();
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    out.push({ name: record.name, size: file.size, sha: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''), course: record.courseId, topic: record.topicId, type: record.mimeType, created: record.createdAt });
  }
  return out.sort((a, b) => a.sha.localeCompare(b.sha));
});
const rewriteZip = (source, script) => {
  const target = path.join(fs.mkdtempSync(path.join(work, 'z-')), 'edited.zip');
  python(`
import sys, zipfile, json
src, dst = sys.argv[1], sys.argv[2]
${script}
`, source, target);
  return target;
};

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4177', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
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

test('set up a realistic study library, including a recording', async () => {
  await open();
  await page.getByLabel('Course name').fill('Biology / 101');
  await page.getByLabel('Course code').fill('BIO 101');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Biology / 101' }).waitFor();
  await page.getByLabel('New topic').fill('Cells');
  await page.getByRole('button', { name: 'Add topic' }).click();
  await page.getByRole('heading', { name: 'Cells', exact: true }).waitFor();
  const topic = page.locator('.topic');
  await page.getByTestId('file-input').first().setInputFiles([FILES.big, FILES.unicode, FILES.hostile, FILES.sameA]);
  await topic.getByTestId('file-input').setInputFiles(FILES.sameB);
  await page.locator('.save-panel li[data-phase=saved]').nth(4).waitFor({ timeout: 60000 });
  await clearPanel();

  await page.getByRole('link', { name: 'Record a lecture for this course' }).click();
  await page.getByLabel('Recording name').fill('Lecture one');
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('button', { name: 'Stop and save' }).waitFor();
  await page.waitForTimeout(5500);
  await page.getByRole('button', { name: 'Stop and save' }).click();
  await page.getByRole('link', { name: 'Play it' }).click();

  await page.locator('.file-notes').getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Title').fill('About the lecture');
  await page.locator('textarea.note-body').fill('Linked to the recording.\nSecond line é 第');
  await page.getByTestId('save-status').getByText('Saved').waitFor();
  await nav('Notes');
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Title').fill('Loose note');
  await page.locator('textarea.note-body').fill('Not in any course');
  await page.getByTestId('save-status').getByText('Saved').waitFor();
  await nav('Today');
  await page.getByTestId('backup-reminder').waitFor();
  original = await savedFiles();
  assert.equal(original.length, 6);
});

test('the backup is a real zip with readable folders, and the reminder clears', async () => {
  backupPath = await download();
  await page.screenshot({ path: path.join(shots, 'backup-done.png'), fullPage: true });
  const listing = JSON.parse(python(`
import sys, zipfile, json
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None, 'a file failed its zip checksum'
print(json.dumps({'names': z.namelist(), 'loose': z.read('Notes/No course/Loose note.txt').decode('utf8')}))
`, backupPath));
  const names = listing.names;
  assert.ok(names.includes('study-forge-backup.json'));
  assert.ok(names.includes('Files/Biology - 101/large lecture.bin'), names.join('\n'));
  assert.ok(names.includes('Files/Biology - 101/Résumé — 第1章.txt'));
  assert.ok(names.includes('Files/Biology - 101/notes.txt'));
  assert.ok(names.includes('Files/Biology - 101/Cells/notes.txt'));
  assert.ok(names.some((name) => name.startsWith('Files/Biology - 101/Lecture one')));
  assert.ok(names.includes('Notes/No course/Loose note.txt'));
  assert.ok(names.includes('Notes/Biology - 101/About the lecture.txt'));
  assert.ok(names.every((name) => !name.split('/').includes('..') && !name.startsWith('/')));
  assert.match(listing.loose, /Loose note\n\nNot in any course/);
  await nav('Today');
  await page.getByRole('heading', { name: /^Today:/ }).waitFor();
  await page.getByText('Recent files').waitFor();
  assert.equal(await page.getByTestId('backup-reminder').count(), 0);
});

test('a fresh browser gets everything back, byte for byte', async () => {
  await open();
  const report = await restore(backupPath);
  assert.match(report, /Added 1 course, 1 topic, 6 files, 2 notes, 0 lessons, 0 planner items, 0 flashcards, 0 practice questions, 0 mock exams, and 0 calendar items/);
  await page.screenshot({ path: path.join(shots, 'restore-done.png'), fullPage: true });
  const restored = await savedFiles();
  assert.equal(restored.length, 6);
  assert.deepEqual(restored.map((f) => [f.name, f.size, f.sha, f.type]), original.map((f) => [f.name, f.size, f.sha, f.type]));
  assert.equal(restored.find((f) => f.size === big.length).sha, sha(big));

  await nav('Courses');
  await page.getByRole('link', { name: /Biology \/ 101/ }).click();
  await page.getByText('BIO 101').waitFor();
  await page.locator('.topic').getByRole('link', { name: 'notes.txt' }).click();
  await page.getByText('Second file named notes').waitFor();

  await nav('Notes');
  await page.getByRole('link', { name: 'About the lecture' }).click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Linked to the recording.\nSecond line é 第');
  await page.getByRole('link', { name: /Lecture one/ }).click();
  const played = await page.getByTestId('audio-player').evaluate(async (audio) => {
    audio.muted = true;
    await audio.play();
    await new Promise((resolve) => setTimeout(resolve, 500));
    return audio.currentTime;
  });
  assert.ok(played > 0, 'the restored recording plays');
});

test('restoring again changes nothing', async () => {
  const report = await restore(backupPath);
  assert.match(report, /Added 0 courses, 0 topics, 0 files, 0 notes, 0 lessons, 0 planner items, 0 flashcards, 0 practice questions, 0 mock exams, and 0 calendar items/);
  assert.match(report, /6 files and 2 notes/);
  assert.equal((await savedFiles()).length, 6);
});

test('restoring never overwrites newer work, and copies do not pile up', async () => {
  await nav('Notes');
  await page.getByRole('link', { name: 'Loose note' }).click();
  await page.locator('textarea.note-body').fill('Changed after the backup');
  await page.getByTestId('save-status').getByText('Saved').waitFor();
  await page.getByRole('button', { name: 'Move to bin' }).count();
  assert.match(await restore(backupPath), /1 note differed/);
  assert.match(await restore(backupPath), /Added 0 courses/);
  await nav('Notes');
  await page.locator('.files li').nth(2).waitFor();
  assert.equal(await page.locator('.files li').count(), 3, 'one copy only');
  await page.getByRole('link', { name: 'Loose note', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Changed after the backup');
  await nav('Notes');
  await page.getByRole('link', { name: 'Loose note (from backup)' }).click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Not in any course');
});

test('a deleted file comes back with its note link', async () => {
  await nav('Library');
  await page.getByRole('link', { name: /Lecture one/ }).click();
  await page.getByRole('button', { name: 'Move to bin' }).click();
  await page.getByRole('heading', { name: /Biology/ }).waitFor();
  await page.goto(`${URL_BASE}#/bin`);
  await page.getByRole('button', { name: /^Remove Lecture one.* for good$/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove for good' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('The bin is empty'));
  assert.match(await restore(backupPath), /1 file/);
  await nav('Library');
  await page.getByRole('link', { name: /Lecture one/ }).click();
  await page.getByTestId('audio-player').waitFor();
});

test('a damaged file is caught and named, and everything else still restores', async () => {
  const damaged = rewriteZip(backupPath, `
import shutil
shutil.copy(src, dst)
z = zipfile.ZipFile(dst)
info = z.getinfo('Files/Biology - 101/large lecture.bin')
z.close()
with open(dst, 'r+b') as f:
    f.seek(info.header_offset + 20 * 1024 * 1024)
    byte = f.read(1)
    f.seek(-1, 1)
    f.write(bytes([byte[0] ^ 0xff]))
`);
  await open();
  const report = await restore(damaged);
  assert.match(report, /Added 1 course, 1 topic, 5 files, 2 notes, 0 lessons, 0 planner items, 0 flashcards, 0 practice questions, 0 mock exams, and 0 calendar items/);
  assert.match(report, /1 file in the backup is damaged and weren't restored: large lecture\.bin|1 file in the backup is damaged/);
  assert.match(report, /large lecture\.bin/);
  const restored = await savedFiles();
  assert.equal(restored.length, 5);
  assert.ok(restored.every((f) => f.name !== 'large lecture.bin'));
  assert.equal(await page.getByRole('heading', { name: 'Restore this backup?' }).count(), 0);
});

for (const [label, file, message] of [
  ['a random file', () => fixture('random.zip', crypto.randomBytes(5000)), "isn't a Study Forge backup"],
  ['an empty file', () => fixture('empty.zip', ''), "isn't a Study Forge backup"],
  ['an ordinary zip', () => rewriteZip(backupPath, `
with zipfile.ZipFile(dst, 'w') as z:
    z.writestr('holiday.txt', 'photos')
`), "isn't a Study Forge backup"],
  ['a recompressed backup', () => rewriteZip(backupPath, `
with zipfile.ZipFile(src) as a, zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as b:
    for n in a.namelist():
        if not n.endswith('.bin'):
            b.writestr(n, a.read(n))
`), 'Another program changed this backup'],
  ['a backup from a newer version', () => rewriteZip(backupPath, `
with zipfile.ZipFile(dst, 'w') as b:
    b.writestr('study-forge-backup.json', json.dumps({'format': 'study-forge-backup', 'version': 99, 'createdAt': 1}))
`), 'made by a newer version'],
  ['a manifest with bad records', () => rewriteZip(backupPath, `
with zipfile.ZipFile(dst, 'w') as b:
    b.writestr('study-forge-backup.json', json.dumps({'format': 'study-forge-backup', 'version': 1, 'createdAt': 1, 'courses': [{'id': 1}], 'topics': [], 'notes': [], 'materials': []}))
`), 'This backup is damaged'],
  ['a manifest that is not JSON', () => rewriteZip(backupPath, `
with zipfile.ZipFile(dst, 'w') as b:
    b.writestr('study-forge-backup.json', 'not json {')
`), 'This backup is damaged'],
]) {
  test(`${label} is refused clearly and changes nothing`, async () => {
    const before = (await savedFiles()).length;
    await nav('Settings');
    await page.getByTestId('restore-input').setInputFiles(file());
    await page.getByRole('alert').getByText(message).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Restore this backup?' }).count(), 0);
    assert.equal((await savedFiles()).length, before);
  });
}

test('unsafe values in a backup are neutralized', async () => {
  const crafted = rewriteZip(backupPath, `
manifest = {'format': 'study-forge-backup', 'version': 1, 'createdAt': 5,
  'courses': [{'id': 'c1', 'name': '<img src=x onerror=alert(1)>', 'code': '', 'color': 'red;background:url(//evil)', 'createdAt': 1}],
  'topics': [{'id': 't1', 'courseId': 'nowhere', 'name': 'Orphan topic', 'createdAt': 1}],
  'notes': [{'id': 'n1', 'title': '<script>window.__pwned=1</script>', 'body': '<b>x</b>', 'courseId': 'nowhere', 'topicId': 't1', 'materialId': 'nothing', 'createdAt': 1, 'updatedAt': 1}],
  'materials': []}
with zipfile.ZipFile(dst, 'w') as b:
    b.writestr('study-forge-backup.json', json.dumps(manifest))
`);
  await open();
  const report = await restore(crafted);
  assert.match(report, /Added 1 course, 0 topics, 0 files, 1 note, 0 lessons, 0 planner items, 0 flashcards, 0 practice questions, 0 mock exams, and 0 calendar items/);
  await nav('Courses');
  const link = page.getByRole('link', { name: /<img src=x/ });
  await link.waitFor();
  const spine = await link.evaluate((el) => el.style.getPropertyValue('--spine'));
  assert.match(spine, /^#[0-9a-fA-F]{6}$/);
  await nav('Notes');
  await page.getByRole('link', { name: /<script>/ }).click();
  await page.locator('textarea.note-body').waitFor();
  assert.equal(await page.getByLabel('Course').inputValue(), '', 'links to things that do not exist are dropped');
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
});

test('the large-file zip format restores correctly', async () => {
  // Small data, but written the way zips over 4 GB are, to prove the reader follows that format.
  const content = Buffer.from('Stored using the large-file format\n');
  const manifest = Buffer.from(JSON.stringify({
    format: 'study-forge-backup', version: 1, createdAt: 7, courses: [], topics: [], notes: [],
    materials: [{ id: 'z1', name: 'zip64.txt', path: 'Files/zip64.txt', mimeType: 'text/plain', hash: sha(content), size: content.length, courseId: null, topicId: null, createdAt: 7 }],
  }));
  const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
  const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
  const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of [['study-forge-backup.json', manifest], ['Files/zip64.txt', content]]) {
    const nameBytes = Buffer.from(name);
    const header = Buffer.concat([u32(0x04034b50), u16(45), u16(0x800), u16(0), u16(0), u16(0), u32(0), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes]);
    local.push(header, data);
    const extra = Buffer.concat([u16(1), u16(24), u64(data.length), u64(data.length), u64(offset)]);
    central.push(Buffer.concat([u32(0x02014b50), u16(45), u16(45), u16(0x800), u16(0), u16(0), u16(0), u32(0), u32(0xffffffff), u32(0xffffffff), u16(nameBytes.length), u16(extra.length), u16(0), u16(0), u16(0), u32(0), u32(0xffffffff), nameBytes, extra]));
    offset += header.length + data.length;
  }
  const dir = Buffer.concat(central);
  const eocd64At = offset + dir.length;
  const eocd64 = Buffer.concat([u32(0x06064b50), u64(44), u16(45), u16(45), u32(0), u32(0), u64(2), u64(2), u64(dir.length), u64(offset)]);
  const locator = Buffer.concat([u32(0x07064b50), u32(0), u64(eocd64At), u32(1)]);
  const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(0xffff), u16(0xffff), u32(0xffffffff), u32(0xffffffff), u16(0)]);
  const file = fixture('zip64.zip', Buffer.concat([...local, dir, eocd64, locator, eocd]));
  await open();
  assert.match(await restore(file), /1 file/);
  await nav('Library');
  await page.getByRole('link', { name: 'zip64.txt' }).click();
  await page.getByText('Stored using the large-file format').waitFor();
});

test('choosing where to save streams the backup to that file', async () => {
  await open(`
    window.showSaveFilePicker = async (options) => {
      window.__suggested = options.suggestedName;
      const root = await navigator.storage.getDirectory();
      return root.getFileHandle('picked-backup.zip', { create: true });
    };`);
  await page.getByLabel('Course name').fill('Streamed');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Streamed' }).waitFor();
  await page.getByTestId('file-input').first().setInputFiles(FILES.big);
  await page.locator('.save-panel li[data-phase=saved]').waitFor({ timeout: 60000 });
  await clearPanel();
  await nav('Settings');
  await page.getByRole('button', { name: 'Create backup' }).click();
  await page.getByTestId('backup-result').waitFor({ timeout: 60000 });
  const info = await page.evaluate(async () => {
    const file = await (await (await navigator.storage.getDirectory()).getFileHandle('picked-backup.zip')).getFile();
    const tail = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    return { suggested: window.__suggested, size: file.size, magic: String.fromCharCode(...tail) };
  });
  assert.equal(info.magic, 'PK');
  assert.ok(info.size > big.length);
  assert.match(info.suggested, /^Study Forge backup \d{4}-\d{2}-\d{2}\.zip$/);
});

test('backing out of the save window saves nothing, and says so', async () => {
  await open(`window.showSaveFilePicker = () => Promise.reject(new DOMException('x', 'AbortError'));`);
  await nav('Settings');
  await page.getByRole('button', { name: 'Create backup' }).click();
  await page.getByText('The backup was cancelled').waitFor();
  await page.getByRole('button', { name: 'Create backup' }).waitFor();
});

test('cancelling a large backup or restore stops cleanly', async () => {
  await open();
  await page.getByLabel('Course name').fill('Cancel test');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Cancel test' }).waitFor();
  await page.getByTestId('file-input').first().setInputFiles(huge);
  await page.locator('.save-panel li[data-phase=saved]').waitFor({ timeout: 120000 });
  await clearPanel();
  await nav('Settings');
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await page.getByRole('button', { name: 'Create backup' }).click();
  await page.locator('.backup-progress').getByRole('button', { name: 'Cancel' }).click();
  await page.getByText('The backup was cancelled').waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  assert.equal(downloads, 0);
  assert.equal(await page.getByTestId('backup-summary').getByText("You haven't made a backup yet").count(), 1);
  page.removeAllListeners('download');

  const file = await download();
  await open();
  await nav('Settings');
  await page.getByTestId('restore-input').setInputFiles(file);
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await page.locator('.backup-progress').getByRole('button', { name: 'Cancel' }).click();
  await page.getByText('The restore was cancelled').waitFor({ timeout: 60000 });
  assert.equal((await savedFiles()).length, 0, 'no half-restored file');
  assert.equal(await page.getByRole('alert').count(), 0, 'cancelling is not reported as damage');
  // Running it again finishes the job.
  assert.match(await restore(file), /1 file/);
  const [restored] = await savedFiles();
  assert.equal(restored.sha, sha(fs.readFileSync(huge)));
});

test('a file the browser lost is reported, and the rest is still backed up', async () => {
  await open();
  await page.getByLabel('Course name').fill('Lost');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Lost' }).waitFor();
  await page.getByTestId('file-input').first().setInputFiles([FILES.unicode, FILES.hostile]);
  await page.locator('.save-panel li[data-phase=saved]').nth(1).waitFor();
  await clearPanel();
  await page.evaluate(async () => {
    const records = await new Promise((resolve) => {
      const request = indexedDB.open('study-forge');
      request.onsuccess = () => {
        const all = request.result.transaction('materials').objectStore('materials').getAll();
        all.onsuccess = () => { request.result.close(); resolve(all.result); };
      };
    });
    const victim = records.find((r) => r.name.startsWith('a..b'));
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('materials');
    await dir.removeEntry(victim.id);
  });
  await download();
  await page.getByTestId('backup-result').getByText("1 file couldn't be included").waitFor();
  await page.getByTestId('backup-result').getByText('Backup created with 1 file').waitFor();
});

test('an interrupted recording is flagged as not in the backup', async () => {
  await open();
  await nav('Record');
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('button', { name: 'Stop and save' }).waitFor();
  await nav('Settings');
  await page.getByText("A recording is running, and it won't be in a backup").waitFor();
  await page.waitForTimeout(5500);
  await open(NO_PICKER, true);
  await nav('Settings');
  await page.getByText("1 interrupted recording won't be in the backup").waitFor();
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});
