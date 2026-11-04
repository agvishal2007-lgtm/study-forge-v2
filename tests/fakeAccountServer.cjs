// A small stand-in for the online service, with the same rules as the real push: a write
// based on an old version is refused. Real privacy rules are tested separately in rules.test.mjs.
const http = require('node:http');

function createServer() {
  const users = new Map();
  let tick = 1;
  const state = { mode: 'ok', pushes: 0, items: (uid) => [...(users.get(uid)?.values() ?? [])] };
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.end();
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      const send = (status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
      if (state.mode === 'quota') return send(429, {});
      if (state.mode === 'denied') return send(403, {});
      if (state.mode === 'down') return req.socket.destroy();
      const store = users.get(body.uid) ?? new Map();
      users.set(body.uid, store);
      if (req.url === '/pull') {
        const items = [...store.values()].filter((item) => item.syncedAt > body.since - 10);
        return send(200, { items, cursor: Math.max(body.since, ...items.map((item) => item.syncedAt), 0) });
      }
      if (req.url === '/push') {
        state.pushes += 1;
        const conflicts = [];
        for (const item of body.items) {
          const key = `${item.collection}/${item.id}`;
          if ((store.get(key)?.rev ?? 0) !== item.baseRev) { conflicts.push(key); continue; }
          const { baseRev, ...saved } = item;
          store.set(key, { ...saved, syncedAt: ++tick });
        }
        return send(200, { conflicts });
      }
      if (req.url === '/deleteAll') { store.clear(); return send(200, {}); }
      return send(404, {});
    });
  });
  return { server, state };
}

module.exports = { createServer };
