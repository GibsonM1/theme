/* Copyright (c) 2026 Matthew Gibson, Mission High School. CC BY-NC-SA 4.0: https://creativecommons.org/licenses/by-nc-sa/4.0/ Not for resale. */
/* Shared student login for Mr. Gibson's games (iBond, Ka-BOHR!, ...). Version 1.
 *
 * Each game loads it with:  <script src="https://gibsonm1.github.io/theme/login-v1.js"></script>
 * The back end address lives ONLY in this file.
 *   - Redeploying Code.gs with Manage deployments > Edit > New version keeps the same address: nothing to change.
 *   - If you ever make a NEW deployment (new address), paste it into API_URL below. Every game picks it up.
 * If a change here would break older games, make login-v2.js instead of editing this file.
 */
(function () {
  'use strict';
  // ===================== CONFIG =====================
  var CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbyQdG9xrv-ba_5Jae5hy0ZN4oyEvXCrSL85F4MCrT52W6zLdIMHcpxmf3dKMPHoA7h1/exec',
    SESSION_KEY: 'gibson-session',   // one login shared by every game on gibsonm1.github.io
    CODE_KEY: 'gibson-code',         // class code from a ?code= link (only matters if the back end requires one)
    RETRIES: 3                       // extra tries when the back end is busy or the internet blips
  };
  // ==================================================

  var viaRun = function () { return !!(window.google && google.script && google.script.run); };
  var inClaude = /claude\.ai$|claudeusercontent\.com$|anthropic\.com$/.test(location.hostname) || !!(window.claude && (window.claude.use || window.claude.complete));
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  // class code: a ?code= link saves it for every game (older links used ibond-code)
  var classCode = '';
  try {
    var q = new URLSearchParams(location.search).get('code');
    if (q) store.set(CONFIG.CODE_KEY, q);
    classCode = q || store.get(CONFIG.CODE_KEY) || store.get('ibond-code') || '';
  } catch (e) {}
  store.del('ibond-who');   // the old name-lookup login (no token) is retired

  function normUser(u) { return String(u || '').trim().toLowerCase().replace(/@.*$/, '').replace(/\s+/g, ''); }

  function session() {
    var raw = store.get(CONFIG.SESSION_KEY), s = null;
    try { s = raw ? JSON.parse(raw) : null; } catch (e) { s = null; }
    if (s && (!s.token || !(s.exp > Date.now()))) { store.del(CONFIG.SESSION_KEY); s = null; }
    return s;
  }
  function tell() { try { window.dispatchEvent(new CustomEvent('gibson-session', { detail: session() })); } catch (e) {} }
  // logging in or out in another tab updates this one too
  window.addEventListener('storage', function (e) { if (e.key === CONFIG.SESSION_KEY) tell(); });

  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function send(req) {
    var body = JSON.stringify(req);
    if (viaRun()) return new Promise(function (res, rej) {
      google.script.run.withSuccessHandler(function (t) { var r; try { r = JSON.parse(t); } catch (e) { r = { error: 'server' }; } res(r); })
        .withFailureHandler(function () { rej({ error: 'network' }); }).apiRun(body);
    });
    if (!CONFIG.API_URL) return Promise.reject({ error: 'offline' });
    // text/plain is a "simple" request: Apps Script can't answer a CORS preflight, so never send application/json
    return fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body })
      .then(function (r) { return r.json(); }, function () { throw { error: 'network' }; })
      .catch(function (e) { throw e && e.error ? e : { error: 'server' }; });
  }

  // call(action, body, game) -> Promise of the reply; rejects with {error:'...'}.
  // Retries network / busy / server errors with growing, jittered waits (a whole class saving at once).
  async function call(action, body, game) {
    var req = Object.assign({ action: action, game: game || '', code: classCode }, body || {});
    if (action !== 'login') { var s = session(); if (!s) throw { error: 'bad_token' }; req.token = s.token; }
    var last = null;
    for (var i = 0; i <= CONFIG.RETRIES; i++) {
      if (i) await wait(800 * Math.pow(2, i - 1) + Math.random() * 900);
      var r;
      try { r = await send(req); } catch (e) { last = e; continue; }
      if (!r || !r.error) return r;
      last = r;
      if (r.error === 'bad_token') { store.del(CONFIG.SESSION_KEY); tell(); break; }
      if (r.error !== 'busy' && r.error !== 'server') break;
    }
    throw last || { error: 'network' };
  }

  // login(username, last5, game) -> Promise of {user, profile, data} for that game
  async function login(username, last5, game) {
    var user = normUser(username);
    var r = await call('login', { username: user, last5: String(last5 || '') }, game);
    store.set(CONFIG.SESSION_KEY, JSON.stringify({
      token: r.token, exp: Date.now() + (r.hours || 168) * 3600000 - 60000,
      user: user, first: String(r.user.first), init: String(r.user.init || ''), period: String(r.user.period)
    }));
    tell();
    return r;
  }
  function logout() { store.del(CONFIG.SESSION_KEY); tell(); }

  window.GibsonLogin = {
    version: 1,
    on: function () { return (viaRun() || !!CONFIG.API_URL) && !inClaude; },   // the Claude preview can't reach the Sheet
    session: session, login: login, logout: logout, call: call, normUser: normUser
  };
})();
