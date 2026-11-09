# ChemBeats 8-bar loops (engine v1.2, tracks2 v1.1)

Every track now repeats every 8 bars instead of 4. Bars 1-4 are the old loop (section A). Bars 5-8 are a related section B:
a different chord order, an answer melody, and drum changes. Bar 8 always ends on a "pull-back" chord (the V chord, or the dark bII in `rage`) and a small fill, so the loop
turns back to bar 1 smoothly.

Setting: `LOOP_BARS` in `CHEMBEATS_CONFIG` (top of `chembeats-v1.js`). `8` = new loop. `4` = old 4-bar loop (section B is switched off).
Level-up fills, level semantics and the public API did not change. Games need no edits.

For track authors: `ChemBeats.lib.sec(i)` returns 0 for bars 1-4 and 1 for bars 5-8. Tracks use `bi = (i % 4) + 4 * sec(i)` to read 8-entry lists.

| Track | Bars 1-4 (A) | Bars 5-8 (B) | Melody / hook in B | Drum changes in B |
|---|---|---|---|---|
| `jersey` (F minor, 140) | Fm - Db - Ab - Eb | Db - Ab - Eb - C (C major = V) | Answer phrase, higher, new rhythm (steps 0,3,6,9,12,14) | Bar 6 kick moves 3a to 3&; bar 8 kick roll (level 3+); squeak up/down swapped; extra stab on 4&; bass adds a fifth; ghost clap |
| `rage` (C minor, 150) | Cm - Ab - Fm - G | Ab - Fm - Eb - Db (Db = dark bII, 808 ends a half step under C) | New 808 line and a higher lead, new rhythm | Kicks follow the new 808 rhythm; hat rolls moved, bar 8 = long roll build; ghost snare; snare fill on bar 8; bells run downward at level 1-2 |
| `drill` (G minor, 142) | Gm - Gm - Eb - D | Eb - D - Cm - D | New 808 slides (new octave jumps), new keys melody | Snares at new places (bar 8 = 3 hits); extra kicks at new places; rims, hat grouping and rolls changed |
| `trap16` (A minor, 140) | Am - F - Dm - E | Dm - Bb - G - E7 | New brass stabs; bells run downward | New kick pattern per bar; claps get ghost hit; bar 8 clap fill; hat rolls moved, bar 8 = long roll |
| `boombap` / `boombap-up` (F minor, 90 / 100) | Fm9 - Ebmaj9 - Dbmaj9 - C7b9 | Bbm9 - Abmaj9 - Gm7b5 - C7b9 | New flute line over the new chords | New kick, bass and Rhodes re-hit timing; ghost snare and rim moved; open hat moved; longer scratch run on bar 8 (level 4) |
| `bounce` (D minor, 100) | Dm - Dm - Bb - C | Gm - Gm - F - A (A major = V) | Higher hook, new contour (up then down) | New kick pattern; snare ghost hits swapped; new conga pattern; bar 8 = longer snare roll; bass line and vox chops moved to new notes |
| `stutter` (E dorian, 98) | Em7 - A9 - Em7 - Cmaj9 | Gmaj7 - Bm7 - A9 - B7 (V) | New clav riff per bar | New stutter-kick pattern; bongos moved; longer hat roll at level 4; stabs and vocal chops moved |

All tracks differ in section B even at level 1 (chords, pad and bass change).
