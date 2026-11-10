/* Copyright (c) 2026 Matthew Gibson, Mission High School. CC BY-NC-SA 4.0: https://creativecommons.org/licenses/by-nc-sa/4.0/ Not for resale. */
/* =====================================================================
   ChemBeats Tracks 4 — cumbia add-on for chembeats-v1.js (needs v1.1+).
   Load AFTER the engine (tracks2 and tracks3 are NOT required):
     <script src="chembeats-v1.js"></script>
     <script src="chembeats-tracks4.js"></script>

   Tracks (id → name):
     'gaita'     Magdalena Molecules    gaita flutes + hand drums, no bass (menus, calm)
     'orquesta'  Ballroom Bonds         big-band cumbia: clarinet, saxes, trumpets, piano (menus)
     'cumbia'    Rolling Reagents       classic cumbia: caña de millo, singer + coro, tambora, bass
     'sabanera'  Squeezebox Solutions   accordion cumbia: caja, guacharaca, electric bass, coro
     'chicha'    Wah-Wah Wavelengths    Peruvian psychedelic cumbia: wah guitar, Farfisa, timbales, güiro
   Cumbia is in 2/4: one ChemBeats bar (16 steps) = two 2/4 measures. Every track loops an 8-bar
   (16-measure) phrase. Same API as v1: ChemBeats.play('cumbia', 1), setLevel(1–4), etc.
   Original melodies and arrangements in traditional styles.
   Drum strokes, wind/reed/voice notes and piano notes are synthesized once when a track starts,
   then replayed as samples (winds at half sample rate to save memory).

   Version: Oct 23, 2026, v1
   ===================================================================== */

// ========================= CONFIG (safe to edit) =========================
const CHEMBEATS_TRACKS4_CONFIG = {
  GAITA_BPM: 86,          // Magdalena Molecules, for menus (80–95)
  ORQUESTA_BPM: 94,       // Ballroom Bonds, for menus (88–100)
  CUMBIA_BPM: 100,        // Rolling Reagents (92–105)
  SABANERA_BPM: 104,      // Squeezebox Solutions (98–110)
  CHICHA_BPM: 108,        // Wah-Wah Wavelengths (100–115)
  CUMBIA_FEEL: 1,         // the rolling lilt in the 16ths: 0 = robot-straight, 1 = typical, 1.5 = heavy
  HUMANIZE: true,         // tiny random timing/volume changes, like real players
  ALEGRE_SOLOS: true,     // level 4: the lead hand drum (alegre) improvises instead of keeping a pattern
  WAH: 1,                 // chicha lead guitar wah: 0 = none, 1 = typical, 1.5 = heavy
  TREMOLO: 0.35,          // chicha rhythm guitar tremolo depth: 0 = none, 0.6 = deep
  FUZZ: 1.6,              // chicha guitar grit: 1 = clean, 3 = fuzzy
};
// =========================================================================

