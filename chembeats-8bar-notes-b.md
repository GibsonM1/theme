# ChemBeats samba set: 8-bar loops (tracks3 v1.3, Nov 8, 2026)

Only `chembeats-tracks3.js` changed. The engine is untouched: it already passes an increasing bar index `i` to every track's `bar(i, L, f)` (it resets to 0 on a level change, so a new level always starts on bar 1 of section A).

## The setting
`CHEMBEATS_TRACKS3_CONFIG.LOOP_BARS` (default 8). 8 = the new longer loop. 4 = the old loop.
With 4, every pattern is byte-for-byte what v1.2 produced (checked for all tracks, levels, bars and fill/enter flags). Roda and Crush already had an 8-bar chord form, so with 4 they keep it and only lose the new rhythm changes in bars 5-8.
It is a local setting and does not depend on any engine value.

## What changes in bars 5-8 (section B), by track
Every track also gets a small pickup fill at the end of bar 4 and a "virada" fill at the end of bar 8 that leads into bar 1. A level-up fill still replaces the virada, as before. At level 4, Bateria Blast keeps its paradinha break on bar 8.

| Track | Harmony in B | Melody / voices in B | Rhythm in B |
|---|---|---|---|
| bateria (no harmony) | none | none | new terceira patterns, caixa accent moves from "a" to "&", chocalho accent moves, tamborim phrase `TELE_B`, new agogô / repinique / cuíca phrases, small muted surdo answers; bars 6 and 8 thin out (caixa without ghost notes, chocalho in 8ths); bar 7 leaves out the 2nd segunda downbeat (a "corte") |
| enredo (D major) | Em7 A7 / D6 B7 / Gmaj7 Gm6 / E7 A7 (A is D6 / Bm7 F#7 / Gmaj7 A7 / D6 A7) | new, higher "lá-laiá" melody; new brass hits | `TELE_B` teleco-teco, new bateria patterns as in bateria |
| quintal (A minor) | Fmaj7 Em7 / Dm7 Db7 / Cmaj7 A7 / Dm7 E7 (bass walks F-E-D-Db-C) | new, higher cavaquinho solo (coro follows its long notes at L4) | tantã pickup, new shell answers, pandeiro slaps move, new hand-drum pattern, `TELE_B`, level-1 cavaquinho rhythm changes |
| partido (F major) | Bb6 Bbm6 / F6 Ab-dim7 / Am7 D7 / Gm7 C7 | call in bars 5-6 (higher), new coro answer in bars 7-8, new cavaquinho answers at L4 | `PART_B` phrase, palmas follow it, tantã, pandeiro, hand drum, reco-reco move |
| roda (G major) | unchanged (already 8 bars) | unchanged | partido phrase answers on odd bars, `PART_B` / `PART_B2` in bars 5-8, tantã pickup at every level, pandeiro slaps, hand drum, extra surdo at L4 |
| crush (C major) | unchanged (already 8 bars) | unchanged | 3 new cuíca phrases, `TELE_B` for violão and cavaquinho, tantã, pandeiro, hand drum, rising cuíca in the bar-8 virada |

## How it was checked (Playwright Chromium, `ChemBeats.renderOffline`)
- Events: for every track and level, every pair of bars 1-4 vs 5-8 has different events (none identical). Bar 9 equals bar 1 (the loop repeats).
- Audio: per-bar spectrum and per-bar envelope differences between bars j and j+4 are well above the control (bar 9 vs bar 1).
- Loudness (whole first 8 bars, RMS) is within +/-1.5 dB of v1.2 at every track and level.
- Wrap: no NaN, no step in the 4 ms around the bar 8 to bar 9 boundary larger than at the other bar boundaries.
- Level-ups (fill, then `enter`) and level-down work in a live AudioContext.

## Things to listen for
- Bateria bar 7 "corte" (no 2nd segunda downbeat) at levels 2+. Easy to remove: set `cut:` to `false` in the bateria `surdos(...)` call.
- Memory: more distinct notes means a bigger baked-sample cache per track (measured in Chromium after startup: enredo 7.8 to 10.7 MB, quintal 3.2 to 4.3, partido 6.0 to 8.4, bateria 5.2 to 5.3, roda 6.5 to 6.4). The cache is kept for the whole page session, as before.
- Loudness: Quintal, Partido, Roda and Crush `louder(...)` trims were lowered by about 0.4 dB each (1.3 to 1.23, 1.45 to 1.36, 1.4 to 1.35, 1.35 to 1.28) because bars 5-8 add notes; every track and level is now within about 0.6 dB of v1.2 and no offline render peaks at or above 1.0.
