# fakebase: local stand-in for Firebase (tests only)

- Setup once: `cd theme/tests/fakebase && npm i`. Start: `node server.js 9123` (or `require('./server').start(port)`). `GET /reset`, `GET /dump`, `GET /shim.js`.
- `firebase-shim.js` defines `window.firebase` (compat subset rooms-v1.js uses) and talks to `globalThis.FAKEBASE_URL` (default `ws://localhost:9123`).
- Playwright: route `https://www.gstatic.com/firebasejs/**`. Answer `firebase-app-compat.js` with the shim and `auth`/`database` with an empty script.
  rooms-v1.js skips loading any SDK part that is already on the page, so only app-compat gets requested:
  `await context.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({ contentType: 'text/javascript', body: r.request().url().includes('app-compat') ? shim : '' }));`
- One browser context = one student (the uid lives in localStorage `fakebase-uid`, so a reload keeps it). Or set `window.FAKEBASE_UID` in `addInitScript`.
- Simulate a closed tab or wifi drop: `firebase.database().goOffline()` (onDisconnect runs), then `goOnline()`.
- No security rules are enforced here; check database.rules.json by hand (tests/rules-notes.md).
- Node tests: `node tests/rooms.test.js` (runs each player in its own vm context).
