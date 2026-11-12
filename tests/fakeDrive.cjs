// A small stand-in for Google Drive's file API: folders, resumable uploads in pieces, checksums and
// downloads. Only files this app made are visible, as with the real drive.file permission.
const crypto = require('node:crypto');

function createDrive() {
  const files = new Map();
  const sessions = new Map();
  let next = 1;
  const drive = {
    files,
    /** 'ok', 'corrupt' (stores different bytes than were sent), or 'down'. */
    mode: 'ok',
    pieces: 0,
    /** Bytes that arrived in upload pieces, to show an interrupted upload resumes instead of restarting. */
    received: 0,
    /** When set, the upload breaks off after this many more pieces, as when a connection drops. */
    cutAfterPieces: null,
    contents: (name) => [...files.values()].find((file) => file.name === name)?.bytes ?? null,
  };

  const info = (file) => ({ id: file.id, name: file.name, size: String(file.bytes.length), sha256Checksum: crypto.createHash('sha256').update(file.bytes).digest('hex') });

  /** Handles a /drive request, or returns false. The body is the raw bytes. */
  drive.handle = (req, res, body) => {
    if (!req.url.startsWith('/drive/')) return false;
    const url = new URL(req.url, 'http://localhost');
    const json = (status, data, headers = {}) => {
      res.statusCode = status;
      for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    };
    res.setHeader('Access-Control-Expose-Headers', 'Location, Range');
    if (drive.mode === 'down') { req.socket.destroy(); return true; }
    if (req.headers.authorization !== 'Bearer test-drive-token') { json(401, {}); return true; }

    if (url.pathname === '/drive/v3/files' && req.method === 'GET') {
      const name = url.searchParams.get('q')?.match(/name='([^']+)'/)?.[1];
      json(200, { files: [...files.values()].filter((file) => file.folder && file.name === name).map((file) => ({ id: file.id })) });
      return true;
    }
    if (url.pathname === '/drive/v3/files' && req.method === 'POST') {
      const meta = JSON.parse(body.toString() || '{}');
      const id = `drive-${next++}`;
      files.set(id, { id, name: meta.name, folder: true, bytes: Buffer.alloc(0) });
      json(200, { id });
      return true;
    }
    if (url.pathname === '/drive/upload/v3/files' && req.method === 'POST') {
      const meta = JSON.parse(body.toString() || '{}');
      const id = `upload-${next++}`;
      sessions.set(id, { meta, total: Number(req.headers['x-upload-content-length']), parts: [] });
      json(200, {}, { Location: `http://localhost:${req.socket.localPort}/drive/upload/session/${id}` });
      return true;
    }
    const session = url.pathname.match(/^\/drive\/upload\/session\/(.+)$/);
    if (session && req.method === 'PUT') {
      const upload = sessions.get(session[1]);
      if (!upload) { json(404, {}); return true; }
      if (drive.cutAfterPieces !== null && body.length > 0) {
        if (drive.cutAfterPieces <= 0) { drive.cutAfterPieces = null; json(503, { error: 'backendError' }); return true; }
        drive.cutAfterPieces -= 1;
      }
      drive.pieces += 1;
      drive.received += body.length;
      upload.parts.push(body);
      const have = upload.parts.reduce((sum, part) => sum + part.length, 0);
      if (have < upload.total) {
        res.statusCode = 308;
        res.setHeader('Range', `bytes=0-${have - 1}`);
        res.end();
        return true;
      }
      let bytes = Buffer.concat(upload.parts);
      if (drive.mode === 'corrupt') bytes = Buffer.concat([bytes, Buffer.from('!')]);
      const id = `drive-${next++}`;
      const file = { id, name: upload.meta.name, parents: upload.meta.parents, appProperties: upload.meta.appProperties, bytes };
      files.set(id, file);
      sessions.delete(session[1]);
      json(200, info(file));
      return true;
    }
    const one = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (one && req.method === 'GET') {
      const file = files.get(one[1]);
      if (!file) { json(404, {}); return true; }
      if (url.searchParams.get('alt') === 'media') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(file.bytes);
      } else json(200, info(file));
      return true;
    }
    json(404, {});
    return true;
  };
  return drive;
}

module.exports = { createDrive };
