// The rules for sending files to the student's Google Drive, tested directly.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const file = { id: 'm1', name: 'lecture.webm', mimeType: 'audio/webm', size: 20_000_000, hash: 'ABC123', kind: 'upload', driveFileId: undefined };

test('only files with bytes here and no verified copy in Drive are sent', async () => {
  const { needsBackup } = await import('../src/data/driveFilesRules.ts');
  assert.equal(needsBackup(file, true), true);
  assert.equal(needsBackup(file, false), false, 'nothing to send from a device that lacks the bytes');
  assert.equal(needsBackup({ ...file, driveFileId: 'd1' }, true), false, 'already in Drive');
  assert.equal(needsBackup({ ...file, kind: 'link', hash: '' }, true), false, 'a link has no bytes');
});

test('a copy counts only when Drive\'s checksum and size both match', async () => {
  const { copyMatches } = await import('../src/data/driveFilesRules.ts');
  assert.equal(copyMatches({ id: 'd1', size: '20000000', sha256Checksum: 'abc123' }, file), true);
  assert.equal(copyMatches({ id: 'd1', size: '20000001', sha256Checksum: 'abc123' }, file), false);
  assert.equal(copyMatches({ id: 'd1', size: '20000000', sha256Checksum: 'ffffff' }, file), false);
  assert.equal(copyMatches({ id: 'd1', size: '20000000' }, file), false, 'no checksum is not a match');
  assert.equal(copyMatches(null, file), false);
});

test('large files go up in resumable pieces, picking up from what Drive has', async () => {
  const { nextRange, receivedFrom, CHUNK_BYTES } = await import('../src/data/driveFilesRules.ts');
  assert.equal(CHUNK_BYTES % (256 * 1024), 0, 'Drive needs multiples of 256 KiB');
  assert.deepEqual(nextRange(0, 20), { start: 0, end: 20, header: 'bytes 0-19/20' });
  const first = nextRange(0, 20_000_000);
  assert.equal(first.end, CHUNK_BYTES);
  assert.equal(nextRange(CHUNK_BYTES, 20_000_000).header, `bytes ${CHUNK_BYTES}-${2 * CHUNK_BYTES - 1}/20000000`);
  assert.equal(nextRange(0, 0).header, 'bytes */0');
  assert.equal(receivedFrom('bytes=0-8388607'), CHUNK_BYTES);
  assert.equal(receivedFrom(null), 0);
});
