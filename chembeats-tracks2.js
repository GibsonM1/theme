/* Copyright (c) 2026 Matthew Gibson, Mission High School. CC BY-NC-SA 4.0: https://creativecommons.org/licenses/by-nc-sa/4.0/ Not for resale. */
/* =====================================================================
   ChemBeats Tracks 2 — add-on tracks for chembeats-v1.js (needs v1.1+).
   Load AFTER the engine:
     <script src="chembeats-v1.js"></script>
     <script src="chembeats-tracks2.js"></script>

   Tracks (id → name):
     'drill'       Glide Reaction    drill: delayed snares, multi-octave 808 slides
     'trap16'      Throwback Trap    2014–16 trap: clean sub on the kicks, 1/32 rolls, triplet bells
     'boombap'     Boom-Bap Beaker   90s boom-bap, MPC swing (calm tempo, for menus/review)
     'boombap-up'  Boom-Bap Beaker+  same groove, faster (for gameplay)
     'bounce'      Bayou Bounce      New Orleans bounce: snare rolls, shakers, congas, synth bass
     'stutter'     Stutter Catalyst  Neptunes/Timbaland-style: stutter kicks, beatbox, clav
   All original patterns. Same API as v1: ChemBeats.play('drill', 1), setLevel(1–4), etc.

   Version: Oct 18, 2026, v1
   ===================================================================== */

// ========================= CONFIG (safe to edit) =========================
const CHEMBEATS_TRACKS2_CONFIG = {
  DRILL_BPM: 142,          // drill tempo (normal range 138–145)
  TRAP16_BPM: 140,         // throwback trap tempo (130–150)
  BOOMBAP_BPM: 90,         // calm boom-bap ('boombap'), 85–95
  BOOMBAP_UP_BPM: 100,     // gameplay boom-bap ('boombap-up')
  BOOMBAP_SWING: 58,       // MPC swing %: 50 = straight, 54–62 = laid back
  BOUNCE_BPM: 100,         // bounce tempo (95–105)
  STUTTER_BPM: 98,         // stutter tempo (90–105)
  VINYL_CRACKLE: true,     // dusty record crackle under boom-bap
  HUMANIZE: true,          // tiny random timing/volume changes on boom-bap and stutter drums
  SUB_HARMONICS: true,     // adds quiet overtones to clean subs so bass is heard on Chromebook speakers
};
// =========================================================================

