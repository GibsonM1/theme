// Multi-client tests for rooms-v1.js against the fakebase server.  Run: node tests/rooms.test.js
// Each simulated browser is its own vm context (own window, localStorage, firebase shim, GibsonRooms).
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const { start } = require('./fakebase/server');
const SHIM = fs.readFileSync(path.join(__dirname, 'fakebase/firebase-shim.js'), 'utf8');
const ROOMS = fs.readFileSync(path.join(__dirname, '..', 'rooms-v1.js'), 'utf8');
const G = 'ionagrams', P = 'P3';
let port, srv, fails = 0, passes = 0;

function browser(uid, host) {
  const ls = new Map(), et = new EventTarget(), events = [];
  if (uid) ls.set('fakebase-uid', uid);
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, WebSocket, CustomEvent, EventTarget,
    location: { hostname: host || 'localhost', search: '' }, FAKEBASE_URL: 'ws://localhost:' + port,
    localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
    addEventListener: et.addEventListener.bind(et), removeEventListener: et.removeEventListener.bind(et), dispatchEvent: et.dispatchEvent.bind(et),
    document: { createElement() { throw new Error('tests never load scripts'); } }
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(SHIM, ctx); vm.runInContext(ROOMS, ctx);
  ctx.addEventListener('gibson-rooms', e => events.push(e.detail.connected));
  return { R: ctx.GibsonRooms, fb: ctx.firebase, ls, events, uid: null };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(40); } return !!fn(); }
function ok(cond, name) { if (cond) { passes++; console.log('ok   ' + name); } else { fails++; console.log('FAIL ' + name); } }
async function rejects(p, code) { try { await p; return 'resolved'; } catch (e) { return e && e.error === code ? true : JSON.stringify(e); } }
const dump = () => fetch('http://localhost:' + port + '/dump').then(r => r.json());
const roomsIn = async () => ((await dump()) || {}).rooms?.[G]?.[P] || {};

