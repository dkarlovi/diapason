# Melody Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks marked **LISTENING GATE** are performed by the human; stop there and hand over.

**Goal:** Replace today's note segmentation with one music-theory-aware engine that turns rough whistling into the melody the user meant, controlled by ~20 knobs and named intent/mood presets that are previewed by ear and saved per recording.

**Architecture:** A pure `src/melody/` package: a knob model with presets, key estimation, a Viterbi decoder over semitone+rest states with key/harmony/interval priors, harmony inference, and a rhythm/feel stage, joined by `interpretMelody`. `processRecording` switches to it; diagnostics, replay, editor and library consume the same result. Phases are separated by two human listening gates before any UI work.

**Tech Stack:** React 19, TypeScript (strict), Vite, Vitest + Testing Library, Node 22+. No new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-10-23-melody-correction-design.md`

## Global Constraints

- Fully client-side; no new runtime dependency; pure calculations in modules, browser effects in hooks.
- Never alter captured or exported WAV audio; correction happens only in note decisions.
- One engine: `segmentNotes` and its hysteresis/debounce/median machinery are removed, not kept alongside.
- Deterministic: identical audio + settings ⇒ identical notes and MIDI bytes (diagnostics replay must stay `match`).
- Bump `PIPELINE_VERSION` (`src/build-info.ts`) to 3 and the diagnostics `SCHEMA_VERSION` (`src/diagnostics.ts`) to 3.
- Every automatic choice is reachable through a knob or dropdown; no two controls mean overlapping things.
- Saving user-defined presets is out of scope, but the stored `{ preset, overrides, key }` shape must allow it later.
- Do not grow Fallow duplication or health baselines; update `README.md`; run `npm run check` before the final commit.
- Tests that analyze a full fixture WAV analyze it once per file at module scope (CI runners are slow).

## Review Focus

1. **Silence-only or click-only recording:** no notes, no exception, key reported as `null` with no alternatives — Task 6.
2. **Very short recording (one note, < 0.5 s):** one note, key estimation does not throw on a single pitch class — Task 2.
3. **Pitch at the edge of the profile range (e.g. 250 Hz / 3000 Hz):** decoded, not dropped or clamped to a neighbour state — Task 3.
4. **Legacy recording with only `tuning`/`quantize` saved:** opens on the default preset with gates, minimum note length, silence gap and grid carried over — Task 10.
5. **Switching preset with a muted note that the new preset merges with a neighbour:** merged note stays muted; switching back restores the original mute — Task 10.

---

## File structure

| File                                                                                                               | Responsibility                                                                                 |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `src/melody/knobs.ts` (new)                                                                                        | `Knobs` type, `KNOB_DEFS` (labels, ranges, family, visibility), `PRESETS`, `resolveKnobs`      |
| `src/melody/key.ts` (new)                                                                                          | Key type, Krumhansl–Kessler key ranking, scale pitch classes, display names                    |
| `src/melody/decode.ts` (new)                                                                                       | Viterbi decoder from `Frame[]` to `NoteEvent[]` with optional key/harmony priors               |
| `src/melody/harmony.ts` (new)                                                                                      | Implied chord per harmony span from decoded notes and key                                      |
| `src/melody/rhythm.ts` (new)                                                                                       | Grid pull, swing, syncopation, articulation                                                    |
| `src/melody/interpret.ts` (new)                                                                                    | `interpretMelody` pipeline joining the above                                                   |
| `src/melody/settings.ts` (new)                                                                                     | Per-recording `MelodySetting`, legacy carry-over, default for new recordings                   |
| `src/notes.ts`                                                                                                     | Keep `Frame`, `NoteEvent`, `freqToMidi`, `midiToName`; remove `segmentNotes`, `SegmentOptions` |
| `src/tuning.ts`                                                                                                    | Deleted; `Tuning` and last-used tuning persistence go away                                     |
| `src/recording.ts`, `src/recording-settings.ts`                                                                    | `processRecording` uses `interpretMelody`; settings resolve via `melody/settings.ts`           |
| `src/db.ts`                                                                                                        | `Recording.melody?: MelodySetting`; `tuning` and `quantize` become optional legacy fields      |
| `src/diagnostics*.ts`                                                                                              | Schema 3 evidence and replay                                                                   |
| `src/editor-model.ts`, `src/hooks/useEditor.ts`, `src/components/Editor.tsx`, new `src/components/MelodyPanel.tsx` | Preset list with preview, key selector, knob panel                                             |
| `src/hooks/useCapture.ts`                                                                                          | New recordings save the default `MelodySetting`                                                |
| `tools/render-presets.mjs` (new)                                                                                   | Offline WAV/MIDI renders per take per preset for listening gates                               |
| `src/fixtures/whistle-take2/` (new)                                                                                | Take 2 WAV/JSON/MIDI with provenance manifest                                                  |
| `src/test-support/fixtures.ts` (new)                                                                               | `loadFixtureFrames(name)` shared by fixture tests                                              |

---

### Task 1: Knob model and presets

**Files:**

- Create: `src/melody/knobs.ts`, `src/melody/knobs.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export type GridSubdivision = 0 | 1 | 2 | 3 | 4; // 0 = off; see quantize.ts for 1–4
  export type HarmonyRate = "bar" | "half-bar" | "beat";
  export interface Knobs {
    // Listening
    pitchTrust: number;        // 0..1, weight of sung pitch vs musical priors (1 = only what was sung)
    stickiness: number;        // 0..1, cost of changing note; the smarter Stickiness
    slipMs: number;            // 0..250, excursions shorter than this are absorbed
    minNoteMs: number;         // 20..300
    silenceGapMs: number;      // 30..300
    clarityGate: number;       // 0.85..0.999
    levelGate: number;         // 0.001..0.1
    // Key and harmony
    modeBias: number;          // -1 (darker/minor) .. 1 (brighter/major); |x| >= 0.5 forces the parallel mode
    keyPull: number;           // 0..1
    harmonyPull: number;       // 0..1
    harmonyRate: HarmonyRate;
    keepOddNotes: number;      // 0..1, how confidently-sung out-of-key notes resist keyPull
    // Melody shape
    leapPenalty: number;       // 0..1
    maxMoveSemitones: number;  // 0..4, furthest a prior may move a note from the sung pitch
    // Rhythm and feel
    grid: GridSubdivision;
    gridPull: number;          // 0..1, 1 = fully snapped onsets
    swing: number;             // 0..0.5, fraction of a subdivision added to off-beat onsets
    syncopation: number;       // 0..1
    articulation: number;      // 0.5 (detached) .. 1.2 (legato, overlaps clamped to next onset)
  }
  export type KnobFamily = "listening" | "key" | "shape" | "rhythm";
  interface KnobBase { key: keyof Knobs; label: string; family: KnobFamily; tip: string; basic: boolean }
  export type KnobDef =
    | (KnobBase & { kind: "range"; min: number; max: number; step: number })
    | (KnobBase & { kind: "select"; options: { value: string | number; label: string }[] });
  export const KNOB_DEFS: readonly KnobDef[];
  export type IntentPresetId = "as-played" | "gentle" | "clean" | "keep-odd";
  export type MoodPresetId = "happy" | "sad" | "dreamy" | "syncopated";
  export type PresetId = IntentPresetId | MoodPresetId;
  export interface Preset { id: PresetId; label: string; kind: "intent" | "mood"; blurb: string; knobs: Knobs }
  export const PRESETS: Record<PresetId, Preset>;
  export function resolveKnobs(preset: PresetId, overrides: Partial<Knobs>): Knobs;
  export function isKnobs(value: unknown): value is Partial<Knobs>; // validation for stored/diagnostic data
  ```

- [ ] **Step 1: Write failing tests** in `src/melody/knobs.test.ts`:
  - `"defines every knob exactly once with a family and a valid default in range"`: for each `KnobDef`, `PRESETS["gentle"].knobs[def.key]` is within `[min,max]` (range) or among `options` (select); `new Set(KNOB_DEFS.map(d => d.key)).size === Object.keys(PRESETS.gentle.knobs).length`.
  - `"as played turns every musical prior off"`: `PRESETS["as-played"].knobs` has `pitchTrust: 1, keyPull: 0, harmonyPull: 0, leapPenalty: 0, maxMoveSemitones: 0, grid: 0, swing: 0, syncopation: 0`.
  - `"overrides win over the preset and unknown keys are ignored"`: `resolveKnobs("clean", { stickiness: 0.1, bogus: 3 } as never).stickiness === 0.1` and has no `bogus` key.
  - `"intent presets keep timing as sung"`: every `kind === "intent"` preset has `grid: 0, swing: 0, syncopation: 0`.
  - `"isKnobs rejects out-of-range and wrong-typed values"`: `isKnobs({ keyPull: 2 }) === false`, `isKnobs({ grid: "x" }) === false`, `isKnobs({ keyPull: 0.3 }) === true`.
- [ ] **Step 2: Run** `npm test -- src/melody/knobs.test.ts` — expect FAIL (module missing; create an empty `knobs.ts` exporting nothing first so failures are assertion failures).
- [ ] **Step 3: Implement** `src/melody/knobs.ts`. Labels are plain language (e.g. `pitchTrust` → "Trust what I sang", `keyPull` → "Pull into key", `modeBias` → "Darker ↔ Brighter"). `basic: true` only for `stickiness`, `keyPull`, `modeBias`, `grid`. Starting weights for presets are placeholders tuned in Tasks 6 and 8.
- [ ] **Step 4: Run** the test — expect PASS.
- [ ] **Step 5: Commit** `git commit -m "Melody knob model and presets"`.

### Task 2: Key estimation

**Files:**

- Create: `src/melody/key.ts`, `src/melody/key.test.ts`

**Interfaces:**

- Consumes: `NoteEvent` from `src/notes.ts`.
- Produces:

  ```ts
  export interface Key {
    tonic: number;
    mode: "major" | "minor";
  } // tonic = pitch class 0–11
  export interface KeyScore {
    key: Key;
    score: number;
  } // Pearson correlation, −1..1
  export function rankKeys(notes: NoteEvent[]): KeyScore[]; // all 24, best first; [] for no notes
  export function scalePitchClasses(key: Key): ReadonlySet<number>; // minor = natural minor + leading tone
  export function parallelKey(key: Key, mode: Key["mode"]): Key;
  export function keyName(key: Key): string; // "E minor", sharps only
  ```

- [ ] **Step 1: Write failing tests**:
  - `"ranks E minor first for the take-1 reference melody"`: load `src/fixtures/whistle-regression/reference.json`, `keyName(rankKeys(ref)[0]!.key) === "E minor"`.
  - `"weights pitch classes by duration"`: a C-major arpeggio held long plus one short F# ranks C major above G major.
  - `"returns no keys for no notes and does not throw for one pitch class"`: `rankKeys([])` is `[]`; `rankKeys([{ midi: 76, name: "E5", start: 0, duration: 0.3 }])` has length 24.
  - `"minor scales include the leading tone"`: `scalePitchClasses({ tonic: 4, mode: "minor" })` equals `{4,6,7,9,11,0,2,3}`.
- [ ] **Step 2: Run** `npm test -- src/melody/key.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** with Krumhansl–Kessler profiles (major `6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88`; minor `6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17`), duration-weighted pitch-class histogram, ties broken by tonic then major-before-minor for determinism. A zero-variance histogram yields score 0, not NaN.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `git commit -m "Melody key estimation"`.

