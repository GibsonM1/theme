/* Copyright (c) 2026 Matthew Gibson, Mission High School. CC BY-NC-SA 4.0: https://creativecommons.org/licenses/by-nc-sa/4.0/ Not for resale. */
/* =====================================================================
   ChemBeats v1 — original, procedurally generated beat music for
   Mr. Gibson's chemistry games. No audio files: everything is
   synthesized live with the Web Audio API (≈20 KB total).

   Tracks:  "jersey"  Jersey Club bounce (140 BPM, F minor)
            "rage"    Trap / Rage / Jersey hybrid (150 BPM, C minor)
   Each track has 4 intensity levels. Call setLevel() as the game
   gets harder; a 1-bar drum fill + riser plays before each level-up.

   Version: Oct 18, 2026, v1.1
   v1.1: adds ChemBeats.addVoice() + ChemBeats.lib so add-on track
         files (chembeats-tracks2.js) can bring their own instruments.
         Nothing else changed; games using v1 calls work as before.
   ===================================================================== */

// ========================= CONFIG (safe to edit) =========================
const CHEMBEATS_CONFIG = {
  MUSIC_ON_FIRST_VISIT: false, // false = music starts OFF until a student turns it on
  VOLUME: 0.8,                 // overall music volume: 0 (silent) to 1 (full)
  JERSEY_BPM: 140,             // Jersey Club tempo (normal range 130–145)
  RAGE_BPM: 150,               // Trap/Rage tempo (normal range 130–160)
  LEVEL_UP_FILL: true,         // true = 1-bar drum fill + riser before each new level
  CHROMEBOOK_GRIT: true,       // true = distort the 808s so bass is audible on laptop speakers
  FADE_SECONDS: 0.5,           // fade time when music starts or stops
};
// =========================================================================