(async () => {
  srv = await start(0); port = srv.port;
  await fetch('http://localhost:' + port + '/reset?skew=-200000');   // server clock 200 s behind the browsers
  try {
    // ---------- preview / basics ----------
    const pv = browser(null, 'abc.claudeusercontent.com');
    ok(pv.R.on() === false && (await rejects(pv.R.ready(), 'offline')) === true, 'Claude preview: on() false, ready() rejects offline');

    const [A, B, C, D, E] = [1, 2, 3, 4, 5].map(() => browser());
    for (const b of [A, B, C, D, E]) b.uid = (await b.R.ready()).uid;
    ok(new Set([A, B, C, D, E].map(b => b.uid)).size === 5, 'ready() signs in 5 distinct uids');
    ok(A.R.on() && A.R.connected() && A.events.includes(true), "connected() true and 'gibson-rooms' event fired");
    ok(Math.abs(A.R.serverNow() - (Date.now() - 200000)) < 1000, 'serverNow() uses .info/serverTimeOffset');

    // ---------- lobby, stale cleanup ----------
    let lobby = null; const stopLobby = B.R.watchLobby(G, P, l => (lobby = l));
    const stale = A.fb.database().ref('rooms/' + G + '/' + P).push().key;
    await A.fb.database().ref('rooms/' + G + '/' + P + '/' + stale + '/meta').set({ name: 'Old', max: 4, created: Date.now() - 200000 - 300000, state: 'lobby' });
    const [id1, id1b] = await Promise.all([A.R.create(G, P, { name: 'Room 1', max: 3, countdownMs: 60000, settings: { naming: 'pick' } }), A.R.create(G, P, { name: 'dup' })]);
    ok(id1 === id1b, 'create() double-click makes one room');
    await until(() => lobby && lobby.length === 2);
    ok(lobby[0].id === id1 && lobby[0].name === 'Room 1' && lobby[0].count === 0 && lobby[0].max === 3 && lobby[0].settings.naming === 'pick' && lobby[0].state === 'lobby', 'watchLobby lists rooms newest first with fields');
    await until(() => lobby.length === 1, 6000);
    const r0 = await roomsIn();
    ok(!r0[stale] && r0[id1], 'stale empty room removed after grace; fresh empty room kept (server clock used)');

    // ---------- join, countdown ----------
    const [a, a2] = await Promise.all([A.R.join(G, P, id1, { name: 'Ana', buddy: 'cat', hat: 2, extra: undefined }), A.R.join(G, P, id1, { name: 'Ana' })]);
    ok(a === a2 && a.uid === A.uid && a.isHost(), 'join() double-click returns one Room; first player is host');
    await sleep(700);
    ok(a.snap.meta.state === 'lobby', 'one player stays in lobby');
    let b = await B.R.join(G, P, id1, { name: 'Ben', buddy: 'dog', hat: 0 });
    ok(await until(() => a.snap.meta.state === 'countdown' && a.snap.meta.countdownEnd > A.R.serverNow() + 50000), '2 players -> countdown with countdownEnd = serverNow + countdownMs');
    ok(!b.isHost(), 'second player is not host');
    let seen = 0; const offCh = b.onChange(() => seen++); ok(seen === 1, 'onChange calls back right away'); offCh();
    await b.leave();
    ok(await until(() => a.snap.meta.state === 'lobby' && !a.snap.meta.countdownEnd), 'countdown with < 2 players -> lobby');
    b = await B.R.join(G, P, id1, { name: 'Ben' });
    ok(await until(() => a.snap.meta.state === 'countdown'), 'rejoin -> countdown again');
    await until(() => lobby[0] && lobby[0].count === 2);
    ok(lobby[0].count === 2 && lobby[0].players[0].name === 'Ana' && lobby[0].players[0].buddy === 'cat', 'lobby shows count and players (host first)');

    // ---------- full room, race for last seat ----------
    const race = await Promise.allSettled([C.R.join(G, P, id1, { name: 'Cy' }), D.R.join(G, P, id1, { name: 'Di' })]);
    const wonI = race.findIndex(r => r.status === 'fulfilled'), lost = race.find(r => r.status === 'rejected');
    ok(race.filter(r => r.status === 'fulfilled').length === 1 && lost && lost.reason.error === 'full', 'two join the last seat at once: exactly one gets in, other gets full');
    const W = [C, D][wonI], L = [C, D][1 - wonI], w = race[wonI].value;
    ok((await rejects(E.R.join(G, P, id1, { name: 'Ed' }), 'full')) === true, 'join a full room -> {error:"full"}');
    ok((await rejects(E.R.join(G, P, '-NOPEnopeNOPEnope123', { name: 'Ed' }), 'gone')) === true, 'join a missing room -> {error:"gone"}');
    await until(() => Object.keys(a.snap.players).length === 3);
    ok(Object.keys(a.snap.players).length === 3, 'room has exactly max players');

    // ---------- all ready -> play ----------
    await Promise.all([a.ready(true), b.ready(true), w.ready(true), w.ready(true)]);
    ok(await until(() => a.snap.meta.state === 'play', 2000), 'everyone ready -> play before countdown ends');
    const m1 = a.snap.meta;
    ok(m1.round === 1 && typeof m1.seed === 'string' && m1.seed.length > 4 && Object.keys(m1.roster).length === 3 && m1.roster[W.uid] && m1.startAt > A.R.serverNow() + 1000, 'play: round 1, seed, roster of 3, startAt ~ serverNow + 3 s');
    await sleep(600);
    ok(a.snap.meta.round === 1, 'only one state change happened (round still 1)');
    ok((await rejects(L.R.join(G, P, id1, { name: 'Late' }), 'started')) === true, 'joining in play is blocked -> {error:"started"}');

    // ---------- disconnect + rejoin from roster ----------
    W.fb.database().goOffline();
    ok(await until(() => !a.snap.players[W.uid]), 'closed tab: onDisconnect removes the player');
    var W2 = browser(W.uid); await W2.R.ready();
    const w2 = await W2.R.join(G, P, id1, { name: 'Again' });
    ok(w2.uid === W.uid && (await until(() => a.snap.players[W.uid] && a.snap.players[W.uid].name === 'Again')), 'reload: roster uid rejoins during play');
    const bJoined = a.snap.players[B.uid].joined;
    B.fb.database().goOffline();
    ok(await until(() => !a.snap.players[B.uid]), 'wifi drop removes player');
    B.fb.database().goOnline();
    ok(await until(() => a.snap.players[B.uid] && a.snap.players[B.uid].joined === bJoined), 'reconnect: player entry re-written with same joined time');
    B.fb.database().goOffline();
    await sleep(100);
    B.fb.database().goOnline();
    await until(() => a.snap.players[B.uid]);
    await sleep(500);
    ok(!!a.snap.players[B.uid], 'onDisconnect re-armed after reconnect (second drop+return still present)');
    B.fb.database().goOffline(); ok(await until(() => !a.snap.players[B.uid]), 'onDisconnect fires again after re-arm'); B.fb.database().goOnline();
    await until(() => a.snap.players[B.uid]);

    // ---------- data ----------
    await a.set('progress/' + A.uid, { left: 5, groups: [{ ions: ['Na', 'Cl'] }] });
    ok(await until(() => b.snap.data.progress && b.snap.data.progress[A.uid] && b.snap.data.progress[A.uid].groups[0].ions[1] === 'Cl'), 'room.set: others see data (arrays come back as arrays)');
    await a.update('progress/' + A.uid, { left: 4, locked: 1 });
    ok(await until(() => b.snap.data.progress[A.uid].left === 4 && b.snap.data.progress[A.uid].locked === 1 && b.snap.data.progress[A.uid].groups), 'room.update merges');
    await a.remove('progress/' + A.uid);
    ok(await until(() => !b.snap.data.progress), 'room.remove');
    const pick = me => cur => (cur ? undefined : { uid: me, n: 0 });
    const tx = await Promise.all([a.txn('done', pick(A.uid)), b.txn('done', pick(B.uid)), w2.txn('done', pick(W.uid))]);
    const winners = tx.filter(t => t.committed);
    ok(winners.length === 1 && (await until(() => a.snap.data.done && a.snap.data.done.uid === winners[0].value.uid)), 'txn race: first caller wins, others abort');

    // ---------- reset ----------
    ok((await rejects(b.reset(), 'host')) === true, 'reset() by non-host rejects {error:"host"}');
    await Promise.all([a.reset(), a.reset()]);
    ok(await until(() => b.snap.meta.state !== 'play' && !Object.keys(b.snap.data).length), 'reset: back to lobby, data cleared');
    ok(await until(() => Object.values(b.snap.players).every(p => !p.ready)), 'reset: everyone not ready');
    await sleep(800);
    ok(b.snap.meta.state === 'countdown' && b.snap.meta.gen === 1, 'reset: stale ready flags did not start play (countdown, gen 1)');

    // ---------- host leaves ----------
    A.fb.database().goOffline();
    ok(await until(() => b.isHost() && !w2.isHost()), 'host closes tab -> next player becomes host');
    await Promise.all([b.ready(true), w2.ready(true)]);
    ok(await until(() => b.snap.meta.state === 'play' && b.snap.meta.round === 2 && Object.keys(b.snap.meta.roster).length === 2), 'new host runs the automation (all ready -> play, round 2)');

    // ---------- countdown expiry, last player leaves ----------
    const id3 = await L.R.create(G, P, { name: 'Quick', countdownMs: 1500 });
    const l3 = await L.R.join(G, P, id3, { name: 'Lu' }), e3 = await E.R.join(G, P, id3, { name: 'Ed' });
    ok(await until(() => e3.snap.meta.state === 'countdown'), 'room 3 countdown');
    const t0 = Date.now();
    ok(await until(() => e3.snap.meta.state === 'play', 4000) && Date.now() - t0 > 900, 'countdown expiry -> play (nobody ready)');
    await l3.leave();
    ok((await roomsIn())[id3] && e3.snap.meta, 'room stays while a player is left');
    await e3.leave();
    ok(!(await roomsIn())[id3], 'last player leaving removes the room');

    // ---------- two browsers both think they are host ----------
    const id4 = await E.R.create(G, P, { name: 'Twins', countdownMs: 60000 });
    const x4 = await E.R.join(G, P, id4, { name: 'X' }), y4 = await L.R.join(G, P, id4, { name: 'Y' });
    x4.isHost = y4.isHost = () => true;   // force the bad case: both run the automation
    ok(await until(() => x4.snap.meta.state === 'countdown'), 'two hosts: countdown starts');
    const cEnd = x4.snap.meta.countdownEnd;
    await Promise.all([x4.ready(true), y4.ready(true)]);
    ok(await until(() => x4.snap.meta.state === 'play'), 'two hosts: play starts');
    await sleep(700);
    ok(x4.snap.meta.round === 1 && x4.snap.meta.countdownEnd === cEnd && y4.snap.meta.seed === x4.snap.meta.seed, 'two hosts: each transition happened once (transactions)');
    await Promise.all([x4.leave(), y4.leave()]);
    ok(!(await roomsIn())[id4], 'both leave at once: room removed');

    // ---------- settings ----------
    let st = 'none'; const offSt = B.R.watchSettings(G, P, v => (st = v));
    ok(await until(() => st === null), 'watchSettings: null when unset');
    await W2.R.setSettings(G, P, { minNaming: 'pick', sets: { mono: true, poly: false, tm: false }, shapes: false });
    ok(await until(() => st && st.minNaming === 'pick' && st.sets.mono === true), 'setSettings -> watchers update');
    offSt(); stopLobby();
    ok((await rejects(A.R.create('Bad Game', P, {}), 'bad')) === true, 'bad game name rejected');
  } catch (e) { fails++; console.log('FAIL exception', e); }
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
