/* fakebase server: a tiny stand-in for the Firebase Realtime Database, for local tests only.
 * One JSON tree in memory. WebSocket protocol is private to firebase-shim.js.
 *   node server.js 9123            run standalone
 *   require('./server').start(9123) -> Promise<{port, close(), reset(), dump(), state}>
 * HTTP: GET /reset[?skew=ms]  empty the tree (skew = fake server clock offset)   GET /dump  the tree as JSON
 *       GET /shim.js          the browser shim (handy for Playwright routing)
 * No security rules are enforced.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');

const parts = p => String(p || '').split('/').filter(Boolean);
const isObj = v => v && typeof v === 'object';
// store form: arrays -> objects, null/empty dropped, {'.sv':'timestamp'} -> server time
function norm(v, now) {
  if (v === undefined || v === null) return null;
  if (!isObj(v)) return v;
  if (v['.sv'] === 'timestamp') return now;
  const o = {}; let n = 0;
  for (const k of Object.keys(v)) { const c = norm(v[k], now); if (c !== null) { o[k] = c; n++; } }
  return n ? o : null;
}
function stable(v) {
  if (!isObj(v)) return JSON.stringify(v === undefined ? null : v);
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}
const related = (a, b) => { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; };

function start(port, opts) {
  opts = opts || {};
  const S = { tree: null, skew: opts.skew || 0 };
  const now = () => Date.now() + S.skew;
  const subs = new Set();   // {ws, id, p:[parts], last}
  const get = p => { let v = S.tree; for (const k of p) { if (!isObj(v)) return null; v = v[k]; if (v === undefined) return null; } return v === undefined ? null : v; };
  function put(p, v) {   // v already in store form
    if (!p.length) { S.tree = v; return; }
    if (!isObj(S.tree)) { if (v === null) return; S.tree = {}; }
    const chain = [S.tree]; let o = S.tree;
    for (let i = 0; i < p.length - 1; i++) {
      if (!isObj(o[p[i]])) { if (v === null) return; o[p[i]] = {}; }
      o = o[p[i]]; chain.push(o);
    }
    if (v === null) delete o[p[p.length - 1]]; else o[p[p.length - 1]] = v;
    for (let i = chain.length - 1; i >= 0; i--) {   // prune empty parents
      if (Object.keys(chain[i]).length) break;
      if (i === 0) S.tree = null; else delete chain[i - 1][p[i - 1]];
    }
  }
  function notify(changed) {
    for (const s of subs) {
      if (!changed.some(c => related(c, s.p))) continue;
      const v = get(s.p), j = stable(v);
      if (j === s.last) continue;
      s.last = j; send(s.ws, { t: 'val', id: s.id, v });
    }
  }
  function send(ws, m) { if (ws.readyState === 1) ws.send(JSON.stringify(m)); }
  function apply(op, p, v) {   // op: set | update | remove ; returns changed paths
    const t = now();
    if (op === 'remove') { put(p, null); return [p]; }
    if (op === 'set') { put(p, norm(v, t)); return [p]; }
    const ch = [];
    for (const k of Object.keys(v || {})) { const q = p.concat(parts(k)); put(q, norm(v[k], t)); ch.push(q); }
    return ch;
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (u.pathname === '/reset') {
      S.tree = null; S.skew = Number(u.searchParams.get('skew') || 0);
      notify([[]]); res.writeHead(200, cors); return res.end('ok');
    }
    if (u.pathname === '/dump') { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); return res.end(JSON.stringify(S.tree)); }
    if (u.pathname === '/shim.js') { res.writeHead(200, Object.assign({ 'Content-Type': 'text/javascript' }, cors)); return res.end(fs.readFileSync(path.join(__dirname, 'firebase-shim.js'))); }
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', ws => {
    const od = [];   // onDisconnect queue for this socket: {p, op, v}
    send(ws, { t: 'hello', now: now() });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      const p = parts(m.path), ack = x => send(ws, Object.assign({ t: 'ack', r: m.r }, x));
      switch (m.t) {
        case 'sub': { const s = { ws, id: m.id, p, last: null }; subs.add(s); const v = get(p); s.last = stable(v); send(ws, { t: 'val', id: m.id, v }); break; }
        case 'unsub': for (const s of subs) if (s.ws === ws && s.id === m.id) subs.delete(s); break;
        case 'get': ack({ ok: true, v: get(p) }); break;
        case 'set': case 'update': case 'remove': notify(apply(m.t, p, m.v)); ack({ ok: true, v: get(p) }); break;
        case 'cas': {   // compare-and-set for transactions
          const cur = get(p);
          if (stable(norm(m.expect, 0)) !== stable(cur)) { ack({ ok: false, v: cur }); break; }
          notify(apply('set', p, m.v)); ack({ ok: true, v: get(p) }); break;
        }
        case 'od': {
          for (let i = od.length - 1; i >= 0; i--) if (related(p, od[i].p) && od[i].p.length >= p.length) od.splice(i, 1);
          if (m.op !== 'cancel') od.push({ p, op: m.op, v: m.v });
          ack({ ok: true }); break;
        }
      }
    });
    ws.on('close', () => {
      for (const s of subs) if (s.ws === ws) subs.delete(s);
      const ch = []; for (const a of od.splice(0)) ch.push(...apply(a.op, a.p, a.v));
      if (ch.length) notify(ch);
    });
  });
  return new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(port || 0, () => res({
      port: server.address().port, state: S,
      reset: () => { S.tree = null; S.skew = 0; notify([[]]); },
      dump: () => S.tree,
      close: () => new Promise(r => { for (const c of wss.clients) c.terminate(); wss.close(); server.close(() => r()); })
    }));
  });
}

module.exports = { start };
if (require.main === module) start(Number(process.argv[2]) || 9123).then(s => console.log('fakebase on ws://localhost:' + s.port));
