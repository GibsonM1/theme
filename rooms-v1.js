/* Copyright (c) 2026 Matthew Gibson, Mission High School. CC BY-NC-SA 4.0: https://creativecommons.org/licenses/by-nc-sa/4.0/ Not for resale. */
/* Shared real-time rooms for Mr. Gibson's multiplayer games (Ionagrams, ...). Version 1.
 *
 * Each game loads it after login-v1.js:  <script src="https://gibsonm1.github.io/theme/rooms-v1.js"></script>
 * It uses the Firebase Realtime Database (project gibson-chem-games) with anonymous sign-in.
 *   - Security rules: database.rules.json next to this file. Paste it into Firebase console > Realtime Database > Rules.
 *   - Database layout: rooms/{game}/{period}/{roomId} = {meta, players, data}; teacher settings at settings/{game}/{period}.
 *   - The oldest player still in a room is the "host"; their browser runs the lobby countdown. If they close the tab,
 *     the next player takes over by themselves.
 * If a change here would break older games, make rooms-v2.js instead of editing this file.
 */
(function () {
  'use strict';
  // ===================== CONFIG =====================
  var CONFIG = {
    FIREBASE: {                        // from Firebase console > Project settings > Your apps (safe to be public)
      apiKey: 'AIzaSyCnhjG5gfVSAx2-dmcnCd8ZAEjYdeWsPLk', authDomain: 'gibson-chem-games.firebaseapp.com',
      databaseURL: 'https://gibson-chem-games-default-rtdb.firebaseio.com', projectId: 'gibson-chem-games',
      storageBucket: 'gibson-chem-games.firebasestorage.app', messagingSenderId: '1008525772732',
      appId: '1:1008525772732:web:186022bda28322e3e5cdb9'
    },
    SDK: '10.12.2',            // Firebase compat SDK version, loaded from gstatic only when a game needs rooms
    ROOMS: 'rooms',            // database folder that holds the rooms
    SETTINGS: 'settings',      // database folder that holds per-period teacher settings
    COUNTDOWN_MS: 15000,       // lobby countdown once enough players are in (create() can change it per room)
    MIN_PLAYERS: 2,            // players needed to start the countdown
    MAX_PLAYERS: 5,            // room size when create() isn't given one
    START_DELAY_MS: 3000,      // gap between the countdown ending and the round starting (startAt)
    TICK_MS: 500,              // how often the host's browser checks the countdown
    STALE_MS: 120000,          // empty rooms older than this get cleaned up by anyone watching the lobby
    GRACE_MS: 3000,            // ...after looking again this long later (a quick wifi blip doesn't delete a room)
    TIMEOUT_MS: 8000           // give up connecting after this long
  };
  // ==================================================

  var inClaude = /claude\.ai$|claudeusercontent\.com$|anthropic\.com$/.test(location.hostname) || !!(window.claude && (window.claude.use || window.claude.complete));
  var GAME = /^[a-z0-9-]{1,24}$/, PERIOD = /^[A-Za-z0-9]{1,12}$/;
  var fb, db, uid = null, offset = 0, isConn = false, readyP = null, wired = false, creating = null, live = {};
  var noop = function () {};
  var err = function (e) { return { error: e }; };
  var size = function (o) { return o ? Object.keys(o).length : 0; };
  var clean = function (o) { return JSON.parse(JSON.stringify(o || {})); };   // drops undefined (Firebase throws on it)
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var TS = function () { return fb.database.ServerValue.TIMESTAMP; };
  var serverNow = function () { return Date.now() + offset; };
  var pathOk = function (g, p) { return GAME.test(g) && PERIOD.test(p); };
  var roomPath = function (g, p, id) { return CONFIG.ROOMS + '/' + g + '/' + p + (id ? '/' + id : ''); };
  // host order: smallest joined time first (tie: uid). Everyone computes the same list.
  function order(P) {
    return Object.keys(P || {}).sort(function (a, b) {
      return ((+P[a].joined || 9e15) - (+P[b].joined || 9e15)) || (a < b ? -1 : a > b ? 1 : 0);
    });
  }
  function load(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }

  // load the SDK (skipped for any part already on the page), sign in anonymously, start watching the connection
  function ready() {
    if (readyP) return readyP;
    if (!GibsonRooms.on()) return Promise.reject(err('offline'));
    var base = 'https://www.gstatic.com/firebasejs/' + CONFIG.SDK + '/firebase-';
    var p = readyP = new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(err('offline')); }, CONFIG.TIMEOUT_MS);
      Promise.resolve()
        .then(function () { return window.firebase || load(base + 'app-compat.js'); })
        .then(function () { return firebase.auth || load(base + 'auth-compat.js'); })
        .then(function () { return firebase.database || load(base + 'database-compat.js'); })
        .then(function () {
          fb = window.firebase;
          if (!fb.apps.length) fb.initializeApp(CONFIG.FIREBASE);
          db = fb.database();
          return new Promise(function (ok, bad) {
            var a = fb.auth(), stop = a.onAuthStateChanged(function (u) {
              if (u) { stop(); ok(u); } else a.signInAnonymously().catch(bad);
            }, bad);
          });
        })
        .then(function (u) {
          clearTimeout(t); uid = u.uid;
          if (!wired) {
            wired = true;
            db.ref('.info/serverTimeOffset').on('value', function (s) { offset = +s.val() || 0; });
            db.ref('.info/connected').on('value', function (s) {
              isConn = !!s.val();
              try { window.dispatchEvent(new CustomEvent('gibson-rooms', { detail: { connected: isConn } })); } catch (e) {}
              if (isConn) for (var k in live) live[k]._online();
            });
          }
          res({ uid: uid });
        }, function () { clearTimeout(t); rej(err('offline')); });
    });
    p.catch(function () { if (readyP === p) readyP = null; });   // a later call can try again
    return p;
  }

  function watch(path, cb) {   // -> unsubscribe; cb(snapshot) once signed in
    var stop = false, ref = null, h = function (s) { if (!stop) cb(s); };
    ready().then(function () { if (!stop) { ref = db.ref(path); ref.on('value', h); } }, noop);
    return function () { stop = true; if (ref) ref.off('value', h); };
  }

  function watchLobby(game, period, cb) {
    if (!pathOk(game, period)) return noop;
    var sweeping = {};
    function sweep(r) {   // delete a stale empty room if it is still empty a moment later
      if (sweeping[r.key]) return; sweeping[r.key] = 1;
      setTimeout(function () {
        r.child('players').once('value').then(function (s) { if (!s.exists()) return r.remove(); })
          .catch(noop).then(function () { delete sweeping[r.key]; });
      }, CONFIG.GRACE_MS);
    }
    return watch(roomPath(game, period), function (s) {
      var now = serverNow(), out = [];
      s.forEach(function (c) {
        var v = c.val() || {}, m = v.meta, P = v.players || {}, n = size(P);
        if (!n && (!m || now - (+m.created || 0) > CONFIG.STALE_MS)) sweep(c.ref);
        if (!m) return;
        out.push({ id: c.key, name: m.name, state: m.state, count: n, max: m.max, settings: m.settings || {}, created: m.created,
          players: order(P).map(function (u) { return { name: P[u].name, buddy: P[u].buddy, hat: P[u].hat }; }) });
      });
      out.sort(function (a, b) { return (b.created || 0) - (a.created || 0); });
      cb(out);
    });
  }

  function create(game, period, o) {
    if (creating) return creating;   // double-click: one room
    o = o || {};
    if (!pathOk(game, period)) return Promise.reject(err('bad'));
    var p = creating = ready().then(function () {
      var ref = db.ref(roomPath(game, period)).push();
      return ref.child('meta').set({
        name: String(o.name || 'Room').slice(0, 40), max: Math.max(CONFIG.MIN_PLAYERS, Math.min(40, +o.max || CONFIG.MAX_PLAYERS)),
        created: TS(), countdownMs: +o.countdownMs || CONFIG.COUNTDOWN_MS, settings: clean(o.settings), state: 'lobby', round: 0, gen: 0
      }).then(function () { return ref.key; });
    });
    p.then(function () { creating = null; }, function () { creating = null; });
    return p.catch(function (e) { throw e && e.error ? e : err('offline'); });
  }

  function join(game, period, id, me) {
    if (!pathOk(game, period) || !id) return Promise.reject(err('gone'));
    var key = roomPath(game, period, id);
    if (live[key]) return live[key]._p;   // double-click or already in this room
    var room = live[key] = Room(game, period, id, key);
    room._p = room._join(me || {}).catch(function (e) { room._close(); throw e && e.error ? e : err('offline'); });
    return room._p;
  }

  function Room(game, period, id, key) {
    var base, myRef, metaRef, mine, cbs = [], left = false, busy = false, healing = false, clearing = false, timer = null, first = null;
    var room = { id: id, game: game, period: period, gone: false, snap: { meta: null, players: {}, data: {} } };
    var dref = function (p) { return base.child(p ? 'data/' + p : 'data'); };
    var arm = function () { return myRef.onDisconnect().remove(); };
    var notIn = function (m) { return m.state === 'play' && !(m.roster && m.roster[uid]); };

    function got(s) {
      var v = s.val() || {}, m = v.meta || null;
      room.snap = { meta: m, players: v.players || {}, data: v.data || {} };
      if (!m) room.gone = true;
      if (room.snap.players[uid]) mine = room.snap.players[uid];
      heal(); tidy(); auto();
      cbs.slice().forEach(function (cb) { try { cb(room.snap); } catch (e) { console.error(e); } });
      if (first) { first(); first = null; }
      if (room.gone) room._close();
    }
    // my entry vanished (connection dropped, onDisconnect ran) but I never left: put it back
    function heal() {
      if (left || healing || !room.snap.meta || room.snap.players[uid] || !mine) return;
      healing = true;
      arm().then(function () { return myRef.set(mine); }).catch(noop).then(function () { healing = false; });
    }
    // after reset() (meta.gen went up) my old "ready" no longer counts: clear it
    function tidy() {
      var m = room.snap.meta, p = room.snap.players[uid];
      if (left || clearing || !m || !p || !p.ready || m.state === 'play' || (p.readyGen || 0) === (m.gen || 0)) return;
      clearing = true;
      myRef.update({ ready: false }).catch(noop).then(function () { clearing = false; });
    }
    // host-only lobby automation; transactions make sure only one browser moves the state
    function auto() {
      var m = room.snap.meta;
      if (!m || left || busy || !isConn || !room.isHost()) return;
      var P = room.snap.players, ids = Object.keys(P), n = ids.length, now = serverNow(), g = m.gen || 0;
      if (m.state === 'lobby' && n >= CONFIG.MIN_PLAYERS) move('lobby', { state: 'countdown', countdownEnd: now + (+m.countdownMs || CONFIG.COUNTDOWN_MS) });
      else if (m.state === 'countdown') {
        if (n < CONFIG.MIN_PLAYERS) move('countdown', { state: 'lobby', countdownEnd: null });
        else if (now >= m.countdownEnd || ids.every(function (u) { return P[u].ready && (P[u].readyGen || 0) === g; })) {
          var roster = {}; ids.forEach(function (u) { roster[u] = true; });
          move('countdown', { state: 'play', startAt: now + CONFIG.START_DELAY_MS, seed: Math.random().toString(36).slice(2, 12), round: (m.round || 0) + 1, roster: roster });
        }
      }
    }
    function move(from, f) {
      busy = true;
      metaRef.transaction(function (m) {
        if (!m || m.state !== from) return;   // another browser already moved it: abort
        for (var k in f) { if (f[k] === null) delete m[k]; else m[k] = f[k]; }
        return m;
      }).catch(noop).then(function () { busy = false; });
    }

    room._join = async function (me) {
      await ready();
      room.uid = uid;
      base = db.ref(key); myRef = base.child('players/' + uid); metaRef = base.child('meta');
      var v = (await base.once('value')).val(), m = v && v.meta, P = (v && v.players) || {};
      if (!m) throw err('gone');
      if (notIn(m)) throw err('started');
      if (!P[uid] && m.state !== 'play' && size(P) >= m.max) throw err('full');
      mine = Object.assign(clean(me), { name: String(me.name || 'Player').slice(0, 40), joined: P[uid] ? P[uid].joined : TS(), ready: false });
      await arm();
      await myRef.set(mine);
      // look again: someone may have taken the last seat or started the game at the same moment
      v = (await base.once('value')).val() || {}; m = v.meta; P = v.players || {};
      var why = !m ? 'gone' : notIn(m) ? 'started' : m.state !== 'play' && order(P).indexOf(uid) >= m.max ? 'full' : '';
      if (why) { left = true; await myRef.onDisconnect().cancel(); if (m) await myRef.remove(); throw err(why); }
      await new Promise(function (r) { first = r; base.on('value', got); });
      if (room.gone) throw err('gone');
      timer = setInterval(auto, CONFIG.TICK_MS);
      return room;
    };
    room._close = function () {
      if (base) base.off('value', got);
      clearInterval(timer);
      if (live[key] === room) delete live[key];
    };
    room._online = function () { if (!left) { arm().catch(noop); heal(); } };

    room.isHost = function () { return !left && order(room.snap.players)[0] === uid; };
    room.onChange = function (cb) {
      cbs.push(cb); try { cb(room.snap); } catch (e) { console.error(e); }
      return function () { cbs = cbs.filter(function (x) { return x !== cb; }); };
    };
    room.setMe = function (f) { f = clean(f); Object.assign(mine, f); return myRef.update(f); };
    room.ready = function (b) { return room.setMe({ ready: !!b, readyGen: (room.snap.meta && room.snap.meta.gen) || 0 }); };
    room.set = function (p, v) { return dref(p).set(v); };
    room.update = function (p, o) { return dref(p).update(o); };
    room.remove = function (p) { return dref(p).remove(); };
    room.txn = function (p, fn) {
      return dref(p).transaction(fn).then(function (r) { return { committed: r.committed, value: r.snapshot.val() }; });
    };
    room.leave = function () {
      if (left) return Promise.resolve();
      left = true; room._close();
      var work = myRef.onDisconnect().cancel()
        .then(function () { return myRef.remove(); })
        .then(function () { return base.child('players').once('value'); })
        .then(function (s) { if (!s.exists()) return base.remove(); })   // I was the last one: remove the room
        .catch(noop);
      return Promise.race([work, wait(3000)]);   // don't hang a "Leave" button when offline
    };
    room.reset = function () {   // play again: back to the lobby, clear game data, nobody ready
      if (!room.isHost()) return Promise.reject(err('host'));
      var m = room.snap.meta || {};
      return base.update({ 'meta/state': 'lobby', 'meta/countdownEnd': null, 'meta/startAt': null, 'meta/gen': (m.gen || 0) + 1, data: null });
    };
    return room;
  }

  window.GibsonRooms = {
    version: 1,
    on: function () { return !!(CONFIG.FIREBASE && CONFIG.FIREBASE.databaseURL) && !inClaude; },   // the Claude preview can't reach Firebase
    ready: ready,
    serverNow: serverNow,
    connected: function () { return isConn; },
    watchLobby: watchLobby,
    create: create,
    join: join,
    watchSettings: function (game, period, cb) {
      if (!pathOk(game, period)) return noop;
      return watch(CONFIG.SETTINGS + '/' + game + '/' + period, function (s) { cb(s.val()); });
    },
    setSettings: function (game, period, obj) {
      if (!pathOk(game, period)) return Promise.reject(err('bad'));
      return ready().then(function () { return db.ref(CONFIG.SETTINGS + '/' + game + '/' + period).set(clean(obj)); });
    }
  };
})();
