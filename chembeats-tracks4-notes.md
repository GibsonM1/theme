# ChemBeats Tracks 4 — Track Notes (Oct 23, 2026)

Add-on file `chembeats-tracks4.js` (≈70 KB). Needs `chembeats-v1.js` **v1.1** (for `addVoice()` + `lib`). Load the engine first, then the add-on; tracks2 and tracks3 are optional and can load alongside it. Same API: `ChemBeats.play('cumbia', 1)`, `setLevel(1–4)`.

Previews (`chembeats-tracks4-previews/*.mp3`) play 4 bars of each level, 1 → 4, with the level-up fills. `cumbia-sound-tour.mp3` plays each instrument alone (timestamps below).

| ID | Name | BPM | Key / loop | Best use |
|---|---|---|---|---|
| `gaita` | Magdalena Molecules | 86 | G mixolydian, no chords (two flutes + drums) | Menus, study screens |
| `orquesta` | Ballroom Bonds | 94 | F major: F · F C7 · C7 · C7 F · B♭ · F Dm · Gm C7 · F C7 | Menus, results |
| `cumbia` | Rolling Reagents | 100 | D minor: Dm · A7 · A7 · Dm · Gm · Dm · A7 · Dm A7 | General gameplay |
| `sabanera` | Squeezebox Solutions | 104 | E minor: Em · B7 · B7 · Em · Em Am · Am Em · B7 · Em B7 | Gameplay |
| `chicha` | Wah-Wah Wavelengths | 108 | A minor pentatonic: Am · G · C G · Am · Dm · Am · E7 · Am E7 | Fast rounds |

Cumbia is in 2/4, so one ChemBeats bar = two measures. Every track loops an **8-bar (16-measure) phrase**. All melodies and arrangements are original, in traditional styles.

---

## The shared cumbia engine (gaita, cumbia)

```
Step:      1 e & a  2 e & a | 1 e & a  2 e & a
Llamador:  . . X .  . . X . | . . X .  . . X .     every "and", never moves
Tambora:   B . . B  r . r . | B . . B  r . r .     B = head (1 and the pickup into 2), r = stick on the shell
Maracas:   c c K c  c c K c | ...                  16ths, heavy down-stroke on the "and" (ch-ch-KUH)
Bass:      R . . .  5 . R . | R . . .  5 . R .     root on 1, fifth on 2, root on the "and" of 2
```

- **Tambora:** follows your spec text (head on 1 + pickup on the "a" of 1). Your table's version (1 and the "and" of 2) plays on alternate bars at level 4 as a variation. Shell strokes fill in by level: 2 → 4 → 6 per measure.
- **Lilt:** the "e" and "a" 16ths land slightly late (`CUMBIA_FEEL`), which gives the rolling gallop. Chicha uses 40% of it, the big band 80%.
- **Alegre:** levels 2–3 keep a steady pattern with an answer every other bar. Level 4 improvises from 5 one-measure cells, plus a roll at the end of each phrase (`ALEGRE_SOLOS`).

## Magdalena Molecules (`gaita`)

| Level | Adds |
|---|---|
| 1 | Gaita macho (2-note rhythm, like the real one-hole flute), maracón, llamador, tambora heads only |
| 2 | Gaita hembra melody (grace notes on the long notes), tambora shell strokes |
| 3 | Alegre, more shell strokes, coro on bars 5–8 ("a… le… lo") |
| 4 | Alegre improvising, coro harmony, macho variations, tambora variation |

No bass, as in the traditional ensemble. The tambora carries the low end.

## Ballroom Bonds (`orquesta`)

| Level | Adds |
|---|---|
| 1 | Upright bass, piano chords on the offbeats, maracas, conga on the "and" |
| 2 | Clarinet melody, piano bass notes, conga heel, soft bass drum (tambora role) |
| 3 | Sax section swells, timbal rim on beat 2, piano pickup chords |
| 4 | Trumpet shouts with falls (every other bar), 2nd clarinet in thirds, sax "pa · pa · paaa" figures, cymbal on the phrase |

Fill: timbal roll + sax swell.

## Rolling Reagents (`cumbia`)

| Level | Adds |
|---|---|
| 1 | Llamador, tambora, maracas, electric bass (root and fifth) |
| 2 | Caña de millo melody, alegre, bass on the "and" of 2 |
| 3 | Call and response: solo singer (bars 1–4) with the millo answering in her rests, then the coro (bars 5–8) in unison + octave |
| 4 | Guache added, alegre improvising, coro harmony (third below), bass octave pickups, tambora variation |

## Squeezebox Solutions (`sabanera`)

