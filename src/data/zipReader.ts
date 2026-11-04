/**
 * Reads a zip file's table of contents without loading the file into memory, so a
 * backup of many gigabytes can be opened. It only reads what's needed, including
 * the large-file (ZIP64) format. Backups store files uncompressed.
 */
export class NotAZip extends Error {}

export interface ZipEntry {
  name: string;
  /** 0 means stored as is. Anything else was recompressed by another program. */
  method: number;
  blob: () => Promise<Blob>;
}

const EOCD = 0x06054b50;
const EOCD64_LOCATOR = 0x07064b50;
const EOCD64 = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_DIRECTORY_BYTES = 256 * 1024 * 1024;

const view = async (file: Blob, start: number, end: number) => new DataView(await file.slice(start, end).arrayBuffer());
const big = (data: DataView, at: number) => {
  const value = data.getBigUint64(at, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new NotAZip('This file is too large to read.');
  return Number(value);
};

export async function readZipEntries(file: Blob): Promise<Map<string, ZipEntry>> {
  const tailStart = Math.max(0, file.size - (22 + 0xffff));
  const tail = await view(file, tailStart, file.size);
  let at = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD && i + 22 + tail.getUint16(i + 20, true) === tail.byteLength) {
      at = i;
      break;
    }
  }
  if (at < 0) throw new NotAZip('This is not a zip file.');

  let count = tail.getUint16(at + 10, true);
  let size = tail.getUint32(at + 12, true);
  let offset = tail.getUint32(at + 16, true);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    const locatorAt = at - 20;
    if (locatorAt < 0 || tail.getUint32(locatorAt, true) !== EOCD64_LOCATOR) throw new NotAZip('This zip file is damaged.');
    const record = await view(file, big(tail, locatorAt + 8), big(tail, locatorAt + 8) + 56);
    if (record.getUint32(0, true) !== EOCD64) throw new NotAZip('This zip file is damaged.');
    count = big(record, 32);
    size = big(record, 40);
    offset = big(record, 48);
  }
  if (size > MAX_DIRECTORY_BYTES || offset + size > file.size) throw new NotAZip('This zip file is damaged.');

  const directory = await view(file, offset, offset + size);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > directory.byteLength || directory.getUint32(cursor, true) !== CENTRAL) throw new NotAZip('This zip file is damaged.');
    const method = directory.getUint16(cursor + 10, true);
    let compressed = directory.getUint32(cursor + 20, true);
    const uncompressed = directory.getUint32(cursor + 24, true);
    const nameLength = directory.getUint16(cursor + 28, true);
    const extraLength = directory.getUint16(cursor + 30, true);
    const commentLength = directory.getUint16(cursor + 32, true);
    let localOffset = directory.getUint32(cursor + 42, true);
    const name = decoder.decode(new Uint8Array(directory.buffer, directory.byteOffset + cursor + 46, nameLength));

    // Large files keep their real sizes in an extra field, listing only the ones that overflowed.
    let extra = cursor + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = directory.getUint16(extra, true);
      const length = directory.getUint16(extra + 2, true);
      if (id === 0x0001) {
        let field = extra + 4;
        if (uncompressed === 0xffffffff) field += 8;
        if (compressed === 0xffffffff) { compressed = big(directory, field); field += 8; }
        if (localOffset === 0xffffffff) localOffset = big(directory, field);
      }
      extra += 4 + length;
    }

    const dataSize = compressed;
    const headerOffset = localOffset;
    entries.set(name, {
      name,
      method,
      async blob() {
        const header = await view(file, headerOffset, headerOffset + 30);
        if (header.byteLength < 30 || header.getUint32(0, true) !== LOCAL) throw new NotAZip('This zip file is damaged.');
        const start = headerOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
        if (start + dataSize > file.size) throw new NotAZip('This zip file is damaged.');
        return file.slice(start, start + dataSize);
      },
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
