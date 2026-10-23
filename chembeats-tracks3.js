/* Copyright (c) 2026 Matthew Gibson, Mission High School. CC BY-NC-SA 4.0: https://creativecommons.org/licenses/by-nc-sa/4.0/ Not for resale. */
/* =====================================================================
   ChemBeats Tracks 3 — samba and pagode add-on for chembeats-v1.js (needs v1.1+).
   Load AFTER the engine (tracks2 is NOT required):
     <script src="chembeats-v1.js"></script>
     <script src="chembeats-tracks3.js"></script>

   Tracks (id → name):
     'bateria'  Bateria Blast       full parade bateria, percussion only (samba-enredo / batucada)
     'enredo'   Enredo Elements     bateria + cavaquinho, 7-string guitar, "lá-laiá" singers, brass
     'quintal'  Backyard Bonds      calm pagode (fundo de quintal): pandeiro, tantã, cavaquinho, banjo
     'partido'  Partido Periodic    upbeat partido alto: call-and-response singing, palmas, pandeiro slaps
     'roda'     Roda Reaction       Fundo de Quintal–style partido roda: banjo, cavaquinho, call and response
     'crush'    Covalent Crush      Fundo de Quintal–style love samba: cuíca from the start, violão, coro
   Samba is in 2/4: one ChemBeats bar (16 steps) = two 2/4 measures (1 e & a 2 e & a | 1 e & a 2 e & a).
   Same API as v1: ChemBeats.play('bateria', 1), setLevel(1–4), etc.
   All patterns are original arrangements of traditional samba rhythms.
   Drum strokes and sung notes are synthesized once when a track starts (≈0.3 s, ≈4–5 MB per track),
   then replayed as samples, so these tracks cost about the same processing power as the v1 tracks.

   Version: Oct 22, 2026, v1.2
   v1.2: adds Roda Reaction and Covalent Crush.
   v1.1: drums rebuilt from noise-excited membrane modes (no sine "keyboard" tones), clean surdos
         by default (headphones), agogô −6 dB, Enredo melody from level 2, cuíca from level 3.
   ===================================================================== */

// ========================= CONFIG (safe to edit) =========================
const CHEMBEATS_TRACKS3_CONFIG = {
  BATERIA_BPM: 142,       // parade samba tempo (normal range 135–150)
  ENREDO_BPM: 138,        // samba-enredo with band (130–145)
  QUINTAL_BPM: 98,        // calm pagode, for menus/study screens (90–105)
  PARTIDO_BPM: 110,       // upbeat partido alto (105–115)
  RODA_BPM: 106,          // Roda Reaction, Fundo de Quintal–style partido (100–112)
  CRUSH_BPM: 96,          // Covalent Crush, romantic pagode (88–100)
  SAMBA_FEEL: 1,          // samba's uneven 16ths: 0 = robot-straight, 1 = typical, 1.5 = heavy
  HUMANIZE: true,         // tiny random timing/volume changes, like real players
  APITO: true,            // the leader's whistle on level-ups (false = no whistle)
  APITO_VOLUME: 0.5,      // whistle loudness, 0–1 (it's piercing on laptop speakers)
  CUICA: true,            // the squeaky, voice-like cuíca drum (false = leave it out)
  CUICA_LEVEL: 3,         // Bateria Blast: level where the cuíca comes in (Enredo always adds it at 4)
  ENREDO_MELODY_LEVEL: 2, // Enredo Elements: level where the "lá-laiá" melody starts (harmony +1 level, full choir + brass at 4)
  PARADINHA: true,        // Bateria level 4: a short unison "break" every 8 bars
  SURDO_GRIT: false,      // true = distort the bass drums so they're heard on laptop speakers (off = clean, for headphones)
};
// =========================================================================