| Level | Adds |
|---|---|
| 1 | Caja (low "bajo" where the tambora would play, open tone on every "and"), guacharaca long-short, bass |
| 2 | Accordion left-hand chords on the offbeats, caja rim strokes |
| 3 | Accordion melody, guacharaca's third stroke |
| 4 | Coro on bars 5–8, accordion thirds on long notes, "adornos" (16th-triplet turns) into new phrases, caja slaps |

Fill: caja roll + long guacharaca scrape + a descending accordion run.

## Wah-Wah Wavelengths (`chicha`)

| Level | Adds |
|---|---|
| 1 | Metal güiro (long-short-short), congas, kick on 1 and the pickup, simple bass |
| 2 | Walking pentatonic bass (root-5-8-♭7-5-♭3), timbal shell (cáscara), rhythm guitar chops with tremolo, Farfisa chords |
| 3 | Lead guitar melody in huayno rhythm (wah, dotted-8th echo, spring reverb), snare rimshots, 8th hats |
| 4 | Cowbell, Farfisa harmony line under the lead, tremolo picking on long notes, 16th hats with open hats, timbal fills |

Fill: timbal roll + rimshot flams + a 1-octave guitar slide.

---

## New instruments (all synthesized)

Drums (noise-excited membrane and wood modes, baked in mono and panned on playback): `tambora`, `llamador`, `alegre`, `maraca` (maraca / maracon / guache), `raspa` (guacharaca / guiro), `caja`, `tumbadora`, `timbal`, `campana`, `bombo`, `redoblante`, `charles`, `platillo`.
Melodic (rendered once per pitch at half sample rate): `millo`, `gaita`, `clarinete`, `saxo`, `trompeta`, `acordeon`, `piano`. Sung: `canto` (syllables la / le / lo / a / ay / ya).
Strings (Karplus–Strong): `bajo` (electric / upright; the plucked string plus its fundamental, so the bass has real low end), `guitarra` (lead with auto-wah + echo, rhythm with tremolo; both through fuzz and a spring "drip"). `farfisa` plays live (cheap oscillators).
Voice names are Spanish, so they don't collide with tracks2/tracks3 names.

## Testing (numbers only, not by ear)

- 52,000 pattern events checked (every level, bar, fill and entry): all valid.
- Loudness per level: within about 1–2 dB of Roda Reaction / Backyard Bonds. Low end (below 150 Hz) in the same range.
- Live vs. baked: every sound within 1 dB, same left/right placement.
- Real-time start in Chromium: baking finishes in 0.25–0.45 s; memory per track 2–6.5 MB (chicha smallest, cumbia largest).

## Sound tour timestamps (`cumbia-sound-tour.mp3`, each clip loudness-matched)

```
0:00  Tambora (bass head + stick on the wooden shell)  [cumbia]
0:05  Llamador (steady slap on every 'and')  [cumbia]
0:11  Alegre (lead hand drum, improvising)  [cumbia]
0:17  Maracas + guache  [cumbia]
0:23  Electric bass  [cumbia]
0:29  Caña de millo (cane clarinet)  [cumbia]
0:35  Cantadora (solo singer)  [cumbia]
0:41  Gaitas: hembra (melody) + macho (2-note rhythm)  [gaita]
0:48  Maracón  [gaita]
0:55  Coro (gaita track)  [gaita]
1:01  Congas  [orquesta]
1:08  Bass drum  [orquesta]
1:14  Upright bass  [orquesta]
1:20  Piano  [orquesta]
1:26  Clarinet  [orquesta]
1:33  Sax section  [orquesta]
1:39  Trumpet shout  [orquesta]
1:45  Timbales (rim accents)  [orquesta]
1:51  Caja vallenata  [sabanera]
1:57  Guacharaca (cane scraper)  [sabanera]
2:03  Accordion (melody + left-hand chords)  [sabanera]
2:09  Coro (accordion track)  [sabanera]
2:14  Metal güiro  [chicha]
2:20  Timbales: shell (cáscara) + fill  [chicha]
2:26  Cowbell  [chicha]
2:31  Snare rimshot  [chicha]
2:37  Hi-hat  [chicha]
2:42  Walking bass  [chicha]
2:48  Rhythm guitar (tremolo chops)  [chicha]
2:54  Lead guitar (wah) + rhythm  [chicha]
2:59  Farfisa organ  [chicha]
```

## To check by ear

- Anything in the tour that sounds like a "keyboard" or toy: give the timestamp.
- The caña de millo is the least familiar sound. Does the buzz read as a reed, or as a kazoo?
- Wah amount (`WAH`), tremolo depth (`TREMOLO`) and fuzz (`FUZZ`) in chicha.
- Lilt amount (`CUMBIA_FEEL`): too lazy or too stiff?
- Tempos: gaita at 86 and orquesta at 94 for menus. Are they calm enough?