(function (global) {
  'use strict';
  const CB = global.ChemBeats;
  if (!CB || !CB.addVoice) { console.warn('chembeats-tracks2: load chembeats-v1.js (v1.1 or newer) first'); return; }
  const C2 = CHEMBEATS_TRACKS2_CONFIG;
  const { mtof, osc, gn, noise, send, curve } = CB.lib;
  const RES2 = new WeakMap();
  const env = (g, t, v, a, d) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.001, t + a + d); };
  const filt = (c, type, f, q, db) => { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q != null) x.Q.value = q; if (db != null) x.gain.value = db; return x; };
  const hum = (on, amt) => (on && C2.HUMANIZE ? (Math.random() * 2 - 1) * amt : 0);

  // vinyl crackle buffer, made once per audio context
  function crackleBuf(ctx) {
    let r = RES2.get(ctx); if (r) return r;
    const sr = ctx.sampleRate, n = sr * 4, b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let s = 99; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < n; i++) {
      d[i] = (rnd() - 0.5) * 0.012;                                  // hiss
      if (rnd() < 0.0009) { const a = (rnd() - 0.5) * (rnd() < 0.1 ? 1.4 : 0.5); for (let k = 0; k < 24 && i + k < n; k++) d[i + k] += a * Math.exp(-k / 3.5); }
    }
    r = { crackle: b }; RES2.set(ctx, r); return r;
  }

  /* ------------------------------- voices ------------------------------- */
  const VO = {
    // clean sustained sub, with optional quiet overtones (missing-fundamental trick for small speakers)
    sub(b, t, p) {
      const c = b.ctx, f = mtof(p.m), dur = Math.max(0.1, p.durS || 0.5), v = (p.vel ?? 1) * 0.3;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006);
      g.gain.setValueAtTime(v, t + dur * 0.6); g.gain.linearRampToValueAtTime(v * 0.7, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
      const hs = C2.SUB_HARMONICS ? [[1, 1], [2, 0.3], [3, 0.24], [4, 0.15], [5, 0.08]] : [[1, 1]];
      hs.forEach(([h, a]) => { const o = osc(c, 'sine', f * h, t); o.connect(gn(c, a)).connect(g); o.start(t); o.stop(t + dur + 0.06); });
      g.connect(b.sub);
    },
    // drill 808: path = [[step offset, midi], ...]; glides between points (can span octaves)
    slide(b, t, p) {
      const c = b.ctx, spb = b.spb, dur = Math.max(0.1, p.durS || 0.5), v = (p.vel ?? 1) * 0.3;
      const path = p.path || [[0, p.m]], gl = (p.glide ?? 1.25) * spb;
      const setF = (prm, h) => {
        const f0 = mtof(path[0][1]) * h;
        prm.setValueAtTime(f0 * 1.7, t); prm.exponentialRampToValueAtTime(f0, t + 0.03);
        let last = t + 0.03;
        for (let i = 1; i < path.length; i++) {
          const te = t + path[i][0] * spb, ts = Math.max(last + 0.001, te - gl);
          prm.setValueAtTime(mtof(path[i - 1][1]) * h, ts); prm.exponentialRampToValueAtTime(mtof(path[i][1]) * h, te); last = te;
        }
      };
      const g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(v * 0.55, t + dur * 0.9); g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
      const o = osc(c, 'sine', 100, t); setF(o.frequency, 1);
      const sh = c.createWaveShaper(); sh.curve = curve(b.r, p.drive ?? 2.2); sh.oversample = '2x';
      o.connect(sh).connect(g);
      const o2 = osc(c, 'sine', 200, t); setF(o2.frequency, 2); o2.connect(gn(c, C2.SUB_HARMONICS ? 0.22 : 0.08)).connect(g);
      const lp = filt(c, 'lowpass', 2200);
      g.connect(lp).connect(b.sub);
      [o, o2].forEach((x) => { x.start(t); x.stop(t + dur + 0.06); });
    },
    // hard acoustic-layered snare (boom-bap): body tones + crack + room
    snareA(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 1) * 1.5, dec = p.dec || 0.22;
      const g = c.createGain(); env(g, t, v * 1.0, 0.001, dec);
      noise(b, t, dec + 0.05).connect(filt(c, 'bandpass', 2600, 0.7)).connect(g);
      const g2 = c.createGain(); env(g2, t, v * 0.45, 0.001, dec * 0.6);
      noise(b, t, dec).connect(filt(c, 'highpass', 6000)).connect(g2);
      [[185, 0.6], [330, 0.35]].forEach(([f, a]) => {
        const o = osc(c, 'triangle', f * 1.25, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
        const og = c.createGain(); env(og, t, v * a, 0.001, 0.09); o.connect(og).connect(b.drums); o.start(t); o.stop(t + 0.12);
      });
      g.connect(b.drums); g2.connect(b.drums); send(b, g, p.verb ?? 0.28, b.verbIn);
    },
    rim(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 1) * 0.7;
      const o = osc(c, 'triangle', 1700, t), g = c.createGain(); env(g, t, v, 0.0005, 0.035);
      o.connect(filt(c, 'bandpass', 1900, 3)).connect(g); o.start(t); o.stop(t + 0.05);
      const ng = c.createGain(); env(ng, t, v * 0.6, 0.0005, 0.02); noise(b, t, 0.03).connect(filt(c, 'highpass', 3000)).connect(ng).connect(b.drums);
      g.connect(b.drums); send(b, g, 0.15, b.verbIn);
    },
    snap(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 1) * 1.6, g = c.createGain(); env(g, t, v, 0.001, 0.07);
      noise(b, t, 0.1).connect(filt(c, 'bandpass', 2400, 2.5)).connect(g).connect(b.drums); send(b, g, 0.4, b.verbIn);
    },
    shaker(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 0.5) * 1.4, g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + (p.acc ? 0.008 : 0.02)); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      const pan = c.createStereoPanner(); pan.pan.value = p.pan ?? -0.3;
      noise(b, t, 0.09).connect(filt(c, 'highpass', 6500)).connect(g).connect(pan).connect(b.drums);
    },
    conga(b, t, p) { // also bongo (higher f); slap = brighter, shorter
      const c = b.ctx, f = p.f || 220, v = (p.vel ?? 1) * 0.55, dec = p.slap ? 0.07 : 0.2;
      const o = osc(c, 'sine', f * 1.3, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.02);
      const g = c.createGain(); env(g, t, v, 0.001, dec);
      const pan = c.createStereoPanner(); pan.pan.value = p.pan ?? 0.35;
      o.connect(g).connect(pan).connect(b.drums); o.start(t); o.stop(t + dec + 0.03);
      if (p.slap) { const ng = c.createGain(); env(ng, t, v * 0.8, 0.001, 0.04); noise(b, t, 0.05).connect(filt(c, 'bandpass', 2000, 1.2)).connect(ng).connect(pan); }
      send(b, g, 0.15, b.verbIn);
    },
    cowbell(b, t, p) { // 808-style
      const c = b.ctx, v = (p.vel ?? 1) * 0.28, g = c.createGain(); env(g, t, v, 0.001, 0.25);
      const bp = filt(c, 'bandpass', 900, 1.5);
      [540, 800].forEach((f) => { const o = osc(c, 'square', f, t); o.connect(bp); o.start(t); o.stop(t + 0.3); });
      bp.connect(g).connect(b.drums);
    },
    tom(b, t, p) {
      const c = b.ctx, f = p.f || 140, v = (p.vel ?? 1) * 0.7;
      const o = osc(c, 'sine', f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      const g = c.createGain(); env(g, t, v, 0.001, 0.3); o.connect(g).connect(b.drums); o.start(t); o.stop(t + 0.35); send(b, g, 0.2, b.verbIn);
    },
    crash(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 1) * 0.3, g = c.createGain(); env(g, t, v, 0.002, 1.6);
      noise(b, t, 1.7).connect(filt(c, 'highpass', 4500)).connect(g).connect(b.drums);
      const s = c.createBufferSource(); s.buffer = b.r.hatO; s.playbackRate.value = 0.7;
      s.connect(gn(c, v * 1.5)).connect(b.drums); s.start(t); send(b, g, 0.4, b.verbIn);
    },
    crackle(b, t, p) {
      const c = b.ctx, s = c.createBufferSource(), buf = crackleBuf(c).crackle;
      s.buffer = buf; s.connect(filt(c, 'bandpass', 3000, 0.4)).connect(gn(c, (p.vel ?? 1) * 1.5)).connect(b.out);
      const dur = Math.min(3.9, p.durS || 2); s.start(t, Math.random() * (4 - dur), dur);
    },
    scratch(b, t, p) { // "wicka" baby scratch: pitch swept forward/back, gated
      const c = b.ctx, dur = p.durS || 0.4, v = (p.vel ?? 1) * 0.8, n = p.n || 2, base = mtof(p.m || 62);
      const o = osc(c, 'sawtooth', base, t), g = c.createGain(), bp = filt(c, 'bandpass', 1400, 1.5);
      g.gain.setValueAtTime(0, t);
      for (let k = 0; k < n; k++) {
        const a = t + (k / n) * dur, m = a + dur / n / 2, e = a + dur / n;
        o.frequency.setValueAtTime(base * 0.6, a); o.frequency.exponentialRampToValueAtTime(base * 1.8, m); o.frequency.exponentialRampToValueAtTime(base * 0.5, e - 0.005);
        g.gain.setValueAtTime(v, a + 0.004); g.gain.setValueAtTime(v * 0.9, e - 0.012); g.gain.linearRampToValueAtTime(0, e - 0.004);
      }
      const ng = c.createGain(); ng.gain.value = 0.25; noise(b, t, dur).connect(ng).connect(bp);
      o.connect(bp).connect(g).connect(b.music); o.start(t); o.stop(t + dur + 0.02);
    },
    rhodes(b, t, p) { // electric piano: FM tine + tremolo
      const c = b.ctx, dur = p.durS || 1.5, v = (p.vel ?? 1) * 0.2;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005);
      g.gain.exponentialRampToValueAtTime(v * 0.35, t + 0.6); g.gain.setValueAtTime(v * 0.35, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.2);
      const trem = c.createGain(); trem.gain.value = 0.85; const lfo = osc(c, 'sine', 4.5, t); lfo.connect(gn(c, 0.15)).connect(trem.gain);
      p.ms.forEach((m) => {
        const f = mtof(m), o = osc(c, 'sine', f, t), mo = osc(c, 'sine', f, t), mg = c.createGain();
        mg.gain.setValueAtTime(f * 1.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.3);
        mo.connect(mg).connect(o.frequency); o.connect(g);
        [o, mo].forEach((x) => { x.start(t); x.stop(t + dur + 0.25); });
      });
      g.connect(trem).connect(b.music); send(b, trem, 0.3, b.verbIn);
      lfo.start(t); lfo.stop(t + dur + 0.25);
    },
    upbass(b, t, p) { // upright-ish bass: plucked, round
      const c = b.ctx, f = mtof(p.m), dur = p.durS || 0.4, v = (p.vel ?? 1) * 0.55;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.2);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(v * 0.3, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
      [['triangle', 1, 1], ['sine', 2, 0.25]].forEach(([ty, h, a]) => { const o = osc(c, ty, f * h, t); o.connect(gn(c, a)).connect(lp); o.start(t); o.stop(t + dur + 0.08); });
      lp.connect(g).connect(b.sub);
    },
    flute(b, t, p) {
      const c = b.ctx, f = mtof(p.m), dur = Math.max(0.12, p.durS || 0.4), v = (p.vel ?? 1) * 0.12;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.05); g.gain.setValueAtTime(v * 0.9, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.12);
      const o = osc(c, 'sine', f, t), vib = osc(c, 'sine', 5.2, t), vg = c.createGain();
      vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + 0.25); vib.connect(vg).connect(o.frequency);
      const o2 = osc(c, 'triangle', f * 2, t); o2.connect(gn(c, 0.12)).connect(g);
      o.connect(g);
      const ng = c.createGain(); ng.gain.value = 0.06; noise(b, t, dur + 0.1).connect(filt(c, 'bandpass', f * 2, 2)).connect(ng).connect(g);
      g.connect(b.music); send(b, g, 0.35, b.verbIn); send(b, g, 0.15, b.dlyIn);
      [o, vib, o2].forEach((x) => { x.start(t); x.stop(t + dur + 0.15); });
    },
    keys(b, t, p) { // dark piano
      const c = b.ctx, f = mtof(p.m), v = (p.vel ?? 1) * 0.16, dec = p.dec || 1.4;
      const g = c.createGain(); env(g, t, v, 0.003, dec);
      const o = osc(c, 'triangle', f, t), o2 = osc(c, 'sine', f * 2, t), mo = osc(c, 'sine', f * 2, t), mg = c.createGain();
      mg.gain.setValueAtTime(f * 0.9, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.4); mo.connect(mg).connect(o.frequency);
      o.connect(g); o2.connect(gn(c, 0.18)).connect(g);
      g.connect(b.music); send(b, g, 0.35, b.verbIn); send(b, g, 0.2, b.dlyIn);
      [o, o2, mo].forEach((x) => { x.start(t); x.stop(t + dec + 0.05); });
    },
    brass(b, t, p) { // orchestral horn stab
      const c = b.ctx, dur = p.durS || 0.3, v = (p.vel ?? 1) * 0.06;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
      lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(2600, t + 0.06); lp.frequency.exponentialRampToValueAtTime(1200, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.03); g.gain.setValueAtTime(v * 0.8, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.15);
      p.ms.forEach((m) => [-7, 0, 7].forEach((dt) => { const o = osc(c, 'sawtooth', mtof(m), t); o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + dur + 0.2); }));
      lp.connect(g).connect(b.music); send(b, g, 0.35, b.verbIn);
    },
    clav(b, t, p) {
      const c = b.ctx, v = (p.vel ?? 1) * 0.35, dec = p.durS || 0.14, ms = p.ms || [p.m];
      const bp = c.createBiquadFilter(); bp.type = 'lowpass'; bp.Q.value = 6;
      bp.frequency.setValueAtTime(4200, t); bp.frequency.exponentialRampToValueAtTime(1100, t + dec);
      const hp = filt(c, 'highpass', 220); hp.connect(bp);
      const g = c.createGain(); env(g, t, v, 0.001, dec);
      ms.forEach((m) => [['square', 0], ['sawtooth', 5]].forEach(([ty, dt]) => { const o = osc(c, ty, mtof(m), t); o.detune.value = dt; o.connect(hp); o.start(t); o.stop(t + dec + 0.03); }));
      const pan = c.createStereoPanner(); pan.pan.value = p.pan ?? 0.2;
      bp.connect(g).connect(pan).connect(b.music); send(b, g, 0.12, b.verbIn); send(b, g, 0.15, b.dlyIn);
    },
    synbass(b, t, p) { // analog mono bass, resonant filter envelope (no 808 glides)
      const c = b.ctx, f = mtof(p.m), dur = Math.max(0.08, p.durS || 0.25), v = (p.vel ?? 1) * 0.24;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = p.q ?? 7;
      lp.frequency.setValueAtTime(p.open || 2200, t); lp.frequency.exponentialRampToValueAtTime(260, t + Math.min(0.18, dur));
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.setValueAtTime(v * 0.8, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
      [['sawtooth', 0, 0.6], ['square', -6, 0.4], ['sine', 0, 0.8]].forEach(([ty, dt, a]) => { const o = osc(c, ty, f, t); o.detune.value = dt; o.connect(gn(c, a)).connect(lp); o.start(t); o.stop(t + dur + 0.05); });
      lp.connect(g).connect(b.sub);
    },
    whistle(b, t, p) { // bounce-style synth lead with slight portamento + vibrato
      const c = b.ctx, f = mtof(p.m), dur = Math.max(0.1, p.durS || 0.3), v = (p.vel ?? 1) * 0.11;
      const o = osc(c, 'square', f, t), o2 = osc(c, 'sine', f * 2, t);
      if (p.from != null) { [o, o2].forEach((x, k) => { x.frequency.setValueAtTime(mtof(p.from) * (k + 1), t); x.frequency.exponentialRampToValueAtTime(f * (k + 1), t + 0.04); }); }
      const vib = osc(c, 'sine', 6, t); vib.connect(gn(c, f * 0.008)).connect(o.frequency);
      const lp = filt(c, 'lowpass', 3500, 1);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.setValueAtTime(v * 0.85, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
      o.connect(lp); o2.connect(gn(c, 0.35)).connect(lp); lp.connect(g).connect(b.music);
      send(b, g, 0.2, b.verbIn); send(b, g, 0.25, b.dlyIn);
      [o, o2, vib].forEach((x) => { x.start(t); x.stop(t + dur + 0.08); });
    },
    bb(b, t, p) { // beatbox: k = 'b' (kick) | 'pf' (snare) | 'k' (click) | 'ts' (hat)
      const c = b.ctx, v = p.vel ?? 1, k = p.k || 'ts';
      if (k === 'b') {
        const o = osc(c, 'sine', 120, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.06);
        const g = c.createGain(); env(g, t, v * 0.8, 0.002, 0.16); o.connect(g).connect(b.drums); o.start(t); o.stop(t + 0.2);
        const ng = c.createGain(); env(ng, t, v * 0.9, 0.001, 0.025); noise(b, t, 0.04).connect(filt(c, 'lowpass', 500)).connect(ng).connect(b.drums);
      } else if (k === 'pf') {
        const pg = c.createGain(); env(pg, t, v * 0.6, 0.001, 0.015); noise(b, t, 0.03).connect(filt(c, 'lowpass', 900)).connect(pg).connect(b.drums);
        const g = c.createGain(); env(g, t, v * 1.4, 0.012, 0.13);
        noise(b, t, 0.18).connect(filt(c, 'bandpass', 1700, 0.9)).connect(filt(c, 'peaking', 3200, 2, 6)).connect(g).connect(b.drums);
        send(b, g, 0.15, b.verbIn);
      } else if (k === 'k') {
        const g = c.createGain(); env(g, t, v * 1.1, 0.0005, 0.03); noise(b, t, 0.04).connect(filt(c, 'bandpass', 3400, 4)).connect(g).connect(b.drums);
      } else {
        const g = c.createGain(), d = p.long ? 0.16 : 0.06; env(g, t, v * 0.9, 0.006, d);
        const pan = c.createStereoPanner(); pan.pan.value = p.pan ?? 0.2;
        noise(b, t, d + 0.03).connect(filt(c, 'highpass', 5500)).connect(filt(c, 'peaking', 7500, 3, 6)).connect(g).connect(pan).connect(b.drums);
      }
    },
  };
  Object.keys(VO).forEach((k) => CB.addVoice(k, VO[k]));

  // helpers for track patterns
  function mk() { const ev = []; return { ev, add: (s, v, p) => ev.push(Object.assign({ s, v }, p || {})) }; }
  function roller(add) { // hat roll: n hits from step s over len steps
    return (s, len, per, p0, p1, vel = 0.45, voice = 'hat', extra = {}) => {
      const n = Math.round(len * per);
      for (let j = 0; j < n; j++) add(s + j / per, voice, Object.assign({ vel: vel * (0.55 + 0.45 * j / n), pitch: p0 + (p1 - p0) * (n > 1 ? j / (n - 1) : 0), pan: j % 2 ? -0.25 : 0.25 }, extra));
    };
  }

  /* ===================== Track 3: Glide Reaction (drill) =====================
     G harmonic minor with a flat-2 color: Gm – Gm – E♭ – D. Half-time.
     Snare on beat 3 in bars 1 and 3; pushed to 3& (bar 2) and to 4 (bar 4). */
  const DR = {
    roots: [43, 43, 39, 38],
    pad: [[55, 58, 62], [55, 58, 63], [55, 58, 63], [54, 57, 62]],
    snare: [[8], [10], [8], [12, 15]],
    // 808: [step, length, path [[offset, midi], ...]]  (≥ +13 semitones = multi-octave, used at level 3+)
    b808: [
      [[0, 5, [[0, 43]]], [6, 4, [[0, 43], [3, 55]]], [10, 6, [[0, 55], [3, 43]]]],
      [[0, 5, [[0, 43]]], [6, 3, [[0, 46]]], [9, 7, [[0, 46], [3, 70], [6, 43]]]],
      [[0, 5, [[0, 39]]], [6, 4, [[0, 39], [3, 51]]], [10, 6, [[0, 51], [3, 39], [5, 41]]]],
      [[0, 5, [[0, 38]]], [6, 3, [[0, 38]]], [9, 7, [[0, 38], [3, 62], [6, 38]]]],
    ],
    mel: [
      [[0, 74], [3, 75], [6, 74], [8, 70], [11, 67], [14, 68]],
      [[0, 67], [3, 70], [6, 74], [10, 75], [12, 74]],
      [[0, 75], [3, 74], [6, 70], [8, 67], [11, 70], [14, 72]],
      [[0, 74], [3, 72], [6, 70], [8, 66], [11, 69], [14, 66]],
    ],
  };
  CB.addTrack({
    id: 'drill', name: 'Glide Reaction', bpm: () => C2.DRILL_BPM, filter: [1000, 2200, 6000, 14000], endChord: [55, 58, 62],
    bar(i, L, f) {
      const { ev, add } = mk(), k = i % 4, R = DR.roots[k], roll = roller(add);
      if (f.enter) add(0, 'impact');
      // kick: sparse, layered with the 808
      add(0, 'kick', { vel: 1.1, lo: 44, dec: 0.25 });
      if (L >= 2 && !f.fill && k % 2 === 1) add(13, 'kick', { vel: 0.8, lo: 44, dec: 0.2 });
      // snares: delayed, sliding bounce
      if (f.fill) { [8, 9, 10, 11, 12, 13, 14, 14.67, 15.33].forEach((s, j) => add(s, 'snare', { vel: 0.4 + j * 0.07, pitch: 210 + j * 15, dec: 0.1 })); add(0, 'riser', { dur: 16 }); }
      else {
        DR.snare[k].forEach((s, j) => { add(s, 'clap', { vel: j ? 0.6 : 1 }); add(s, 'snare', { vel: j ? 0.3 : 0.55 }); });
        if (L >= 3 && k === 1) add(9, 'snare', { vel: 0.3, dec: 0.08 });          // stutter before the late snare
        if (L >= 2) [6, 14].forEach((s) => add(s, 'rim', { vel: 0.6 }));
      }
      // 808 slides (one octave max below level 3)
      if (L === 1) { add(0, 'slide', { path: [[0, R]], dur: 10 }); if (!f.fill) add(12, 'slide', { path: [[0, R]], dur: 4 }); }
      else DR.b808[k].forEach(([s, d, path]) => {
        if (f.fill && s >= 8) return;
        const pp = path.map(([o, m]) => [o, L < 3 && m > R + 12 ? m - 12 : m]);
        add(s, 'slide', { path: pp, dur: d, drive: L >= 4 ? 3 : 2.2 });
      });
      if (f.fill) add(8, 'slide', { path: [[0, R], [6, R + 24]], dur: 8, glide: 5 });   // two-octave climb into the next level
      // hats: 3-3-2 grouping; triplet rolls at L3+
      const busy = [];
      if (f.fill) { roll(8, 8, 3, 0, 12, 0.45); busy.push([8, 16]); }
      else if (L >= 3) {
        const r = [[6, 2, 1.5, 0, 0], [14, 2, 3, 0, 7], [10, 2, 1.5, 0, 0], [12, 4, 3, 7, -5]][k];
        roll(r[0], r[1], r[2], r[3], r[4]); busy.push([r[0], r[0] + r[1]]);
        if (L >= 4 && k % 2 === 0) { roll(3, 1, 3, 12, 0, 0.35); busy.push([3, 4]); }
      }
      const free = (s) => !busy.some(([a, b]) => s >= a && s < b);
      const hs = L === 1 ? [0, 4, 8, 12] : [0, 3, 6, 8, 11, 14];
      hs.forEach((s) => free(s) && add(s, 'hat', { vel: s % 8 === 0 ? 0.85 : 0.62, pan: s % 2 ? -0.2 : 0.2 }));
      if (L >= 2) [2, 10].forEach((s) => free(s) && add(s, 'hat', { vel: 0.38 }));
      // harmony + melody
      add(0, 'pad', { ms: DR.pad[k], dur: 16, vel: L >= 3 ? 0.55 : 0.9 });
      if (L >= 3) DR.mel[k].forEach(([s, m]) => { if (!(f.fill && s >= 8)) { add(s, 'keys', { m, vel: 0.9 }); if (L >= 4) add(s, 'keys', { m: m + 12, vel: 0.3, dec: 0.8 }); } });
      if (L >= 4 && !f.fill) add(0, 'vox', { m: DR.pad[k][2] - 12, vow: 'oh', dur: 6, vel: 0.5 });
      return ev;
    },
  });

  /* ================== Track 4: Throwback Trap (2014–16 style) ==================
     A minor: Am – F – Dm – E. Clean sub ONLY on root kicks; claps rigid on beat 3
     (2 and 4 at level 4). Bells in quarter-note triplets = triplet-over-duple. */
  const TT = {
    roots: [33, 29, 38, 40],
    ch: [[69, 72, 76], [69, 72, 77], [69, 74, 77], [68, 71, 76]],
    kicks: [[0, 7, 10], [0, 3, 10, 14], [0, 7, 10], [0, 6, 10, 11]],
    brass: [[[0, 3], [6, 2], [10, 4]], [[0, 3], [3, 3], [8, 6]], [[0, 3], [6, 2], [10, 4]], [[0, 2], [3, 2], [6, 2], [11, 5]]],
  };
  CB.addTrack({
    id: 'trap16', name: 'Throwback Trap', bpm: () => C2.TRAP16_BPM, filter: [1100, 2400, 6000, 14000], endChord: [57, 60, 64],
    bar(i, L, f) {
      const { ev, add } = mk(), k = i % 4, R = TT.roots[k], roll = roller(add), dbl = L >= 4;
      if (f.enter) add(0, 'impact');
      // kick + sub locked together (sub holds until the next kick)
      let kicks = L === 1 ? [0, 10] : TT.kicks[k];
      if (f.fill) kicks = kicks.filter((s) => s < 8);
      kicks.forEach((s, j) => {
        const nx = j + 1 < kicks.length ? kicks[j + 1] : 16;
        add(s, 'kick', { vel: s === 0 ? 1.15 : 1, lo: 44, dec: 0.24 });
        add(s, 'sub', { m: R, dur: nx - s - 0.15 });
      });
      // claps: rigid
      if (f.fill) { [8, 10, 12, 13, 14, 15].forEach((s, j) => add(s, 'clap', { vel: 0.45 + j * 0.1, dec: 0.1 })); add(0, 'riser', { dur: 16, vel: 0.8 }); }
      else (dbl ? [4, 12] : [8]).forEach((s) => add(s, 'clap'));
      // hats: straight 16ths, straight 1/32 rolls (no pitch bend), triplet hats at L4
      const busy = [];
      if (f.fill) { roll(8, 8, 2, 0, 0, 0.45); busy.push([8, 16]); }
      else if (L >= 3 && k % 2 === 1) { roll(12, 4, 2, 0, 0, 0.45); busy.push([12, 16]); }
      else if (L >= 3 && k === 2) { roll(6, 2, 2, 0, 0, 0.4); busy.push([6, 8]); }
      if (dbl && k === 0 && !f.fill) { roll(8, 8, 0.75, 0, 0, 0.6); busy.push([8, 16]); }   // 8th-note triplets over the duple grid
      const free = (s) => !busy.some(([a, b]) => s >= a && s < b);
      for (let s = 0; s < 16; s += (L === 1 ? 2 : 1)) if (free(s)) add(s, 'hat', { vel: s % 4 === 0 ? 0.55 : (s % 2 ? 0.3 : 0.45), pan: s % 2 ? -0.15 : 0.15 });
      if (dbl && k % 2 === 1 && free(6)) add(6, 'hat', { open: true, vel: 0.4 });
      // bells in quarter-note triplets (6 per bar)
      const arp = [TT.ch[k][0] + 12, TT.ch[k][2], TT.ch[k][1], TT.ch[k][0], TT.ch[k][1], TT.ch[k][2]];
      for (let j = 0; j < 6; j++) { const s = j * 16 / 6; if (!(f.fill && s >= 8)) add(s, 'bell', { m: arp[j], vel: L >= 3 ? 0.55 : 0.8 }); }
      add(0, 'pad', { ms: TT.ch[k].map((m) => m - 12), dur: 16, vel: L >= 3 ? 0.5 : 0.8 });
      // brass stabs (L3+), octave doubled at L4
      if (L >= 3) TT.brass[k].forEach(([s, d]) => {
        if (f.fill && s >= 8) return;
        const ms = TT.ch[k].map((m) => m - 12);
        add(s, 'brass', { ms, dur: d * 0.8 });
        if (dbl) add(s, 'brass', { ms: [ms[0] - 12], dur: d * 0.8, vel: 0.8 });
      });
      return ev;
    },
  });

  /* ==================== Track 5: Boom-Bap Beaker (90s/early 2000s) ====================
     F minor jazz loop: Fm9 – E♭maj9 – D♭maj9 – C7(♭9). Standard time, MPC swing on 16ths,
     snare a hair behind the beat. Two tempos: 'boombap' (calm) and 'boombap-up' (gameplay). */
  const BB = {
    roots: [41, 39, 37, 36],
    ch: [[56, 60, 63, 67], [55, 58, 62, 65], [53, 56, 60, 63], [52, 55, 58, 61]],
    kick: [[0, 7, 10], [0, 6, 10, 15], [0, 7, 10], [0, 2, 10, 11]],
    bass: [[[0, 41, 3], [7, 41, 2], [10, 48, 2], [14, 46, 2]], [[0, 39, 3], [6, 39, 2], [10, 46, 3], [15, 37, 1]],
           [[0, 37, 3], [7, 37, 2], [10, 44, 2], [14, 39, 2]], [[0, 36, 3], [2, 36, 2], [10, 43, 1], [11, 40, 3], [14, 41, 2]]],
    flute: [[[0, 84, 3], [3, 82, 1], [4, 80, 4], [10, 77, 2], [12, 80, 4]], [[0, 82, 3], [3, 79, 1], [4, 77, 6], [12, 75, 4]],
            [[0, 80, 3], [3, 77, 1], [4, 75, 2], [6, 77, 2], [8, 80, 6], [14, 84, 2]], [[0, 82, 4], [4, 79, 2], [6, 76, 6], [12, 77, 4]]],
  };
  function boombapBar(i, L, f) {
    const { ev, add: raw } = mk(), k = i % 4;
    const sw = (C2.BOOMBAP_SWING - 50) / 50;                       // odd-16th delay, in steps
    const add = (s, v, p, drum) => raw(Math.max(0, s + ((Math.round(s * 4) % 8) === 4 ? sw : 0) + hum(drum, 0.03)), v, Object.assign({}, p, p && p.vel != null ? { vel: p.vel * (1 + hum(drum, 0.08)) } : {}));
    if (f.enter) add(0, 'crash', { vel: 0.8 });
    if (C2.VINYL_CRACKLE) raw(0, 'crackle', { dur: 16, vel: L === 1 ? 1 : 0.7 });
    // kick: heavy on 1, syncopated double kicks
    const kk = f.fill ? [0, 7] : BB.kick[k];
    kk.forEach((s) => add(s, 'kick', { vel: s === 0 ? 1.2 : 0.95, hi: 120, lo: 48, dec: 0.42 }, true));
    // snare: hard on 2 and 4, slightly late
    add(4.06, 'snareA', { vel: 1 }, true);
    if (f.fill) {
      [8, 10, 11, 12, 13, 14, 15].forEach((s, j) => add(s + 0.06, 'snareA', { vel: 0.45 + j * 0.08, dec: 0.12 }, true));
      add(8, 'kick', { vel: 1, hi: 120, lo: 48, dec: 0.35 }, true);
      add(12, 'scratch', { m: 62, dur: 4, n: 4, vel: 0.9 });
    } else add(12.06, 'snareA', { vel: 1 }, true);
    // ghost snares + rimshots (L3+)
    if (L >= 3 && !f.fill) { add(7, 'snareA', { vel: 0.18, dec: 0.08, verb: 0 }, true); add(15, 'snareA', { vel: 0.22, dec: 0.08, verb: 0 }, true); add(k % 2 ? 9 : 3, 'rim', { vel: 0.9 }, true); }
    // hats: swung 8ths at L2, swung 16ths at L3+, open hat at L4
    if (L >= 2) for (let s = 0; s < (f.fill ? 8 : 16); s += (L >= 3 ? 1 : 2)) add(s, 'hat', { vel: s % 4 === 2 ? 0.8 : (s % 2 ? 0.4 : 0.62), pan: 0.25 }, true);
    if (L >= 4 && !f.fill) add(14, 'hat', { open: true, vel: 0.4 }, true);
    if (L >= 3 && !f.fill) for (let s = 0; s < 16; s += 2) add(s + 1, 'shaker', { vel: 0.3 }, true);
    // keys: Rhodes chord on 1, re-hit on 2a (swung)
    add(0, 'rhodes', { ms: BB.ch[k], dur: 9, vel: L === 1 ? 1 : 0.85 });
    if (!f.fill) add(10, 'rhodes', { ms: BB.ch[k], dur: 5, vel: 0.6 });
    // bass (L2+)
    if (L === 1) add(0, 'upbass', { m: BB.roots[k], dur: 8, vel: 0.8 });
    else BB.bass[k].forEach(([s, m, d]) => { if (!(f.fill && s >= 8)) add(s, 'upbass', { m, dur: d }); });
    // flute line (L3+)
    if (L >= 3) BB.flute[k].forEach(([s, m, d]) => { if (!(f.fill && s >= 8)) add(s, 'flute', { m, dur: d, vel: L >= 4 ? 0.85 : 1 }); });
    // scratches (L4)
    if (L >= 4 && !f.fill && k === 3) { add(12, 'scratch', { m: 60, dur: 2, n: 2 }); add(14, 'scratch', { m: 64, dur: 2, n: 3 }); }
    if (L >= 4 && !f.fill && k === 1) add(14, 'scratch', { m: 58, dur: 2, n: 2, vel: 0.7 });
    return ev;
  }
  CB.addTrack({ id: 'boombap', name: 'Boom-Bap Beaker', bpm: () => C2.BOOMBAP_BPM, filter: [1600, 2400, 3800, 8000], endChord: [56, 60, 63, 67], bar: boombapBar });
  CB.addTrack({ id: 'boombap-up', name: 'Boom-Bap Beaker+', bpm: () => C2.BOOMBAP_UP_BPM, filter: [1600, 2400, 3800, 8000], endChord: [56, 60, 63, 67], bar: boombapBar });

  /* ====================== Track 6a: Bayou Bounce (New Orleans bounce) ======================
     D minor: Dm – Dm – B♭ – C. 808 machine drums, syncopated snare rolls, shakers, congas,
     analog synth bass, call-and-response vocal chops. */
  const BO = {
    roots: [38, 38, 34, 36],
    bass: [[[0, 38, 2], [3, 50, 1], [6, 38, 2], [10, 41, 1], [11, 43, 2], [14, 45, 2]],
           [[0, 38, 2], [3, 50, 1], [6, 38, 2], [10, 45, 1], [11, 43, 2], [14, 41, 2]],
           [[0, 34, 2], [3, 46, 1], [6, 34, 2], [10, 38, 1], [11, 41, 2], [14, 43, 2]],
           [[0, 36, 2], [3, 48, 1], [6, 36, 2], [10, 40, 1], [11, 43, 2], [14, 48, 2]]],
    hook: [[[0, 81], [2, 79], [3, 77], [6, 74], [8, 77], [10, 79], [11, 77], [14, 74]],
           [[0, 81], [2, 79], [3, 77], [6, 74], [8, 72], [10, 74], [12, 77]],
           [[0, 82], [2, 81], [3, 77], [6, 74], [8, 77], [10, 82], [12, 81], [14, 77]],
           [[0, 79], [2, 77], [3, 76], [6, 72], [8, 76], [10, 79], [12, 84]]],
    congas: [[0, 330, 1], [3, 220], [6, 220], [7, 330, 1], [10, 220], [12, 330, 1], [14, 220], [15, 260]],
  };
  CB.addTrack({
    id: 'bounce', name: 'Bayou Bounce', bpm: () => C2.BOUNCE_BPM, filter: [1400, 2600, 6000, 14000], endChord: [62, 65, 69],
    bar(i, L, f) {
      const { ev, add } = mk(), k = i % 4, roll = roller(add);
      if (f.enter) { add(0, 'crash', { vel: 0.9 }); add(0, 'kick', { vel: 1.2, hi: 110, lo: 42, dec: 0.6 }); }
      // 808-machine kick (boomy) + snare on 2 and 4, syncopated extras
      (f.fill ? [0, 7] : [0, 7, 10]).forEach((s) => add(s, 'kick', { vel: 1.1, hi: 110, lo: 42, dec: 0.5 }));
      add(4, 'snare', { vel: 0.9, pitch: 230, dec: 0.18 }); add(4, 'clap', { vel: 0.7 });
      if (f.fill) {
        roll(8, 8, 2, 0, 0, 0.9, 'snare', { dec: 0.07 });                           // classic bounce 1/32 snare roll
        [8, 10, 12, 14].forEach((s, j) => add(s, 'tom', { f: 200 - j * 30 }));
      } else {
        add(12, 'snare', { vel: 0.9, pitch: 230, dec: 0.18 }); add(12, 'clap', { vel: 0.7 });
        if (L >= 2) { add(k % 2 ? 15 : 6, 'snare', { vel: 0.45, pitch: 240, dec: 0.1 }); if (k === 3) add(14, 'snare', { vel: 0.5, dec: 0.1 }); }
        if (L >= 3 && k === 1) roll(13, 3, 1.5, 0, 0, 0.7, 'snare', { dec: 0.07 });   // 16th-triplet roll into beat 1
        if (L >= 3 && k === 3) roll(12, 4, 1, 0, 0, 0.75, 'snare', { dec: 0.08 });
        if (L >= 4 && k === 3) [13, 14, 15].forEach((s, j) => add(s, 'tom', { f: 190 - j * 35, vel: 0.6 }));
        if (L >= 4 && k === 1) roll(8, 1, 3, 0, 0, 0.5, 'snare', { dec: 0.05 });
      }
      // hats 8ths (L1) → 16ths (L3); shaker 16ths (L2+); cowbell + congas (L3+)
      for (let s = 0; s < (f.fill ? 8 : 16); s += (L >= 3 ? 1 : 2)) add(s, 'hat', { vel: s % 2 ? 0.4 : 0.6 });
      if (L >= 2 && !f.fill) for (let s = 0; s < 16; s++) add(s, 'shaker', { vel: s % 4 === 2 ? 0.55 : 0.3, acc: s % 4 === 2 });
      if (L >= 3 && !f.fill) { BO.congas.forEach(([s, fr, slap]) => add(s, 'conga', { f: fr, slap: !!slap, vel: 0.8 })); add(k % 2 ? 6 : 2, 'cowbell', { vel: 0.7 }); }
      // analog bass
      if (L === 1) { add(0, 'synbass', { m: BO.roots[k], dur: 3 }); add(8, 'synbass', { m: BO.roots[k], dur: 3 }); }
      else BO.bass[k].forEach(([s, m, d]) => { if (!(f.fill && s >= 8)) add(s, 'synbass', { m, dur: d, q: 6 }); });
      // synth hook (L3+), octave-up double at L4
      if (L >= 3) BO.hook[k].forEach(([s, m], j, a) => {
        if (f.fill && s >= 8) return;
        const d = (j + 1 < a.length ? a[j + 1][0] : 16) - s;
        add(s, 'whistle', { m, dur: d * 0.8, from: j ? a[j - 1][1] : null });
        if (L >= 4) add(s, 'whistle', { m: m + 12, dur: d * 0.6, vel: 0.35 });
      });
      else add(0, 'stab', { ms: [BO.roots[k] + 24, BO.roots[k] + 27 + (k >= 2 ? 1 : 0), BO.roots[k] + 31], dur: 2 });
      // call-and-response chops (L4)
      if (L >= 4 && !f.fill) { add(6, 'vox', { m: 62, vow: 'eh', dur: 1.5 }); add(14, 'vox', { m: k % 2 ? 65 : 62, vow: 'ah', dur: 1.5 }); }
      return ev;
    },
  });

  /* ================= Track 6b: Stutter Catalyst (Neptunes / Timbaland style) =================
     E dorian: Em7 – A9 – Em7 – Cmaj9. Sparse syncopation, triplet stutter kicks, beatbox kit,
     clav riff, squelchy analog bass, Neptunes-style 4-count claps at level 4. */
  const ST = {
    roots: [40, 45, 40, 36],
    ch: [[62, 64, 67, 71], [61, 64, 67, 71], [62, 64, 67, 71], [59, 64, 67, 71]],
    clav: [[[0, 64], [3, 64], [5, 67], [6, 69], [8, 64], [11, 71], [12, 69], [14, 67]],
           [[0, 69], [3, 69], [5, 73], [6, 71], [8, 69], [11, 67], [12, 64], [14, 67]],
           [[0, 64], [3, 64], [5, 67], [6, 69], [8, 71], [10, 74], [11, 71], [14, 69]],
           [[0, 64], [2, 67], [3, 71], [6, 72], [8, 71], [10, 67], [11, 64], [14, 62]]],
    bass: [[[0, 40, 3], [6, 40, 1], [7, 43, 2], [10, 45, 2], [14, 47, 1]],
           [[0, 45, 3], [6, 45, 1], [7, 43, 2], [10, 40, 2], [13, 43, 2]],
           [[0, 40, 3], [6, 40, 1], [7, 43, 2], [10, 45, 2], [14, 50, 1]],
           [[0, 36, 3], [6, 36, 1], [7, 40, 2], [10, 43, 2], [14, 47, 2]]],
    kicks: [[0, 7, 10], [0, 7, 10, 13.33, 14.67], [0, 3, 7, 10], [0, 7, 9.33, 10.67, 14]],
    bongo: [[2, 400], [3, 300], [6, 400, 1], [9, 300], [11, 400], [13, 300, 1], [14, 400]],
  };
  CB.addTrack({
    id: 'stutter', name: 'Stutter Catalyst', bpm: () => C2.STUTTER_BPM, filter: [1500, 2800, 6500, 14000], endChord: [64, 67, 71, 74],
    bar(i, L, f) {
      const { ev, add: raw } = mk(), k = i % 4, roll = roller(raw);
      const add = (s, v, p, h) => raw(Math.max(0, s + hum(h, 0.025)), v, p);
      if (f.enter) { add(0, 'crash', { vel: 0.7 }); add(0, 'bb', { k: 'b', vel: 1.2 }); }
      // kicks: plain at L1–2, triplet stutters at L3+
      let kk = L >= 3 ? ST.kicks[k] : [0, 7, 10];
      if (f.fill) kk = [0, 7];
      kk.forEach((s) => { add(s, 'kick', { vel: s % 1 ? 0.75 : 1, hi: 140, lo: 50, dec: 0.22 }); if (s === 0) add(s, 'bb', { k: 'b', vel: 0.6 }); });
      // backbeat: rim + beatbox snare
      if (f.fill) {
        [8, 9, 10, 11, 12, 12.67, 13.33, 14, 14.67, 15.33].forEach((s, j) => add(s, 'bb', { k: j % 2 ? 'k' : 'pf', vel: 0.5 + j * 0.05 }));
        raw(0, 'riser', { dur: 16, vel: 0.6 });
      } else [4, 12].forEach((s) => { add(s, 'rim', { vel: 0.8 }); if (L >= 2) add(s, 'bb', { k: 'pf', vel: 0.9 }); });
      if (L >= 3 && !f.fill) { [4, 12].forEach((s) => add(s, 'snap', { vel: 0.8 })); [3, 11, 15].forEach((s) => add(s, 'bb', { k: 'k', vel: 0.6 }, true)); }
      if (L >= 4 && !f.fill) [0, 4, 8, 12].forEach((s) => add(s, 'clap', { vel: s % 8 ? 0.8 : 0.55, dec: 0.12 }));   // 4-count claps
      // beatbox "ts" hats: 8ths, then 16ths; 16th-triplet stutters at L4
      const busy = [];
      if (L >= 4 && !f.fill && k % 2 === 1) { roll(12, 4, 1.5, 0, 0, 0.6, 'bb', { k: 'ts' }); busy.push([12, 16]); }
      for (let s = 0; s < (f.fill ? 8 : 16); s += (L >= 3 ? 1 : 2)) if (!busy.some(([a, b]) => s >= a && s < b)) add(s, 'bb', { k: 'ts', vel: s % 4 === 2 ? 0.75 : 0.4, long: s % 8 === 6, pan: s % 2 ? -0.25 : 0.25 }, true);
      // bongos (L2+)
      if (L >= 2 && !f.fill) ST.bongo.forEach(([s, fr, slap]) => add(s, 'conga', { f: fr, slap: !!slap, vel: 0.65, pan: -0.35 }, true));
      // bass (L2+)
      if (L === 1) add(0, 'synbass', { m: ST.roots[k], dur: 4, q: 9, open: 1600 });
      else ST.bass[k].forEach(([s, m, d]) => { if (!(f.fill && s >= 8)) add(s, 'synbass', { m, dur: d, q: 10, open: 2800 }); });
      // clav: sparse at L1–2, full riff at L3+
      if (L <= 2) [[0, 3], [6, 1], [10, 2]].forEach(([s, d]) => { if (!(f.fill && s >= 8)) add(s, 'clav', { ms: ST.ch[k], dur: d * 0.9, vel: 0.7 }); });
      else ST.clav[k].forEach(([s, m]) => { if (!(f.fill && s >= 8)) add(s, 'clav', { m, vel: 1 }); });
      // stabs + vocal chops (L4)
      if (L >= 4 && !f.fill) {
        add(7, 'stab', { ms: ST.ch[k], dur: 1 }); add(15, 'stab', { ms: ST.ch[k], dur: 1, vel: 0.7 });
        [[2, 'ee', 76], [10, 'oh', 71]].forEach(([s, vow, m]) => add(s, 'vox', { m: m - 12, vow, dur: 1.5, vel: 0.7 }));
      }
      return ev;
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