(function (global) {
  'use strict';
  const CFG = CHEMBEATS_CONFIG;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const clampL = (n) => Math.max(1, Math.min(4, Math.round(n || 1)));
  const RES = new WeakMap();

  /* ---------- shared per-context resources (noise, hats, reverb) ---------- */
  function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967296) * 2 - 1; }; }
  function resources(ctx) {
    let r = RES.get(ctx); if (r) return r;
    const sr = ctx.sampleRate, rnd = lcg(7);
    r = { curves: {} };
    const nb = ctx.createBuffer(1, sr * 3, sr), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = rnd();
    r.noise = nb;
    r.hatC = metal(ctx, 0.07, rnd);
    r.hatO = metal(ctx, 0.42, rnd);
    const len = Math.floor(sr * 1.6), ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) { const x = i / len; d[i] = rnd() * Math.pow(1 - x, 3.2) * Math.min(1, i / (sr * 0.01)) * 0.6; }
    }
    r.ir = ir;
    RES.set(ctx, r); return r;
  }
  // TR-808-style metallic hat: 6 inharmonic square waves + noise, double high-passed
  function metal(ctx, dec, rnd) {
    const sr = ctx.sampleRate, n = Math.floor(sr * Math.min(dec * 1.2 + 0.02, 1));
    const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * 1.7), ph = fr.map(() => 0);
    const dt = 1 / sr, rc = 1 / (2 * Math.PI * 7000), a = rc / (rc + dt);
    let x1 = 0, y1 = 0, y2 = 0, z1 = 0, peak = 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < 6; k++) { ph[k] += fr[k] * dt; ph[k] -= Math.floor(ph[k]); s += ph[k] < 0.5 ? 1 : -1; }
      s = (s / 6) * 0.7 + rnd() * 0.3;
      const y = a * (y1 + s - x1); x1 = s; y1 = y;
      const z = a * (z1 + y - y2); y2 = y; z1 = z;
      const t = i / sr;
      d[i] = z * Math.exp((-t * 6.9) / dec) * (t < 0.0015 ? t / 0.0015 : 1);
      peak = Math.max(peak, Math.abs(d[i]));
    }
    for (let i = 0; i < n; i++) d[i] *= 0.9 / peak;
    return b;
  }
  function curve(r, drive) {
    const k = Math.max(0.5, Math.round(drive * 10) / 10);
    if (r.curves[k]) return r.curves[k];
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
    return (r.curves[k] = c);
  }

  /* ---------- mixer ---------- */
  function makeMaster(ctx, vol) {
    const input = ctx.createGain(); input.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.15;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    const out = ctx.createGain(); out.gain.value = vol;
    if (global.ChemBeats && global.ChemBeats.debugRaw) input.connect(out).connect(ctx.destination);
    else input.connect(comp).connect(lim).connect(out).connect(ctx.destination);
    return { input, out };
  }
  function makeBuses(ctx, dest, tr) {
    const b = { ctx, r: resources(ctx), spb: 60 / tr.bpm() / 4 };
    const G = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    b.out = G(0); b.out.connect(dest);
    b.drums = G(0.9); b.drums.connect(b.out);
    b.sub = G(0.85); b.sub.connect(b.out);
    b.music = G(0.7);
    b.filt = ctx.createBiquadFilter(); b.filt.type = 'lowpass'; b.filt.Q.value = 0.9; b.filt.frequency.value = tr.filter[0];
    b.duck = G(1);
    b.music.connect(b.filt).connect(b.duck).connect(b.out);
    b.verb = ctx.createConvolver(); b.verb.buffer = b.r.ir; b.verbIn = G(0.5);
    b.verbIn.connect(b.verb).connect(b.out);
    // dotted-8th echo for melodic parts
    b.dlyIn = G(1); const dly = ctx.createDelay(1); dly.delayTime.value = 3 * b.spb;
    const fb = G(0.3), dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3000;
    const dout = G(0.45);
    b.dlyIn.connect(dly).connect(dlp).connect(fb).connect(dly); dlp.connect(dout).connect(b.music);
    return b;
  }

  /* ---------- synth voices ---------- */
  function osc(c, type, f, t) { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); return o; }
  function gn(c, v) { const g = c.createGain(); g.gain.value = v; return g; }
  function noise(b, t, dur) {
    const s = b.ctx.createBufferSource(); s.buffer = b.r.noise;
    s.start(t, Math.random() * Math.max(0, 2.95 - dur), dur); return s;
  }
  function send(b, node, amt, bus) { if (amt > 0) node.connect(gn(b.ctx, amt)).connect(bus); }
  function bend(param, f, t, p) { // pitch start: glide from previous note, or 808 "punch" drop
    if (p.from != null) { param.setValueAtTime(mtof(p.from) * (f / mtof(p.m)), t); param.exponentialRampToValueAtTime(f, t + (p.glideS || 0.07)); }
    else if (p.punch) { param.setValueAtTime(f * 1.9, t); param.exponentialRampToValueAtTime(f, t + 0.035); }
  }

  const V = {
    kick(b, t, p) {
      const c = b.ctx, v = p.vel ?? 1, dec = p.dec || 0.34;
      const o = osc(c, 'sine', p.hi || 165, t); o.frequency.exponentialRampToValueAtTime(p.lo || 46, t + 0.1);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.001, t + dec);
      o.connect(g).connect(b.drums); o.start(t); o.stop(t + dec + 0.02);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      noise(b, t, 0.012).connect(hp).connect(gn(c, 0.35 * v)).connect(b.drums);
      if (p.duck) { const d = b.duck.gain; d.setValueAtTime(0.4, t); d.linearRampToValueAtTime(1, t + 0.16); }
    },
    clap(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 1) * 2.9, dec = p.dec || 0.2;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = p.freq || 1250; bp.Q.value = 1.1;
      const g = c.createGain(); g.gain.setValueAtTime(0, t);
      for (let k = 0; k < 3; k++) { const tk = t + k * 0.011; g.gain.setValueAtTime(v, tk); g.gain.exponentialRampToValueAtTime(v * 0.15, tk + 0.0095); }
      g.gain.setValueAtTime(v, t + 0.034); g.gain.exponentialRampToValueAtTime(0.001, t + 0.034 + dec);
      noise(b, t, dec + 0.06).connect(bp).connect(g).connect(b.drums);
      send(b, g, p.verb ?? 0.3, b.verbIn);
    },
    snare(b, t, p) {
      const c = b.ctx, v = p.vel ?? 1, dec = p.dec || 0.16, f = p.pitch || 200;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
      const g = c.createGain(); g.gain.setValueAtTime(v * 1.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + dec);
      noise(b, t, dec + 0.02).connect(hp).connect(g).connect(b.drums);
      const o = osc(c, 'triangle', f, t); o.frequency.exponentialRampToValueAtTime(f * 0.75, t + 0.05);
      const og = c.createGain(); og.gain.setValueAtTime(v * 0.85, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.connect(og).connect(b.drums); o.start(t); o.stop(t + 0.1);
      send(b, g, 0.2, b.verbIn);
    },
    hat(b, t, p) {
      const c = b.ctx, s = c.createBufferSource(); s.buffer = p.open ? b.r.hatO : b.r.hatC;
      s.playbackRate.setValueAtTime(Math.pow(2, (p.pitch || 0) / 12), t);
      const pan = c.createStereoPanner(); pan.pan.value = p.pan ?? 0.15;
      s.connect(gn(c, (p.vel ?? 0.6) * 1.25)).connect(pan).connect(b.drums); s.start(t);
    },
    squeak(b, t, p) { // Jersey "bedspring" squeak
      const c = b.ctx, v = (p.vel ?? 1) * 1.5, f = p.f || 1150;
      const o = osc(c, 'sawtooth', f, t);
      if (p.up !== false) { o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.035); o.frequency.exponentialRampToValueAtTime(f * 1.15, t + 0.1); }
      else { o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.09); }
      const lfo = osc(c, 'square', 38, t); lfo.connect(gn(c, f * 0.06)).connect(o.frequency);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2300; bp.Q.value = 3;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(bp).connect(g).connect(b.drums); send(b, g, 0.2, b.verbIn);
      o.start(t); lfo.start(t); o.stop(t + 0.13); lfo.stop(t + 0.13);
    },
    b808(b, t, p) { // distorted 808: sine sub + octave-up saw "synth bass" layer
      const c = b.ctx, f = mtof(p.m), dur = Math.max(0.08, p.durS || 0.5), v = p.vel ?? 1;
      const drive = CFG.CHROMEBOOK_GRIT ? (p.drive ?? 3) : Math.min(p.drive ?? 3, 1.2);
      const q = Object.assign({ punch: true }, p);
      const o = osc(c, 'sine', f, t); bend(o.frequency, f, t, q);
      const sh = c.createWaveShaper(); sh.curve = curve(b.r, drive); sh.oversample = '2x';
      const s2 = osc(c, 'sawtooth', f * 2, t); bend(s2.frequency, f * 2, t, q);
      const slp = c.createBiquadFilter(); slp.type = 'lowpass'; slp.frequency.value = 1100; slp.Q.value = 4;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.32, t + 0.004);
      g.gain.exponentialRampToValueAtTime(v * 0.16, t + dur * 0.85); g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
      o.connect(sh).connect(g);
      s2.connect(slp).connect(gn(c, 0.05 * Math.min(drive, 6) / 2)).connect(g);
      g.connect(lp).connect(b.sub);
      o.start(t); s2.start(t); o.stop(t + dur + 0.05); s2.stop(t + dur + 0.05);
    },
    jbass(b, t, p) {
      const c = b.ctx, f = mtof(p.m), dur = p.durS || 0.22, v = p.vel ?? 1;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
      lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(320, t + 0.15);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.7, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      [['sine', 0, 0.8], ['sawtooth', 7, 0.3], ['sawtooth', -7, 0.3]].forEach(([ty, dt, a]) => {
        const o = osc(c, ty, f, t); o.detune.value = dt; o.connect(gn(c, a)).connect(lp); o.start(t); o.stop(t + dur + 0.02);
      });
      lp.connect(g).connect(b.sub);
    },
    pad(b, t, p) {
      const c = b.ctx, dur = p.durS || 1, v = (p.vel ?? 1) * 0.083;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.12);
      g.gain.setValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.25);
      p.ms.forEach((m) => [-10, 10].forEach((dt) => {
        const o = osc(c, 'sawtooth', mtof(m), t); o.detune.value = dt; o.connect(g); o.start(t); o.stop(t + dur + 0.3);
      }));
      g.connect(b.music); send(b, g, 0.35, b.verbIn);
    },
    stab(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 1) * 0.144, dec = p.durS || 0.2;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
      lp.frequency.setValueAtTime(3800, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.15);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t + dec);
      p.ms.forEach((m) => [['sawtooth', -8], ['square', 8]].forEach(([ty, dt]) => {
        const o = osc(c, ty, mtof(m), t); o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + dec + 0.02);
      }));
      lp.connect(g).connect(b.music); send(b, g, 0.25, b.verbIn);
    },
    lead(b, t, p) { // Jersey pluck lead
      const c = b.ctx, f = mtof(p.m), v = (p.vel ?? 1) * 0.25, dec = Math.max(0.15, p.durS || 0.25);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
      lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.18);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t + dec);
      [['square', 0], ['sawtooth', 6]].forEach(([ty, dt]) => { const o = osc(c, ty, f, t); o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + dec + 0.02); });
      lp.connect(g).connect(b.music); send(b, g, 0.2, b.verbIn); send(b, g, 0.35, b.dlyIn);
    },
    bell(b, t, p) { // FM bell
      const c = b.ctx, f = mtof(p.m), v = (p.vel ?? 1) * 0.13, dec = p.dec || 1.1;
      const o = osc(c, 'sine', f, t), m = osc(c, 'sine', f * 3.5, t), mg = c.createGain();
      mg.gain.setValueAtTime(f * 2.5, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.6);
      m.connect(mg).connect(o.frequency);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.001, t + dec);
      o.connect(g).connect(b.music); send(b, g, 0.4, b.verbIn); send(b, g, 0.3, b.dlyIn);
      o.start(t); m.start(t); o.stop(t + dec + 0.02); m.stop(t + dec + 0.02);
    },
    saw(b, t, p) { // Rage supersaw lead, 5 detuned saws spread in stereo + sub saw
      const c = b.ctx, f = mtof(p.m), dur = Math.max(0.08, p.durS || 0.2), v = p.vel ?? 1;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
      lp.frequency.setValueAtTime(7000, t); lp.frequency.exponentialRampToValueAtTime(2600, t + dur + 0.1);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.13, t + 0.004);
      g.gain.setTargetAtTime(v * 0.087, t + 0.01, 0.08); g.gain.setValueAtTime(v * 0.087, t + dur); g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.12);
      [-20, -10, 0, 10, 20].forEach((dt, k) => {
        const o = osc(c, 'sawtooth', f, t); o.detune.value = dt;
        const pan = c.createStereoPanner(); pan.pan.value = (k - 2) * 0.33;
        o.connect(pan).connect(lp); o.start(t); o.stop(t + dur + 0.15);
      });
      const sub = osc(c, 'sawtooth', f / 2, t); sub.connect(gn(c, 0.5)).connect(lp); sub.start(t); sub.stop(t + dur + 0.15);
      lp.connect(g).connect(b.music); send(b, g, 0.25, b.verbIn); send(b, g, 0.2, b.dlyIn);
    },
    vox(b, t, p) { // formant "vocal chop" (ah / eh / oh / ee)
      const c = b.ctx, f = mtof(p.m), dur = p.durS || 0.16, v = (p.vel ?? 1) * 1.25;
      const F = { ah: [800, 1150, 2900], eh: [500, 1750, 2500], oh: [450, 800, 2830], ee: [300, 2200, 3000] }[p.vow || 'ah'];
      const o = osc(c, 'sawtooth', f, t); o.frequency.exponentialRampToValueAtTime(f * 0.93, t + dur);
      const vib = osc(c, 'sine', 6, t); vib.connect(gn(c, f * 0.01)).connect(o.frequency);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      F.forEach((ff, k) => { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = 8 + k * 2; o.connect(bp).connect(gn(c, [1, 0.6, 0.25][k] * 3.5)).connect(g); });
      g.connect(b.music); send(b, g, 0.3, b.verbIn); send(b, g, 0.2, b.dlyIn);
      o.start(t); vib.start(t); o.stop(t + dur + 0.02); vib.stop(t + dur + 0.02);
    },
    riser(b, t, p) {
      const c = b.ctx, dur = p.durS || 1, v = (p.vel ?? 1) * 0.3;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
      bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.01);
      noise(b, t, dur + 0.02).connect(bp).connect(g).connect(b.drums); send(b, g, 0.3, b.verbIn);
    },
    impact(b, t, p) { // crash + boom on the first beat of a new level
      const c = b.ctx, v = p.vel ?? 1;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      const g = c.createGain(); g.gain.setValueAtTime(0.32 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      noise(b, t, 1.45).connect(hp).connect(g).connect(b.drums); send(b, g, 0.5, b.verbIn);
      const o = osc(c, 'sine', 90, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
      const og = c.createGain(); og.gain.setValueAtTime(0.7 * v, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      o.connect(og).connect(b.sub); o.start(t); o.stop(t + 0.95);
    },
  };

  /* ---------- tracks ---------- */
  const TRACKS = {};
  function addTrack(def) { TRACKS[def.id] = def; }
  function mk() { const ev = []; return { ev, add: (s, v, p) => ev.push(Object.assign({ s, v }, p || {})) }; }

  // ---- Track 1: Jersey Bounce (F minor: Fm – Db – Ab – Eb) ----
  const JZ = {
    prog: [{ root: 41, ch: [65, 68, 72] }, { root: 37, ch: [65, 68, 73] }, { root: 44, ch: [63, 68, 72] }, { root: 39, ch: [63, 67, 70] }],
    hook: [
      [[0, 72], [3, 68], [6, 65], [8, 72], [11, 75], [14, 72]],
      [[0, 73], [3, 68], [6, 65], [8, 73], [11, 77], [14, 75]],
      [[0, 75], [3, 72], [6, 68], [8, 75], [11, 72], [14, 70]],
      [[0, 70], [3, 67], [6, 70], [8, 75], [11, 79], [14, 77]],
    ],
  };
  addTrack({
    id: 'jersey', name: 'Jersey Bounce', bpm: () => CFG.JERSEY_BPM, filter: [900, 1900, 4500, 14000],
    endChord: [65, 68, 72],
    bar(i, L, f) {
      const { ev, add } = mk(), k = i % 4, P = JZ.prog[k];
      // KICK: classic 5-kick bounce 1, 2, 3, 3a, 4& ; level 4 adds a kick roll every 4th bar
      const kicks = f.fill ? [0, 4, 8] : (L >= 4 && k === 3 ? [0, 4, 8, 11, 12, 13, 14, 15] : [0, 4, 8, 11, 14]);
      kicks.forEach((s) => add(s, 'kick', { vel: s % 4 === 0 ? 1 : 0.85, duck: true }));
      // CLAP on 2 and 4
      add(4, 'clap');
      if (f.fill) { for (let s = 8; s < 16; s++) add(s, 'clap', { vel: 0.35 + 0.65 * (s - 8) / 7, freq: 1100 + (s - 8) * 180, dec: 0.08 }); add(0, 'riser', { dur: 16 }); }
      else { add(12, 'clap'); if (L >= 4 && k % 2 === 1) add(14, 'clap', { vel: 0.55 }); }
      if (f.enter) add(0, 'impact');
      // BEDSPRING SQUEAKS on the offbeats (level 2+), extra pickups at level 3+
      if (L >= 2 && !f.fill) {
        [2, 6, 10, 14].forEach((s, j) => add(s, 'squeak', { up: j % 2 === 0 }));
        if (L >= 3) { add(7, 'squeak', { up: false, vel: 0.6 }); add(15, 'squeak', { up: true, vel: 0.6, f: 1300 }); }
      }
      // HATS: 8ths at L2, 16ths at L3+, open hats at L4
      if (L >= 2) for (let s = 0; s < (f.fill ? 8 : 16); s += (L >= 3 ? 1 : 2)) add(s, 'hat', { vel: s % 4 === 2 ? 0.7 : (s % 2 ? 0.35 : 0.5), pan: s % 2 ? -0.2 : 0.2 });
      if (L >= 4 && !f.fill) { add(6, 'hat', { open: true, vel: 0.45 }); add(14, 'hat', { open: true, vel: 0.45 }); }
      // BASS follows the kick bounce (octave jump on 3a)
      if (L === 1) { add(0, 'jbass', { m: P.root, dur: 6 }); add(8, 'jbass', { m: P.root, dur: 6 }); }
      else (f.fill ? [0, 4, 8] : [0, 4, 8, 11, 14]).forEach((s) => add(s, 'jbass', { m: s === 11 ? P.root + 12 : P.root, dur: 2.5 }));
      // HARMONY: soft pad (L1–2) → pad + bounce stabs (L3+)
      add(0, 'pad', { ms: P.ch, dur: 16, vel: L >= 3 ? 0.5 : 1 });
      if (L >= 3) (f.fill ? [0, 3] : [0, 3, 8, 11]).forEach((s) => add(s, 'stab', { ms: P.ch, dur: 1.5 }));
      // HOOK (L3+)
      if (L >= 3) JZ.hook[k].forEach(([s, m]) => { if (!(f.fill && s >= 8)) add(s, 'lead', { m, dur: 2 }); });
      // VOCAL CHOPS (L4)
      if (L >= 4 && !f.fill) {
        const pat = k % 2 === 0 ? [[3, 'ah', 0], [6, 'ah', 0], [11, 'eh', 2]] : [[3, 'ah', 0], [6, 'eh', 1], [10, 'oh', 2], [14, 'ah', 0]];
        pat.forEach(([s, vow, ci]) => add(s, 'vox', { m: P.ch[ci] - 12, vow, dur: 2 }));
      }
      return ev;
    },
  });

  // ---- Track 2: Rage Reactor (C minor: Cm – Ab – Fm – G) ----
  const RG = {
    prog: [{ root: 36, ch: [60, 63, 67] }, { root: 44, ch: [60, 63, 68] }, { root: 41, ch: [60, 65, 68] }, { root: 43, ch: [59, 62, 67] }],
    // [step, midi note, length in steps, glide from previous note?]
    b808: [
      [[0, 36, 6], [6, 36, 4], [10, 39, 3, 1], [13, 43, 3, 1]],
      [[0, 44, 6], [6, 44, 4], [10, 48, 2, 1], [12, 46, 4, 1]],
      [[0, 41, 6], [6, 41, 4], [10, 44, 3, 1], [13, 48, 3, 1]],
      [[0, 43, 6], [6, 43, 2], [8, 47, 3, 1], [11, 50, 3, 1], [14, 43, 2, 1]],
    ],
    lead: [
      [[0, 79], [3, 75], [6, 72], [8, 79], [10, 75], [12, 74], [14, 75]],
      [[0, 80], [3, 75], [6, 72], [8, 80], [10, 75], [12, 79], [14, 77]],
      [[0, 80], [3, 77], [6, 72], [8, 80], [10, 77], [12, 75], [14, 72]],
      [[0, 79], [3, 74], [6, 71], [8, 79], [10, 74], [12, 77], [14, 74]],
    ],
    // hi-hat rolls at level 3+: [start step, length in steps, hits per 16th, start pitch, end pitch]
    // hits per 16th: 1.5 = 16th triplets, 2 = 1/32, 3 = 1/32 triplets, 6 = 1/64 triplets
    rolls: [[6, 2, 3, 0, 5], [12, 4, 2, 7, -5], [10, 2, 3, -3, 7], [12, 4, 3, 0, 12]],
  };
  addTrack({
    id: 'rage', name: 'Rage Reactor', bpm: () => CFG.RAGE_BPM, filter: [1200, 2600, 6500, 14000],
    endChord: [60, 63, 67],
    bar(i, L, f) {
      const { ev, add } = mk(), k = i % 4, P = RG.prog[k], dbl = L >= 4;
      // KICKS on the downbeats (punch layered with the 808)
      add(0, 'kick', { vel: 1.2, lo: 42, dec: 0.28 });
      if (!f.fill) { if (L >= 2) add(10, 'kick', { vel: 1, lo: 42, dec: 0.25 }); if (dbl) add(7, 'kick', { vel: 1, lo: 42, dec: 0.25 }); }
      // SNARE/CLAP: half-time (beat 3) at L1–3, double-time (2 & 4) at L4
      if (f.fill) {
        [[8, 0.5], [10, 0.55], [12, 0.6], [13, 0.65], [14, 0.7], [14.5, 0.75], [15, 0.85], [15.5, 1]].forEach(([s, v], j) => add(s, 'snare', { vel: v, pitch: 190 + j * 25, dec: 0.1 }));
        add(dbl ? 4 : 8, 'clap'); add(0, 'riser', { dur: 16 });
      } else (dbl ? [4, 12] : [8]).forEach((s) => { add(s, 'clap'); add(s, 'snare', { vel: 0.45 }); });
      if (f.enter) add(0, 'impact');
      // 808 BASSLINE = the melody (sliding, distorted, higher register)
      if (L === 1) { add(0, 'b808', { m: P.root, dur: 10, drive: 1.6 }); if (!f.fill) add(10, 'b808', { m: P.root, dur: 6, drive: 1.6 }); }
      else {
        const pat = RG.b808[k], drive = L === 2 ? 3 : 6;
        pat.forEach((n, j) => { if (!(f.fill && n[0] >= 8)) add(n[0], 'b808', { m: n[1], dur: n[2], from: n[3] ? pat[j - 1][1] : null, drive }); });
      }
      if (f.fill) add(8, 'b808', { m: P.root + 12, from: P.root, glide: 7, dur: 8, drive: L === 1 ? 2 : 5 }); // long slide up into the drop
      // HI-HATS
      const roll = (s, len, per, p0, p1, vel = 0.45) => {
        const n = Math.round(len * per);
        for (let j = 0; j < n; j++) add(s + j / per, 'hat', { vel: vel * (0.55 + 0.45 * j / n), pitch: p0 + (p1 - p0) * (n > 1 ? j / (n - 1) : 0), pan: j % 2 ? -0.25 : 0.25 });
      };
      const busy = [];
      if (f.fill) { roll(8, 8, 2, 0, 12, 0.5); busy.push([8, 16]); }
      else if (L === 2 && k % 2 === 1) { roll(12, 4, 1.5, 0, 0); busy.push([12, 16]); }
      else if (L >= 3) {
        const r = RG.rolls[k]; roll(r[0], r[1], r[2], r[3], r[4]); busy.push([r[0], r[0] + r[1]]);
        if (dbl) { const z = k % 2 === 0 ? [3, 12, 0] : [5, 0, 12]; roll(z[0], 1, 6, z[1], z[2], 0.35); busy.push([z[0], z[0] + 1]); }
      }
      const free = (s) => !busy.some(([a, b]) => s >= a && s < b);
      for (let s = 0; s < 16; s += (L === 1 ? 2 : 1)) if (free(s)) add(s, 'hat', { vel: s % 4 === 0 ? 0.6 : (s % 2 ? 0.35 : 0.5), pan: s % 2 ? -0.15 : 0.15 });
      if (dbl && !f.fill && k % 2 === 0 && free(14)) add(14, 'hat', { open: true, vel: 0.45 });
      // HARMONY: dark pad (L1–3), FM bell arps (L1–2)
      if (L <= 3) add(0, 'pad', { ms: P.ch, dur: 16, vel: L === 3 ? 0.6 : 1 });
      if (L <= 2) { const arp = [P.ch[0] + 12, P.ch[1] + 12, P.ch[2] + 12, P.ch[1] + 12], st = L === 1 ? 4 : 2; for (let s = 0, j = 0; s < 16; s += st, j++) add(s, 'bell', { m: arp[j % 4], vel: 0.8 }); }
      // RAGE LEAD (L3+), octave-doubled at L4
      if (L >= 3) {
        const ln = RG.lead[k];
        ln.forEach(([s, m], j) => {
          if (f.fill && s >= 8) return;
          const dur = (j + 1 < ln.length ? ln[j + 1][0] : 16) - s;
          add(s, 'saw', { m, dur: dur * 0.85 });
          if (dbl) add(s, 'saw', { m: m - 12, dur: dur * 0.85, vel: 0.55 });
        });
      }
      return ev;
    },
  });

  /* ---------- scheduler ---------- */
  function scheduleBar(b, tr, i, L, flags, t0) {
    const spb = b.spb, ev = tr.bar(i, L, flags).sort((x, y) => x.s - y.s);
    const fq = b.filt.frequency;
    if (flags.fill) { const to = tr.filter[(flags.to || L) - 1]; fq.setValueAtTime(tr.filter[L - 1], t0 + 8 * spb); fq.exponentialRampToValueAtTime(Math.max(to, tr.filter[L - 1]) * 1.2, t0 + 16 * spb); }
    else fq.setTargetAtTime(tr.filter[L - 1], t0, 0.04);
    for (const e of ev) {
      if (ChemBeats.debugSolo && !ChemBeats.debugSolo.includes(e.v)) continue;
      const p = Object.assign({}, e);
      if (e.dur != null) p.durS = e.dur * spb;
      if (e.glide != null) p.glideS = e.glide * spb;
      V[e.v](b, t0 + e.s * spb, p);
    }
  }

  const st = { game: 'chem', enabled: CFG.MUSIC_ON_FIRST_VISIT, track: null, level: 1, volume: CFG.VOLUME };
  let ctx = null, master = null, sess = null;
  const key = () => st.game + '-music';
  function load() { try { const v = localStorage.getItem(key()); return v == null ? CFG.MUSIC_ON_FIRST_VISIT : v === 'on'; } catch (e) { return CFG.MUSIC_ON_FIRST_VISIT; } }
  function save() { try { localStorage.setItem(key(), st.enabled ? 'on' : 'off'); } catch (e) {} }

  function ensureCtx() {
    if (!ctx) { const AC = global.AudioContext || global.webkitAudioContext; if (!AC) return null; ctx = new AC(); master = makeMaster(ctx, st.volume); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function startSession() {
    const tr = TRACKS[st.track]; if (!tr || !st.enabled) return;
    const c = ensureCtx(); if (!c) return;
    stopSession(0.08);
    const b = makeBuses(c, master.input, tr);
    b.filt.frequency.value = tr.filter[st.level - 1];
    const now = c.currentTime;
    b.out.gain.setValueAtTime(0, now); b.out.gain.linearRampToValueAtTime(1, now + CFG.FADE_SECONDS);
    sess = { b, tr, bar: 0, L: st.level, next: now + 0.1, goingTo: null, noFill: false, timer: null };
    tick();
  }
  function tick() {
    if (!sess) return;
    const s = sess, now = ctx.currentTime;
    if (s.next < now - 0.05) s.next = now + 0.05; // resync after a stall
    while (s.next < now + 0.3) planBar(s);
    s.timer = setTimeout(tick, 50);
  }
  function planBar(s) {
    let L = s.L; const flags = { fill: false, enter: false, to: null };
    if (s.goingTo != null) { L = s.goingTo; s.goingTo = null; flags.enter = true; s.bar = 0; }
    else if (st.level !== s.L) {
      if (st.level > s.L && CFG.LEVEL_UP_FILL && !s.noFill) { flags.fill = true; flags.to = st.level; s.goingTo = st.level; }
      else { L = st.level; s.bar = 0; }
    }
    s.noFill = false;
    scheduleBar(s.b, s.tr, s.bar, L, flags, s.next);
    s.L = L; s.bar++; s.next += 16 * s.b.spb;
  }
  function stopSession(fade) {
    if (!sess) return;
    const s = sess; sess = null; clearTimeout(s.timer);
    const g = s.b.out.gain, now = ctx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + fade);
    setTimeout(() => { try { s.b.out.disconnect(); } catch (e) {} }, (fade + 3) * 1000);
  }

  /* ---------- public API ---------- */
  const ChemBeats = {
    /** Call once on page load. game = short name, used for the saved on/off setting (e.g. 'ibond'). */
    init(opts = {}) {
      st.game = opts.game || st.game; st.enabled = load();
      const unlock = () => { if (ctx && ctx.state === 'suspended' && st.enabled) ctx.resume(); };
      ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => global.addEventListener && global.addEventListener(ev, unlock, { passive: true }));
      return st.enabled;
    },
    /** Start (or switch to) a track at a level 1–4. Safe to call every time the level changes. */
    play(track, level) {
      if (!TRACKS[track]) throw new Error('ChemBeats: unknown track ' + track);
      const L = clampL(level ?? st.level);
      if (sess && st.track === track) { st.level = L; return; }
      st.track = track; st.level = L;
      if (st.enabled) startSession();
    },
    /** Change intensity 1–4. Going up plays a fill first (unless instant:true). */
    setLevel(n, opts = {}) { st.level = clampL(n); if (sess && opts.instant) sess.noFill = true; },
    getLevel() { return st.level; },
    stop() { st.track = null; stopSession(CFG.FADE_SECONDS); },
    pause() { if (ctx) ctx.suspend(); },
    resume() { if (ctx && st.enabled) ctx.resume(); },
    /** Music on/off toggle (remembered per game on this device). */
    setEnabled(on) {
      st.enabled = !!on; save();
      if (st.enabled) { ensureCtx(); if (st.track && !sess) startSession(); }
      else stopSession(0.3);
      return st.enabled;
    },
    toggle() { return this.setEnabled(!st.enabled); },
    isEnabled() { return st.enabled; },
    setVolume(v) { st.volume = Math.max(0, Math.min(1, v)); if (master) master.out.gain.setTargetAtTime(st.volume, ctx.currentTime, 0.05); },
    /** For add-on files: register a new instrument, and the helpers the built-in ones use. */
    addVoice(name, fn) { V[name] = fn; },
    lib: { mtof, osc, gn, noise, send, bend, curve, resources, V },
    tracks() { return Object.values(TRACKS).map((t) => ({ id: t.id, name: t.name, bpm: t.bpm() })); },
    addTrack,
    /** Events for one bar (for drawing a step grid). */
    pattern(track, level, bar = 0, flags = {}) { return TRACKS[track].bar(bar, clampL(level), Object.assign({ fill: false, enter: false, to: null }, flags)); },
    /** Where the music is right now: { step 0–15, bar, level } or null if stopped. */
    position() {
      if (!sess) return null;
      const spb = sess.b.spb, now = ctx.currentTime; let start = sess.next - 16 * spb, bar = sess.bar - 1;
      while (now < start && bar > 0) { start -= 16 * spb; bar--; }
      return { step: Math.max(0, Math.min(15, Math.floor((now - start) / spb))), bar, level: sess.L };
    },
    debugState() { return sess ? { track: st.track, playingLevel: sess.L, goingTo: sess.goingTo, bar: sess.bar, ctx: ctx.state } : { track: st.track, playing: false }; },
    /** Render offline to an AudioBuffer. plan = [[level, bars], ...] e.g. [[1,8],[2,8],[3,8],[4,8]] */
    renderOffline(id, plan, sampleRate = 44100) {
      const tr = TRACKS[id], levels = [];
      plan.forEach(([L, n]) => { for (let j = 0; j < n; j++) levels.push(clampL(L)); });
      const spb = 60 / tr.bpm() / 4, total = levels.length * 16 * spb + 3.2;
      const oc = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate);
      const m = makeMaster(oc, 1), b = makeBuses(oc, m.input, tr);
      b.out.gain.value = 1; b.filt.frequency.value = tr.filter[levels[0] - 1];
      let i = 0, t = 0.05;
      levels.forEach((L, k) => {
        const prev = levels[k - 1], nx = levels[k + 1], last = k === levels.length - 1;
        const flags = { fill: CFG.LEVEL_UP_FILL && ((nx != null && nx > L) || last), enter: prev != null && L > prev, to: nx || L };
        if (flags.enter) i = 0;
        scheduleBar(b, tr, i, L, flags, t); i++; t += 16 * spb;
      });
      V.impact(b, t, {}); V.kick(b, t, {}); V.pad(b, t, { ms: tr.endChord, durS: 1.6 });
      return oc.startRendering();
    },
  };
  global.ChemBeats = ChemBeats;
})(typeof window !== 'undefined' ? window : globalThis);