### Task 3: Viterbi note decoder and take-2 fixture

**Files:**

- Create: `src/melody/decode.ts`, `src/melody/decode.test.ts`, `src/test-support/fixtures.ts`, `src/fixtures/whistle-take2/{original.wav,original.json,original.mid,manifest.json}`

**Interfaces:**

- Consumes: `Knobs` (Task 1), `Key`, `scalePitchClasses` (Task 2), `Frame`, `NoteEvent`, `freqToMidi`, `midiToName`.
- Produces:

  ```ts
  export interface PitchContext {
    key: Key | null; // null = no key prior
    harmony: { start: number; end: number; pitchClasses: ReadonlySet<number> }[]; // [] = no harmony prior
    range: { minMidi: number; maxMidi: number }; // from the sound profile minFreq/maxFreq
  }
  export function decodeMelody(frames: Frame[], knobs: Knobs, context: PitchContext): NoteEvent[];
  // test-support/fixtures.ts
  export function loadFixture(name: "whistle-regression" | "whistle-take2"): {
    pcm: Float32Array;
    sampleRate: number;
    frames: Frame[];
    record: Recording;
  };
  ```

- [ ] **Step 1: Add the take-2 fixture.** Copy `~/Downloads/diapason-recording-oct-23-02-02-pm-1792756984252.wav` → `original.wav`, `…-1792756985301.json` → `original.json`, `…-1792756987679.mid` → `original.mid`; write `manifest.json` with SHA-256 of each, `sampleRate`, `sampleCount`, and provenance: "Take 2 of the same tune as whistle-regression, 2026-10-23, 95 BPM, headphones; schema-2 export; contains a 0.11 s slip (G#6 at 16.01 s, sung −49¢, gliding into G6 at 16.12 s)." Implement `loadFixture` (decode WAV with `decodeWav`, build the record via `test-support/recording.ts` with the fixture's sample rate/duration/BPM 95, analyze with `analyzeRecording`).
- [ ] **Step 2: Write failing tests** (frames for fixtures loaded once at module scope):
  - `"holds a vibrato note as one note"`: synthetic frames, 1 s at hop 512/48 kHz, pitch 76 ± 0.4 semitone sine vibrato at 6 Hz, clarity 0.99 → exactly one note, `midi 76`.
  - `"absorbs a glide shorter than slipMs"`: 0.5 s at 79, 0.1 s at 79.5, 0.5 s at 79 with `slipMs 150` → one note `79`; with `slipMs 0` and `stickiness 0` → three notes.
  - `"keeps a deliberate leap and repeated pitches separated by real silence"`: 0.4 s at 72, 0.4 s at 79 → two notes; 0.3 s at 76, 0.12 s unvoiced, 0.3 s at 76 with `silenceGapMs 90` → two notes.
  - `"decodes pitches at the profile range edges"`: frames at `freqToMidi(250)` and `freqToMidi(3000)` decode to `Math.round` of those values.
  - `"key prior resolves an ambiguous note toward the key"`: 0.5 s at 77.5 (F/F# boundary), `key` E minor, `keyPull 0.8` → `midi 78`; with `keyPull 0` → the nearer state by pitch.
  - `"never moves a note further than maxMoveSemitones"`: 0.5 s at 77.05 with E minor `keyPull 1` and `maxMoveSemitones 0` → 77.
  - `"faithful decoding of take 1 reproduces the reference melody"`: `PRESETS["as-played"].knobs`, `key null`, harmony `[]` → pitch sequence equals `reference.json` midi sequence; each onset within 0.05 s of the reference.
  - `"absorbs the take-2 slip with gentle settings"`: `PRESETS.gentle.knobs` with E minor → no note shorter than 0.15 s starts between 13.5 s and 16.6 s, and the note sounding at 16.05 s is G6 (MIDI 91).
  - `"is deterministic"`: decoding the take-2 frames twice gives deep-equal results.
- [ ] **Step 3: Run** `npm test -- src/melody/decode.test.ts` — expect FAIL.
- [ ] **Step 4: Implement `decodeMelody`.** States: one per semitone in `range` plus `rest`. Per-frame log-score of a pitch state `s` for a voiced frame (clarity ≥ `clarityGate`, rms ≥ `levelGate`) with sung pitch `p`:
  ```
  evidence = -pitchTrust * ((p - s) / 0.35)^2 * clarity
  prior    = (1 - pitchTrust) * ( keyPull * inKey(s) + harmonyPull * inChord(s, t)
             - keyPull * (1 - keepOddNotes * confidence(p, s)) * outOfKey(s) )
  score    = |p - s| > maxMoveSemitones + 0.5 ? -Infinity : evidence + prior
  ```
  where `confidence(p,s) = 1 - min(1, 2|p - s|)`. Unvoiced frames favour `rest`; voiced frames penalise `rest`. Transition cost: staying is free; changing note costs `stickiness * 8 + leapPenalty * |interval| / 2`; rest→note and note→rest cost a constant. After Viterbi, collapse runs into notes (pitch = state), merge runs shorter than `slipMs` into the longer neighbour, split notes on rests at least `silenceGapMs` long, drop notes shorter than `minNoteMs`. The constants (0.35, 8, 2) are starting values; tune only via the listening gates. Keep the inner loop allocation-free (typed arrays, backpointers as `Int16Array`).
- [ ] **Step 5: Run** — expect PASS. Then time `decodeMelody` on 3 minutes of synthetic frames in a scratch script (not a test) and note the result in the commit message; if it exceeds 100 ms, profile before continuing.
- [ ] **Step 6: Commit** `git commit -m "Viterbi melody decoder and take-2 fixture"`.

### Task 4: Implied harmony

**Files:**

- Create: `src/melody/harmony.ts`, `src/melody/harmony.test.ts`

**Interfaces:**

- Consumes: `Key`, `scalePitchClasses`; `NoteEvent`; `HarmonyRate`.
- Produces:

  ```ts
  export interface ChordSpan {
    start: number;
    end: number;
    root: number;
    quality: "maj" | "min" | "dim";
    pitchClasses: ReadonlySet<number>;
  }
  export function inferHarmony(
    notes: NoteEvent[],
    key: Key,
    timing: { bpm: number; beatsPerBar: number },
    rate: HarmonyRate,
  ): ChordSpan[];
  ```

- [ ] **Step 1: Write failing tests**:
  - `"chooses the diatonic triad covering the most note time per span"`: in C major at 120 BPM 4/4 with `rate "bar"`, bar 1 notes C,E,G → root 0 `maj`; bar 2 notes D,F,A → root 2 `min`.
  - `"prefers the previous chord or the tonic when a span is ambiguous"`: a bar containing only E in C major after a C-major bar → root 0.
  - `"spans tile the notes' time range at the requested rate"`: `rate "beat"` produces spans of `60 / bpm` seconds, contiguous, covering first note start to last note end.
  - `"returns no spans for no notes"`.
- [ ] **Step 2: Run** `npm test -- src/melody/harmony.test.ts` — expect FAIL.
- [ ] **Step 3: Implement**: candidate chords are the seven diatonic triads of the key (minor uses the harmonic-minor V); per span score = duration-weighted chord-tone coverage + 0.1 if equal to the previous span's chord + 0.05 if tonic; deterministic tie-break by scale degree.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `git commit -m "Implied harmony inference"`.

### Task 5: Rhythm and feel

**Files:**

- Create: `src/melody/rhythm.ts`, `src/melody/rhythm.test.ts`

**Interfaces:**

- Consumes: `Knobs`; `quantizeSequence` from `src/quantize.ts` (collision-safe snapping, reused, not reimplemented).
- Produces: `export function applyFeel(notes: NoteEvent[], knobs: Knobs, timing: { bpm: number; beatsPerBar: number }): NoteEvent[];`

- [ ] **Step 1: Write failing tests**:
  - `"is the identity when grid is off and feel knobs are neutral"` (`grid 0, swing 0, syncopation 0, articulation 1`).
  - `"gridPull interpolates between sung and snapped onsets"`: onset 0.27 s at 120 BPM `grid 2` → 0.25 at `gridPull 1`, 0.26 at `gridPull 0.5`.
  - `"swing delays off-beat grid onsets only"`: with `grid 2, gridPull 1, swing 0.33`, an onset at 0.25 s moves to `0.25 + 0.33 * 0.25`; one at 0.5 s does not move.
  - `"syncopation anticipates some on-beat onsets by one subdivision"`: eight quarter-note onsets with `grid 2, gridPull 1, syncopation 1` → at least 2 onsets land on off-beat eighths; order and count preserved.
  - `"articulation shortens or extends without overlapping the next onset"`: `0.5` halves durations; `1.2` extends but `end ≤ next.start`.
  - `"never reorders, drops or overlaps notes"` for all grid values with `syncopation 1, swing 0.5`.
- [ ] **Step 2: Run** `npm test -- src/melody/rhythm.test.ts` — expect FAIL.
- [ ] **Step 3: Implement**: snap with `quantizeSequence` then interpolate by `gridPull`; swing and syncopation operate on snapped grid positions; syncopation anticipates every other on-beat onset (deterministic by beat index) when `syncopation ≥ 0.5`, scaled shifts below; finally articulation, clamped to the next onset.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `git commit -m "Rhythm and feel stage"`.

### Task 6: Interpretation pipeline, intent preset tuning and render tool

**Files:**

- Create: `src/melody/interpret.ts`, `src/melody/interpret.test.ts`, `tools/render-presets.mjs`
- Modify: `package.json` (script `"render:presets": "node tools/render-presets.mjs"`), `src/melody/knobs.ts` (intent weights)

**Interfaces:**

- Consumes: everything from Tasks 1–5.
- Produces:

  ```ts
  export type KeyChoice = "auto" | Key;
  export interface Interpretation {
    knobs: Knobs;
    key: { chosen: Key | null; auto: boolean; ranked: KeyScore[] }; // ranked[0..2] are the alternatives offered
    harmony: ChordSpan[];
    faithful: NoteEvent[]; // priors off, used for key/harmony estimation
    decoded: NoteEvent[]; // with priors, before feel
    notes: NoteEvent[]; // after feel; what is exported
  }
  export function interpretMelody(
    frames: Frame[],
    input: {
      knobs: Knobs;
      key: KeyChoice;
      timing: { bpm: number; beatsPerBar: number };
      range: { minMidi: number; maxMidi: number };
    },
  ): Interpretation;
  export function agreement(a: NoteEvent[], b: NoteEvent[]): number; // Levenshtein distance between midi sequences
  ```

- [ ] **Step 1: Write failing tests**:
  - `"silence yields no notes and no key"`: 2 s of unvoiced frames → `notes []`, `key.chosen null`, `ranked []`.
  - `"as played equals the faithful pass"`: with `PRESETS["as-played"].knobs`, `decoded` deep-equals `faithful`.
  - `"auto key uses the faithful pass and modeBias forces the parallel mode"`: take-1 frames, `gentle` → `keyName(key.chosen) === "E minor"`; with `modeBias 1` → `"E major"`.
  - `"an explicit key is used and reported as not auto"`.
  - `"agreement counts edits between pitch sequences"`: `[60,62,64]` vs `[60,63,64]` → 1.
- [ ] **Step 2: Run** `npm test -- src/melody/interpret.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `interpretMelody`: decode with priors off → `rankKeys` → choose key (auto/explicit, then `parallelKey` when `|modeBias| ≥ 0.5`) → `inferHarmony` → decode with priors → `applyFeel`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Write `tools/render-presets.mjs`** using the same Vite `createServer({ mode: "replay" })`/`ssrLoadModule` pattern as `tools/replay-recording.mjs` (always `server.close()` in `finally`). Usage: `npm run render:presets -- --out <dir> [--presets gentle,clean]`. For both fixtures and each preset write `<take>/<preset>.wav` (additive harmonic tone two octaves below the decoded notes, original length, 10 ms attack, 50 ms release), `<take>/<preset>.mid`, and `README.md` with key + alternatives, note list with sung cents, and `agreement(take1, take2)` per preset over the full sequences.
- [ ] **Step 6: Tune intent preset weights** in `knobs.ts` using the render README until: take-2 slip absorbed under gentle/clean/keep-odd; as-played reproduces the reference (Task 3 test); agreement per preset is reported. Do not tune toward agreement alone (both takes could agree on a wrong tune).
- [ ] **Step 7: Run** `npm test` — expect PASS. **Commit** `git commit -m "Melody interpretation pipeline and preset renders"`.

### Task 7: LISTENING GATE 1 — intent presets (human)

- [ ] **Step 1:** Run `npm run render:presets -- --out <scratch>/renders --presets as-played,gentle,clean,keep-odd` and give the user the folder path plus the README summary.
- [ ] **Step 2:** The user listens and answers: which preset sounds most like the intended tune for each take, and whether any sounds like a different tune. If not approved, return to Task 6 Step 6 with their notes. **Stop here until approved.**
- [ ] **Step 3:** Record the approved preset as `DEFAULT_PRESET` (exported from `src/melody/knobs.ts`) and save each take's approved output as `src/fixtures/<take>/expected-<preset>.json` (`{ midi, start, duration }[]`, with a `provenance` note naming the approval date).
- [ ] **Step 4: Write regression tests** in `src/melody/interpret.test.ts`: `"take <n> matches the approved <preset> output"` (pitch sequence equal, onsets within 0.02 s) for both takes, and `"takes agree under the default preset"` asserting `agreement(...)` is at most the approved value.
- [ ] **Step 5: Run** `npm test` — PASS. **Commit** `git commit -m "Pin approved intent preset output"`.

### Task 8: Mood presets

**Files:**

- Modify: `src/melody/knobs.ts`, `src/melody/interpret.test.ts`

- [ ] **Step 1: Write failing tests** on take 1 (frames loaded once):
  - `"happy uses a major key and sad a minor key"`: `key.chosen.mode` is `"major"` for `happy`, `"minor"` for `sad`.
  - `"dreamy is smoother and more legato than clean"`: mean |interval| of `dreamy` < `clean`; mean gap between consecutive notes of `dreamy` < `clean`.
  - `"syncopated puts onsets off the beat"`: every `syncopated` onset lies on the eighth-note grid and at least 20% of them are off the beat (on an "and").
  - `"moods keep the tune recognisable"`: `agreement(mood, approved default) ≤ 0.35 × notes.length` for every mood.
- [ ] **Step 2: Run** `npm test -- src/melody/interpret.test.ts` — FAIL.
- [ ] **Step 3: Set mood knob values** (happy `modeBias 1`; sad `modeBias -1`; dreamy high `stickiness`, `leapPenalty`, `articulation 1.2`, `gridPull` low; syncopated `grid 2`, `gridPull 1`, `syncopation 1`), adjusting with renders.
- [ ] **Step 4: Run** — PASS. **Commit** `git commit -m "Mood presets"`.

### Task 9: LISTENING GATE 2 — moods (human)

- [ ] **Step 1:** Render `--presets happy,sad,dreamy,syncopated` and hand over as in Task 7.
- [ ] **Step 2:** The user confirms each mood is distinguishable by ear and still their tune. If not, return to Task 8 Step 3. **Stop here until approved.**

### Task 10: Per-recording settings and the engine swap

**Files:**

- Create: `src/melody/settings.ts`, `src/melody/settings.test.ts`
- Modify: `src/db.ts`, `src/recording.ts`, `src/recording-settings.ts`, `src/hooks/useCapture.ts`, `src/hooks/useLibrary.ts`, `src/notes.ts`; delete `src/tuning.ts`; update or replace tests that import `segmentNotes`, `SegmentOptions` or `tuning.ts` (`src/notes.test.ts`, `src/recording.test.ts`, `src/recording-analysis.test.ts`, `src/recording-pipeline.integration.test.ts`, editor tests).

**Interfaces:**

- Consumes: `interpretMelody`, `PresetId`, `DEFAULT_PRESET`, `resolveKnobs`, `Key`.
- Produces:

  ```ts
  // db.ts
  export interface MelodySetting {
    preset: PresetId;
    overrides: Partial<Knobs>;
    key: "auto" | Key;
  }
  // Recording gains `melody?: MelodySetting`; `tuning?` and `quantize?` become optional legacy fields.
  // melody/settings.ts
  export function melodySettingFor(record: Recording): MelodySetting; // legacy carry-over
  export function newRecordingMelody(levelGate: number): MelodySetting; // default for captures
  // recording.ts — processRecording keeps its name and adds `interpretation`
  export function processRecording(
    rec: Recording,
    frames: Frame[],
  ): {
    settings: ReturnType<typeof resolveRecordingSettings>;
    interpretation: Interpretation;
    items: NoteItem[];
    notes: NoteEvent[];
  };
  export function previewNotes(
    rec: Recording,
    frames: Frame[],
    change: Partial<MelodySetting>,
  ): NoteEvent[];
  ```

  `NoteItem.raw` is now the decoded note (before feel) and `NoteItem.note` the note after feel.

- [ ] **Step 1: Write failing tests** in `src/melody/settings.test.ts` and `src/recording.test.ts`:
  - `"legacy tuning and grid carry over to the default preset"`: record with `tuning { rmsGate 0.01, clarityThreshold 0.95, minDurationSec 0.12, silenceGapSec 0.15, hysteresisSemitones 0.8 }` and `quantize { on: true, subdivision: 4 }` → `{ preset: DEFAULT_PRESET, key: "auto", overrides: { levelGate 0.01, clarityGate 0.95, minNoteMs 120, silenceGapMs 150, grid 4, gridPull 1 } }` (hysteresis dropped).
  - `"a saved melody setting is used as is"`.
  - `"new captures start on the default preset with the measured level gate"`.
  - `"a mute follows its note through a merge and returns when switching back"` (Review Focus 5): synthetic frames where `as-played` yields two notes and `gentle` merges them; mute the second under `as-played`; under `gentle` the merged note is muted; back under `as-played` only the second note is muted.
  - `"previewNotes does not change the record"`: returns notes for `{ preset: "clean" }` while `rec.melody` is unchanged.
- [ ] **Step 2: Run** those tests — FAIL.
- [ ] **Step 3: Implement**: `processRecording` resolves `melodySettingFor` → `resolveKnobs` → `interpretMelody` (range from `analysisOptionsFor(rec)` min/max frequency) and applies mutes with the existing `covers` rule to `decoded` notes, mapped to their felt counterparts by index. `useCapture` saves `melody: newRecordingMelody(settings.room.gate)` and no longer writes `tuning`/`quantize`. Remove `segmentNotes`, `SegmentOptions`, `src/tuning.ts`, `loadLastTuning`/`saveLastTuning` and their call sites; migrate fixture tests to `interpretMelody` with `as-played`, keeping the 22-note reference assertions and the no-overlap MIDI assertions across grids.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `git commit -m "Switch recordings to the melody engine"`.

### Task 11: Diagnostics schema 3 and replay

**Files:**

- Modify: `src/build-info.ts` (`PIPELINE_VERSION = 3`), `src/diagnostics.ts` (`SCHEMA_VERSION = 3`), `src/diagnostics-validation.ts`, `src/diagnostics-replay.ts`, `src/diagnostics.test.ts`, `src/diagnostics-replay.test.ts`, `src/recording-pipeline.integration.test.ts`

- [ ] **Step 1: Write failing tests**:
  - `"records preset, overrides, effective knobs, key choice and harmony"`: report for a record with `melody { preset: "clean", overrides: { stickiness: 0.2 }, key: "auto" }` has `settings.melody` equal to it, `stages.knobs.stickiness === 0.2`, `stages.key.auto === true`, `stages.key.ranked.length === 24`, and `stages.faithful`, `stages.decoded`, `stages.harmony`, `stages.notes` arrays.
  - `"replays a schema-3 pair for every preset"`: 2 s excerpt of take 2, each `PresetId` → `status "match"` and byte-identical MIDI.
  - `"reports schema-2 evidence as produced by an older pipeline"`: schema-2 report → status `"incomplete"` with a difference naming the pipeline change, not an exception.
  - Copy log `[stages]` line: `"[stages] preset=clean key=E minor (auto) faithful=N decoded=N muted=N exported=N"`.
- [ ] **Step 2: Run** the three test files — FAIL.
- [ ] **Step 3: Implement**; validation accepts schema 3 (`melody` setting checked with `isKnobs` and `PresetId` membership).
- [ ] **Step 4: Run** — PASS. **Commit** `git commit -m "Diagnostics schema 3 for melody interpretation"`.

### Task 12: Editor melody panel

**Files:**

- Create: `src/components/MelodyPanel.tsx`, `src/components/MelodyPanel.test.tsx`
- Modify: `src/hooks/useEditor.ts`, `src/hooks/useEditorPlayback.ts`, `src/editor-model.ts` (remove `SLIDERS`/tuning helpers; add `knobValueLabel(def, value): string`), `src/components/Editor.tsx` (replace quantize row and tuning sliders with `<MelodyPanel>`), `src/hooks/useEditorPlayback.test.tsx`, `src/components/Editor.loaded.test.tsx`

**Interfaces:**

- Consumes: `MelodySetting`, `PRESETS`, `KNOB_DEFS`, `previewNotes`, `Interpretation`.
- Produces (from `useEditor`): `melody: MelodySetting`, `interpretation: Interpretation | null`, `applyPreset(id: PresetId): void`, `changeKnob(key: keyof Knobs, value: number | string): void`, `resetKnob(key?: keyof Knobs): void`, `changeKey(key: "auto" | Key): void`, `previewMelody(change: Partial<MelodySetting>): void` (plays via `playNotes` with the recording's play settings; stops on second press, on another preview, and on unmount).

- [ ] **Step 1: Write failing tests** in `MelodyPanel.test.tsx` (Testing Library, playback mocked as in `useEditorPlayback.test.tsx`):
  - `"previewing a preset plays it without changing the recording"`: click "Play Clean" → `playNotes` called with clean notes; `putRecording` not called.
  - `"using a preset saves it and clears overrides"`: click "Use Clean" → saved `melody { preset: "clean", overrides: {} }`.
  - `"moving a knob shows Custom (from …)"`: after "Use Gentle fix", change "Pull into key" → heading reads "Custom (from Gentle fix)" and saved `overrides.keyPull` is the new value.
  - `"the key selector offers Auto, previewable alternatives and every key behind 'I know my key'"`: Auto selected by default; three alternatives each with a play button; the expanded list has 24 options.
  - `"basic knobs are visible and the rest are behind More"`: only `basic: true` knobs render outside the `<details>`.
- [ ] **Step 2: Run** `npm test -- src/components/MelodyPanel.test.tsx` — FAIL.
- [ ] **Step 3: Implement.** Intent and mood presets are two labelled rows of cards: label, one-line blurb, "Play" and "Use". Knob changes debounce-persist like today's tuning (`scheduleTuning` pattern, 300 ms). Key names render in small secondary text. Use existing `primitives.tsx` controls and `styles.css` classes.
- [ ] **Step 4: Run** `npm test` — PASS. **Commit** `git commit -m "Editor melody panel with previews"`.

### Task 13: README and full check

**Files:**

- Modify: `README.md`

- [ ] **Step 1:** Rewrite the detection/tuning sections: one engine, presets (intent and mood), preview by ear, key selector, knob families, that existing recordings may sound different after updating, `npm run render:presets`, schema-3 diagnostics; remove the old slider descriptions and any roadmap item this implements.
- [ ] **Step 2: Run** `npm run check` — expect exit 0 with unchanged Fallow baselines.
- [ ] **Step 3: Commit** `git commit -m "Document melody correction"`.