(function (global) {
  'use strict';
  const CB = global.ChemBeats;
  if (!CB || !CB.addVoice) { console.warn('chembeats-tracks4: load chembeats-v1.js (v1.1 or newer) first'); return; }
  const C4 = CHEMBEATS_TRACKS4_CONFIG;
  const { mtof, osc, gn, noise, send, curve } = CB.lib;
  const OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
  const isOff = (c) => !!OAC && c instanceof OAC;
  const env = (g, t, v, a, d) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.001, t + a + d); };
  const filt = (c, type, f, q, db) => { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q != null) x.Q.value = q; if (db != null) x.gain.value = db; return x; };
  const panner = (c, p) => { const x = c.createStereoPanner(); x.pan.value = p || 0; return x; };
  const nz = (c, r, t, dur) => { const s = c.createBufferSource(); s.buffer = r.noise; s.start(t, Math.random() * Math.max(0, 2.9 - dur), dur + 0.01); return s; };

  /* ---------------- plucked strings (Karplus–Strong, computed once per note) ---------------- */
  const KS = {
    bass:    { T60: 2.2, dur: 1.8, exLP: 0.9, pick: 0.25, taps3: true, gain: 0.32, fund: [1.1, 0.35] },   // electric bass, fingers
    upright: { T60: 0.9, dur: 1.2, exLP: 0.9, pick: 0.3,  taps3: true, gain: 0.42, fund: [1.2, 0.25] },   // upright bass, pizzicato
    gtr:     { T60: 2.0, dur: 2.0, exLP: 0.18, pick: 0.12, taps3: false, gain: 0.42 },   // electric guitar, pick
  };
  const KSB = new WeakMap();
  function ksBuf(c, inst, m) {
    let R = KSB.get(c); if (!R) KSB.set(c, R = {});
    const key = inst + ':' + m; if (R[key]) return R[key];
    const P = KS[inst], sr = c.sampleRate, f = mtof(m), n = Math.floor(sr * P.dur);
    const tap = P.taps3 ? 1 : 0.5, per = sr / f - tap, N = Math.max(2, Math.floor(per - 0.1)), fr = per - N;
    const C = (1 - fr) / (1 + fr), g = Math.pow(10, -3 / (P.T60 * Math.pow(440 / f, 0.4) * f));
    let s = (m * 7919 + inst.length * 104729) >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2147483648 - 1; };
    const ex = new Float32Array(N); let lp = 0, mean = 0;
    for (let i = 0; i < N; i++) { lp = (1 - P.exLP) * rnd() + P.exLP * lp; ex[i] = lp; mean += lp / N; }
    const pk = Math.max(1, Math.round(P.pick * N)), e2 = new Float32Array(N);
    for (let i = 0; i < N; i++) e2[i] = (ex[i] - mean) - (i >= pk ? ex[i - pk] - mean : 0);
    const y = new Float32Array(n); let ax = 0, ay = 0, peak = 1e-9;
    for (let i = 0; i < n; i++) {
      let fb = 0;
      if (i >= N) {
        const a0 = y[i - N], a1 = i > N ? y[i - N - 1] : 0;
        const lv = P.taps3 ? 0.25 * a0 + 0.5 * a1 + 0.25 * (i > N + 1 ? y[i - N - 2] : 0) : 0.5 * (a0 + a1);
        const out = C * lv + ax - C * ay; ax = lv; ay = out; fb = g * out;
      }
      y[i] = (i < N ? e2[i] : 0) + fb;
      if (Math.abs(y[i]) > peak) peak = Math.abs(y[i]);
    }
    if (P.fund) {   // a bass's body is mostly its fundamental: add it (and the 2nd harmonic) with the string's decay
      const tau = P.T60 * Math.pow(440 / f, 0.4) / 6.9, w = 2 * Math.PI * f / sr; let pk2 = 1e-9;
      for (let i = 0; i < n; i++) { const e = Math.exp(-i / sr / tau) * Math.min(1, i / (sr * 0.004)); y[i] += peak * e * (P.fund[0] * Math.sin(w * i) + P.fund[1] * Math.sin(2 * w * i + 0.6)); pk2 = Math.max(pk2, Math.abs(y[i])); }
      peak = pk2;
    }
    const fade = Math.floor(sr * 0.03);
    for (let i = 0; i < n; i++) y[i] = (y[i] / peak) * 0.9 * (i > n - fade ? (n - i) / fade : 1);
    const b = c.createBuffer(1, n, sr); b.getChannelData(0).set(y);
    return (R[key] = b);
  }

  /* ------------------------------- drums ------------------------------- */
  const MEMB = [[1.59, 1], [2.14, 0.8], [2.30, 0.6], [2.65, 0.5], [2.92, 0.4], [3.16, 0.35], [3.50, 0.3], [4.06, 0.25], [4.60, 0.2]];
  let LITE = false;   // true while a not-yet-baked stroke plays live: fewer resonators
  // noise-excited resonators: a drum's ring comes from its modes, not from a clean sine (which sounds like a keyboard)
  function modes(b, t, dest, f0, list, exc, vol) {
    const c = b.ctx, e = c.createGain(); env(e, t, 1, 0.0005, exc.d);
    noise(b, t, exc.d + 0.02).connect(filt(c, 'lowpass', exc.lp || 8000, 0.7)).connect(e);
    const out = c.createGain(); out.gain.value = vol; out.connect(dest);
    (LITE ? list.slice(0, 3) : list).forEach(([r, tau, a]) => { const fr = f0 * r, Q = Math.max(0.7, Math.PI * fr * tau); e.connect(filt(c, 'bandpass', fr, Q)).connect(gn(c, a * Math.sqrt(Q))).connect(out); });
    return out;
  }
  const memb = (n, tau, f0div, slope) => MEMB.slice(0, n).map(([r, a], j) => [r / (f0div || 1), tau / (1 + j * (slope || 0.3)), a]);
  const hit = (b, t, dest, v, f, q, d) => { const c = b.ctx, g = c.createGain(); env(g, t, v, 0.0004, d); noise(b, t, d + 0.02).connect(filt(c, 'bandpass', f, q)).connect(g).connect(dest); return g; };
  // where each drum sits left/right. Drums are baked in mono and panned on playback (same sound, half the memory)
  const PAN = {
    tambora: (p) => (p.k === 'rim' ? -0.15 : null), llamador: () => 0.3, alegre: () => -0.28,
    maraca: (p) => ({ maraca: -0.35, maracon: 0.35, guache: 0.4 })[p.k || 'maraca'], raspa: (p) => (p.k === 'guiro' ? -0.4 : -0.38),
    caja: () => 0.25, tumbadora: (p) => (p.k === 'tumba' ? 0.42 : 0.3), timbal: () => 0.18, campana: () => 0.1, bombo: () => null,
    redoblante: () => -0.1, charles: () => 0.22, platillo: () => -0.25,
  };   // null = not panned (goes straight to the drum bus)
  let BAKING = false;
  const pn = (c, v) => (BAKING ? c.createGain() : panner(c, v));
  const K = { boom: 1.15, skin: 3.2, thud: 1.4, rim: 4.5, llam: 20, ale: 13, caja: 13, conga: 13, timb: 10, casc: 4, camp: 16, snare: 2 };   // level trims (set by measurement)

  const VO = {
    // tambora: two-headed drum played with sticks. k: 'head' (bass) | 'rim' (stick on the wooden shell) | 'both'
    tambora(b, t, p) {
      const c = b.ctx, k = p.k || 'head', v = p.vel ?? 1;
      if (k !== 'head') {
        const pan = pn(c, -0.15); pan.connect(b.drums);
        const m = modes(b, t, pan, 1, [[650, 0.007, 0.8], [1320, 0.005, 1], [2150, 0.004, 0.7], [3100, 0.003, 0.5], [4300, 0.002, 0.3]], { d: 0.002, lp: 10000 }, v * K.rim);
        hit(b, t, pan, v * 0.3, 3500, 1.2, 0.012); send(b, m, 0.12, b.verbIn);
        if (k === 'rim') return;
      }
      const f = p.f || 74, dec = 0.42;
      const o = osc(c, 'sine', f * 1.8, t); o.frequency.exponentialRampToValueAtTime(f * 1.05, t + 0.03); o.frequency.exponentialRampToValueAtTime(f, t + dec * 0.6);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.55 * K.boom, t + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t + dec);
      o.connect(g).connect(b.sub); o.start(t); o.stop(t + dec + 0.05);
      const sk = modes(b, t, b.drums, f, MEMB.map(([r, a], j) => [r, 0.13 / (1 + j * 0.25), a]), { d: 0.006, lp: 3000 }, v * K.skin);
      hit(b, t, b.drums, v * 0.55 * K.thud, 900, 0.8, 0.03); send(b, sk, 0.1, b.verbIn);
    },
    // llamador: small single-headed drum, steady open slap on every "and"
    llamador(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 1) * 0.7, pan = pn(c, PAN.llamador(p)); pan.connect(b.drums);
      const m = modes(b, t, pan, 245, memb(6, p.k === 'mute' ? 0.025 : 0.065, 1.59), { d: 0.003, lp: 5000 }, v * K.llam);
      hit(b, t, pan, v * 0.75, 2400, 1, 0.03); send(b, m, 0.14, b.verbIn);
    },
    // alegre: lead hand drum. k: 'open' | 'slap' | 'bass' (center of the head) | 'mute' (tapao)
    alegre(b, t, p) {
      const c = b.ctx, k = p.k || 'open', v = (p.vel ?? 1) * 0.7, pan = pn(c, PAN.alegre(p)); pan.connect(b.drums);
      const S = { open: [195, 0.1, 0.004, 3000, 0.3], slap: [210, 0.025, 0.002, 8000, 1], bass: [120, 0.06, 0.008, 700, 0], mute: [205, 0.02, 0.004, 1600, 0.25] }[k];
      const m = modes(b, t, pan, S[0], memb(6, S[1], k === 'bass' ? 1 : 1.59), { d: S[2], lp: S[3] }, v * K.ale * (k === 'bass' ? 0.9 : 1));
      if (S[4]) hit(b, t, pan, v * S[4], 2600, 1.1, k === 'slap' ? 0.04 : 0.02);
      send(b, m, 0.15, b.verbIn);
    },
    // shakers. k: 'maraca' (gourd) | 'maracon' (the gaita player's big maraca) | 'guache' (metal tube). acc = heavy down-stroke
    maraca(b, t, p) {
      const c = b.ctx, kind = p.k || 'maraca', v = p.vel ?? 0.5;
      const [bf, q, att, dec, hp] = { maraca: [4800, 0.9, 0.006, 0.055, 3200, -0.35], maracon: [3600, 0.9, 0.008, 0.075, 2200, 0.35], guache: [7200, 0.7, 0.014, 0.085, 4800, 0.4] }[kind];
      const pan = pn(c, PAN.maraca(p)); pan.connect(b.drums);
      const a = p.acc ? att * 0.5 : att, g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 1.2, t + a); g.gain.exponentialRampToValueAtTime(0.001, t + a + dec);
      noise(b, t, a + dec + 0.02).connect(filt(c, 'bandpass', bf, q)).connect(filt(c, 'highpass', hp)).connect(g).connect(pan);
      hit(b, t + a + 0.012, pan, v * 0.4, bf * 1.1, q, 0.025);   // seeds hitting the far wall
      if (kind === 'guache') { const s = c.createBufferSource(); s.buffer = b.r.hatC; s.playbackRate.value = 1.9; s.connect(gn(c, v * 0.22)).connect(pan); s.start(t); }
    },
    // scraper: k 'guacharaca' (ribbed cane, fork) | 'guiro' (metal). durS = length of the scrape; up = return stroke
    raspa(b, t, p) {
      const c = b.ctx, metal = p.k === 'guiro', dur = Math.max(0.03, p.durS || 0.08), v = (p.vel ?? 1) * (metal ? 0.75 : 1);
      const rate = (metal ? 95 : 64) * (p.up ? 1.25 : 1), n = Math.max(2, Math.round(dur * rate)), pan = pn(c, PAN.raspa(p));
      pan.connect(b.drums);
      const bus = c.createGain(), f1 = metal ? 5200 : 2100, f2 = metal ? 8200 : 3600;
      bus.connect(filt(c, 'bandpass', f1, metal ? 2.5 : 1.6)).connect(pan); bus.connect(filt(c, 'bandpass', f2, 3)).connect(gn(c, 0.6)).connect(pan);
      for (let j = 0; j < (LITE ? Math.min(n, 4) : n); j++) {   // a scrape is a train of clicks, one per ridge
        const tj = t + j / rate * (1 + (Math.random() - 0.5) * 0.15), g = c.createGain();
        env(g, tj, v * (j === 0 ? 1.4 : 0.6 + 0.4 * Math.sin(Math.PI * j / n)), 0.0004, metal ? 0.012 : 0.009);
        noise(b, tj, 0.02).connect(g).connect(bus);
      }
      send(b, pan, 0.08, b.verbIn);
    },
    // caja vallenata: small hand drum. k: 'open' | 'slap' | 'bajo' (low, center) | 'rim'
    caja(b, t, p) {
      const c = b.ctx, k = p.k || 'open', v = (p.vel ?? 1) * 0.7, pan = pn(c, PAN.caja(p)); pan.connect(b.drums);
      if (k === 'rim') { hit(b, t, pan, v * 0.8, 2100, 3, 0.025); modes(b, t, pan, 1, [[900, 0.006, 1], [1700, 0.004, 0.6]], { d: 0.002, lp: 9000 }, v * K.rim * 0.5); return; }
      const S = { open: [320, 0.07, 0.003, 4500, 0.35], slap: [340, 0.022, 0.002, 9000, 1], bajo: [170, 0.06, 0.008, 900, 0] }[k];
      const m = modes(b, t, pan, S[0], memb(6, S[1], k === 'bajo' ? 1 : 1.59), { d: S[2], lp: S[3] }, v * K.caja);
      if (S[4]) hit(b, t, pan, v * S[4], 2800, 1.1, k === 'slap' ? 0.035 : 0.02);
      send(b, m, 0.14, b.verbIn);
    },
    // congas. k: 'open' | 'slap' | 'mute' | 'heel' (palm, low thud) | 'tumba' (the big low drum, open)
    tumbadora(b, t, p) {
      const c = b.ctx, k = p.k || 'open', v = (p.vel ?? 1) * 0.7, pan = pn(c, PAN.tumbadora(p)); pan.connect(b.drums);
      const S = { open: [215, 0.11, 0.004, 3200, 0.25], slap: [225, 0.02, 0.002, 8000, 1], mute: [220, 0.02, 0.004, 1500, 0.2], heel: [130, 0.035, 0.01, 500, 0], tumba: [165, 0.13, 0.005, 2600, 0.2] }[k];
      const m = modes(b, t, pan, S[0], memb(6, S[1], k === 'heel' ? 1 : 1.59), { d: S[2], lp: S[3] }, v * K.conga * (k === 'heel' ? 0.8 : 1));
      if (S[4]) hit(b, t, pan, v * S[4], 2500, 1.1, k === 'slap' ? 0.04 : 0.02);
      send(b, m, 0.15, b.verbIn);
    },
    // timbales. k: 'cascara' (stick on the metal shell) | 'hi' | 'lo' | 'rim' (rimshot on the high drum)
    timbal(b, t, p) {
      const c = b.ctx, k = p.k || 'cascara', v = (p.vel ?? 1) * 0.7, pan = pn(c, PAN.timbal(p)); pan.connect(b.drums);
      if (k === 'cascara') {
        const m = modes(b, t, pan, 1, [[1850, 0.025, 0.9], [2700, 0.02, 1], [3950, 0.014, 0.7], [5300, 0.01, 0.5], [6900, 0.007, 0.35]], { d: 0.0015, lp: 12000 }, v * K.casc);
        hit(b, t, pan, v * 0.5, 6000, 0.8, 0.008); send(b, m, 0.12, b.verbIn); return;
      }
      const f = k === 'lo' ? 330 : 440;
      const m = modes(b, t, pan, f, memb(6, 0.16, 1.59), { d: 0.002, lp: 8000 }, v * K.timb);
      modes(b, t, pan, 1, [[f * 4.1, 0.12, 0.5], [f * 6.3, 0.09, 0.35], [f * 8.9, 0.06, 0.2]], { d: 0.0015, lp: 12000 }, v * K.timb * 0.25);   // steel shell ringing
      if (k === 'rim') hit(b, t, pan, v * 1.1, 2600, 1.5, 0.02);
      send(b, m, 0.18, b.verbIn);
    },
    // cowbell. k: 'boca' (open mouth, ringy) | 'body' (closed, short). f = pitch Hz
    campana(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 1) * 0.5, pan = pn(c, PAN.campana(p)), f = p.f || 620, open = p.k === 'boca'; pan.connect(b.drums);
      const m = modes(b, t, pan, f, [[1, open ? 0.09 : 0.05, 1], [1.48, open ? 0.07 : 0.04, 0.85], [2.42, 0.035, 0.45], [3.6, 0.02, 0.25], [5.1, 0.012, 0.15]], { d: 0.001, lp: 9000 }, v * K.camp);
      hit(b, t, pan, v * 0.5, 3000, 1, 0.006); send(b, m, 0.12, b.verbIn);
    },
    // drum kit: bombo (kick), redoblante (snare, k 'rimshot' | 'ghost'), charles (hi-hat, k 'closed' | 'open'), platillo (crash)
    bombo(b, t, p) {
      const c = b.ctx, v = p.vel ?? 1;
      const o = osc(c, 'sine', 115, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.07);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.6, t + 0.002); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(b.sub); o.start(t); o.stop(t + 0.35);
      modes(b, t, b.drums, 60, memb(5, 0.05, 1.59), { d: 0.004, lp: 1800 }, v * K.skin * 0.7);
      hit(b, t, b.drums, v * 0.35, 3000, 0.8, 0.008);
    },
    redoblante(b, t, p) {
      const c = b.ctx, k = p.k || 'rimshot', v = (p.vel ?? 1) * (k === 'ghost' ? 0.35 : 1), pan = pn(c, PAN.redoblante(p)); pan.connect(b.drums);
      const g = c.createGain(); env(g, t, v * 0.9 * K.snare, 0.0008, 0.11);
      noise(b, t, 0.14).connect(filt(c, 'bandpass', 3800, 0.8)).connect(filt(c, 'highpass', 1800)).connect(g).connect(pan);
      modes(b, t, pan, 205, [[1, 0.03, 1], [1.59, 0.02, 0.8], [2.14, 0.015, 0.6], [2.65, 0.012, 0.5]], { d: 0.003, lp: 6000 }, v * 3);
      if (k === 'rimshot') hit(b, t, pan, v * 1.2, 1750, 3, 0.022);
      send(b, g, 0.15, b.verbIn);
    },
    charles(b, t, p) {
      const c = b.ctx, open = p.k === 'open', v = (p.vel ?? 0.5) * 0.9, pan = pn(c, PAN.charles(p)); pan.connect(b.drums);
      const s = c.createBufferSource(); s.buffer = open ? b.r.hatO : b.r.hatC; s.playbackRate.value = 0.82;
      const sg = c.createGain(); sg.gain.value = v * 0.6; s.connect(filt(c, 'highpass', 5000)).connect(sg).connect(pan); s.start(t);
      hit(b, t, pan, v * 0.7, 9000, 0.7, open ? 0.3 : 0.035);
    },
    platillo(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 1) * 0.35, pan = pn(c, PAN.platillo(p)); pan.connect(b.drums);
      const g = c.createGain(); env(g, t, v, 0.002, 1.5);
      noise(b, t, 1.55).connect(filt(c, 'highpass', 3200)).connect(filt(c, 'peaking', 7000, 1, 4)).connect(g).connect(pan);
      const s = c.createBufferSource(); s.buffer = b.r.hatO; s.playbackRate.value = 0.55; s.connect(gn(c, v * 0.6)).connect(pan); s.start(t);
      send(b, g, 0.3, b.verbIn);
    },
  };

  /* ---------- bass and guitar (Karplus–Strong strings through amp / body chains) ---------- */
  const LFOS = [];   // tremolo oscillators of the current session (stopped when a new session starts)
  function shared(b, key, make) { const sh = b._c4 || (b._c4 = {}); return sh[key] || (sh[key] = make()); }
  function bassChain(b, kind) {
    return shared(b, 'bass' + kind, () => {
      const c = b.ctx, a = filt(c, 'highpass', 35, 0.7), up = kind === 'upright';
      a.connect(filt(c, 'peaking', up ? 130 : 95, 1, up ? 3 : 2)).connect(filt(c, 'lowpass', up ? 900 : 1400, 0.7)).connect(b.sub);
      return a;
    });
  }
  function gChain(b, part) {
    return shared(b, 'gtr' + part, () => {
      const c = b.ctx, lead = part === 'lead', inp = c.createGain();
      const ws = c.createWaveShaper(); ws.curve = curve(b.r, lead ? C4.FUZZ : Math.max(1, C4.FUZZ * 0.7)); ws.oversample = '2x';
      const trem = c.createGain(), depth = lead ? 0 : Math.max(0, Math.min(0.8, C4.TREMOLO));
      trem.gain.value = 1 - depth / 2;
      if (depth) {
        const lfo = c.createOscillator(); lfo.frequency.value = 6.3; lfo.connect(gn(c, depth / 2)).connect(trem.gain); lfo.start();
        if (!isOff(c)) { while (LFOS.length) { try { LFOS.pop().stop(); } catch (e) {} } LFOS.push(lfo); } else lfo.stop(c.length / c.sampleRate);
      }
      const pan = panner(c, lead ? 0.12 : -0.32);
      inp.connect(gn(c, 1.4)).connect(ws).connect(filt(c, 'highpass', 110, 0.7)).connect(filt(c, 'peaking', 2300, 1, 3))
        .connect(filt(c, 'lowpass', lead ? 5200 : 4200, 0.8)).connect(gn(c, lead ? 0.9 : 0.55)).connect(trem).connect(pan).connect(b.music);
      // spring reverb "drip": short metallic delay with feedback
      const sp = c.createDelay(0.1); sp.delayTime.value = 0.037; const fb = gn(c, 0.5), bp = filt(c, 'bandpass', 1500, 1.2);
      trem.connect(gn(c, 0.25)).connect(sp).connect(bp).connect(fb).connect(sp); bp.connect(gn(c, 0.6)).connect(pan);
      send(b, trem, 0.3, b.verbIn); if (lead) send(b, trem, 0.32, b.dlyIn);
      return inp;
    });
  }
  Object.assign(VO, {
    // bass note. k: 'bass' (electric) | 'upright'. from = slide in from that MIDI note
    bajo(b, t, p) {
      const c = b.ctx, kind = p.k || 'bass', P = KS[kind], s = c.createBufferSource(); s.buffer = ksBuf(c, kind, p.m);
      if (p.from != null) { s.playbackRate.setValueAtTime(mtof(p.from) / mtof(p.m), t); s.playbackRate.exponentialRampToValueAtTime(1, t + 0.08); }
      const g = c.createGain(), v = (p.vel ?? 1) * P.gain; g.gain.setValueAtTime(v, t);
      let end = t + P.dur;
      if (p.durS) { const e = t + p.durS; g.gain.setValueAtTime(v, e); g.gain.exponentialRampToValueAtTime(0.001, e + 0.05); end = Math.min(end, e + 0.07); }
      s.connect(g).connect(bassChain(b, kind)); s.start(t); s.stop(end);
      if (kind === 'upright') hit(b, t, b.sub, (p.vel ?? 1) * 0.15, 260, 0.8, 0.03);
    },
    // electric guitar. part: 'lead' (wah, echo) | 'rhy' (tremolo). m = one note, ms = chord. mute = choked chop
    guitarra(b, t, p) {
      const c = b.ctx, part = p.part || 'lead', inp = gChain(b, part), ms = p.ms || [p.m], v = p.vel ?? 1, mute = !!p.mute, P = KS.gtr;
      const wah = part === 'lead' && C4.WAH > 0;
      ms.forEach((m, j) => {
        const tj = t + j * (p.spread ?? 0.008), s = c.createBufferSource(); s.buffer = ksBuf(c, 'gtr', m);
        if (p.from != null) { s.playbackRate.setValueAtTime(mtof(p.from) / mtof(m), tj); s.playbackRate.exponentialRampToValueAtTime(1, tj + (p.glideS || 0.07)); }
        const g = c.createGain(), a = v * P.gain * (mute ? 0.7 : 1) * (j ? 0.85 : 1); g.gain.setValueAtTime(a, tj);
        let end = tj + P.dur; const d = mute ? 0.05 : p.durS;
        if (d) { g.gain.setValueAtTime(a, tj + d); g.gain.exponentialRampToValueAtTime(0.001, tj + d + (mute ? 0.02 : 0.06)); end = Math.min(end, tj + d + 0.08); }
        if (wah) {   // auto-wah: the filter opens on each pick attack, then closes
          const w = filt(c, 'bandpass', 450, 3.5), hi = 450 + 1900 * C4.WAH;
          w.frequency.setValueAtTime(450, tj); w.frequency.exponentialRampToValueAtTime(hi, tj + 0.07); w.frequency.exponentialRampToValueAtTime(800, tj + 0.4);
          s.connect(gn(c, 0.35)).connect(g); s.connect(w).connect(gn(c, 1.7)).connect(g);
        } else s.connect(g);
        g.connect(inp); s.start(tj); s.stop(end);
      });
      if (mute) hit(b, t, inp, v * 0.18, 2600, 1.5, 0.02);
    },
    // Farfisa combo organ (live oscillators: cheap). ms = notes. dly = echo send
    farfisa(b, t, p) {
      const c = b.ctx, dur = Math.max(0.06, p.durS || 0.3), v = (p.vel ?? 1) * 0.05, ms = p.ms || [p.m];
      const ch = shared(b, 'farf', () => { const a = filt(c, 'highpass', 220, 0.7), pn = panner(c, -0.18); a.connect(filt(c, 'peaking', 2400, 1, 5)).connect(filt(c, 'lowpass', 6500, 0.7)).connect(pn).connect(b.music); send(b, pn, 0.25, b.verbIn); return a; });
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.008); g.gain.setValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
      g.connect(ch); if (p.dly) send(b, g, p.dly, b.dlyIn);
      const vib = osc(c, 'sine', 6.4, t), os = [vib];
      ms.forEach((m) => { const f = mtof(m); [['square', 1, 1], ['sawtooth', 2, 0.3]].forEach(([ty, mul, a]) => {
        const o = osc(c, ty, f * mul, t); vib.connect(gn(c, f * mul * 0.006)).connect(o.frequency); o.connect(gn(c, a)).connect(g); os.push(o);
      }); });
      os.forEach((o) => { o.start(t); o.stop(t + dur + 0.06); });
    },
  });

  /* ---------- winds, reeds, voices and piano: rendered once per pitch, replayed as samples ----------
     render(c, r, out, t, f, hold, p): one note held for `hold` seconds, then its natural release */
  function vib(c, t, rate, depth, delay, targets) {   // vibrato that fades in after `delay`
    const l = osc(c, 'sine', rate, t), g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.setValueAtTime(0, t + delay * 0.5); g.gain.linearRampToValueAtTime(1, t + delay);
    l.connect(g); targets.forEach(([param, amt]) => g.connect(gn(c, amt)).connect(param)); return l;
  }
  function amp(c, t, v, att, hold, rel) { const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + att); g.gain.setValueAtTime(v, t + Math.max(att, hold)); g.gain.linearRampToValueAtTime(0, t + Math.max(att, hold) + rel); return g; }
  const RENDER = {
    // caña de millo: cane clarinet with a buzzing reed tongue; nasal and raspy
    millo(c, r, out, t, f, hold) {
      const g = amp(c, t, 0.15, 0.02, hold, 0.06), end = t + hold + 0.1;
      const o1 = osc(c, 'square', f, t), o2 = osc(c, 'sawtooth', f, t); o2.detune.value = 5;
      [o1, o2].forEach((o) => { o.frequency.setValueAtTime(f * 1.025, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.035); });
      const lf = vib(c, t, 5.6, 1, 0.3, [[o1.frequency, f * 0.009], [o2.frequency, f * 0.009]]);
      const buzz = c.createGain(); buzz.gain.value = 0.8; const fl = osc(c, 'sine', 33, t); fl.connect(gn(c, 0.22)).connect(buzz.gain);
      o1.connect(gn(c, 0.55)).connect(buzz); o2.connect(gn(c, 0.45)).connect(buzz);
      buzz.connect(filt(c, 'bandpass', 1150, 1.4)).connect(gn(c, 1.7)).connect(g);
      buzz.connect(filt(c, 'bandpass', 2700, 2.5)).connect(gn(c, 1)).connect(g);
      buzz.connect(filt(c, 'highpass', 400, 0.7)).connect(gn(c, 0.35)).connect(g);
      const br = c.createGain(); br.gain.setValueAtTime(0.09, t); br.gain.exponentialRampToValueAtTime(0.03, t + 0.08);
      nz(c, r, t, hold + 0.1).connect(filt(c, 'bandpass', f * 2, 3)).connect(br).connect(g);
      g.connect(out); [o1, o2, lf, fl].forEach((o) => { o.start(t); o.stop(end); });
    },
    // gaita: Colombian cactus duct flute, breathy and a little hoarse. k 'macho' = the rhythm gaita (shorter, airier)
    gaita(c, r, out, t, f, hold, p) {
      const macho = p.k === 'macho', g = amp(c, t, macho ? 0.15 : 0.17, macho ? 0.012 : 0.03, hold, 0.08), end = t + hold + 0.12;
      const os = [[1, 1, 'sine'], [2, 0.32, 'sine'], [3, 0.12, 'sine']].map(([h, a, ty]) => { const o = osc(c, ty, f * h, t); o.connect(gn(c, a)).connect(g); return o; });
      os.forEach((o, h) => { o.frequency.setValueAtTime(f * (h + 1) * 0.975, t); o.frequency.exponentialRampToValueAtTime(f * (h + 1), t + 0.06); });
      const lf = vib(c, t, 4.7, 1, macho ? 0.5 : 0.35, os.map((o, h) => [o.frequency, f * (h + 1) * 0.011]));
      const rasp = osc(c, 'sawtooth', f, t), am = c.createGain(); am.gain.value = 0.06; const fl = osc(c, 'sine', 27, t); fl.connect(gn(c, 0.03)).connect(am.gain);
      rasp.connect(filt(c, 'lowpass', 1900, 0.7)).connect(am).connect(g);
      const air = c.createGain(); air.gain.value = macho ? 0.32 : 0.24;
      nz(c, r, t, hold + 0.12).connect(filt(c, 'bandpass', f, 14)).connect(air).connect(g);
      nz(c, r, t, hold + 0.12).connect(filt(c, 'bandpass', 2600, 0.7)).connect(gn(c, macho ? 0.06 : 0.04)).connect(g);
      const ch = c.createGain(); env(ch, t, 0.25, 0.002, 0.035); nz(c, r, t, 0.05).connect(filt(c, 'bandpass', f * 3, 4)).connect(ch).connect(g);   // "chiff"
      g.connect(out); os.concat([lf, rasp, fl]).forEach((o) => { o.start(t); o.stop(end); });
    },
    clarinete(c, r, out, t, f, hold) {
      const g = amp(c, t, 0.12, 0.03, hold, 0.07), end = t + hold + 0.1, o = osc(c, 'square', f, t);
      o.frequency.setValueAtTime(f * 0.985, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
      const lf = vib(c, t, 5.2, 1, 0.35, [[o.frequency, f * 0.0045]]);
      const lp = filt(c, 'lowpass', 1200, 0.7); lp.frequency.setValueAtTime(1200, t); lp.frequency.linearRampToValueAtTime(2600, t + 0.05);
      o.connect(lp).connect(filt(c, 'peaking', 1400, 1, 3)).connect(g);
      nz(c, r, t, hold + 0.1).connect(filt(c, 'bandpass', f * 2, 4)).connect(gn(c, 0.08)).connect(g);
      g.connect(out); [o, lf].forEach((x) => { x.start(t); x.stop(end); });
    },
    saxo(c, r, out, t, f, hold) {
      const g = amp(c, t, 0.075, 0.045, hold, 0.08), end = t + hold + 0.12;
      const os = [-7, 7].map((dt) => { const o = osc(c, 'sawtooth', f, t); o.detune.value = dt; return o; });
      const lf = vib(c, t, 5, 1, 0.3, os.map((o) => [o.frequency, f * 0.006]));
      const lp = filt(c, 'lowpass', 900, 0.8); lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(2600, t + 0.06); lp.frequency.exponentialRampToValueAtTime(1800, t + 0.3);
      os.forEach((o) => o.connect(lp)); lp.connect(filt(c, 'peaking', 1700, 1.2, 5)).connect(filt(c, 'peaking', 500, 1, 3)).connect(g);
      nz(c, r, t, hold + 0.12).connect(filt(c, 'bandpass', 2400, 1.5)).connect(gn(c, 0.03)).connect(g);
      g.connect(out); os.concat([lf]).forEach((x) => { x.start(t); x.stop(end); });
    },
    trompeta(c, r, out, t, f, hold) {
      const g = amp(c, t, 0.08, 0.02, hold, 0.06), end = t + hold + 0.1;
      const o = osc(c, 'sawtooth', f, t), o2 = osc(c, 'square', f, t); o2.detune.value = 4;
      [o, o2].forEach((x) => { x.frequency.setValueAtTime(f * 0.98, t); x.frequency.exponentialRampToValueAtTime(f, t + 0.03); });
      const lf = vib(c, t, 5.5, 1, 0.45, [[o.frequency, f * 0.005], [o2.frequency, f * 0.005]]);
      const lp = filt(c, 'lowpass', 600, 1.2); lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(4200, t + 0.05); lp.frequency.exponentialRampToValueAtTime(2700, t + 0.25);
      o.connect(lp); o2.connect(gn(c, 0.3)).connect(lp); lp.connect(filt(c, 'peaking', 1300, 1, 3)).connect(g);
      g.connect(out); [o, o2, lf].forEach((x) => { x.start(t); x.stop(end); });
    },
    // accordion: two reeds per note tuned slightly apart (the beating is the accordion's shimmer). k 'bajos' = left hand
    acordeon(c, r, out, t, f, hold, p) {
      const bj = p.k === 'bajos', g = amp(c, t, bj ? 0.07 : 0.085, 0.018, hold, 0.05), end = t + hold + 0.08;
      const os = [-9, 9].map((dt) => { const o = osc(c, 'sawtooth', f, t); o.detune.value = dt; return o; });
      const sq = osc(c, 'square', f, t); sq.detune.value = 2; os.push(sq);
      const lp = filt(c, 'lowpass', bj ? 2200 : 3800, 0.7);
      os.forEach((o, j) => o.connect(gn(c, j === 2 ? 0.35 : 0.5)).connect(lp));
      lp.connect(filt(c, 'peaking', 1100, 1, 4)).connect(filt(c, 'highpass', bj ? 120 : 180, 0.7)).connect(g);
      nz(c, r, t, 0.06).connect(filt(c, 'bandpass', 1800, 1)).connect(gn(c, 0.04)).connect(g);   // valve "click"
      g.connect(out); os.forEach((x) => { x.start(t); x.stop(end); });
    },
    // piano: inharmonic partials, two strings per note, hammer thump. Rings freely; damped on playback
    piano(c, r, out, t, f, hold) {
      const g = c.createGain(); g.gain.value = 0.09; g.connect(out);
      const B = 0.00012 * Math.pow(f / 130, 1.2), np = LITE ? 5 : 10;
      for (let n = 1; n <= np; n++) {
        const fn = f * n * Math.sqrt(1 + B * n * n); if (fn > 9000) break;
        const a = Math.pow(n, -1.1) * Math.exp(-n * f / 4000), tau = 1.5 / (1 + n * 0.45) * Math.pow(261 / f, 0.4);
        (LITE ? [0] : [-0.6, 0.6]).forEach((dt) => { const o = osc(c, 'sine', fn, t); o.detune.value = dt; const pg = c.createGain(); env(pg, t, a * 0.5, 0.002, tau * 3); o.connect(pg).connect(g); o.start(t); o.stop(t + tau * 3 + 0.05); });
      }
      const th = c.createGain(); env(th, t, 0.4, 0.001, 0.02); nz(c, r, t, 0.04).connect(filt(c, 'lowpass', 2200, 0.7)).connect(th).connect(g);
    },
  };
  // name: [length (s), release (s), volume, pan, reverb send, echo send, fixed half-rate?]
  const SAMP = {
    millo: [1.2, 0.06, 1.3, 0.12, 0.22, 0.12], gaita: [1.6, 0.08, 1, 0.08, 0.3, 0.12], clarinete: [1.25, 0.07, 1, 0.1, 0.28, 0.1],
    saxo: [1.45, 0.08, 1, -0.2, 0.25, 0], trompeta: [0.8, 0.06, 1.6, 0.25, 0.25, 0], acordeon: [0.85, 0.05, 1.25, 0.1, 0.18, 0],
    piano: [1.1, 0.08, 1.2, -0.1, 0.18, 0],
  };

  /* ---------------- sung syllable (cantadora / coro). n = number of singers ---------------- */
  VO.canto = function (b, t, p) {
    const c = b.ctx, f = mtof(p.m), dur = Math.max(0.1, p.durS || 0.3), n = p.n || 1, v = (p.vel ?? 1) * 0.18;
    const S = { la: ['l', 'a'], le: ['l', 'e'], lo: ['l', 'o'], a: ['', 'a'], ay: ['', 'a', 'i'], e: ['', 'e'], o: ['', 'o'], ya: ['y', 'a'] }[p.syl || 'la'] || ['l', 'a'];
    const VW = { a: [760, 1180, 2750], e: [520, 1800, 2550], o: [480, 850, 2700], i: [330, 2250, 3000] }, T = VW[S[1]];
    const on = S[0] === 'l' ? [340, 1300, 0.06] : S[0] === 'y' ? [300, 2250, 0.09] : [T[0] * 0.9, T[1], 0.02];
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.035); g.gain.setValueAtTime(v * 0.9, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
    const mix = c.createGain(); mix.gain.value = 1 / Math.sqrt(n);
    const vb = osc(c, 'sine', 5.3, t), vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(dur, 0.3)); vb.connect(vg);
    const oscs = [vb];
    for (let k = 0; k < (LITE ? Math.min(n, 2) : n); k++) {
      const tk = t + k * 0.007, o = osc(c, 'sawtooth', f * 0.97, tk);
      o.frequency.setValueAtTime(f * 0.97, tk); o.frequency.exponentialRampToValueAtTime(f, tk + 0.05);
      o.detune.value = (k - (n - 1) / 2) * 11 + (Math.random() - 0.5) * 4; vg.connect(o.frequency);
      const og = c.createGain(); og.gain.setValueAtTime(0, t); og.gain.setValueAtTime(1, tk); o.connect(og).connect(mix); o.start(tk); oscs.push(o);
    }
    [[on[0], T[0], 7, 1, VW.i[0]], [on[1], T[1], 9, 0.5, VW.i[1]], [T[2], T[2], 11, 0.2, VW.i[2]]].forEach(([s0, s1, q, a, iF]) => {
      const bp = filt(c, 'bandpass', s0, q); bp.frequency.setValueAtTime(s0, t); bp.frequency.linearRampToValueAtTime(s1, t + on[2]);
      if (S[2]) { bp.frequency.setValueAtTime(s1, t + dur * 0.6); bp.frequency.linearRampToValueAtTime(iF, t + dur); }   // "ay" glides to i
      mix.connect(bp).connect(gn(c, a * 3.4)).connect(g);
    });
    g.connect(pn(c, p.pan ?? 0)).connect(b.music); send(b, g, 0.32, b.verbIn);
    vb.start(t); oscs.forEach((x) => x.stop(t + dur + 0.15));
  };

  /* ---------------- baking ----------------
     Drums: each stroke rendered once (a few random variants) and replayed. Winds/voices: once per pitch.
     Until a sound is baked (the first moment of a track), it plays live from the same code. */
  const BAKE = {   // voice: [length in seconds (or fn of params), variants, reverb send, options]
    tambora: [(p) => (p.k === 'rim' ? 0.08 : 0.45), 2, 0.1], llamador: [0.22, 3, 0.14], alegre: [0.3, 3, 0.15],
    maraca: [0.12, 4, 0], raspa: [(p) => Math.max(0.03, p.durS || 0.08) + 0.05, 3, 0.08], caja: [0.25, 3, 0.14],
    tumbadora: [0.3, 3, 0.15], timbal: [(p) => (p.k === 'cascara' ? 0.1 : 0.35), 2, 0.18], campana: [0.3, 2, 0.12], bombo: [0.35, 2, 0], redoblante: [0.2, 3, 0.15],
    charles: [(p) => (p.k === 'open' ? 0.35 : 0.1), 3, 0], platillo: [1.6, 1, 0.3],
    canto: [(p) => Math.max(0.1, p.durS || 0.3) + 0.2, 1, 0.32, { music: true, mono: true, half: true }],
  };
  const DEFV = { maraca: 0.5, charles: 0.5 };
  const SKIP = { s: 1, v: 1, vel: 1, dur: 1, glide: 1, pan: 1 };
  const CACHE = {};   // sampleRate -> key -> {bufs:[]}
  const queue = []; let baking = false;
  function bakeKey(name, p) {
    if (SAMP[name]) return name + ':' + p.m + ':' + (p.k || '');
    const o = {}; Object.keys(p).sort().forEach((k) => { if (!SKIP[k]) o[k] = typeof p[k] === 'number' ? Math.round(p[k] * 1000) / 1000 : p[k]; });
    return name + JSON.stringify(o);
  }
  async function pump() {
    if (baking) return; baking = true;
    while (queue.length) {
      const j = queue.shift();
      try {
        const sr = j.sr, len = Math.ceil(sr * j.len), oc = new OAC(j.mono ? 1 : 2, len, sr), d = oc.destination;
        if (SAMP[j.name]) RENDER[j.name](oc, j.r, d, 0, mtof(j.p.m), j.len - SAMP[j.name][1] - 0.04, j.p);
        else {
          const sub = oc.createGain(); sub.gain.value = 0.85 / 0.9; sub.connect(d);
          const dummy = oc.createGain();
          const fb = { ctx: oc, r: j.r, spb: j.spb, drums: d, sub, music: d, out: d, verbIn: dummy, dlyIn: dummy, duck: dummy };
          BAKING = true; try { VO[j.name](fb, 0, Object.assign({}, j.p, { vel: 1 }, j.mono ? { pan: 0 } : {})); } finally { BAKING = false; }
        }
        const buf = await new Promise((res, rej) => { const pr = oc.startRendering(); if (pr && pr.then) pr.then(res, rej); else oc.oncomplete = (e) => res(e.renderedBuffer); });
        j.slot.bufs.push(buf);
      } catch (e) { j.slot.fail = true; }
    }
    baking = false;
  }
  function enqueue(C, name, p, b) {
    const key = bakeKey(name, p); if (C[key]) return C[key];
    const slot = C[key] = { bufs: [] }, sr = b.ctx.sampleRate;
    if (SAMP[name]) queue.push({ name, p: { m: p.m, k: p.k }, slot, sr: Math.round(sr / 2), len: SAMP[name][0], r: b.r, mono: true });
    else {
      const [lenOf, nVar, , opt = {}] = BAKE[name], len = typeof lenOf === 'function' ? lenOf(p) : lenOf;
      for (let k = 0; k < nVar; k++) queue.push({ name, p: Object.assign({}, p), slot, sr: opt.half ? Math.round(sr / 2) : sr, len, r: b.r, spb: b.spb, mono: true });
    }
    pump(); return slot;
  }
  function outFor(b, name, pan, music, verb, dly) {   // shared pan + sends per voice and pan position
    return shared(b, 'o:' + name + ':' + pan, () => {
      const c = b.ctx, pn = panner(c, pan); pn.connect(music ? b.music : b.drums);
      if (verb) send(b, pn, verb, b.verbIn); if (dly) send(b, pn, dly, b.dlyIn);
      return pn;
    });
  }
  function bakedDrum(name) {
    const [, , verb, opt = {}] = BAKE[name];
    return (b, t, p) => {
      const c = b.ctx, C = CACHE[c.sampleRate] || (CACHE[c.sampleRate] = {});
      if (current && !isOff(c)) prewarm(b);
      const slot = OAC ? enqueue(C, name, p, b) : null;
      if (!slot || slot.fail || !slot.bufs.length) { LITE = !isOff(c); try { VO[name](b, t, p); } finally { LITE = false; } return; }
      const src = c.createBufferSource(); src.buffer = slot.bufs[Math.floor(Math.random() * slot.bufs.length)];
      const g = c.createGain(); g.gain.value = (p.vel ?? DEFV[name] ?? 1);
      const pv = PAN[name] ? PAN[name](p) : (p.pan || 0);
      src.connect(g).connect(pv == null ? (opt.music ? b.music : b.drums) : outFor(b, name, pv, opt.music, 0, 0));
      if (verb) g.connect(shared(b, 'v:' + name, () => { const x = gn(c, verb); x.connect(b.verbIn); return x; }));
      src.start(t);
    };
  }
  // sampled melodic voice. p: m, dur, vel, orn ('g' grace from above | 'gb' grace from below | 's' slide up), fall, k, pan
  function sampled(name) {
    const [len, rel, vol, pan0, verb, dly] = SAMP[name];
    return (b, t, p) => {
      const c = b.ctx, C = CACHE[c.sampleRate] || (CACHE[c.sampleRate] = {}), v = (p.vel ?? 1) * vol, durS = p.durS || 0.3;
      if (current && !isOff(c)) prewarm(b);
      const out = outFor(b, name, p.pan ?? pan0, true, verb, dly), slot = OAC ? enqueue(C, name, p, b) : null;
      const g = c.createGain(); g.connect(out);
      if (!slot || slot.fail || !slot.bufs.length) {   // not baked yet: render live
        g.gain.value = v; LITE = !isOff(c);
        try { RENDER[name](c, b.r, g, t, mtof(p.m), Math.min(durS, len - rel - 0.05), p); } finally { LITE = false; } return;
      }
      const src = c.createBufferSource(); src.buffer = slot.bufs[0];
      const pr = src.playbackRate, o = p.orn;
      if (o === 'g' || o === 'gb') { pr.setValueAtTime(Math.pow(2, (o === 'g' ? 2 : -1) / 12), t); pr.setValueAtTime(1, t + 0.045); }
      else if (o === 's') { pr.setValueAtTime(Math.pow(2, -3 / 12), t); pr.exponentialRampToValueAtTime(1, t + 0.09); }
      const e = t + Math.min(durS, len - rel - 0.05);
      g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, e); g.gain.exponentialRampToValueAtTime(0.001, e + rel);
      if (p.fall) { pr.setValueAtTime(1, e - 0.02); pr.exponentialRampToValueAtTime(0.82, e + rel + 0.1); g.gain.cancelScheduledValues(e); g.gain.setValueAtTime(v, e); g.gain.exponentialRampToValueAtTime(0.001, e + rel + 0.15); }
      src.connect(g); src.start(t); src.stop(Math.min(t + len, e + rel + 0.2));
    };
  }
  // bake a whole track up front when it starts (current level first), so live synthesis is only a brief fallback
  const MINE = { gaita: 1, orquesta: 1, cumbia: 1, sabanera: 1, chicha: 1 }, warmed = {};
  let current = null;
  function prewarm(b) {
    const sr = b.ctx.sampleRate, id = current;
    if (!id || !OAC || warmed[sr + id]) return;
    warmed[sr + id] = true;
    const C = CACHE[sr] || (CACHE[sr] = {}), L0 = CB.getLevel();
    [L0, 1, 2, 3, 4].forEach((L) => { for (let bar = 0; bar < 8; bar++) [{}, { fill: true, to: Math.min(4, L + 1) }, { enter: true }].forEach((fl) => {
      CB.pattern(id, L, bar, fl).forEach((e) => {
        const p = Object.assign({}, e); if (e.dur != null) p.durS = e.dur * b.spb;
        if (BAKE[e.v] || SAMP[e.v]) enqueue(C, e.v, p, b);
        else if (e.v === 'bajo') ksBuf(b.ctx, e.k || 'bass', e.m);
        else if (e.v === 'guitarra') (e.ms || [e.m]).forEach((m) => ksBuf(b.ctx, 'gtr', m));
      });
    }); });
  }
  const play0 = CB.play;
  CB.play = function (track, level) { current = MINE[track] ? track : null; return play0.call(CB, track, level); };
  CB.tracks4Info = () => { let n = 0, bytes = 0; Object.values(CACHE).forEach((C) => Object.values(C).forEach((sl) => sl.bufs.forEach((x) => { n++; bytes += x.length * x.numberOfChannels * 4; }))); return { baked: n, MB: +(bytes / 1048576).toFixed(1), waiting: queue.length }; };
  Object.keys(VO).forEach((k) => CB.addVoice(k, BAKE[k] ? bakedDrum(k) : VO[k]));
  Object.keys(SAMP).forEach((k) => CB.addVoice(k, sampled(k)));

  /* ------------------------------- helpers ------------------------------- */
  // cumbia lilt: the "e" and "a" 16ths sit a little late, so the shaker rolls instead of ticking
  const FEEL = [0, 0.07, 0, 0.05];
  function mk(feel) {
    const ev = [], fz = (feel ?? 1) * C4.CUMBIA_FEEL;
    const add = (s, v, p) => {
      p = Object.assign({}, p);
      let x = s;
      if (Number.isInteger(s)) x += FEEL[s % 4] * fz;
      if (C4.HUMANIZE) { x += (Math.random() * 2 - 1) * 0.02; if (p.vel != null) p.vel *= 1 + (Math.random() * 2 - 1) * 0.07; }
      ev.push(Object.assign({ s: Math.max(0, x), v }, p));
    };
    return { ev, add };
  }
  const louder = (ev, g) => { ev.forEach((e) => { e.vel = (e.vel ?? DEFV[e.v] ?? 1) * g; }); return ev; };
  const MEAS = [0, 8];
  const MIN = [0, 2, 3, 5, 7, 8, 10], HMIN = [0, 2, 3, 5, 7, 8, 11], MAJ = [0, 2, 4, 5, 7, 9, 11], MIX = [0, 2, 4, 5, 7, 9, 10];
  function dia(m, steps, tonic, sc) {   // move `steps` scale degrees within a scale
    const pc = ((m - tonic) % 12 + 12) % 12, i = sc.indexOf(pc);
    if (i < 0) return m + (steps < 0 ? -3 : 3);
    const j = i + steps, oct = Math.floor(j / 7), jj = ((j % 7) + 7) % 7;
    return m - pc + sc[jj] + oct * 12;
  }
  // melody line: [step, midi, length in steps, ornament?]
  function line(add, live, v, notes, o) {
    notes.forEach(([s, m, d, x]) => { if (live(s)) add(s, v, Object.assign({ m, dur: d * (o.leg ?? 0.92), vel: o.vel ?? 1 }, x ? { orn: x } : {}, o.k ? { k: o.k } : {}, o.pan != null ? { pan: o.pan } : {})); });
  }
  // sung line: [step, midi, length, syllable?]. opt: solo | harm (scale for a third below) | oct (octave below)
  function sing(add, live, notes, opt) {
    notes.forEach(([s, m, d, syl]) => {
      if (!live(s)) return;
      const base = { dur: d * 0.9, syl: syl || 'la' };
      if (opt.solo) { add(s, 'canto', Object.assign({ m, vel: 1.1 }, base)); return; }
      add(s, 'canto', Object.assign({ m, n: 3, vel: 1 }, base));
      if (opt.oct) add(s, 'canto', Object.assign({ m: m - 12, n: 2, vel: 0.6, pan: 0.3 }, base));
      if (opt.harm) add(s, 'canto', Object.assign({ m: dia(m, -2, opt.tonic, opt.harm(s)), n: 2, vel: 0.55, pan: -0.3 }, base));
    });
  }

  /* ---------------- traditional drum parts (cumbia de gaita / millo) ---------------- */
  function llamador(add, live, vel) { [2, 6, 10, 14].forEach((s) => live(s) && add(s, 'llamador', { vel: (s % 8 === 6 ? 1 : 0.9) * vel })); }
  // tambora: head on 1 and the pickup into 2 (1 . . a | 2); rim fills in by level (0 = heads only).
  // alt = the other common figure, head on 1 and the "and" of 2
  const RIMV = [0.5, 0.45, 0.8, 0.5, 0.95, 0.45, 0.85, 0.55];
  function tambora(add, live, rimL, alt) {
    MEAS.forEach((m, h) => {
      const heads = alt && h === 1 ? [0, 6] : [0, 3];
      heads.forEach((s) => live(m + s) && add(m + s, 'tambora', { k: 'head', vel: s === 0 ? 1 : 0.8 }));
      const rims = [[], [4, 6], [2, 4, 6, 7], [1, 2, 4, 5, 6, 7]][rimL];
      rims.forEach((s) => !heads.includes(s) && live(m + s) && add(m + s, 'tambora', { k: 'rim', vel: RIMV[s] }));
    });
  }
  // shaker 16ths, heavy down-stroke on the "and": ch-ch-KUH-ch
  function shaker(add, live, kind, vel) { for (let s = 0; s < 16; s++) { if (!live(s)) continue; const q = s % 4; add(s, 'maraca', { k: kind, acc: q === 2, vel: vel * [0.5, 0.32, 1, 0.45][q] }); } }
  const ALE = [   // alegre one-measure cells: [step, stroke, vel]
    [[0, 'bass', 0.7], [2, 'open', 0.9], [3, 'mute', 0.5], [4, 'slap', 1], [6, 'open', 0.9]],
    [[0, 'bass', 0.6], [2, 'open', 0.9], [4, 'open', 0.8], [5, 'slap', 1], [6, 'open', 0.8], [7, 'mute', 0.4]],
    [[1, 'mute', 0.4], [2, 'slap', 1], [3, 'slap', 0.7], [4, 'open', 0.9], [6, 'open', 0.9], [7, 'open', 0.6]],
    [[0, 'open', 0.8], [2, 'open', 0.9], [3, 'slap', 0.8], [5, 'slap', 1], [6, 'open', 0.8]],
    [[0, 'bass', 0.7], [2, 'open', 1], [4, 'mute', 0.5], [5, 'open', 0.8], [6, 'slap', 1], [7, 'slap', 0.6]],
  ];
  const ALE_BASE = [[0, 'bass', 0.6], [2, 'open', 0.85], [4, 'mute', 0.45], [6, 'open', 0.85]];
  const ALE_ROLL = [0, 1, 2, 3, 4, 5, 6, 7].map((s) => [s, s % 3 === 2 ? 'open' : 'slap', 0.55 + s * 0.065]);
  // solo = improvise (ALEGRE_SOLOS); otherwise steady base with an answer every other bar
  function alegre(add, live, i, solo) {
    MEAS.forEach((m, h) => {
      let cell = ALE_BASE;
      if (solo && C4.ALEGRE_SOLOS) cell = i % 8 === 7 && h === 1 ? ALE_ROLL : ALE[(i * 3 + h * 5 + (i >> 3)) % ALE.length];
      else if (solo || (h === 1 && i % 2 === 1)) cell = ALE[(i >> 1) % ALE.length];
      cell.forEach(([s, k, v]) => live(m + s) && add(m + s, 'alegre', { k, vel: v }));
    });
  }
  function redoble(add) {   // level-up fill: alegre roll + tambora rims, landing on a head
    for (let j = 0; j < 8; j++) add(8 + j, 'alegre', { k: j % 3 === 2 ? 'open' : 'slap', vel: 0.5 + j * 0.07 });
    [8, 10, 12, 13, 14].forEach((s) => add(s, 'tambora', { k: 'rim', vel: 0.8 }));
    add(15, 'tambora', { k: 'head', vel: 0.9 });
  }
  // cumbia bass: root on 1, fifth on 2, root on the "and" of 2 (pickup = octave bounce on the "a" of 1)
  function bassline(add, live, L, B, kind, pick) {
    MEAS.forEach((m, h) => {
      const [r, fi] = B[h];
      if (live(m)) add(m, 'bajo', { k: kind, m: r, dur: L === 1 ? 3.5 : 3, vel: 1 });
      if (live(m + 4)) add(m + 4, 'bajo', { k: kind, m: fi, dur: L === 1 ? 3.5 : 1.8, vel: 0.85 });
      if (L >= 2 && live(m + 6)) add(m + 6, 'bajo', { k: kind, m: r, dur: 1.8, vel: 0.8 });
      if (pick && live(m + 3)) add(m + 3, 'bajo', { k: kind, m: r + 12, dur: 0.8, vel: 0.5 });
    });
  }

  /* ===================== Track A: Magdalena Molecules (gaita, G mixolydian, menus) =====================
     Style of the gaiteros of the Colombian Caribbean coast. No chords, no bass: two flutes and drums.
     L1 gaita macho ostinato + maracón, llamador, tambora heads
     L2 + gaita hembra melody, tambora rims
     L3 + alegre, fuller rims, coro on bars 5–8
     L4 + alegre improvising, coro harmony, macho variations */
  const GA = {
    tonic: 7,
    hembra: [
      [[0, 79, 3, 'g'], [3, 81, 1], [4, 83, 2], [6, 81, 1], [7, 79, 1], [8, 77, 4], [12, 79, 4]],
      [[0, 81, 2], [2, 83, 2], [4, 86, 4, 'g'], [8, 83, 2], [10, 81, 2], [12, 79, 4]],
      [[0, 77, 2], [2, 79, 1], [3, 81, 1], [4, 79, 2], [6, 77, 2], [8, 74, 6, 'g'], [14, 76, 2]],
      [[0, 77, 2], [2, 76, 1], [3, 74, 1], [4, 72, 2], [6, 74, 2], [8, 79, 8, 'g']],
      [[0, 86, 3, 'g'], [3, 84, 1], [4, 83, 2], [6, 81, 2], [8, 83, 2], [10, 81, 1], [11, 79, 1], [12, 77, 4]],
      [[0, 79, 2], [2, 81, 2], [4, 83, 4, 'g'], [8, 81, 2], [10, 79, 2], [12, 77, 2], [14, 76, 2]],
      [[0, 74, 2], [2, 77, 2], [4, 79, 2], [6, 81, 2], [8, 83, 3], [11, 81, 1], [12, 79, 4]],
      [[0, 77, 2], [2, 76, 2], [4, 74, 4, 'g'], [8, 79, 8]],
    ],
    coro: [
      [[0, 74, 4, 'a'], [4, 71, 4, 'le'], [8, 71, 2], [10, 69, 2], [12, 65, 4, 'lo']],
      [[0, 67, 4, 'a'], [4, 71, 4, 'le'], [8, 69, 4], [12, 65, 4, 'lo']],
      [[0, 62, 4, 'a'], [4, 67, 4, 'le'], [8, 71, 4], [12, 67, 4, 'lo']],
      [[0, 65, 4, 'ay'], [4, 62, 4], [8, 67, 8, 'lo']],
    ],
    macho: [[0, 67, 2], [2, 71, 1], [3, 67, 1], [4, 67, 2], [6, 71, 2]],      // one measure; two notes, like the real one-hole gaita
    machoV: [[0, 71, 1], [1, 67, 1], [2, 71, 2], [4, 67, 2], [6, 71, 2]],
  };
  CB.addTrack({
    id: 'gaita', name: 'Magdalena Molecules', bpm: () => C4.GAITA_BPM, filter: [5000, 8000, 12000, 16000], endChord: [55, 62, 67, 71],
    bar(i, L, f) {
      const { ev, add } = mk(1), k = i % 8;
      const live = (s) => !(f.fill && s >= 8);
      if (f.enter) { add(0, 'tambora', { k: 'both', vel: 1.1 }); add(0, 'alegre', { k: 'slap', vel: 1 }); }
      llamador(add, live, L === 1 ? 0.75 : 0.9);
      tambora(add, live, L - 1, L >= 4 && k % 2 === 1);
      shaker(add, live, 'maracon', L === 1 ? 0.8 : 1);
      if (L >= 3) alegre(add, live, i, L >= 4);
      MEAS.forEach((m, h) => {
        const cell = L >= 4 && h === 1 && k % 4 === 3 ? GA.machoV : GA.macho;
        cell.forEach(([s, n, d]) => live(m + s) && add(m + s, 'gaita', { k: 'macho', m: n, dur: d * 0.75, vel: L === 1 ? 0.85 : 0.75, pan: -0.2 }));
      });
      if (L >= 2) line(add, live, 'gaita', GA.hembra[k], { vel: 1 });
      if (L >= 3 && k >= 4) sing(add, live, GA.coro[k - 4], { oct: false, harm: L >= 4 ? () => MIX : null, tonic: GA.tonic });
      if (f.fill) redoble(add);
      return louder(ev, 1.25);
    },
  });

  /* ===================== Track B: Ballroom Bonds (big-band cumbia, F major, menus) =====================
     Style of the 1950s Colombian cumbia orchestras (Lucho Bermúdez era): clarinet lead, saxes, trumpets.
     L1 upright bass, piano on the offbeats, maracas, conga
     L2 + clarinet melody, conga heel, soft bass drum
     L3 + sax section, timbal accents, piano pickups
     L4 + trumpet shouts, second clarinet in thirds, sax figures, cymbal on the phrase */
  const OQ_CH = { F6: [65, 69, 72, 74], C7: [64, 67, 70, 72], Bb6: [65, 67, 70, 74], Dm7: [62, 65, 69, 72], Gm7: [65, 67, 70, 74] };
  const OQ_B = { F6: [41, 36], C7: [36, 43], Bb6: [34, 41], Dm7: [38, 45], Gm7: [43, 38] };
  const OQ = {
    tonic: 5,
    ch: [['F6', 'F6'], ['F6', 'C7'], ['C7', 'C7'], ['C7', 'F6'], ['Bb6', 'Bb6'], ['F6', 'Dm7'], ['Gm7', 'C7'], ['F6', 'C7']],
    mel: [
      [[2, 72, 1], [3, 74, 1], [4, 77, 2], [6, 81, 2], [8, 79, 2], [10, 77, 1], [11, 76, 1], [12, 77, 4]],
      [[2, 72, 1], [3, 74, 1], [4, 77, 2], [6, 81, 2], [8, 82, 3], [11, 81, 1], [12, 79, 4]],
      [[2, 79, 1], [3, 81, 1], [4, 82, 2], [6, 79, 2], [8, 76, 2], [10, 79, 1], [11, 82, 1], [12, 81, 2], [14, 79, 2]],
      [[0, 76, 2], [2, 72, 2], [4, 70, 2], [6, 72, 2], [8, 77, 6]],
      [[2, 74, 1], [3, 77, 1], [4, 82, 2], [6, 86, 2], [8, 84, 2], [10, 82, 1], [11, 81, 1], [12, 82, 4]],
      [[2, 77, 1], [3, 79, 1], [4, 81, 2], [6, 84, 2], [8, 81, 2], [10, 77, 1], [11, 74, 1], [12, 77, 4]],
      [[0, 79, 2], [2, 82, 2], [4, 79, 2], [6, 74, 2], [8, 76, 2], [10, 79, 2], [12, 82, 2], [14, 79, 2]],
      [[0, 77, 6], [8, 76, 2], [10, 72, 2], [12, 74, 2], [14, 76, 2]],
    ],
  };
  CB.addTrack({
    id: 'orquesta', name: 'Ballroom Bonds', bpm: () => C4.ORQUESTA_BPM, filter: [5000, 8000, 12000, 16000], endChord: [53, 65, 69, 72, 74],
    bar(i, L, f) {
      const { ev, add } = mk(0.8), k = i % 8;
      const live = (s) => !(f.fill && s >= 8);
      const chAt = (h) => OQ.ch[k][h];
      if (f.enter) { add(0, 'platillo', { vel: 0.8 }); add(0, 'timbal', { k: 'rim', vel: 1 }); OQ_CH[chAt(0)].forEach((m) => add(0, 'saxo', { m: m - 12, dur: 3, vel: 0.9 })); }
      shaker(add, live, 'maraca', L === 1 ? 0.8 : 1);
      MEAS.forEach((m) => {
        [2, 6].forEach((s) => live(m + s) && add(m + s, 'tumbadora', { k: s === 6 ? 'open' : 'slap', vel: s === 6 ? 0.9 : 0.6 }));
        if (L >= 2) [0, 4].forEach((s) => live(m + s) && add(m + s, 'tumbadora', { k: 'heel', vel: 0.55 }));
        if (L >= 2) [0, 3].forEach((s) => live(m + s) && add(m + s, 'bombo', { vel: s ? 0.4 : 0.55 }));
        if (L >= 3 && live(m + 4)) add(m + 4, 'timbal', { k: 'rim', vel: 0.55 });
      });
      bassline(add, live, L, MEAS.map((_, h) => OQ_B[chAt(h)]), 'upright', false);
      // piano: chords on the offbeats; pickup chord on the "a" of 2 from level 3
      MEAS.forEach((m, h) => {
        const ch = OQ_CH[chAt(h)];
        [2, 6].concat(L >= 3 ? [7] : []).forEach((s) => live(m + s) && ch.forEach((n) => add(m + s, 'piano', { m: n, dur: s === 7 ? 0.8 : 1.4, vel: s === 7 ? 0.55 : 0.75 })));
        if (L >= 2 && live(m)) add(m, 'piano', { m: OQ_B[chAt(h)][0] + 12, dur: 3, vel: 0.6 });
      });
      if (L >= 2) line(add, live, 'clarinete', OQ.mel[k], { vel: 1 });
      if (L >= 4) line(add, live, 'clarinete', OQ.mel[k].map(([s, m, d]) => [s, dia(m, -2, OQ.tonic, MAJ), d]), { vel: 0.6, pan: -0.15 });
      if (L >= 3) MEAS.forEach((m, h) => {   // saxes: soft swells (L3), "pa . . pa . . paaa" figures (L4)
        const ch = OQ_CH[chAt(h)].map((n) => n - 12), fig = L >= 4 ? [[0, 1.5, 0.75], [3, 1, 0.65], [6, 1.8, 0.8]] : [[0, 6.5, 0.55]];
        fig.forEach(([s, d, v]) => live(m + s) && ch.forEach((n) => add(m + s, 'saxo', { m: n, dur: d, vel: v })));
      });
      if (L >= 4 && k % 2 === 1) {   // trumpet shout at the end of every other bar
        const ch = OQ_CH[chAt(1)].slice(1).map((n) => n + 12 > 84 ? n : n + 12);
        [[10, 1, 0], [11, 1, 0], [12, 3, 1]].forEach(([s, d, fall]) => live(s) && ch.forEach((n) => add(s, 'trompeta', { m: n, dur: d, fall: !!fall, vel: 0.9 })));
      }
      if (L >= 4 && k === 0 && !f.enter) add(0, 'platillo', { vel: 0.5 });
      if (f.fill) {
        for (let j = 0; j < 8; j++) add(8 + j, 'timbal', { k: j % 2 ? 'lo' : 'hi', vel: 0.5 + j * 0.07 });
        OQ_CH[chAt(1)].forEach((n) => add(8, 'saxo', { m: n - 12, dur: 7, vel: 0.6 }));
        add(15, 'timbal', { k: 'rim', vel: 1 });
      }
      return louder(ev, 1.2);
    },
  });

  /* ===================== Track C: Rolling Reagents (classic cumbia, D minor) =====================
     Conjunto de millo (cane clarinet + drums) with a singer and coro, plus electric bass.
     L1 llamador, tambora, maracas, bass (root and fifth)
     L2 + millo melody, alegre, more tambora rims, bass on the "and" of 2
     L3 + singer's call (bars 1–4) and coro's answer (bars 5–8); millo answers the singer
     L4 + guache, alegre improvising, coro harmony, tambora variation, bass pickups */
  const CU_B = { Dm: [38, 45], A7: [33, 40], Gm: [43, 38] };
  const CU = {
    tonic: 2,
    ch: [['Dm', 'Dm'], ['A7', 'A7'], ['A7', 'A7'], ['Dm', 'Dm'], ['Gm', 'Gm'], ['Dm', 'Dm'], ['A7', 'A7'], ['Dm', 'A7']],
    millo: [
      [[2, 74, 1], [3, 77, 1], [4, 81, 3, 'g'], [7, 79, 1], [8, 77, 2], [10, 76, 1], [11, 74, 1], [12, 77, 4]],
      [[2, 76, 1], [3, 79, 1], [4, 81, 2], [6, 79, 1], [7, 77, 1], [8, 76, 3, 'g'], [11, 73, 1], [12, 76, 4]],
      [[2, 73, 1], [3, 76, 1], [4, 79, 2], [6, 77, 1], [7, 76, 1], [8, 73, 2], [10, 69, 2], [12, 71, 2], [14, 73, 2]],
      [[0, 74, 6, 'g'], [8, 77, 1], [9, 76, 1], [10, 74, 2], [12, 72, 2], [14, 74, 2]],
      [[2, 79, 1], [3, 82, 1], [4, 86, 3, 'g'], [7, 84, 1], [8, 82, 2], [10, 81, 1], [11, 79, 1], [12, 77, 4]],
      [[2, 77, 1], [3, 81, 1], [4, 84, 2], [6, 81, 1], [7, 79, 1], [8, 77, 3, 'g'], [11, 76, 1], [12, 74, 4]],
      [[2, 76, 1], [3, 77, 1], [4, 79, 2], [6, 81, 2], [8, 79, 1], [9, 77, 1], [10, 76, 2], [12, 73, 2], [14, 76, 2]],
      [[0, 74, 4, 'g'], [4, 69, 2], [6, 72, 1], [7, 74, 1], [8, 76, 2], [10, 73, 2], [12, 69, 2], [14, 73, 2]],
    ],
    call: [
      [[4, 69, 2, 'a'], [6, 69, 1], [7, 72, 1], [8, 74, 3, 'le'], [11, 72, 1], [12, 69, 3, 'lo']],
      [[4, 67, 2, 'a'], [6, 67, 1], [7, 69, 1], [8, 73, 3, 'le'], [11, 71, 1], [12, 69, 3, 'lo']],
      [[4, 76, 2, 'ay'], [6, 74, 1], [7, 73, 1], [8, 71, 2, 'le'], [10, 69, 1], [11, 67, 1], [12, 69, 3, 'lo']],
      [[0, 65, 2, 'a'], [2, 64, 1], [3, 62, 5, 'lo']],
    ],
    answer: [   // millo fills the singer's rests
      [[0, 77, 1], [1, 79, 1], [2, 81, 2]],
      [[0, 79, 1], [1, 77, 1], [2, 76, 2]],
      [[0, 81, 2], [2, 79, 2]],
      [[8, 81, 2, 'g'], [10, 79, 1], [11, 77, 1], [12, 76, 1], [13, 74, 1], [14, 73, 1], [15, 76, 1]],
    ],
    coro: [
      [[0, 70, 2, 'a'], [2, 70, 1], [3, 74, 1], [4, 79, 3, 'le'], [7, 77, 1], [8, 74, 2], [10, 72, 1], [11, 70, 1], [12, 67, 4, 'lo']],
      [[0, 69, 2, 'a'], [2, 69, 1], [3, 72, 1], [4, 77, 3, 'le'], [7, 76, 1], [8, 74, 2], [10, 72, 1], [11, 69, 1], [12, 74, 4, 'lo']],
      [[0, 73, 2, 'ay'], [2, 76, 2], [4, 79, 2], [6, 76, 2], [8, 73, 3, 'le'], [11, 71, 1], [12, 69, 4, 'lo']],
      [[0, 74, 4, 'a'], [4, 72, 2], [6, 69, 2], [8, 73, 2, 'le'], [10, 76, 2], [12, 69, 4, 'lo']],
    ],
  };
  CB.addTrack({
    id: 'cumbia', name: 'Rolling Reagents', bpm: () => C4.CUMBIA_BPM, filter: [5000, 8000, 12000, 16000], endChord: [50, 57, 62, 65, 69],
    bar(i, L, f) {
      const { ev, add } = mk(1), k = i % 8;
      const live = (s) => !(f.fill && s >= 8);
      if (f.enter) { add(0, 'tambora', { k: 'both', vel: 1.15 }); add(0, 'alegre', { k: 'slap', vel: 1 }); add(0, 'bajo', { m: CU_B[CU.ch[k][0]][0], dur: 4, vel: 1 }); }
      llamador(add, live, 1);
      tambora(add, live, Math.min(3, L), L >= 4 && k % 2 === 1);
      shaker(add, live, 'maraca', L === 1 ? 0.85 : 1);
      if (L >= 4) for (let s = 2; s < 16; s += 4) live(s) && add(s, 'maraca', { k: 'guache', acc: true, vel: 0.7 });
      if (L >= 2) alegre(add, live, i, L >= 4);
      bassline(add, live, L, CU.ch[k].map((c) => CU_B[c]), 'bass', L >= 4);
      if (L === 2) line(add, live, 'millo', CU.millo[k], { vel: 1 });
      if (L >= 3) {
        const harm = (s) => (CU.ch[k][s < 8 ? 0 : 1] === 'A7' ? HMIN : MIN);
        if (k < 4) { sing(add, live, CU.call[k], { solo: true }); line(add, live, 'millo', CU.answer[k], { vel: 0.9 }); }
        else { sing(add, live, CU.coro[k - 4], { oct: true, harm: L >= 4 ? harm : null, tonic: CU.tonic }); line(add, live, 'millo', CU.coro[k - 4].map(([s, m, d]) => [s, m + 12, d]), { vel: 0.4 }); }
      }
      if (f.fill) redoble(add);
      ev.forEach((e) => { if (e.v === 'bajo') e.vel *= 0.78; });
      return louder(ev, 1.3);
    },
  });

  /* ===================== Track D: Squeezebox Solutions (accordion cumbia, E minor) =====================
     Style of the accordion cumbias of the Colombian savanna: accordion, caja, guacharaca, electric bass.
     L1 caja, guacharaca, bass
     L2 + accordion left-hand chords on the offbeats, caja rims
     L3 + accordion melody, full guacharaca
     L4 + coro on bars 5–8, accordion runs ("adornos") at phrase ends, caja slaps */
  const SA_CH = { Em: [64, 67, 71], B7: [63, 66, 69, 71], Am: [64, 69, 72] };
  const SA_B = { Em: [40, 47], B7: [35, 42], Am: [45, 40] };
  const SA = {
    tonic: 4,
    ch: [['Em', 'Em'], ['B7', 'B7'], ['B7', 'B7'], ['Em', 'Em'], ['Em', 'Am'], ['Am', 'Em'], ['B7', 'B7'], ['Em', 'B7']],
    mel: [
      [[2, 71, 1], [3, 74, 1], [4, 76, 2], [6, 79, 2], [8, 78, 1], [9, 76, 1], [10, 74, 1], [11, 76, 1], [12, 79, 2], [14, 76, 2]],
      [[0, 75, 2], [2, 78, 2], [4, 81, 2], [6, 78, 1], [7, 75, 1], [8, 71, 2], [10, 75, 1], [11, 78, 1], [12, 81, 4]],
      [[0, 83, 2], [2, 81, 1], [3, 79, 1], [4, 78, 2], [6, 81, 2], [8, 79, 1], [9, 78, 1], [10, 76, 1], [11, 75, 1], [12, 71, 4]],
      [[0, 76, 2], [2, 79, 1], [3, 83, 1], [4, 88, 4], [8, 86, 1], [9, 84, 1], [10, 83, 1], [11, 81, 1], [12, 79, 2], [14, 78, 2]],
      [[0, 76, 3], [3, 79, 1], [4, 83, 2], [6, 79, 2], [8, 81, 3], [11, 79, 1], [12, 76, 2], [14, 72, 2]],
      [[0, 72, 2], [2, 76, 1], [3, 79, 1], [4, 81, 2], [6, 84, 2], [8, 83, 3], [11, 79, 1], [12, 76, 4]],
      [[0, 78, 2], [2, 81, 1], [3, 83, 1], [4, 87, 2], [6, 83, 2], [8, 81, 1], [9, 78, 1], [10, 75, 1], [11, 78, 1], [12, 81, 2], [14, 78, 2]],
      [[0, 76, 4], [4, 71, 2], [6, 74, 1], [7, 76, 1], [8, 75, 2], [10, 78, 2], [12, 71, 4]],
    ],
    coro: [
      [[0, 64, 2, 'ay'], [2, 67, 2], [4, 71, 4, 'le'], [8, 72, 4, 'a'], [12, 69, 4, 'lo']],
      [[0, 69, 2, 'a'], [2, 72, 2], [4, 76, 4, 'le'], [8, 71, 4, 'a'], [12, 67, 4, 'lo']],
      [[0, 66, 2, 'ay'], [2, 69, 2], [4, 71, 4, 'le'], [8, 75, 4, 'a'], [12, 71, 4, 'lo']],
      [[0, 67, 4, 'a'], [4, 66, 2], [6, 64, 2], [8, 63, 4, 'le'], [12, 66, 4, 'lo']],
    ],
  };
  function adorno(add, s0, m, sc, tonic) {   // quick accordion turn: three 16th-triplets climbing into the next note
    [-3, -2, -1].forEach((d, j) => add(s0 + j / 3, 'acordeon', { m: dia(m, d, tonic, sc), dur: 0.3, vel: 0.75 }));
  }
  CB.addTrack({
    id: 'sabanera', name: 'Squeezebox Solutions', bpm: () => C4.SABANERA_BPM, filter: [5000, 8000, 12000, 16000], endChord: [52, 59, 64, 67, 71],
    bar(i, L, f) {
      const { ev, add } = mk(1), k = i % 8, nk = (k + 1) % 8;
      const live = (s) => !(f.fill && s >= 8);
      const chAt = (h) => SA.ch[k][h];
      if (f.enter) { add(0, 'caja', { k: 'slap', vel: 1.1 }); add(0, 'raspa', { k: 'guacharaca', dur: 3, vel: 1 }); SA_CH[chAt(0)].forEach((m) => add(0, 'acordeon', { m, dur: 3, vel: 0.9 })); }
      MEAS.forEach((m, h) => {   // caja: low "bajo" where the tambora would play, open tone on every "and"
        [0, 3].forEach((s) => live(m + s) && add(m + s, 'caja', { k: 'bajo', vel: s ? 0.8 : 1 }));
        [2, 6].forEach((s) => live(m + s) && add(m + s, 'caja', { k: 'open', vel: s === 6 ? 1 : 0.85 }));
        if (L >= 2) [1, 5, 7].forEach((s) => live(m + s) && add(m + s, 'caja', { k: 'rim', vel: 0.5 }));
        if (L >= 4 && h === 1 && k % 2 === 1 && live(m + 4)) add(m + 4, 'caja', { k: 'slap', vel: 0.9 });
      });
      for (let s = 0; s < 16; s += 4) {   // guacharaca: long scrape down, then two short strokes
        if (live(s)) add(s, 'raspa', { k: 'guacharaca', dur: 1.6, vel: 0.85 });
        if (live(s + 2)) add(s + 2, 'raspa', { k: 'guacharaca', dur: 0.6, up: true, vel: 1 });
        if (L >= 3 && live(s + 3)) add(s + 3, 'raspa', { k: 'guacharaca', dur: 0.5, vel: 0.6 });
      }
      bassline(add, live, L, MEAS.map((_, h) => SA_B[chAt(h)]), 'bass', L >= 4);
      if (L >= 2) MEAS.forEach((m, h) => [2, 6].forEach((s) => live(m + s) && SA_CH[chAt(h)].forEach((n) => add(m + s, 'acordeon', { k: 'bajos', m: n - 12, dur: 1, vel: 0.85 }))));
      if (L >= 3) {
        const mel = SA.mel[k], next = SA.mel[nk][0];
        line(add, live, 'acordeon', mel, { vel: L >= 4 && k >= 4 ? 0.75 : 1 });
        if (L >= 4) {
          if (k % 2 === 1 && !f.fill && next[0] === 0) adorno(add, 15, next[1], HMIN, SA.tonic);
          mel.forEach(([s, m, d]) => d >= 3 && live(s) && add(s, 'acordeon', { m: dia(m, -2, SA.tonic, HMIN), dur: d * 0.9, vel: 0.55 }));
        }
      }
      if (L >= 4 && k >= 4) sing(add, live, SA.coro[k - 4], { oct: false, harm: (s) => (chAt(s < 8 ? 0 : 1) === 'B7' ? HMIN : MIN), tonic: SA.tonic });
      if (f.fill) {
        for (let j = 0; j < 8; j++) add(8 + j, 'caja', { k: j % 2 ? 'open' : 'slap', vel: 0.5 + j * 0.07 });
        add(8, 'raspa', { k: 'guacharaca', dur: 6, vel: 0.9 });
        const top = SA.mel[nk][0][1];
        for (let j = 0; j < 8; j++) add(8 + j, 'acordeon', { m: dia(top, j - 8, SA.tonic, HMIN), dur: 0.9, vel: 0.7 + j * 0.03 });
      }
      ev.forEach((e) => { if (e.v === 'bajo') e.vel *= 0.85; });
      return louder(ev, 1.4);
    },
  });

  /* ===================== Track E: Wah-Wah Wavelengths (Peruvian psychedelic cumbia, A minor) =====================
     Style of the 1970s Amazonian and Lima "chicha" bands: wah guitar like an Andean flute, Farfisa organ,
     walking pentatonic bass, timbales, congas and a metal güiro.
     L1 güiro (long-short-short), congas, kick, bass
     L2 + walking bass, timbal shell (cáscara), rhythm guitar chops with tremolo, Farfisa chords
     L3 + lead guitar melody (wah, echo, spring reverb), rimshots, hi-hat
     L4 + cowbell, Farfisa harmony line, tremolo-picked long notes, 16th hats, timbal fills */
  const CH = {
    Am: { r: 45, q: 'min', tri: [64, 69, 72], org: [60, 64, 69] }, G: { r: 43, q: 'maj', tri: [62, 67, 71], org: [59, 62, 67] },
    C: { r: 36, q: 'maj', tri: [64, 67, 72], org: [60, 64, 67] }, Dm: { r: 38, q: 'min', tri: [62, 65, 69], org: [62, 65, 69] },
    E7: { r: 40, q: 'dom', tri: [62, 64, 68], org: [62, 64, 68] },
  };
  const WALK = { min: [0, 7, 12, 10, 7, 3], maj: [0, 4, 7, 12, 9, 7], dom: [0, 4, 7, 10, 12, 7] }, WALK_S = [[0, 1.8], [2, 0.9], [3, 0.9], [4, 1.8], [6, 0.9], [7, 0.9]];
  const CI = {
    tonic: 9,
    ch: [['Am', 'Am'], ['G', 'G'], ['C', 'G'], ['Am', 'Am'], ['Dm', 'Dm'], ['Am', 'Am'], ['E7', 'E7'], ['Am', 'E7']],
    lead: [
      [[0, 76, 1], [1, 79, 2], [3, 76, 1], [4, 74, 1], [5, 76, 2], [7, 72, 1], [8, 69, 2], [10, 72, 1], [11, 74, 1], [12, 76, 4]],
      [[0, 74, 1], [1, 79, 2], [3, 74, 1], [4, 71, 1], [5, 74, 2], [7, 71, 1], [8, 67, 2], [10, 71, 1], [11, 74, 1], [12, 79, 4]],
      [[0, 76, 1], [1, 79, 2], [3, 84, 1], [4, 81, 1], [5, 79, 2], [7, 76, 1], [8, 74, 1], [9, 79, 2], [11, 74, 1], [12, 71, 2], [14, 74, 2]],
      [[0, 72, 1], [1, 76, 2], [3, 72, 1], [4, 69, 4, 's'], [8, 67, 1], [9, 69, 1], [10, 72, 1], [11, 74, 1], [12, 76, 2], [14, 79, 2]],
      [[0, 81, 1], [1, 77, 2], [3, 74, 1], [4, 77, 1], [5, 74, 2], [7, 72, 1], [8, 69, 2], [10, 72, 1], [11, 74, 1], [12, 77, 4]],
      [[0, 76, 1], [1, 72, 2], [3, 69, 1], [4, 72, 1], [5, 69, 2], [7, 67, 1], [8, 64, 2], [10, 67, 1], [11, 69, 1], [12, 72, 4]],
      [[0, 71, 1], [1, 74, 2], [3, 76, 1], [4, 80, 2], [6, 76, 2], [8, 74, 1], [9, 71, 2], [11, 68, 1], [12, 71, 2], [14, 74, 2]],
      [[0, 69, 4, 's'], [4, 72, 1], [5, 76, 2], [7, 72, 1], [8, 71, 1], [9, 74, 2], [11, 76, 1], [12, 80, 2], [14, 76, 2]],
    ],
  };
  CB.addTrack({
    id: 'chicha', name: 'Wah-Wah Wavelengths', bpm: () => C4.CHICHA_BPM, filter: [6000, 9000, 13000, 16000], endChord: [57, 64, 69, 72],
    bar(i, L, f) {
      const { ev, add } = mk(0.4), k = i % 8;
      const live = (s) => !(f.fill && s >= 8);
      const chAt = (h) => CH[CI.ch[k][h]];
      if (f.enter) { add(0, 'platillo', { vel: 0.9 }); add(0, 'bombo', { vel: 1 }); add(0, 'timbal', { k: 'hi', vel: 1 }); }
      for (let s = 0; s < 16; s += 4) {   // metal güiro: long scrape, short, short
        if (live(s)) add(s, 'raspa', { k: 'guiro', dur: 1.7, vel: 0.9 });
        if (live(s + 2)) add(s + 2, 'raspa', { k: 'guiro', dur: 0.5, up: true, vel: 0.8 });
        if (live(s + 3)) add(s + 3, 'raspa', { k: 'guiro', dur: 0.5, vel: 0.65 });
      }
      MEAS.forEach((m, h) => {
        [[0, 'heel', 0.6], [2, 'slap', 0.7], [4, 'mute', 0.5], [6, 'open', 0.95], [7, 'tumba', L >= 3 ? 0.8 : 0]].forEach(([s, kk, v]) => v && live(m + s) && add(m + s, 'tumbadora', { k: kk, vel: v }));
        [0, 3].forEach((s) => live(m + s) && add(m + s, 'bombo', { vel: s ? 0.6 : 0.85 }));
        if (L >= 2) [0, 2, 3, 4, 6].forEach((s) => live(m + s) && add(m + s, 'timbal', { k: 'cascara', vel: s % 4 === 0 ? 0.9 : 0.6 }));
        if (L >= 3 && live(m + 6)) add(m + 6, 'redoblante', { k: 'rimshot', vel: 0.85 });
        if (L >= 4) [0, 4].forEach((s) => live(m + s) && add(m + s, 'campana', { k: 'boca', vel: s ? 0.6 : 0.85 }));
        if (L >= 4 && k % 4 === 3 && h === 1 && !f.fill) [12, 13, 14, 15].forEach((s, j) => add(s, 'timbal', { k: j % 2 ? 'lo' : 'hi', vel: 0.6 + j * 0.1 }));
      });
      if (L >= 3) for (let s = 0; s < 16; s += (L >= 4 ? 1 : 2)) live(s) && add(s, 'charles', { k: L >= 4 && s % 8 === 6 ? 'open' : 'closed', vel: s % 4 === 2 ? 0.6 : 0.35 });
      // bass: simple at L1, walking pentatonic arpeggios from L2
      MEAS.forEach((m, h) => {
        const c = chAt(h);
        if (L === 1) [[0, c.r, 3.5], [4, c.r + 7, 1.8], [6, c.r, 1.8]].forEach(([s, n, d]) => live(m + s) && add(m + s, 'bajo', { m: n, dur: d, vel: 1 }));
        else WALK_S.forEach(([s, d], j) => live(m + s) && add(m + s, 'bajo', { m: c.r + WALK[c.q][j], dur: d, vel: j === 0 ? 1 : 0.8 }));
      });
      if (L >= 2) MEAS.forEach((m, h) => {
        [2, 6].forEach((s) => live(m + s) && add(m + s, 'guitarra', { part: 'rhy', ms: chAt(h).tri, mute: s === 2, dur: 1.2, vel: s === 2 ? 0.8 : 0.9 }));
        if (L <= 3 && live(m)) add(m, 'farfisa', { ms: chAt(h).org, dur: 7.6, vel: 0.8 });
      });
      if (L >= 3) {
        CI.lead[k].forEach(([s, m, d, x]) => {
          if (!live(s)) return;
          if (L >= 4 && d >= 4) for (let j = 0; j < d * 2; j++) add(s + j / 2, 'guitarra', { part: 'lead', m, dur: 0.4, vel: j ? 0.55 + 0.25 * (j % 2) : 1 });   // tremolo picking
          else add(s, 'guitarra', Object.assign({ part: 'lead', m, dur: d * 0.95, vel: 1 }, x === 's' ? { from: m - 3, glide: 0.8 } : {}));
          if (L >= 4) add(s, 'farfisa', { m: dia(m, -2, CI.tonic, CI.ch[k][s < 8 ? 0 : 1] === 'E7' ? HMIN : MIN), dur: d * 0.9, vel: 0.9, dly: 0.15 });
        });
      }
      if (f.fill) {
        for (let j = 0; j < 8; j++) add(8 + j, 'timbal', { k: j % 2 ? 'lo' : 'hi', vel: 0.5 + j * 0.07 });
        [14, 14.5, 15, 15.5].forEach((s, j) => add(s, 'redoblante', { k: 'rimshot', vel: 0.6 + j * 0.13 }));
        if (L >= 2) add(8, 'guitarra', { part: 'lead', m: 81, from: 69, glide: 6, dur: 7, vel: 0.9 });
      }
      return louder(ev, 1.15);
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