(function (global) {
  'use strict';
  const CB = global.ChemBeats;
  if (!CB || !CB.addVoice) { console.warn('chembeats-tracks3: load chembeats-v1.js (v1.1 or newer) first'); return; }
  const C3 = CHEMBEATS_TRACKS3_CONFIG;
  const { mtof, osc, gn, noise, send, curve } = CB.lib;
  const RES3 = new WeakMap();
  const res3 = (c) => { let r = RES3.get(c); if (!r) { r = { ks: {} }; RES3.set(c, r); } return r; };
  const env = (g, t, v, a, d) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.001, t + a + d); };
  const filt = (c, type, f, q, db) => { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q != null) x.Q.value = q; if (db != null) x.gain.value = db; return x; };
  const panner = (c, p) => { const x = c.createStereoPanner(); x.pan.value = p || 0; return x; };

  /* ---------------- plucked strings (Karplus–Strong, rendered once per note) ----------------
     cav = cavaquinho (steel, bright), banjo (pagode banjo: short and twangy), violao = 7-string nylon guitar */
  const KS = {
    cav:    { T60: 1.3, dur: 1.7, exLP: 0.45, pick: 0.17, taps3: false, gain: 0.32, verb: 0.18 },
    banjo:  { T60: 0.5, dur: 0.9, exLP: 0.15, pick: 0.11, taps3: false, gain: 0.36, verb: 0.12 },
    violao: { T60: 2.4, dur: 2.4, exLP: 0.82, pick: 0.27, taps3: true,  gain: 0.5, verb: 0.12 },
  };
  function ksBuf(c, inst, m) {
    const R = res3(c), key = inst + ':' + m;
    if (R.ks[key]) return R.ks[key];
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
    const fade = Math.floor(sr * 0.03);
    for (let i = 0; i < n; i++) y[i] = (y[i] / peak) * 0.9 * (i > n - fade ? (n - i) / fade : 1);
    const b = c.createBuffer(1, n, sr); b.getChannelData(0).set(y);
    return (R.ks[key] = b);
  }
  // body resonance per instrument; returns [input, output]
  function body(c, inst) {
    let a, z;
    if (inst === 'violao') { a = filt(c, 'peaking', 105, 1.2, 5); z = filt(c, 'lowpass', 3800, 0.7); a.connect(filt(c, 'peaking', 230, 1.5, 3)).connect(z); }
    else if (inst === 'banjo') { a = filt(c, 'highpass', 300, 0.7); z = filt(c, 'peaking', 3600, 2, 4); a.connect(filt(c, 'peaking', 1800, 2, 6)).connect(z); }
    else { a = filt(c, 'highpass', 190, 0.7); z = filt(c, 'peaking', 2600, 1, 4); a.connect(z); }
    return [a, z];
  }
  // one body + pan chain per instrument per music session, shared by every note
  function chain(b, inst, pan, dest) {
    const sh = b._t3c || (b._t3c = {}), key = inst + pan;
    if (sh[key]) return sh[key];
    const c = b.ctx, [a, z] = body(c, inst), pn = panner(c, pan);
    z.connect(pn).connect(dest); send(b, pn, KS[inst].verb, b.verbIn);
    return (sh[key] = a);
  }
  function pluckInto(b, t, inst, m, vel, durS, dest) {
    const c = b.ctx, P = KS[inst], s = c.createBufferSource(); s.buffer = ksBuf(c, inst, m);
    const g = c.createGain(), v = vel * P.gain; g.gain.setValueAtTime(v, t);
    let end = t + P.dur;
    if (durS) { const e = t + durS; g.gain.setValueAtTime(v, e); g.gain.exponentialRampToValueAtTime(0.001, e + 0.05); end = Math.min(end, e + 0.07); }
    s.connect(g).connect(dest); s.start(t); s.stop(end);
  }

  /* ------------------------------- voices ------------------------------- */
  // circular-membrane mode ratios (relative to the fundamental) with relative strengths
  const MEMB = [[1.59, 1], [2.14, 0.8], [2.30, 0.6], [2.65, 0.5], [2.92, 0.4], [3.16, 0.35], [3.50, 0.3], [4.06, 0.25], [4.60, 0.2]];
  // noise-excited resonators: a drum's ring comes from its modes, not from a clean sine (which sounds like a keyboard)
  function modes(b, t, dest, f0, list, exc, vol) {
    const c = b.ctx, e = c.createGain(); env(e, t, 1, 0.0005, exc.d);
    noise(b, t, exc.d + 0.02).connect(filt(c, 'lowpass', exc.lp || 8000, 0.7)).connect(e);
    const out = c.createGain(); out.gain.value = vol; out.connect(dest);
    (LITE ? list.slice(0, 3) : list).forEach(([r, tau, a]) => { const fr = f0 * r, Q = Math.max(0.7, Math.PI * fr * tau); e.connect(filt(c, 'bandpass', fr, Q)).connect(gn(c, a * Math.sqrt(Q))).connect(out); });
    return out;
  }
  let LITE = false;   // true while a not-yet-baked stroke plays live: fewer resonators, so startup stays smooth
  const K = { boom: 1.2, skin: 3.4, thud: 1.5, caixa: 1.5, rep: 15, tam: 10, agogo: 0.36, shell: 4, pand: 16, rm: 13 };   // level trims (set by measurement)
  const SURDO_F = [0, 55, 68, 90];   // 1 = primeira (lowest), 2 = segunda, 3 = terceira (cutting)
  const VO = {
    // big bass drum (felt mallet). n: 1 | 2 | 3. mute: hand on the head. Clean "boom" + noise-excited skin modes
    surdo(b, t, p) {
      const c = b.ctx, n = p.n || 1, f = SURDO_F[n] * (p.tune || 1), v = p.vel ?? 1, mute = !!p.mute, dec = mute ? 0.15 : [0, 1.1, 0.85, 0.6][n];
      const o = osc(c, 'sine', f * 1.7, t); o.frequency.exponentialRampToValueAtTime(f * 1.05, t + 0.05); o.frequency.exponentialRampToValueAtTime(f, t + dec * 0.6);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.6 * K.boom, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + dec);
      if (C3.SURDO_GRIT) { const sh = c.createWaveShaper(); sh.curve = curve(b.r, 2.4); o.connect(sh).connect(g); } else o.connect(g);
      g.connect(b.sub); o.start(t); o.stop(t + dec + 0.05);
      const tau = mute ? 0.03 : [0, 0.22, 0.18, 0.13][n];
      const sk = modes(b, t, b.drums, f, MEMB.map(([r, a], j) => [r, tau / (1 + j * 0.25), a]), { d: 0.012, lp: 1400 }, v * K.skin * (mute ? 0.7 : 1));
      const th = c.createGain(); env(th, t, v * 0.5 * K.thud, 0.001, 0.035); noise(b, t, 0.05).connect(filt(c, 'lowpass', mute ? 900 : 500, 0.7)).connect(th).connect(b.drums);
      send(b, sk, 0.12, b.verbIn);
    },
    // snare (caixa): crisp 16ths. snare wires (noise) + wooden-shell body modes
    caixa(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 0.6) * 1.6, dec = p.dec || 0.075, pan = panner(c, -0.12);
      const g = c.createGain(); env(g, t, v, 0.001, dec);
      noise(b, t, dec + 0.03).connect(filt(c, 'bandpass', 3400, 0.8)).connect(filt(c, 'highpass', 1700)).connect(g).connect(pan).connect(b.drums);
      modes(b, t, pan, 210, [[1, 0.025, 1], [1.59, 0.02, 0.8], [2.14, 0.015, 0.6], [2.65, 0.012, 0.5]], { d: 0.004, lp: 5000 }, v * K.caixa);
      send(b, g, 0.1, b.verbIn);
    },
    // repinique: high lead drum. k: 'open' (stick) | 'hand' (soft left hand) | 'rim'
    repique(b, t, p) {
      const c = b.ctx, k = p.k || 'open', v = (p.vel ?? 1) * 0.65, pan = panner(c, 0.28);
      if (k === 'rim') {
        const g = c.createGain(); env(g, t, v * 0.9, 0.0005, 0.03); noise(b, t, 0.04).connect(filt(c, 'bandpass', 2300, 3)).connect(g).connect(pan).connect(b.drums);
        modes(b, t, pan, 950, [[1, 0.012, 1], [1.7, 0.008, 0.6]], { d: 0.002, lp: 9000 }, v * K.rep * 0.4);
        return;
      }
      const hand = k === 'hand', ta = hand ? 0.03 : 0.09;
      const m = modes(b, t, pan, hand ? 500 : 530, MEMB.slice(0, 6).map(([r, a], j) => [r === 1.59 ? 1 : r / 1.59, ta / (1 + j * 0.3), a]), { d: hand ? 0.008 : 0.003, lp: hand ? 1500 : 7000 }, v * K.rep * (hand ? 0.5 : 1));
      pan.connect(b.drums);
      const ng = c.createGain(); env(ng, t, v * (hand ? 0.2 : 0.7), 0.0005, 0.02);
      noise(b, t, 0.03).connect(filt(c, 'bandpass', 3000, 1.2)).connect(ng).connect(pan);
      send(b, m, 0.15, b.verbIn);
    },
    // tamborim: tiny frame drum hit with a plastic beater. flip: soft "turned" stroke in carreteiro
    tamborim(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 1) * 0.75 * (p.flip ? 0.42 : 1), pan = panner(c, 0.38); pan.connect(b.drums);
      const m = modes(b, t, pan, 1050, [[1, p.flip ? 0.012 : 0.03, 1], [1.59, 0.018, 0.6], [2.14, 0.012, 0.45], [2.65, 0.009, 0.3]], { d: 0.002, lp: p.flip ? 2500 : 9000 }, v * K.tam);
      const ng = c.createGain(); env(ng, t, v * 1.1, 0.0005, 0.018);
      noise(b, t, 0.03).connect(filt(c, 'bandpass', p.flip ? 2500 : 4200, 1.1)).connect(ng).connect(pan);
      send(b, m, 0.12, b.verbIn);
    },
    // chocalho (rows of metal jingles) / ganzá (tube shaker): 16th motor
    chocalho(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 0.5) * 0.9, pan = panner(c, p.pan ?? -0.35), g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
      noise(b, t, 0.08).connect(filt(c, 'highpass', 6500)).connect(filt(c, 'peaking', 9000, 1.5, 5)).connect(g).connect(pan).connect(b.drums);
      const s = c.createBufferSource(); s.buffer = b.r.hatC; s.playbackRate.value = 1.6;
      s.connect(gn(c, v * 0.35)).connect(pan); s.start(t);
    },
    ganza(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 0.5) * 1.2, pan = panner(c, p.pan ?? -0.3), g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + (p.acc ? 0.008 : 0.018)); g.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
      noise(b, t, 0.09).connect(filt(c, 'bandpass', 5200, 0.9)).connect(filt(c, 'highpass', 3500)).connect(g).connect(pan).connect(b.drums);
    },
    // agogô: two bells. hi: true = high bell. f = low bell pitch in Hz
    agogo(b, t, p) {
      const c = b.ctx, f = (p.f || 740) * (p.hi ? 1.335 : 1), v = (p.vel ?? 1) * 0.16 * K.agogo, pan = panner(c, 0.15);
      [[1, 1, 0.4], [1.004, 0.5, 0.4], [2.43, 0.4, 0.16], [3.95, 0.15, 0.08], [5.4, 0.08, 0.05]].forEach(([r, a, d]) => {
        const o = osc(c, 'sine', f * r, t), g = c.createGain(); env(g, t, v * a, 0.0008, d);
        o.connect(g).connect(pan).connect(b.drums); o.start(t); o.stop(t + d + 0.03);
      });
      const ng = c.createGain(); env(ng, t, v * 1.2, 0.0005, 0.008); noise(b, t, 0.02).connect(filt(c, 'bandpass', 4500, 1.5)).connect(ng).connect(pan);
      send(b, pan, 0.18, b.verbIn);
    },
    // cuíca: friction drum "voice". sh: 'up' | 'dn' | 'hi' | 'lo'; f = center pitch Hz
    cuica(b, t, p) {
      if (!C3.CUICA) return;
      const c = b.ctx, f = p.f || 640, dur = p.durS || 0.13, v = (p.vel ?? 1) * 0.16, sh = p.sh || 'up';
      const [f0, f1] = { up: [0.62, 1.05], dn: [1.05, 0.6], hi: [0.92, 1.08], lo: [0.55, 0.62] }[sh];
      const o = osc(c, 'sawtooth', f * f0, t), o2 = osc(c, 'triangle', f * f0, t);
      [o, o2].forEach((x) => { x.frequency.setValueAtTime(f * f0, t); x.frequency.exponentialRampToValueAtTime(f * f1, t + dur * 0.7); });
      const wob = osc(c, 'sine', 19, t); wob.connect(gn(c, f * 0.015)).connect(o.frequency);
      const bp = filt(c, 'bandpass', f * 1.1, 2.2), lp = filt(c, 'lowpass', 3200, 0.7);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.012); g.gain.setValueAtTime(v * 0.85, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.04);
      o.connect(bp); o2.connect(gn(c, 0.8)).connect(bp); bp.connect(lp).connect(g).connect(panner(c, -0.2)).connect(b.drums);
      send(b, g, 0.2, b.verbIn);
      [o, o2, wob].forEach((x) => { x.start(t); x.stop(t + dur + 0.06); });
    },
    // apito: the leader's pea whistle (trilled)
    apito(b, t, p) {
      if (!C3.APITO) return;
      const c = b.ctx, dur = Math.max(0.06, p.durS || 0.12), v = (p.vel ?? 1) * 0.1 * C3.APITO_VOLUME, f = p.f || 2850;
      const o = osc(c, 'sine', f, t), tr = osc(c, 'sine', 31, t);
      tr.connect(gn(c, 130)).connect(o.frequency);
      const am = c.createGain(); am.gain.value = 0.7; tr.connect(gn(c, 0.3)).connect(am.gain);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.015); g.gain.setValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
      const ng = c.createGain(); ng.gain.value = 0.25; noise(b, t, dur + 0.05).connect(filt(c, 'bandpass', f, 4)).connect(ng).connect(g);
      o.connect(am).connect(g).connect(b.drums); send(b, g, 0.25, b.verbIn);
      [o, tr].forEach((x) => { x.start(t); x.stop(t + dur + 0.05); });
    },
    // tantã / surdo de mão (pagode hand bass drum). k: 'open' | 'mute' | 'shell' (slap on the wooden body)
    tanta(b, t, p) {
      const c = b.ctx, k = p.k || 'open', v = p.vel ?? 1;
      if (k === 'shell') {   // wooden "tok": very short, noise-excited body resonances (no pitched tone)
        const pan = panner(c, -0.22); pan.connect(b.drums);
        const m = modes(b, t, pan, 1, [[480, 0.006, 0.7], [1150, 0.004, 1], [1900, 0.003, 0.7], [2700, 0.0025, 0.5], [3600, 0.002, 0.35]], { d: 0.003, lp: 9000 }, v * K.shell);
        send(b, m, 0.15, b.verbIn); return;
      }
      const mute = k === 'mute', f = mute ? 96 : 82, dec = mute ? 0.12 : 0.6;
      const o = osc(c, 'sine', f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.5 * K.boom, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + dec);
      if (C3.SURDO_GRIT) { const sh = c.createWaveShaper(); sh.curve = curve(b.r, 2); o.connect(sh).connect(g); } else o.connect(g);
      g.connect(b.sub); o.start(t); o.stop(t + dec + 0.05);
      const tau = mute ? 0.025 : 0.14;
      const m = modes(b, t, b.drums, f, MEMB.map(([r, a], j) => [r, tau / (1 + j * 0.3), a]), { d: 0.01, lp: mute ? 2500 : 1600 }, v * K.skin * 0.8);
      const hg = c.createGain(); env(hg, t, v * 0.35 * K.thud, 0.001, 0.025); noise(b, t, 0.04).connect(filt(c, 'bandpass', 800, 1)).connect(hg).connect(b.drums);
      send(b, m, 0.12, b.verbIn);
    },
    // pandeiro (samba tambourine). k: 'T' thumb (low) | 'F' fingertips | 'P' palm/heel | 'S' slap
    pandeiro(b, t, p) {
      const c = b.ctx, k = p.k || 'F', v = (p.vel ?? 0.7) * 1.25, pan = panner(c, 0.2); pan.connect(b.drums);
      const jv = { T: 0.63, F: 0.56, P: 0.84, S: 0.75 }[k];
      const js = c.createBufferSource(); js.buffer = b.r.hatC; js.playbackRate.value = 1.25 + (k === 'F' ? 0.1 : 0);
      js.connect(gn(c, v * jv * 0.55)).connect(pan); js.start(t);
      const jg = c.createGain(); env(jg, t, v * jv * 0.45, 0.002, 0.06); noise(b, t, 0.08).connect(filt(c, 'bandpass', 8200, 1.5)).connect(jg).connect(pan);
      if (k === 'T') modes(b, t, pan, 150, MEMB.slice(0, 4).map(([r, a], j) => [r / 1.59, (p.open ? 0.08 : 0.045) / (1 + j * 0.4), a]), { d: 0.006, lp: 900 }, v * K.pand);
      if (k === 'P') modes(b, t, pan, 210, [[1, 0.02, 1], [1.35, 0.015, 0.6]], { d: 0.005, lp: 1200 }, v * K.pand * 0.5);
      if (k === 'S') {
        const g = c.createGain(); env(g, t, v * 1.35, 0.0005, 0.05);
        noise(b, t, 0.07).connect(filt(c, 'bandpass', 2100, 1)).connect(g).connect(pan); send(b, g, 0.15, b.verbIn);
        modes(b, t, pan, 300, [[1, 0.012, 1], [1.59, 0.01, 0.6]], { d: 0.002, lp: 6000 }, v * K.pand * 0.4);
      }
    },
    // repique de mão (pagode hand drum). k: 'open' slap | 'tone' | 'rim'
    repmao(b, t, p) {
      const c = b.ctx, k = p.k || 'open', v = (p.vel ?? 1) * 0.7, pan = panner(c, 0.32); pan.connect(b.drums);
      if (k === 'rim') { const g = c.createGain(); env(g, t, v * 0.7, 0.0005, 0.025); noise(b, t, 0.035).connect(filt(c, 'bandpass', 1900, 3.5)).connect(g).connect(pan); return; }
      const open = k === 'open';
      const m = modes(b, t, pan, 340, MEMB.slice(0, 5).map(([r, a], j) => [r / 1.59, (open ? 0.05 : 0.075) / (1 + j * 0.35), a]), { d: open ? 0.003 : 0.007, lp: open ? 6000 : 1300 }, v * K.rm);
      if (open) { const ng = c.createGain(); env(ng, t, v * 0.7, 0.0005, 0.035); noise(b, t, 0.045).connect(filt(c, 'bandpass', 2600, 1.2)).connect(ng).connect(pan); }
      send(b, m, 0.15, b.verbIn);
    },
    // palmas: a group of people clapping (each hand a few ms apart)
    palmas(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 1) * 2, n = p.n || 5;
      for (let j = 0; j < n; j++) {
        const tj = t + Math.random() * 0.014, g = c.createGain(); env(g, tj, v * (0.6 + Math.random() * 0.4), 0.001, 0.05 + Math.random() * 0.03);
        noise(b, tj, 0.1).connect(filt(c, 'bandpass', 1100 + Math.random() * 700, 1.3)).connect(g).connect(panner(c, (j / (n - 1)) * 1.2 - 0.6)).connect(b.drums);
        send(b, g, 0.3, b.verbIn);
      }
    },
    // reco-reco: scraped metal springs
    reco(b, t, p) {
      const c = b.ctx, dur = p.durS || 0.09, v = (p.vel ?? 1) * 0.9, g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.setValueAtTime(v * 0.8, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
      const gate = c.createGain(); gate.gain.value = 0.5; const lfo = osc(c, 'square', p.rate || 70, t); lfo.connect(gn(c, 0.5)).connect(gate.gain);
      noise(b, t, dur + 0.05).connect(filt(c, 'bandpass', 3800, 3)).connect(gate).connect(g).connect(panner(c, -0.4)).connect(b.drums);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    },
    // single plucked note. inst: 'cav' | 'banjo' | 'violao'
    pluck(b, t, p) {
      const inst = p.inst || 'cav';
      pluckInto(b, t, inst, p.m, p.vel ?? 1, p.durS, chain(b, inst, p.pan ?? (inst === 'violao' ? -0.1 : 0.25), inst === 'violao' ? b.sub : b.music));
    },
    // chord strum. ms = notes low→high; up = upstroke; mute = choked percussive strum
    strum(b, t, p) {
      const c = b.ctx, inst = p.inst || 'cav', ms = p.up ? p.ms.slice().reverse() : p.ms, v = p.vel ?? 1;
      const a = chain(b, inst, p.pan ?? (inst === 'banjo' ? -0.3 : 0.3), b.music), pan = a;
      const sp = p.spread ?? (p.mute ? 0.005 : 0.009), dur = p.mute ? 0.04 : p.durS;
      ms.forEach((m, j) => pluckInto(b, t + j * sp, inst, m, v * (p.mute ? 0.55 : 1) * (j === 0 ? 1 : 0.88), dur, a));
      if (p.mute) { const g = c.createGain(); env(g, t, v * 0.22, 0.001, 0.025); noise(b, t, 0.04).connect(filt(c, 'bandpass', 2600, 1.5)).connect(g).connect(pan); }
    },
    // sung syllable. syl: 'la' | 'ia' | 'a' (onset), n = number of singers (coro)
    sing(b, t, p) {
      const c = b.ctx, f = mtof(p.m), dur = Math.max(0.1, p.durS || 0.3), n = p.n || 1, v = (p.vel ?? 1) * 0.18;
      const on = { la: [340, 1300, 0.06], ia: [300, 2250, 0.09], a: [700, 1150, 0.02] }[p.syl || 'la'];
      const T = p.vow === 'e' ? [520, 1800, 2550] : p.vow === 'o' ? [480, 850, 2700] : [760, 1180, 2750];
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.035);
      g.gain.setValueAtTime(v * 0.9, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
      const mix = c.createGain(); mix.gain.value = 1 / Math.sqrt(n);
      const vib = osc(c, 'sine', 5.3, t), vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(dur, 0.3)); vib.connect(vg);
      const oscs = [vib];
      for (let k = 0; k < n; k++) {
        const tk = t + k * 0.007, o = osc(c, 'sawtooth', f * 0.97, tk);
        o.frequency.setValueAtTime(f * 0.97, tk); o.frequency.exponentialRampToValueAtTime(f, tk + 0.05);
        o.detune.value = (k - (n - 1) / 2) * 11 + (Math.random() - 0.5) * 4; vg.connect(o.frequency);
        const og = c.createGain(); og.gain.setValueAtTime(0, t); og.gain.setValueAtTime(1, tk); o.connect(og).connect(mix); o.start(tk); oscs.push(o);
      }
      [[on[0], T[0], 7, 1], [on[1], T[1], 9, 0.5], [T[2], T[2], 11, 0.2]].forEach(([s0, s1, q, a]) => {
        const bp = filt(c, 'bandpass', s0, q); bp.frequency.setValueAtTime(s0, t); bp.frequency.linearRampToValueAtTime(s1, t + on[2]);
        mix.connect(bp).connect(gn(c, a * 3.4)).connect(g);
      });
      g.connect(panner(c, p.pan ?? 0)).connect(b.music); send(b, g, 0.32, b.verbIn);
      vib.start(t); oscs.forEach((x) => x.stop(t + dur + 0.15));
    },
    // brass section stab (trumpets + trombone). fall: pitch drops off at the end
    metais(b, t, p) {
      const c = b.ctx, dur = p.durS || 0.2, v = (p.vel ?? 1) * 0.08;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.3;
      lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(3400, t + 0.04); lp.frequency.exponentialRampToValueAtTime(1500, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.setValueAtTime(v * 0.75, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + (p.fall ? 0.2 : 0.08));
      p.ms.forEach((m) => [-8, 0, 8].forEach((dt) => {
        const o = osc(c, 'sawtooth', mtof(m), t); o.detune.value = dt;
        if (p.fall) { o.frequency.setValueAtTime(mtof(m), t + dur); o.frequency.exponentialRampToValueAtTime(mtof(m) * 0.8, t + dur + 0.2); }
        o.connect(lp); o.start(t); o.stop(t + dur + 0.25);
      }));
      lp.connect(g).connect(b.music); send(b, g, 0.3, b.verbIn);
    },
  };
  /* ---------------- baking: each drum stroke is synthesized once, then replayed as a sample ----------------
     Saves most of the processing power while music plays (matters on Chromebooks and phones).
     Until a stroke is baked (the first second or so), it plays live from the same synth code, so it sounds the same. */
  const BAKE = {   // voice: [length in seconds (or fn of params), variants, reverb send]
    surdo: [(p) => (p.mute ? 0.22 : 1.05), 2, 0.1], caixa: [0.15, 3, 0.1], repique: [0.25, 2, 0.12], tamborim: [0.1, 2, 0.1],
    chocalho: [0.1, 3, 0], ganza: [0.12, 3, 0], agogo: [0.5, 1, 0.18], cuica: [(p) => (p.durS || 0.13) + 0.12, 1, 0.2],
    tanta: [(p) => (p.k === 'open' ? 0.62 : 0.2), 2, 0.1], pandeiro: [0.3, 2, 0.08], repmao: [0.2, 2, 0.12],
    palmas: [0.16, 4, 0.3], reco: [(p) => (p.durS || 0.09) + 0.06, 2, 0], apito: [(p) => Math.max(0.06, p.durS || 0.12) + 0.06, 1, 0.25],
    sing: [(p) => Math.max(0.1, p.durS || 0.3) + 0.2, 1, 0.32, { music: true, mono: true }],   // sung notes too (mono, panned on playback)
  };
  const DEFV = { caixa: 0.6, chocalho: 0.5, ganza: 0.5, pandeiro: 0.7 };
  const SKIP = { s: 1, v: 1, vel: 1, dur: 1, glide: 1, pan: 1 };
  const CACHE = {};   // sampleRate -> key -> {bufs:[], busy}
  const OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
  const queue = []; let baking = false;
  function bakeKey(name, p) {
    const o = {}; Object.keys(p).sort().forEach((k) => { if (!SKIP[k]) o[k] = typeof p[k] === 'number' ? Math.round(p[k] * 1000) / 1000 : p[k]; });
    return name + JSON.stringify(o);
  }
  async function pump() {
    if (baking) return; baking = true;
    while (queue.length) {
      const j = queue.shift();
      try {
        const sr = j.sr, len = Math.ceil(sr * j.len), oc = new OAC(j.mono ? 1 : 2, len, sr), d = oc.destination;
        const sub = oc.createGain(); sub.gain.value = 0.85 / 0.9; sub.connect(d);
        const dummy = oc.createGain();
        const fb = { ctx: oc, r: j.r, spb: j.spb, drums: d, sub, music: d, out: d, verbIn: dummy, dlyIn: dummy, duck: dummy };
        VO[j.name](fb, 0, Object.assign({}, j.p, { vel: 1 }, j.mono ? { pan: 0 } : {}));
        const buf = await new Promise((res, rej) => { const pr = oc.startRendering(); if (pr && pr.then) pr.then(res, rej); else oc.oncomplete = (e) => res(e.renderedBuffer); });
        j.slot.bufs.push(buf);
      } catch (e) { j.slot.fail = true; }
    }
    baking = false;
  }
  function bakedVoice(name) {
    const [lenOf, nVar, verb, opt = {}] = BAKE[name];
    return (b, t, p) => {
      if ((name === 'apito' && !C3.APITO) || (name === 'cuica' && !C3.CUICA)) return;
      const c = b.ctx, sr = c.sampleRate, C = CACHE[sr] || (CACHE[sr] = {}), key = bakeKey(name, p);
      if (current && !(c instanceof (OAC || Object))) prewarm(b);
      let slot = C[key];
      if (!slot && OAC) {
        slot = C[key] = { bufs: [] };
        const len = typeof lenOf === 'function' ? lenOf(p) : lenOf;
        for (let k = 0; k < nVar; k++) queue.push({ name, p: Object.assign({}, p), slot, sr, len, r: b.r, spb: b.spb, mono: !!opt.mono });
        pump();
      }
      if (!slot || slot.fail || !slot.bufs.length) {   // not baked yet: play live (lighter version on real devices)
        LITE = !(c instanceof (OAC || Object)); try { VO[name](b, t, p); } finally { LITE = false; } return;
      }
      const src = c.createBufferSource(); src.buffer = slot.bufs[Math.floor(Math.random() * slot.bufs.length)];
      const g = c.createGain(); g.gain.value = (p.vel ?? DEFV[name] ?? 1);
      let out = opt.music ? b.music : b.drums;
      if (opt.mono) { const pk = name + (p.pan || 0), sh = b._t3p || (b._t3p = {}); if (!sh[pk]) { sh[pk] = panner(c, p.pan || 0); sh[pk].connect(out); } out = sh[pk]; }
      src.connect(g).connect(out);
      if (verb) { const sh = b._t3s || (b._t3s = {}); if (!sh[name]) { sh[name] = gn(c, verb); sh[name].connect(b.verbIn); } g.connect(sh[name]); }
      src.start(t);
    };
  }
  // bake a whole track up front when it starts (current level first), so live synthesis is only a brief fallback
  const MINE = { bateria: 1, enredo: 1, quintal: 1, partido: 1, roda: 1, crush: 1 }, warmed = {};
  let current = null;
  function prewarm(b) {
    const sr = b.ctx.sampleRate, id = current;
    if (!id || !OAC || warmed[sr + id]) return;
    warmed[sr + id] = true;
    const C = CACHE[sr] || (CACHE[sr] = {}), L0 = CB.getLevel();
    [L0, 1, 2, 3, 4].forEach((L) => { for (let bar = 0; bar < 8; bar++) [{}, { fill: true, to: Math.min(4, L + 1) }, { enter: true }].forEach((fl) => {
      CB.pattern(id, L, bar, fl).forEach((e) => {
        if (!BAKE[e.v]) return;
        const p = Object.assign({}, e); if (e.dur != null) p.durS = e.dur * b.spb;
        const key = bakeKey(e.v, p); if (C[key]) return;
        const [lenOf, nVar, , opt = {}] = BAKE[e.v], slot = C[key] = { bufs: [] }, len = typeof lenOf === 'function' ? lenOf(p) : lenOf;
        for (let k = 0; k < nVar; k++) queue.push({ name: e.v, p, slot, sr, len, r: b.r, spb: b.spb, mono: !!opt.mono });
      });
    }); });
    pump();
  }
  const play0 = CB.play;
  CB.play = function (track, level) { current = MINE[track] ? track : null; return play0.call(CB, track, level); };
  CB.tracks3Info = () => { let n = 0, bytes = 0; Object.values(CACHE).forEach((C) => Object.values(C).forEach((sl) => sl.bufs.forEach((x) => { n++; bytes += x.length * x.numberOfChannels * 4; }))); return { baked: n, MB: +(bytes / 1048576).toFixed(1), waiting: queue.length }; };
  Object.keys(VO).forEach((k) => CB.addVoice(k, BAKE[k] ? bakedVoice(k) : VO[k]));

  /* ------------------------------- helpers ------------------------------- */
  // samba feel: 3rd and 4th 16ths of each beat land early, 2nd a hair late (medium-long, short, medium-short, long)
  const FEEL = [0, 0.04, -0.08, -0.12];
  function mk() {
    const ev = [];
    const raw = (s, v, p) => ev.push(Object.assign({ s, v }, p || {}));
    const add = (s, v, p) => {
      p = Object.assign({}, p);
      let x = s;
      if (Number.isInteger(s)) x += FEEL[s % 4] * C3.SAMBA_FEEL;
      if (C3.HUMANIZE) { x += (Math.random() * 2 - 1) * 0.025; if (p.vel != null) p.vel *= 1 + (Math.random() * 2 - 1) * 0.07; }
      raw(Math.max(0, x), v, p);
    };
    return { ev, add, raw };
  }
  const VDEF = { pandeiro: 0.7, caixa: 0.6, chocalho: 0.5, ganza: 0.5 };
  const louder = (ev, g) => { ev.forEach((e) => { e.vel = (e.vel ?? VDEF[e.v] ?? 1) * g; }); return ev; };   // per-track loudness match
  const TELE = [0, 2, 3, 5, 7, 9, 10, 12, 14];        // teleco-teco: the 2-measure phrase of tamborim + cavaquinho
  const PART = [0, 3, 5, 9, 11, 12, 14];              // partido-alto phrase
  const isIn = (a, s) => a.indexOf(s) >= 0;
  // diatonic step inside a major key (tonic pitch class), for coro harmony
  function dia(m, steps, tonic) {
    const sc = [0, 2, 4, 5, 7, 9, 11], pc = ((m - tonic) % 12 + 12) % 12, i = sc.indexOf(pc);
    if (i < 0) return m + (steps < 0 ? -4 : 4);
    const j = i + steps, oct = Math.floor(j / 7), jj = ((j % 7) + 7) % 7;
    return m - pc + sc[jj] + oct * 12;
  }
  // 7-string guitar run (baixaria) from note a toward b in 16ths, using the key's scale, chromatic last step
  function run(a, b, n, tonic) {
    const dir = b > a ? 1 : -1, pool = [], out = []; let m = a;
    for (let g = 0; g < 40; g++) { m = dia(m, dir, tonic); if ((b - m) * dir <= 1) break; pool.push(m); }
    for (let j = 0; j < n - 1 && pool.length; j++) out.push(pool[Math.min(pool.length - 1, Math.floor(j * pool.length / (n - 1)))]);
    out.push(b - dir);
    return out;
  }

  /* ================= bateria pieces (shared by Bateria and Enredo) ================= */
  // L = level, k = bar in the 4-bar loop, live(s) = false where a break/call silences the band
  function surdos(add, live, L, k, opt) {
    const lite = opt && opt.lite;
    [0, 8].forEach((m) => {
      if (live(m)) { add(m, 'surdo', { n: 2, vel: 0.9 }); if (!lite) add(m, 'surdo', { n: 1, mute: true, vel: 0.45 }); }
      if (live(m + 4)) { add(m + 4, 'surdo', { n: 1, vel: 1.05 }); if (!lite) add(m + 4, 'surdo', { n: 2, mute: true, vel: 0.35 }); }
    });
    if (L >= 2) {
      const T3 = L >= 4 ? [[2, 3, 4, 10, 11, 12], [2, 3, 4, 6, 7, 10, 11, 12, 14], [2, 3, 4, 10, 11, 12], [2, 3, 4, 7, 10, 12, 13, 14, 15]][k]
                        : [[2, 3, 4, 10, 11, 12], [2, 3, 4, 10, 11, 12, 15], [2, 3, 4, 10, 11, 12], [2, 3, 4, 10, 11, 13, 14]][k];
      if (!(lite && L < 3)) T3.forEach((s) => live(s) && add(s, 'surdo', { n: 3, vel: s % 4 === 0 ? 0.9 : 0.75, mute: s % 4 === 2 && L < 4 }));
    }
  }
  function caixa(add, live, L, vel) {
    for (let s = 0; s < 16; s++) if (live(s)) add(s, 'caixa', { vel: vel * [0.55, 0.35, 0.6, 1][s % 4] });
  }
  function chocalho(add, live, L, vel, step) {
    for (let s = 0; s < 16; s += step) if (live(s)) add(s, 'chocalho', { vel: vel * [0.4, 0.3, 0.75, 0.55][s % 4] });
  }
  function tamborim(add, live, L, carreteiro) {
    if (carreteiro) for (let s = 0; s < 16; s++) { if (live(s)) add(s, 'tamborim', isIn(TELE, s) ? { vel: 1 } : { vel: 1, flip: true }); }
    else TELE.forEach((s) => live(s) && add(s, 'tamborim', { vel: s % 8 === 0 ? 1 : 0.85 }));
  }
  const AGOGO = [[0, 0], [2, 1], [3, 1], [5, 0], [6, 1], [8, 0], [10, 1], [11, 0], [13, 1], [14, 0]];
  function agogo(add, live, f) { AGOGO.forEach(([s, h]) => live(s) && add(s, 'agogo', { hi: !!h, f, vel: h ? 0.9 : 1 })); }
  const REP_GROOVE = [[0, 'rim', 0.6], [1, 'hand', 0.5], [3, 'open', 1], [5, 'hand', 0.5], [6, 'open', 0.9], [8, 'rim', 0.6], [9, 'hand', 0.5], [11, 'open', 1], [13, 'hand', 0.5], [14, 'open', 0.8], [15, 'open', 0.7]];
  function repique(add, live, L, k) {
    REP_GROOVE.forEach(([s, kk, v]) => live(s) && add(s, 'repique', { k: kk, vel: v }));
    if (L >= 4 && k === 3) [12, 13].forEach((s) => live(s) && add(s, 'repique', { k: 'open', vel: 0.85 }));
  }
  const CUICA = [[[2, 'up'], [3, 'dn'], [6, 'up'], [7, 'lo'], [10, 'up'], [11, 'dn'], [13, 'hi'], [14, 'dn']],
                 [[2, 'up'], [3, 'dn'], [5, 'hi'], [6, 'hi'], [7, 'dn'], [10, 'up'], [11, 'dn'], [14, 'up', 3]]];
  function cuica(add, live, k, f) { CUICA[k % 2].forEach(([s, sh, d]) => live(s) && add(s, 'cuica', { sh, f, dur: d || 1.1, vel: 0.9 })); }
  // level-up "chamada": whistle in the first half, repinique calls in the second while everyone else stops
  function chamada(add) {
    add(0, 'apito', { dur: 0.5 }); add(2, 'apito', { dur: 0.5 }); add(4, 'apito', { dur: 3.2 });
    [[8, 1], [9, 0.6], [11, 1], [12, 0.7], [14, 1]].forEach(([s, v]) => add(s, 'repique', { k: 'open', vel: v }));
    add(15, 'surdo', { n: 3, vel: 0.7 });
  }
  function entrada(add) {   // everyone lands together on the new level
    [1, 2, 3].forEach((n) => add(0, 'surdo', { n, vel: 1.1 }));
    add(0, 'repique', { k: 'open', vel: 1 }); add(0, 'caixa', { vel: 1.3 }); add(0, 'tamborim', { vel: 1 });
  }

  /* ===================== Track A: Bateria Blast (pure percussion) =====================
     L1 surdos + chocalho · L2 + caixa + terceira · L3 + tamborim teleco-teco, agogô, repinique
     L4 + tamborim carreteiro, busier terceira, paradinha (unison break) every 8 bars. Cuíca from CUICA_LEVEL (3) */
  CB.addTrack({
    id: 'bateria', name: 'Bateria Blast', bpm: () => C3.BATERIA_BPM, filter: [16000, 16000, 16000, 16000], endChord: [],
    bar(i, L, f) {
      const { ev, add } = mk(), k = i % 4;
      const brk = L >= 4 && C3.PARADINHA && !f.fill && i % 8 === 7;
      const live = (s) => !((f.fill || brk) && s >= 8);
      if (f.enter) entrada(add);
      surdos(add, live, L, k);
      chocalho(add, live, L, L === 1 ? 1.15 : 1, 1);
      if (L >= 2) caixa(add, live, L, L === 2 ? 0.8 : 1);
      if (L >= 3) { tamborim(add, live, L, L >= 4 && k % 2 === 1); agogo(add, live, 740); repique(add, live, L, k); }
      if (L >= C3.CUICA_LEVEL) cuica(add, live, k, 620);
      if (f.fill) chamada(add);
      if (brk) {   // paradinha: whistle cue, then the whole bateria hits 3 unison accents
        add(2, 'apito', { dur: 0.6 }); add(4, 'apito', { dur: 0.6 });
        [8, 11, 14].forEach((s) => { [1, 2, 3].forEach((n) => add(s, 'surdo', { n, vel: 1 })); add(s, 'caixa', { vel: 1.2 }); add(s, 'repique', { k: 'open', vel: 1 }); add(s, 'tamborim', { vel: 1 }); add(s, 'agogo', { f: 740, hi: s === 14, vel: 1 }); });
      }
      return ev;
    },
  });

  /* ============ Track B: Enredo Elements (bateria + band, D major) ============
     2 chords per bar: D6 D6 | Bm7 F#7 | Gmaj7 A7 | D6 A7
     L1 surdos, cavaquinho on the teleco-teco, 7-string bass on 1 and 2
     L2 + caixa, chocalho, tamborim, full cavaquinho 16ths (open on the phrase, choked in between)
     L2+ "lá-laiá" melody (ENREDO_MELODY_LEVEL), harmony part one level later
     L3 + guitar runs (baixarias), terceira, agogô, repinique
     L4 + full coro (3 parts), brass, tamborim carreteiro, cuíca */
  const EN = {
    tonic: 2,
    ch: [[[62, 66, 69, 71], [62, 66, 69, 71]], [[66, 69, 71, 74], [64, 66, 70, 73]], [[62, 66, 67, 71], [64, 67, 69, 73]], [[62, 66, 69, 71], [64, 67, 69, 73]]],
    bass: [[[38, 45], [38, 45]], [[35, 42], [42, 37]], [[43, 38], [45, 40]], [[38, 45], [45, 40]]],   // [root, fifth] per measure
    mel: [
      [[2, 69, 1], [3, 71, 1], [4, 74, 3, 'ia'], [7, 74, 1], [10, 71, 1], [11, 69, 1], [12, 66, 3, 'ia'], [15, 69, 1]],
      [[2, 71, 1], [3, 74, 1], [4, 78, 3, 'ia'], [7, 76, 1], [10, 73, 1], [11, 70, 1], [12, 73, 3, 'ia'], [15, 74, 1]],
      [[2, 71, 1], [3, 74, 1], [4, 79, 3, 'ia'], [7, 78, 1], [10, 76, 1], [11, 73, 1], [12, 76, 3, 'ia'], [15, 73, 1]],
      [[2, 78, 1], [3, 76, 1], [4, 74, 2, 'ia'], [6, 71, 1], [8, 69, 2, 'a'], [10, 73, 1], [11, 76, 1], [12, 79, 2, 'ia'], [14, 76, 1]],
    ],
    brass: [[], [[14, 1, 0], [15, 2, 1]], [[6, 1, 0], [7, 1, 0]], [[14, 1, 0], [15, 2, 1]]],   // [step, len, fall?] on that measure's chord
  };
  CB.addTrack({
    id: 'enredo', name: 'Enredo Elements', bpm: () => C3.ENREDO_BPM, filter: [3600, 6000, 10000, 16000], endChord: [62, 66, 69, 71],
    bar(i, L, f) {
      const { ev, add } = mk(), k = i % 4, nk = (k + 1) % 4;
      const live = (s) => !(f.fill && s >= 8);
      const chordAt = (s) => EN.ch[k][s < 8 ? 0 : 1];
      if (f.enter) { entrada(add); add(0, 'strum', { ms: EN.ch[k][0], dur: 4, vel: 1.1 }); }
      // bateria (lighter than Bateria Blast)
      surdos(add, live, L, k, { lite: true });
      if (L >= 2) { caixa(add, live, L, 0.7); chocalho(add, live, L, 0.8, 1); }
      if (L >= 2) tamborim(add, live, L, L >= 4 && k % 2 === 1);
      if (L >= 3) { agogo(add, live, 880); repique(add, live, L, k); }
      if (L >= 4) cuica(add, live, k, 700);
      // cavaquinho
      for (let s = 0; s < 16; s++) {
        if (!live(s)) continue;
        if (isIn(TELE, s)) add(s, 'strum', { ms: chordAt(s), up: s % 2 === 1, dur: 1.4, vel: 0.95 });
        else if (L >= 2) add(s, 'strum', { ms: chordAt(s), up: s % 2 === 1, mute: true, vel: 0.7 });
      }
      // 7-string guitar: root on beat 1, fifth on beat 2; runs into the next chord at L3+
      [0, 8].forEach((m, h) => {
        const [r, fi] = EN.bass[k][h];
        if (live(m)) add(m, 'pluck', { inst: 'violao', m: r, dur: 3, vel: 1 });
        const runHere = L >= 3 && h === 1 && !f.fill && k % 2 === 1;
        if (runHere) run(fi, EN.bass[nk][0][0], 4, EN.tonic).forEach((nm, j) => add(12 + j, 'pluck', { inst: 'violao', m: nm, dur: 1, vel: 0.85 }));
        else if (live(m + 4)) add(m + 4, 'pluck', { inst: 'violao', m: fi, dur: L >= 2 ? 2.5 : 3.5, vel: 0.9 });
        if (L >= 2 && !runHere && live(m + 7)) add(m + 7, 'pluck', { inst: 'violao', m: (h ? EN.bass[nk][0][0] : EN.bass[k][1][0]) - 1, dur: 1, vel: 0.6 });   // chromatic approach
      });
      // melody (L3) → coro in 3 parts (L4)
      const ML = Math.max(1, Math.min(4, C3.ENREDO_MELODY_LEVEL));
      if (L >= ML) EN.mel[k].forEach(([s, m, d, syl]) => {
        if (!live(s)) return;
        const o = { m, dur: d * 0.92, syl: syl || 'la', vel: 0.95 };
        add(s, 'sing', o);
        if (L >= Math.min(4, ML + 1)) add(s, 'sing', Object.assign({}, o, { m: dia(m, -2, EN.tonic), n: 2, vel: 0.7, pan: -0.3 }));
        if (L >= 4) add(s, 'sing', Object.assign({}, o, { m: m - 12, n: 2, vel: 0.65, pan: 0.3 }));
      });
      if (L >= 4) EN.brass[k].forEach(([s, d, fall]) => live(s) && add(s, 'metais', { ms: chordAt(s).map((m) => m - 2 < 60 ? m + 10 : m - 2).slice(1), dur: d, fall: !!fall, vel: 1 }));
      if (f.fill) {
        chamada(add);
        add(8, 'strum', { ms: EN.ch[k][1], dur: 6, vel: 0.9 });
        if (L >= 3) [[8, 1], [11, 1], [14, 2]].forEach(([s, d]) => add(s, 'metais', { ms: EN.ch[k][1].slice(1), dur: d, vel: 0.9 }));
        run(EN.bass[k][1][0], EN.bass[nk][0][0] + 12, 6, EN.tonic).forEach((nm, j) => add(10 + j, 'pluck', { inst: 'violao', m: nm, dur: 1, vel: 0.85 }));
      }
      return ev;
    },
  });

  /* =========== pagode pieces (shared by Backyard Bonds and Partido Periodic) =========== */
  function tanta(add, live, L, k) {
    [0, 8].forEach((m) => { if (live(m)) add(m, 'tanta', { k: 'mute', vel: 0.55 }); if (live(m + 4)) add(m + 4, 'tanta', { k: 'open', vel: 1 }); });
    if (L >= 2) [2, 6, 7, 10, 14, 15].forEach((s) => live(s) && add(s, 'tanta', { k: 'shell', vel: s % 4 === 3 ? 0.6 : 0.85 }));
    if (L >= 4 && k === 3 && live(13)) add(13, 'tanta', { k: 'open', vel: 0.7 });
  }
  function pandeiro(add, live, L, slapVel) {
    for (let s = 0; s < 16; s++) {
      if (!live(s)) continue;
      const q = s % 4, beat2 = s % 8 === 4;
      if (q === 0) add(s, 'pandeiro', { k: 'T', open: beat2, vel: L === 1 ? (beat2 ? 0.75 : 0.5) : (beat2 ? 0.95 : 0.65) });
      else if (q === 2) add(s, 'pandeiro', L >= 2 && s % 8 === 6 ? { k: 'S', vel: slapVel } : { k: 'P', vel: L === 1 ? 0.45 : 0.6 });
      else add(s, 'pandeiro', { k: 'F', vel: L === 1 ? 0.3 : (q === 3 ? 0.5 : 0.38) });
    }
  }
  const RM = [[0, 'open'], [2, 'rim'], [5, 'rim'], [6, 'open'], [7, 'rim'], [8, 'open'], [10, 'rim'], [13, 'rim'], [14, 'open'], [15, 'open']];
  function repmao(add, live, L) { RM.forEach(([s, kk]) => live(s) && add(s, 'repmao', { k: kk, vel: kk === 'open' ? 0.95 : 0.7 })); if (L >= 4) [3, 11].forEach((s) => live(s) && add(s, 'repmao', { k: 'tone', vel: 0.6 })); }
  function viradaPandeiro(add) {   // pandeiro roll into the next level, tantã underneath
    for (let j = 0; j < 12; j++) add(8 + j * (8 / 12), 'pandeiro', { k: j % 3 === 0 ? 'S' : 'F', vel: 0.45 + 0.5 * j / 11 });
    [[8, 'open'], [11, 'open'], [14, 'open']].forEach(([s, kk]) => add(s, 'tanta', { k: kk, vel: 0.9 }));
    [12, 13, 14, 15].forEach((s, j) => add(s, 'repmao', { k: 'open', vel: 0.55 + j * 0.12 }));
  }

  /* ========== Track C: Backyard Bonds (calm pagode, A minor) ==========
     2 chords per bar: Am7 Am7 | Dm7 G7 | Cmaj7 Fmaj7 | Bm7♭5 E7
     L1 tantã, soft pandeiro, cavaquinho chords, guitar bass
     L2 full pandeiro (slaps), tantã shell slaps, cavaquinho on the teleco-teco
     L3 + repique de mão, banjo takes the rhythm, cavaquinho solo melody, guitar runs
     L4 + ganzá, quiet "laiá" coro */
  const QU = {
    tonic: 0,   // C major / A minor
    ch: [[[64, 67, 69, 72], [64, 67, 69, 72]], [[62, 65, 69, 72], [62, 65, 67, 71]], [[64, 67, 71, 72], [64, 65, 69, 72]], [[62, 65, 69, 71], [62, 64, 68, 71]]],
    bass: [[[45, 40], [45, 52]], [[38, 45], [43, 38]], [[36, 43], [41, 36]], [[35, 41], [40, 35]]],
    mel: [
      [[0, 76, 2], [2, 72, 1], [3, 76, 1], [4, 81, 2], [7, 79, 1], [8, 76, 2], [11, 74, 1], [12, 72, 3], [15, 71, 1]],
      [[2, 74, 1], [3, 77, 1], [4, 81, 2], [7, 79, 1], [8, 79, 2], [10, 77, 1], [11, 74, 1], [12, 71, 3], [15, 72, 1]],
      [[2, 76, 1], [3, 79, 1], [4, 83, 2], [7, 81, 1], [8, 81, 2], [10, 77, 1], [11, 76, 1], [12, 72, 3], [15, 74, 1]],
      [[2, 74, 1], [3, 77, 1], [4, 81, 2], [7, 77, 1], [8, 76, 2], [10, 74, 1], [11, 71, 1], [12, 68, 2], [14, 71, 1], [15, 72, 1]],
    ],
  };
  const QU_L1 = [0, 3, 7, 8, 11, 14];
  CB.addTrack({
    id: 'quintal', name: 'Backyard Bonds', bpm: () => C3.QUINTAL_BPM, filter: [3200, 5000, 8000, 14000], endChord: [57, 64, 67, 72],
    bar(i, L, f) {
      const { ev, add } = mk(), k = i % 4, nk = (k + 1) % 4;
      const live = (s) => !(f.fill && s >= 8);
      const chordAt = (s) => QU.ch[k][s < 8 ? 0 : 1];
      if (f.enter) { add(0, 'tanta', { k: 'open', vel: 1.1 }); add(0, 'pandeiro', { k: 'S', vel: 1 }); add(0, 'strum', { ms: QU.ch[k][0], dur: 4, vel: 1 }); }
      tanta(add, live, L, k);
      pandeiro(add, live, L, 0.85);
      if (L >= 3) repmao(add, live, L);
      if (L >= 4) for (let s = 0; s < 16; s++) live(s) && add(s, 'ganza', { vel: s % 4 === 3 ? 0.6 : 0.32, acc: s % 4 === 3 });
      // rhythm strings: cavaquinho (L1–2) → banjo (L3+) on the teleco-teco
      const rInst = L >= 3 ? 'banjo' : 'cav';
      for (let s = 0; s < 16; s++) {
        if (!live(s)) continue;
        if (L === 1) { if (isIn(QU_L1, s)) add(s, 'strum', { ms: chordAt(s), up: s % 2 === 1, dur: 2, vel: 0.85 }); }
        else if (isIn(TELE, s)) add(s, 'strum', { inst: rInst, ms: chordAt(s), up: s % 2 === 1, dur: 1.4, vel: 0.9 });
        else if (s % 2 === 1) add(s, 'strum', { inst: rInst, ms: chordAt(s), up: true, mute: true, vel: 0.6 });
      }
      // guitar bass + runs
      [0, 8].forEach((m, h) => {
        const [r, fi] = QU.bass[k][h];
        if (live(m)) add(m, 'pluck', { inst: 'violao', m: r, dur: 3.5, vel: 1 });
        const runHere = L >= 3 && h === 1 && !f.fill && (k === 1 || k === 3);
        if (runHere) run(fi, QU.bass[nk][0][0], 4, QU.tonic).forEach((nm, j) => add(12 + j, 'pluck', { inst: 'violao', m: nm, dur: 1, vel: 0.85 }));
        else if (live(m + 4)) add(m + 4, 'pluck', { inst: 'violao', m: fi, dur: 3.5, vel: 0.85 });
      });
      // cavaquinho solo (L3+), coro on the long notes (L4)
      if (L >= 3) QU.mel[k].forEach(([s, m, d]) => {
        if (!live(s)) return;
        add(s, 'pluck', { inst: 'cav', m, dur: d * 1.1, vel: 0.9, pan: 0.1 });
        if (L >= 4 && d >= 2) add(s, 'sing', { m: m - 12, dur: d * 1.4, syl: s % 8 === 4 ? 'ia' : 'la', n: 2, vel: 1.35 });
      });
      if (f.fill) { viradaPandeiro(add); add(8, 'strum', { inst: rInst, ms: QU.ch[k][1], dur: 6, vel: 0.85 }); }
      return louder(ev, 1.3);
    },
  });

  /* ========== Track D: Partido Periodic (upbeat partido alto, F major) ==========
     2 chords per bar: F6 D7 | Gm7 C7 | F6 F7 | B♭6 C7
     L1 tantã, pandeiro, cavaquinho on the partido-alto phrase, guitar bass
     L2 + palmas (hand claps) on the phrase, hard pandeiro slaps, tantã shell
     L3 + banjo, repique de mão, call (solo singer, bars 1–2) and response (coro, bars 3–4)
     L4 + tamborim, reco-reco, coro doubled an octave down, cavaquinho answers the call */
  const PA = {
    tonic: 5,
    ch: [[[62, 65, 69, 72], [62, 66, 69, 72]], [[62, 65, 67, 70], [64, 67, 70, 72]], [[62, 65, 69, 72], [63, 65, 69, 72]], [[65, 67, 70, 74], [64, 67, 70, 72]]],
    bass: [[[41, 48], [38, 45]], [[43, 38], [36, 43]], [[41, 48], [41, 48]], [[46, 41], [48, 43]]],
    call: [
      [[3, 72, 2], [5, 74, 1], [6, 72, 2], [9, 72, 1], [11, 69, 1], [12, 66, 2], [14, 69, 2]],
      [[3, 70, 2], [5, 74, 1], [6, 72, 2], [9, 70, 1], [11, 67, 1], [12, 64, 2], [14, 67, 2]],
    ],
    resp: [
      [[0, 72, 2, 'a'], [3, 77, 2, 'ia'], [5, 74, 1], [6, 72, 2], [9, 75, 2, 'ia'], [11, 74, 1], [12, 72, 3]],
      [[0, 74, 2, 'a'], [3, 72, 1], [5, 70, 1], [6, 67, 2, 'ia'], [9, 70, 1], [11, 72, 1], [12, 67, 2], [14, 64, 2, 'ia']],
    ],
    // cavaquinho answers inside the call's rests (L4)
    fills: [[[0, 77], [1, 76], [2, 74]], [[0, 74], [1, 72], [2, 70]]],
  };
  CB.addTrack({
    id: 'partido', name: 'Partido Periodic', bpm: () => C3.PARTIDO_BPM, filter: [3400, 6000, 10000, 16000], endChord: [65, 69, 72, 74],
    bar(i, L, f) {
      const { ev, add } = mk(), k = i % 4, nk = (k + 1) % 4;
      const live = (s) => !(f.fill && s >= 8);
      const chordAt = (s) => PA.ch[k][s < 8 ? 0 : 1];
      if (f.enter) { add(0, 'tanta', { k: 'open', vel: 1.1 }); add(0, 'palmas', { vel: 1, n: 7 }); add(0, 'strum', { ms: PA.ch[k][0], dur: 4, vel: 1 }); }
      tanta(add, live, L, k);
      pandeiro(add, live, L, L >= 2 ? 1.15 : 0.8);
      if (L >= 2) PART.forEach((s) => live(s) && add(s, 'palmas', { vel: L >= 4 ? 0.95 : 0.75 }));
      if (L >= 3) repmao(add, live, L);
      if (L >= 4) { tamborim(add, live, L, false); [2, 6, 10, 14].forEach((s) => live(s) && add(s, 'reco', { dur: 1.6, vel: 0.7 })); [3, 7, 11, 15].forEach((s) => live(s) && add(s, 'reco', { dur: 0.6, vel: 0.5, rate: 85 })); }
      // cavaquinho (and banjo at L3+) on the partido-alto phrase, choked strums between
      for (let s = 0; s < 16; s++) {
        if (!live(s)) continue;
        if (isIn(PART, s)) {
          add(s, 'strum', { ms: chordAt(s), up: s % 2 === 1, dur: 1.5, vel: 0.95 });
          if (L >= 3) add(s, 'strum', { inst: 'banjo', ms: chordAt(s).map((m) => m + 12), up: s % 2 === 1, dur: 1, vel: 0.75 });
        } else if (L >= 2 && s % 2 === 1) add(s, 'strum', { ms: chordAt(s), up: true, mute: true, vel: 0.6 });
      }
      [0, 8].forEach((m, h) => {
        const [r, fi] = PA.bass[k][h];
        if (live(m)) add(m, 'pluck', { inst: 'violao', m: r, dur: 3, vel: 1 });
        const runHere = L >= 3 && h === 1 && !f.fill && k === 3;
        if (runHere) run(fi, PA.bass[nk][0][0], 4, PA.tonic).forEach((nm, j) => add(12 + j, 'pluck', { inst: 'violao', m: nm, dur: 1, vel: 0.85 }));
        else if (live(m + 4)) add(m + 4, 'pluck', { inst: 'violao', m: fi, dur: 3, vel: 0.85 });
      });
      // call and response
      if (L >= 3) {
        const resp = k >= 2, line = resp ? PA.resp[k - 2] : PA.call[k];
        line.forEach(([s, m, d, syl]) => {
          if (!live(s)) return;
          const o = { m, dur: d * 0.9, syl: syl || 'la', vel: resp ? 0.95 : 1.05 };
          if (resp) { add(s, 'sing', Object.assign(o, { n: 2, vel: 1.05 })); add(s, 'sing', { m: dia(m, -2, PA.tonic), dur: d * 0.9, syl: syl || 'la', n: 2, vel: 0.6, pan: -0.3 }); if (L >= 4) add(s, 'sing', { m: m - 12, dur: d * 0.9, syl: syl || 'la', n: 2, vel: 0.6, pan: 0.3 }); }
          else add(s, 'sing', o);
        });
        if (L >= 4 && !resp) PA.fills[k].forEach(([s, m]) => live(s) && add(s, 'pluck', { inst: 'cav', m, dur: 1, vel: 0.85, pan: 0.15 }));
      }
      if (f.fill) {
        viradaPandeiro(add);
        [8, 10, 12, 13, 14].forEach((s) => add(s, 'palmas', { vel: 0.9 }));
        add(8, 'strum', { ms: PA.ch[k][1], dur: 6, vel: 0.9 });
      }
      return louder(ev, 1.45);
    },
  });

  /* ======== Fundo de Quintal–style pieces (Roda Reaction, Covalent Crush) ========
     Modeled on the 1980 Cacique de Ramos sound: Sereno's tantã, Ubirany's repique de mão, Bira's pandeiro,
     Almir Guineto's banjo ("a harmonic reco-reco"), cavaquinho, 6- and 7-string violão, group coro.
     Original progressions and melodies. 8-bar (16-measure) phrases instead of 4. */
  function tantaFQ(add, live, L, k) {   // muted 1, pickup on the "a" of 1, heavy open 2, shell answers
    [0, 8].forEach((m) => {
      if (live(m)) add(m, 'tanta', { k: 'mute', vel: 0.6 });
      if (L >= 2 && live(m + 3)) add(m + 3, 'tanta', { k: 'open', vel: 0.5 });
      if (live(m + 4)) add(m + 4, 'tanta', { k: 'open', vel: 1 });
      if (L >= 2) [m + 6, m + 7].forEach((s) => live(s) && add(s, 'tanta', { k: 'shell', vel: s % 2 ? 0.55 : 0.8 }));
    });
    if (L >= 4 && k % 4 === 3 && live(13)) add(13, 'tanta', { k: 'open', vel: 0.7 });
  }
  // rhythm strings: open strums on the phrase, choked strums on every other 16th ("reco-reco harmônico" when full)
  function cordas(add, live, inst, ch, phrase, opt) {
    for (let s = 0; s < 16; s++) {
      if (!live(s)) continue;
      const c = ch[s < 8 ? 0 : 1];
      if (isIn(phrase, s)) add(s, 'strum', { inst, ms: c, up: s % 2 === 1, dur: opt.open || 1.4, vel: opt.vel });
      else if (opt.all || s % 2 === 1) add(s, 'strum', { inst, ms: c, up: s % 2 === 1, mute: true, vel: opt.vel * 0.65 });
    }
  }
  function violaoBass(add, live, L, T, k, nk, runOn) {   // 7-string: root on 1, fifth on 2, runs (baixarias) into the next chord
    [0, 8].forEach((m, h) => {
      const [r, fi] = T.bass[k][h], runHere = runOn && h === 1;
      if (live(m)) add(m, 'pluck', { inst: 'violao', m: r, dur: 3, vel: 1 });
      if (runHere) run(fi, T.bass[nk][0][0], 4, T.tonic).forEach((nm, j) => add(12 + j, 'pluck', { inst: 'violao', m: nm, dur: 1, vel: 0.85 }));
      else if (live(m + 4)) add(m + 4, 'pluck', { inst: 'violao', m: fi, dur: 3, vel: 0.85 });
    });
  }
  function coro(add, live, line, L, tonic, opt) {
    line.forEach(([s, m, d, syl]) => {
      if (!live(s)) return;
      const base = { dur: d * 0.9, syl: syl || 'la' };
      if (opt.solo) { add(s, 'sing', Object.assign({ m, vel: 1.1 }, base)); return; }
      add(s, 'sing', Object.assign({ m, n: 3, vel: 1 }, base));
      add(s, 'sing', Object.assign({ m: m - 12, n: 2, vel: 0.6, pan: 0.3 }, base));
      if (opt.harm) add(s, 'sing', Object.assign({ m: dia(m, -2, tonic), n: 2, vel: 0.55, pan: -0.3 }, base));
    });
  }

  /* ========== Track E: Roda Reaction (partido alto in a backyard roda, G major) ==========
     Style of 1980 Fundo de Quintal partido sambas. 8-bar loop, 2 chords per bar:
     G6 E7 · Am7 D7 · Bm7 E7 · Am7 D7 · G7 C6 · Cm6 Bm7 · E7 A7 · D7 D7
     L1 tantã, pandeiro, cavaquinho on the partido phrase, 7-string bass
     L2 + banjo 16ths (reco-reco harmônico), repique de mão, tantã pickups and shell
     L3 + call (solo singer, bars 1–4) and response (coro, bars 5–8), guitar runs, palmas
     L4 + coro octave + harmony, surdo on 2, ganzá, harder palmas */
  const RO = {
    tonic: 7,
    ch: [[[62, 64, 67, 71], [62, 64, 68, 71]], [[64, 67, 69, 72], [62, 66, 69, 72]], [[62, 66, 69, 71], [62, 64, 68, 71]], [[64, 67, 69, 72], [62, 66, 69, 72]],
         [[62, 65, 67, 71], [64, 67, 69, 72]], [[63, 67, 69, 72], [62, 66, 69, 71]], [[62, 64, 68, 71], [64, 67, 69, 73]], [[62, 66, 69, 72], [60, 62, 66, 69]]],
    bass: [[[43, 38], [40, 47]], [[45, 40], [38, 45]], [[35, 42], [40, 47]], [[45, 40], [38, 45]], [[43, 38], [48, 43]], [[48, 43], [35, 42]], [[40, 47], [45, 40]], [[38, 45], [38, 45]]],
    call: [
      [[3, 74, 2], [5, 71, 1], [6, 74, 2], [9, 74, 1], [11, 71, 1], [12, 68, 2], [14, 71, 2]],
      [[3, 72, 2], [5, 69, 1], [6, 72, 2], [9, 72, 1], [11, 69, 1], [12, 66, 2], [14, 69, 2]],
      [[3, 74, 2], [5, 78, 1], [6, 76, 2], [9, 74, 1], [11, 71, 1], [12, 68, 2], [14, 71, 2]],
      [[3, 72, 2], [5, 76, 1], [6, 74, 2], [9, 72, 1], [11, 69, 1], [12, 66, 2], [14, 62, 2]],
    ],
    resp: [
      [[0, 67, 2, 'a'], [3, 71, 2, 'ia'], [5, 74, 1], [6, 77, 2], [9, 76, 2, 'ia'], [11, 72, 1], [12, 76, 3]],
      [[0, 75, 2, 'a'], [3, 72, 1], [5, 69, 1], [6, 75, 2], [9, 74, 2, 'ia'], [11, 71, 1], [12, 66, 3]],
      [[0, 71, 2, 'a'], [3, 74, 1], [5, 71, 1], [6, 68, 2], [9, 73, 2, 'ia'], [11, 76, 1], [12, 79, 3]],
      [[0, 78, 2, 'a'], [3, 76, 1], [5, 74, 1], [6, 72, 2], [9, 69, 2, 'ia'], [11, 66, 1], [12, 69, 2], [14, 71, 2]],
    ],
  };
  CB.addTrack({
    id: 'roda', name: 'Roda Reaction', bpm: () => C3.RODA_BPM, filter: [4000, 7000, 11000, 16000], endChord: [55, 62, 64, 67, 71],
    bar(i, L, f) {
      const { ev, add } = mk(), k = i % 8, nk = (k + 1) % 8;
      const live = (s) => !(f.fill && s >= 8);
      if (f.enter) { add(0, 'tanta', { k: 'open', vel: 1.1 }); add(0, 'pandeiro', { k: 'S', vel: 1 }); add(0, 'palmas', { vel: 1, n: 7 }); add(0, 'strum', { ms: RO.ch[k][0], dur: 4, vel: 1 }); }
      tantaFQ(add, live, L, k);
      pandeiro(add, live, L, L >= 2 ? 1.05 : 0.8);
      if (L >= 2) repmao(add, live, L);
      if (L >= 3) PART.forEach((s) => live(s) && add(s, 'palmas', { vel: L >= 4 ? 0.9 : 0.6 }));
      if (L >= 4) {
        [4, 12].forEach((s) => live(s) && add(s, 'surdo', { n: 1, vel: 0.55 }));
        for (let s = 0; s < 16; s++) live(s) && add(s, 'ganza', { vel: s % 4 === 3 ? 0.55 : 0.3, acc: s % 4 === 3 });
      }
      cordas(add, live, 'cav', RO.ch[k], PART, { vel: 0.9 });
      if (L >= 2) cordas(add, live, 'banjo', RO.ch[k], PART, { vel: L >= 4 ? 0.8 : 0.65, open: 1, all: true });
      violaoBass(add, live, L, RO, k, nk, L >= 3 && !f.fill && k % 2 === 1);
      if (L >= 3) {
        if (k < 4) coro(add, live, RO.call[k], L, RO.tonic, { solo: true });
        else coro(add, live, RO.resp[k - 4], L, RO.tonic, { harm: L >= 4 });
      }
      if (f.fill) { viradaPandeiro(add); [8, 10, 12, 13, 14].forEach((s) => add(s, 'palmas', { vel: 0.9 })); add(8, 'strum', { ms: RO.ch[k][1], dur: 6, vel: 0.9 }); }
      return louder(ev, 1.4);
    },
  });

  /* ========== Track F: Covalent Crush (romantic pagode, C major) ==========
     Style of 1980 Fundo de Quintal love sambas: cuíca from the start, then violão, then the coro with a
     soft cavaquinho. 8-bar loop: Cmaj7 C6 · Am7 A7♭9 · Dm7 G7 · Em7 A7 · Fmaj7 Fm6 · Em7 E♭°7 · Dm7 G7 · C6 G7♭9
     L1 tantã, soft pandeiro, cuíca following the chords
     L2 + 6-string violão chords, 7-string bass and runs, repique de mão
     L3 + coro sings the melody (unison + octave), soft cavaquinho
     L4 + coro harmony, banjo, palmas, busier cuíca */
  const CR = {
    tonic: 0,
    ch: [[[64, 67, 71, 72], [64, 67, 69, 72]], [[67, 69, 72, 76], [64, 67, 70, 73]], [[62, 65, 69, 72], [62, 65, 67, 71]], [[62, 64, 67, 71], [64, 67, 69, 73]],
         [[64, 65, 69, 72], [62, 65, 68, 72]], [[62, 64, 67, 71], [63, 66, 69, 72]], [[62, 65, 69, 72], [62, 65, 67, 71]], [[64, 67, 69, 72], [62, 65, 68, 71]]],
    bass: [[[36, 43], [36, 43]], [[45, 40], [45, 40]], [[38, 45], [43, 38]], [[40, 47], [45, 40]], [[41, 48], [41, 48]], [[40, 47], [39, 45]], [[38, 45], [43, 38]], [[36, 43], [43, 38]]],
    root: [[0, 0], [9, 9], [2, 7], [4, 9], [5, 5], [4, 3], [2, 7], [0, 7]],   // chord roots (pitch class) for the cuíca
    mel: [
      [[0, 67, 2, 'a'], [3, 72, 1], [4, 76, 3, 'ia'], [7, 74, 1], [8, 72, 4, 'a'], [14, 71, 1], [15, 72, 1]],
      [[0, 76, 3, 'a'], [3, 74, 1], [4, 72, 2], [6, 69, 2], [8, 73, 3, 'ia'], [11, 74, 1], [12, 76, 2], [14, 74, 2]],
      [[0, 77, 3, 'a'], [3, 76, 1], [4, 74, 2], [6, 72, 2], [8, 71, 3, 'ia'], [11, 72, 1], [12, 74, 4]],
      [[2, 71, 1], [3, 72, 1], [4, 74, 2], [6, 76, 2], [8, 73, 2, 'ia'], [10, 76, 1], [11, 79, 1], [12, 76, 4]],
      [[0, 77, 3, 'a'], [3, 76, 1], [4, 72, 2], [6, 69, 2], [8, 68, 3, 'ia'], [11, 72, 1], [12, 74, 4]],
      [[0, 71, 3, 'a'], [3, 72, 1], [4, 74, 2], [6, 76, 2], [8, 75, 3, 'ia'], [11, 72, 1], [12, 69, 4]],
      [[0, 69, 2], [2, 72, 1], [3, 74, 1], [4, 77, 3, 'ia'], [7, 76, 1], [8, 74, 2], [10, 71, 2], [12, 67, 2], [14, 71, 2]],
      [[0, 72, 4, 'a'], [8, 68, 2], [10, 71, 2], [12, 74, 2], [14, 71, 2]],
    ],
  };
  const CR_CUICA = [[[2, 'up'], [3, 'dn'], [6, 'up', 0], [7, 'lo']], [[2, 'up'], [3, 'dn'], [5, 'hi'], [6, 'up'], [7, 'dn']]];
  CB.addTrack({
    id: 'crush', name: 'Covalent Crush', bpm: () => C3.CRUSH_BPM, filter: [3600, 5500, 9000, 15000], endChord: [48, 55, 64, 67, 69, 72],
    bar(i, L, f) {
      const { ev, add } = mk(), k = i % 8, nk = (k + 1) % 8;
      const live = (s) => !(f.fill && s >= 8);
      if (f.enter) { add(0, 'tanta', { k: 'open', vel: 1 }); add(0, 'pandeiro', { k: 'S', vel: 0.9 }); add(0, 'cuica', { sh: 'up', f: mtof(72 + CR.root[k][0]), dur: 2, vel: 1 }); }
      tantaFQ(add, live, Math.min(L, 3), k);
      pandeiro(add, live, L === 1 ? 1 : 2, 0.8);
      if (L >= 2) repmao(add, live, 3);
      // cuíca tuned to each chord (players press the head to match the harmony)
      [0, 8].forEach((m, h) => {
        const f0 = mtof(72 + CR.root[k][h]), pat = CR_CUICA[L >= 4 ? 1 : (k % 2)];
        pat.forEach(([s, sh]) => live(m + s) && add(m + s, 'cuica', { sh, f: f0, dur: 1.1, vel: 0.85 }));
      });
      if (L >= 2) {
        for (let s = 0; s < 16; s++) {   // 6-string violão: soft chord comping on the teleco-teco
          if (!live(s) || !isIn(TELE, s)) continue;
          add(s, 'strum', { inst: 'violao', ms: CR.ch[k][s < 8 ? 0 : 1].map((m) => m - 12), up: s % 2 === 1, dur: 1.6, vel: 0.4, pan: -0.25, spread: 0.014 });
        }
        violaoBass(add, live, L, CR, k, nk, !f.fill && (k % 2 === 1 || L >= 4));
      }
      if (L >= 3) cordas(add, live, 'cav', CR.ch[k], TELE, { vel: 0.38 });
      if (L >= 4) { cordas(add, live, 'banjo', CR.ch[k], PART, { vel: 0.45, open: 1 }); PART.forEach((s) => live(s) && add(s, 'palmas', { vel: 0.55 })); }
      if (L >= 3) coro(add, live, CR.mel[k], L, CR.tonic, { harm: L >= 4 });
      if (f.fill) {
        viradaPandeiro(add);
        add(8, 'cuica', { sh: 'up', f: mtof(76), dur: 3, vel: 1 }); add(12, 'cuica', { sh: 'up', f: mtof(79), dur: 3, vel: 1 });
        run(CR.bass[k][1][0], CR.bass[nk][0][0] + 12, 6, CR.tonic).forEach((nm, j) => add(10 + j, 'pluck', { inst: 'violao', m: nm, dur: 1, vel: 0.85 }));
      }
      return louder(ev, 1.35);
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
