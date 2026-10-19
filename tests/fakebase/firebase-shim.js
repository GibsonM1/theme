/* fakebase shim: defines a global `firebase` with the compat-SDK subset that rooms-v1.js uses, talking to
 * fakebase/server.js over a WebSocket. Works as a browser <script> and inside a Node vm context.
 * Server: globalThis.FAKEBASE_URL (default ws://localhost:9123). Fixed uid (optional): globalThis.FAKEBASE_UID.
 * Extras for tests: firebase.database().goOffline() / goOnline() (real SDK has these too).
 */
(function (G) {
  'use strict';
  if (G.firebase && G.firebase.__fake) return;
  var TS = { '.sv': 'timestamp' };
  var url = function () { return G.FAKEBASE_URL || 'ws://localhost:9123'; };
  var store = {
    get: function (k) { try { return G.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { G.localStorage.setItem(k, v); } catch (e) {} }
  };
  var parts = function (p) { return String(p || '').split('/').filter(Boolean); };
  var isObj = function (v) { return v && typeof v === 'object'; };
  function stable(v) {
    if (!isObj(v)) return JSON.stringify(v === undefined ? null : v);
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }
  function clone(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }
  function check(v, where) {   // the real SDK throws on undefined values and bad keys
    if (v === undefined) throw new Error('Firebase: ' + where + ' contains undefined');
    if (typeof v === 'number' && !isFinite(v)) throw new Error('Firebase: ' + where + ' contains NaN/Infinity');
    if (isObj(v)) for (var k in v) {
      if (/[.#$\[\]\/]/.test(k) && k !== '.sv') throw new Error('Firebase: bad key "' + k + '" in ' + where);
      check(v[k], where + '/' + k);
    }
  }
  // Firebase key order: integer keys numerically, then strings
  var INT = /^-?(0|[1-9]\d{0,8})$/;
  function keyCmp(a, b) {
    var ia = INT.test(a), ib = INT.test(b);
    if (ia && ib) return a - b;
    if (ia) return -1; if (ib) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function readForm(v) {   // objects with mostly-sequential integer keys come back as arrays (like real val())
    if (!isObj(v)) return v;
    var ks = Object.keys(v), max = -1, all = true, o = {};
    ks.forEach(function (k) { o[k] = readForm(v[k]); if (/^(0|[1-9]\d*)$/.test(k)) max = Math.max(max, +k); else all = false; });
    if (all && ks.length && max < 2 * ks.length) { var a = []; ks.forEach(function (k) { a[+k] = o[k]; }); return a; }
    return o;
  }
  function at(v, p) { for (var i = 0; i < p.length; i++) { if (!isObj(v)) return null; v = v[p[i]]; if (v === undefined) return null; } return v === undefined ? null : v; }

  // ---------- connection ----------
  var ws = null, online = true, connected = false, offset = 0, rid = 0, sid = 0;
  var pend = {};   // r -> {msg, res}   (resent after a reconnect, like the real SDK)
  var subs = {};   // id -> {path, p, cb, j, v, has}
  var info = [];   // {path, cb}
  function fireInfo() { info.forEach(function (l) { l.cb(infoVal(l.path)); }); }
  function infoVal(path) { return path === '.info/connected' ? connected : path === '.info/serverTimeOffset' ? offset : null; }
  function raw(m) { if (ws && connected) ws.send(JSON.stringify(m)); }
  function connect() {
    if (ws || !online) return;
    var s = ws = new G.WebSocket(url());
    s.onmessage = function (e) {
      var m = JSON.parse(e.data);
      if (m.t === 'hello') {
        offset = m.now - Date.now(); connected = true;
        Object.keys(subs).forEach(function (id) { raw({ t: 'sub', id: +id, path: subs[id].path }); });
        Object.keys(pend).sort(function (a, b) { return a - b; }).forEach(function (r) { raw(pend[r].msg); });
        fireInfo();
      } else if (m.t === 'val') {
        var sb = subs[m.id]; if (!sb) return;
        var j = stable(m.v); sb.v = m.v; sb.has = true;
        if (j !== sb.j) { sb.j = j; sb.cb(m.v); }
      } else if (m.t === 'ack') {
        var pd = pend[m.r]; if (!pd) return; delete pend[m.r]; pd.res(m);
      }
    };
    s.onclose = function () {
      if (ws !== s) return;
      ws = null; var was = connected; connected = false;
      if (was) fireInfo();
      if (online) setTimeout(connect, 300);
    };
    s.onerror = function () {};
  }
  function rpc(msg) {
    return new Promise(function (res) { msg.r = ++rid; pend[msg.r] = { msg: msg, res: res }; raw(msg); });
  }
  function cached(p) {   // value at p from any active listener at or above p (what a real transaction starts with)
    for (var id in subs) { var s = subs[id]; if (s.has && s.p.length <= p.length && s.p.every(function (k, i) { return k === p[i]; })) return at(s.v, p.slice(s.p.length)); }
    return null;
  }

  // ---------- snapshots ----------
  function Snap(key, v, ref) { this.key = key; this._v = v === undefined ? null : v; this.ref = ref; }
  Snap.prototype = {
    val: function () { return readForm(clone(this._v)); },
    exportVal: function () { return this.val(); },
    toJSON: function () { return this.val(); },
    exists: function () { return this._v !== null; },
    child: function (p) { var q = parts(p); return new Snap(q.length ? q[q.length - 1] : this.key, at(this._v, q), this.ref && this.ref.child(p)); },
    hasChild: function (p) { return at(this._v, parts(p)) !== null; },
    hasChildren: function () { return this.numChildren() > 0; },
    numChildren: function () { return isObj(this._v) ? Object.keys(this._v).length : 0; },
    forEach: function (cb) {
      if (!isObj(this._v)) return false;
      var ks = Object.keys(this._v).sort(keyCmp);
      for (var i = 0; i < ks.length; i++) if (cb(this.child(ks[i])) === true) return true;
      return false;
    }
  };

  // ---------- refs ----------
  var PUSH = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz', lastT = 0, lastR = [];
  function pushId() {
    var t = Date.now() + offset, dup = t === lastT, id = '', i; lastT = t;
    for (i = 0; i < 8; i++) { id = PUSH.charAt(t % 64) + id; t = Math.floor(t / 64); }
    if (!dup) for (i = 0; i < 12; i++) lastR[i] = Math.floor(Math.random() * 64);
    else { for (i = 11; i >= 0 && lastR[i] === 63; i--) lastR[i] = 0; lastR[i]++; }
    for (i = 0; i < 12; i++) id += PUSH.charAt(lastR[i]);
    return id;
  }
  function done(p, cb) { return p.then(function (m) { if (cb) cb(null); return m; }); }
  function Ref(path) {
    this._p = parts(path); this.path = this._p.join('/');
    this.key = this._p.length ? this._p[this._p.length - 1] : null;
  }
  Ref.prototype = {
    child: function (p) { return new Ref(this._p.concat(parts(p)).join('/')); },
    get parent() { return this._p.length ? new Ref(this._p.slice(0, -1).join('/')) : null; },
    get root() { return new Ref(''); },
    toString: function () { return url() + '/' + this.path; },
    isEqual: function (o) { return !!o && o.path === this.path; },
    set: function (v, cb) { check(v, 'set(' + this.path + ')'); return done(rpc({ t: 'set', path: this.path, v: v }), cb).then(function () {}); },
    update: function (o, cb) {
      if (!isObj(o)) throw new Error('Firebase: update() needs an object');
      for (var k in o) { if (/[.#$\[\]]/.test(k)) throw new Error('Firebase: bad key "' + k + '"'); check(o[k], 'update(' + this.path + ')/' + k); }
      return done(rpc({ t: 'update', path: this.path, v: o }), cb).then(function () {});
    },
    remove: function (cb) { return done(rpc({ t: 'remove', path: this.path }), cb).then(function () {}); },
    push: function (v, cb) {
      var r = this.child(pushId());
      if (v === undefined) return r;
      var p = r.set(v, cb), t = new Ref(r.path);
      t.then = function (a, b) { return p.then(function () { return r; }).then(a, b); };
      t.catch = function (b) { return p.catch(b); };
      return t;
    },
    once: function (ev, cb) {
      var self = this;
      if (this.path.indexOf('.info') === 0) { var s0 = new Snap(this.key, infoVal(this.path), this); if (cb) cb(s0); return Promise.resolve(s0); }
      return rpc({ t: 'get', path: this.path }).then(function (m) { var s = new Snap(self.key, m.v, self); if (cb) cb(s); return s; });
    },
    get: function () { return this.once('value'); },
    on: function (ev, cb) {
      if (ev !== 'value') throw new Error('fakebase: only on("value") is supported');
      var self = this;
      if (this.path.indexOf('.info') === 0) {
        info.push({ path: this.path, cb: function (v) { cb(new Snap(self.key, v, self)); }, orig: cb, ref: this.path });
        setTimeout(function () { cb(new Snap(self.key, infoVal(self.path), self)); }, 0);
        return cb;
      }
      var id = ++sid;
      subs[id] = { path: this.path, p: this._p, j: null, v: null, has: false, orig: cb, cb: function (v) { cb(new Snap(self.key, v, self)); } };
      connect(); raw({ t: 'sub', id: id, path: this.path });
      return cb;
    },
    off: function (ev, cb) {
      var path = this.path;
      Object.keys(subs).forEach(function (id) {
        if (subs[id].path === path && (!cb || subs[id].orig === cb)) { delete subs[id]; raw({ t: 'unsub', id: +id }); }
      });
      info = info.filter(function (l) { return !(l.ref === path && (!cb || l.orig === cb)); });
    },
    transaction: function (fn, cb) {
      var self = this, cur = cached(this._p);
      return new Promise(function (res, rej) {
        var tries = 0;
        (function step() {
          var nv;
          try { nv = fn(readForm(clone(cur))); } catch (e) { return rej(e); }
          if (nv === undefined) { var s = new Snap(self.key, cur, self); if (cb) cb(null, false, s); return res({ committed: false, snapshot: s }); }
          check(nv, 'transaction(' + self.path + ')');
          rpc({ t: 'cas', path: self.path, expect: cur, v: nv }).then(function (m) {
            if (m.ok) { var s = new Snap(self.key, m.v, self); if (cb) cb(null, true, s); return res({ committed: true, snapshot: s }); }
            cur = m.v;
            if (++tries > 25) { var e = new Error('maxretry'); if (cb) cb(e, false, null); return rej(e); }
            step();
          });
        })();
      });
    },
    onDisconnect: function () {
      var path = this.path;
      var od = function (op, v) { return rpc({ t: 'od', path: path, op: op, v: v }).then(function () {}); };
      return {
        set: function (v) { check(v, 'onDisconnect.set'); return od('set', v); },
        update: function (o) { return od('update', o); },
        remove: function () { return od('remove'); },
        cancel: function () { return od('cancel'); }
      };
    }
  };

  // ---------- auth ----------
  var user = null, authL = [];
  var fixed = G.FAKEBASE_UID || store.get('fakebase-uid');
  if (fixed) { user = { uid: String(fixed), isAnonymous: true }; store.set('fakebase-uid', user.uid); }
  function tellAuth() { authL.forEach(function (cb) { cb(user); }); }
  var authApi = {
    get currentUser() { return user; },
    signInAnonymously: function () {
      if (!user) {
        var id = ''; for (var i = 0; i < 28; i++) id += PUSH.charAt(1 + Math.floor(Math.random() * 62));
        user = { uid: id.replace(/[-_]/g, 'x'), isAnonymous: true }; store.set('fakebase-uid', user.uid);
      }
      setTimeout(tellAuth, 0);
      return Promise.resolve({ user: user });
    },
    onAuthStateChanged: function (cb) {
      authL.push(cb); setTimeout(function () { if (authL.indexOf(cb) >= 0) cb(user); }, 0);
      return function () { authL = authL.filter(function (x) { return x !== cb; }); };
    },
    signOut: function () { user = null; setTimeout(tellAuth, 0); return Promise.resolve(); }
  };

  // ---------- firebase ----------
  var app = null;
  var dbApi = {
    ref: function (p) { connect(); return new Ref(p); },
    goOffline: function () { online = false; var s = ws; ws = null; if (s) { s.onclose = null; s.close(); } if (connected) { connected = false; fireInfo(); } },
    goOnline: function () { online = true; connect(); }
  };
  function needApp() { if (!app) throw new Error("Firebase: No Firebase App '[DEFAULT]' has been created (app/no-app)."); }
  var firebase = {
    __fake: true, SDK_VERSION: 'fakebase', apps: [],
    initializeApp: function (cfg) {
      if (app) throw new Error("Firebase: Firebase App named '[DEFAULT]' already exists (app/duplicate-app).");
      app = { name: '[DEFAULT]', options: cfg || {}, auth: function () { return authApi; }, database: function () { return dbApi; } };
      firebase.apps.push(app); return app;
    },
    app: function () { needApp(); return app; },
    auth: function () { needApp(); return authApi; },
    database: function () { needApp(); return dbApi; }
  };
  dbApi.app = { name: '[DEFAULT]' };
  firebase.database.ServerValue = { TIMESTAMP: TS };
  G.firebase = firebase;
})(typeof globalThis !== 'undefined' ? globalThis : this);
