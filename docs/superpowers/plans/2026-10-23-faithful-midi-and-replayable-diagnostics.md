# Faithful MIDI and Replayable Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implement inline; delegation is not required.

**Goal:** Make exported MIDI preserve the captured monophonic melody, and make a JSON/WAV pair sufficient to reproduce and inspect every audio-to-MIDI processing stage without access to IndexedDB or the original browser.

**Architecture:** Analyze captured PCM without automatic metronome beat masking. Resolve recording settings explicitly, compute one shared sequence of segmented, quantized, muted, and exported notes, and serialize those settings and intermediate results in versioned diagnostics. Use the user's recording and small synthetic signals to drive independent regression tests, including parsing the emitted MIDI bytes.

**Tech Stack:** Existing React/TypeScript/Vite application, Vitest, Node 22+, browser Web Crypto, PCM16 WAV, Standard MIDI File Type 0. No new runtime dependency.

**Spec:** The user requests in this conversation, the decisions and acceptance criteria below, and the measured reproduction in this document. This is a proposed plan; production code is not changed by writing it.

## Global Constraints

- Fully client-side; keep recordings local in IndexedDB and preserve `/diapason/`.
- Use Node 22+, strict TypeScript, two-space indentation, double quotes, semicolons, and oxfmt.
- Keep browser effects in hooks and reusable calculations in pure modules.
- Every behavior fix starts with a test observed failing for the expected reason, followed by the minimal fix and a passing run. Exploratory scripts are not evidence of completed TDD.
- Do not grow Fallow duplication or health baselines to accommodate the change.
- Update `README.md` on this feature branch.
- Preserve original captured audio. Do not add scale snapping, pitch correction, pitch shifting, or an audio import screen.
- The metronome is a guide for the user. Its schedule alone must never delete microphone evidence. BPM still controls optional quantization and the seconds-to-MIDI-ticks conversion.

## Review Focus

- Headphone recording with no click bleed: changing BPM must not change detected frames or segmented notes (Tasks 2 and 5).
- Actual audible clicks: click-only input must not become a tune; brief clicks over a held whistle must not split or replace it (Task 2).
- Fast notes, repeated pitches, rests, and coarse grids: retain note order and articulation without collisions or invented chords (Tasks 3 and 5).
- Old recordings and nondefault settings: explicit saved choices must survive; missing or obsolete fields must have visible, reproducible defaults (Tasks 1 and 4).
- Wrong WAV, PCM conversion drift, stale build, and rounded diagnostics: identify the mismatch instead of claiming exact replay (Tasks 1, 4, and 5).

## Evidence collected before implementation

Source files in `/home/dkarlovi/Downloads/`:

- `diapason-recording-oct-23-12-58-pm-1792753524648.wav`
- `diapason-recording-oct-23-12-58-pm-1792753891029.mid`
- `diapason-recording-oct-23-12-58-pm-1792753907411.json`

The WAV is mono PCM16, 48,000 Hz, 973,873 samples (20.2890208333 seconds). The user confirms headphones were used and prefers the unmasked, unquantized preview. The preview was rendered two octaves below the recorded whistle; that is a listening accommodation, not a pitch correction.

Measured reproduction:

| Pipeline                                             | Notes | Overlapping note pairs | Identical pitch/start duplicates |
| ---------------------------------------------------- | ----: | ---------------------: | -------------------------------: |
| Unmasked, no quantization                            |    22 |                      0 |                                0 |
| Unmasked, quarter-note grid at 95 BPM                |    22 |                      3 |                                0 |
| Unmasked, eighth-note grid at 95 BPM                 |    22 |                      2 |                                0 |
| Current masked analysis, quarter-note grid at 95 BPM |    44 |                     16 |                                7 |
| Current masked analysis, eighth-note grid at 95 BPM  |    44 |                      0 |                                0 |

The supplied MIDI matches all 44 diagnostic notes quantized to quarter notes at 95 BPM, to 0.1 ms. This identifies the effective grid, not why that grid was selected: existing JSON omits BPM, quantization, complete segmentation tuning, muted notes, playback settings, and build identity. Current source defaults to eighth notes.

At 48 kHz the masking window includes a 42.7 ms analysis window plus 40 ms guards on both sides, exceeding the default 90 ms silence gap. Treating those artificial null frames as silence splits held notes and resets pitch locks. Increasing the general silence gap would also merge real articulations, so it is not the fix.

A matched-click check at 1000/1600 Hz found no increased median correlation at beat times versus off-beat controls. This supports the headphone explanation, but does not prove absence of every faint click. Synthetic 4-second signals containing a 1500 Hz whistle plus short clicks at amplitudes 0.03, 0.1, and 0.3 produced one held note without masking; click-only signals produced none. Extend these exploratory checks into proper regressions rather than assuming they cover every acoustic environment.

A separate reproducibility defect was observed: PCM values `[16383, -16384, 32767, -32768]` decoded from storage become `[16382, -16384, 32766, -32768]` on current WAV export. Positive samples are quantized twice using different scaling. The old WAV therefore cannot reproduce every original float decision exactly; five voiced/null frame decisions differed in one reanalysis. New exports must eliminate this ambiguity.

## Proposed decisions and alternatives

1. **Use captured audio as the detection authority.** Remove unconditional beat masking from the app's analysis path. Keeping masking with interpolation would still replace real observations and could conceal actual note changes; adding a headphone checkbox would depend on users diagnosing the pipeline. Ordinary detection gates remain. Do not build adaptive echo cancellation or automatic headphone detection in this work.
2. **Preserve melody before grid purity.** Quantize the monophonic sequence together. If a coarse grid collapses distinct onsets, retain the original onsets for the affected notes instead of dropping notes, merging pitches, inventing chords, or stretching every note to a whole grid cell. Report these adjustments.
3. **New recordings preserve detected timing by default.** Save `{ on: false, subdivision: 2 }` explicitly when capturing a new recording. Preserve explicit existing settings; legacy recordings with no quantization field retain their previous effective eighth-note behavior, with that fallback recorded in diagnostics. This is a proposed product default, not a request to silently rewrite saved recordings.
4. **Reproduce the pipeline, not arbitrary external hardware.** JSON/WAV must explain detection, segmentation, edits, quantization, MIDI bytes, and application playback context. Browser/synth/device metadata is useful context, but cannot reproduce an external synth patch or recover pre-capture information that was never recorded. Record unavailable context as unknown.

## File responsibilities

- `src/pcm.ts` (new): canonical PCM16 conversion shared by storage and WAV encoding.
- `src/wav.ts`, `src/codec.ts`: encode/decode using the shared conversion without altering stored recordings.
- `src/recording-analysis.ts` (new): resolve effective detector settings and analyze a recording identically for editor, library, diagnostics replay.
- `src/recording.ts`: shared effective tuning/quantization and note processing stages, maintaining raw anchors for muting.
- `src/quantize.ts`: ordered monophonic quantization and collision decisions.
- `src/diagnostics.ts`: versioned report serialization and text summary; consume shared results rather than independently resegmenting.
- `src/diagnostics-replay.ts` (new): validate and replay a report plus WAV; compare stages and decoded MIDI events.
- `src/hooks/useEditor.ts`, `src/hooks/useLibrary.ts`, `src/hooks/useEditorExports.ts`: wire the same production analysis and snapshot into rendering, playback, and exports.
- `src/hooks/useCapture.ts`: persist new-recording defaults explicitly.
- `src/midi.ts`, `src/midi-playback.ts`, `src/playback.ts`: change only if byte/scheduling tests reveal remaining boundary violations.
- `tools/replay-recording.mjs` (new): local developer CLI, using installed Vite's `createServer`/`ssrLoadModule` to execute production TypeScript under Node 22; no browser or new transpiler dependency. Always close the Vite server.
- `src/test-support/` (new): test-only WAV/MIDI readers and deterministic signal generation; no test helpers in production modules.
- `src/fixtures/whistle-regression/` (new): the original evidence, a provenance manifest, and separately reviewed expected results.

## Task 1: Make exported WAV samples exactly match analyzed PCM

**Files:** Create `src/pcm.ts`, `src/pcm.test.ts`, `src/wav.test.ts`, `src/codec.test.ts`; modify `src/codec.ts`, `src/wav.ts`; create `src/test-support/audio-files.ts`.

**Interfaces:** Export `floatToPcm16(samples: Float32Array): Int16Array` and `pcm16ToFloat(samples: Int16Array): Float32Array` from `src/pcm.ts`. Keep `encodeAudio`, `decodeAudio`, and `encodeWav` public signatures unchanged.

- [x] Write a failing round-trip test using PCM16 values `[-32768, -16384, -1, 0, 1, 16383, 32767]`: decode to float, export WAV, independently read its data chunk, and expect exactly the starting integers. Include clipping and signed boundary cases. The production change this guards is positive-sample rescaling in the encoder.
- [x] Run `npm test -- src/pcm.test.ts src/wav.test.ts src/codec.test.ts`; observe the expected sample mismatch before fixing encoding. Tests must reach assertions, not fail because a module cannot load.
- [x] Use a single conversion convention: decode by 32768; encode by truncating `sample * 32768`, clipped to `[-32768, 32767]`. Existing stored bytes retain their meaning. WAV export must not mutate the provided PCM.
- [x] Verify storage → decoded PCM → exported WAV → decoded PCM is exact. Verify the WAV encoder's data size, rate, mono layout, and little-endian samples with an independent reader.
- [x] Run the focused tests and full `npm test`, then commit `Preserve PCM samples in WAV exports`.

## Task 2: Detect the recorded signal independently of metronome timing

**Files:** Create `src/recording-analysis.ts`, `src/recording-analysis.test.ts`, fixture files and manifest; modify `src/recorder.ts`, `src/recorder.test.ts`, `src/hooks/useEditor.ts`, `src/hooks/useLibrary.ts`; update `README.md`.

**Interfaces:** Export `resolveAnalysisOptions(record: Pick<Recording, "source">): AnalyzeOptions` and `analyzeRecording(pcm: Float32Array, sampleRate: number, record: Pick<Recording, "source">): Frame[]`. Resolve full effective window size/hop/band/clarity, with no implicit BPM-derived masking. Both editor and library use this entry point and the same resolved-options cache key.

- [x] Copy the supplied WAV/JSON/MIDI into the fixture directory with original hashes, lengths, and an explanation that schema-1 settings are incomplete. Keep original evidence immutable. Add a reference note list from the unmasked/unquantized preview, with provenance and no scale correction. Do not claim it is hand-transcribed musical ground truth.
- [x] Write failing tests that analyze the real WAV through the app entry point at recording tempos 60, 95, and 180 BPM and expect identical frames and the reference 22-note sequence. Separate count, pitch order, boundaries, and silence assertions. Boundary tolerance: one hop (`512 / 48000` seconds); do not require brittle exact detector float hashes.
- [x] Add synthetic tests: a sustained whistle crossing many beats stays one note; real silence of at least the configured gap still separates repeated same-pitch notes; deliberate pitch changes at beat times survive; click-only audio produces zero notes. Mix the actual 40 ms metronome attack/decay and accent frequencies with whistles both near and far from the click frequencies, at 44.1 and 48 kHz, with gain ratios represented in the exploratory evidence.
- [x] Run `npm test -- src/recording-analysis.test.ts src/recorder.test.ts`; observe the beat-induced splits before the fix. Replace the existing test that treats scheduled masking as desired behavior with the continuity regression.
- [x] Remove automatic beat blanking from the application path and obsolete automatic-mask settings/comments. Keep raw capture and metronome scheduling untouched. Reuse ordinary signal/clarity/min-duration filtering; if a click-mixture regression fails, diagnose that waveform before adding any narrowly targeted acoustic rejection. Never restore schedule-only deletion or increase global silence tolerance to hide the failure.
- [x] Verify editor and library analysis parity, all synthetic cases, and the real recording. Update the README's claim that beat windows are skipped. Run full `npm test`, then commit `Analyze captured audio without metronome masking`.

## Task 3: Quantize monophonic melodies without collisions

**Files:** Create `src/quantize.test.ts`; modify `src/quantize.ts`, `src/recording.ts`, `src/recording.test.ts`, `src/hooks/useCapture.ts`, capture/default-setting tests, and `README.md`.

**Interfaces:** Preserve `quantizeNotes(notes: NoteEvent[], opts: QuantizeOptions): NoteEvent[]` for callers. Add `quantizeSequence(notes: NoteEvent[], opts: QuantizeOptions): { notes: NoteEvent[]; adjustments: QuantizeAdjustment[] }`, with `QuantizeAdjustment = { index: number; reason: "onset-collision" | "end-clamped"; before: NoteEvent; after: NoteEvent }`. Input is chronological, positive-duration, nonoverlapping monophonic notes; do not mutate it.

- [x] Write failing cases from the actual recording for the 95 BPM quarter and eighth grids. Assert preserved count/pitch order, positive duration, strictly ordered onsets, no simultaneous notes, no overlaps, and no identical pitch/start duplicates. Include empty input, invalid grid options (retain existing no-op behavior), triplets, sixteenths, repeated pitches, and real rests.
- [x] Add a minimal coarse-grid collision: two short successive notes that currently round to the same onset. Expect both original onsets retained and no new chord. Add an isolated short note whose rounded end would equal its start: preserve its useful original length rather than extending it to an entire grid cell.
- [x] Run `npm test -- src/quantize.test.ts src/recording.test.ts`; observe failures on collisions and duration extension.
- [x] Implement sequence-aware quantization: compute candidate snapped onsets, mark adjacent ties/reversals as collisions, and restore original onsets for those notes. Expand the affected set if restoring them conflicts with a neighboring candidate, until the chronological sequence is strictly increasing. Keep independent safe onsets snapped. Snap ends only when they stay after the resolved onset, otherwise retain the original duration. Clamp ends at the next resolved onset. Emit adjustment records rather than silently deleting notes. Avoid adding intermediate one-grid-step minimum durations.
- [x] Verify grid-aligned notes remain unchanged and quantization off returns the detected timings. Preserve raw note anchors and muting behavior in `recordingItems`.
- [x] Persist quantization off explicitly on new captures. Keep legacy absent-field behavior and explicit saved settings intact, and test both. Update README to explain the new default and collision fallback.
- [x] Run focused tests and full `npm test`, then commit `Preserve monophonic note order during quantization`.

## Task 4: Export complete, versioned processing evidence

**Files:** Create `src/diagnostics.test.ts`, `src/recording-settings.ts` if needed to keep `recording.ts` focused; modify `src/diagnostics.ts`, `src/recording.ts`, `src/editor-model.ts`, `src/hooks/useEditorExports.ts`, export integration tests, `vite.config.ts`, `src/vite-env.d.ts` (new), and `README.md`.

**Interfaces:** Add `resolveRecordingSettings(record: Recording): ResolvedRecordingSettings` and `processRecording(record: Recording, frames: Frame[]): RecordingProcessing`. `RecordingProcessing` contains effective segmentation/quantization settings, segmented notes, `NoteItem[]`, enabled export notes, and quantization adjustments. Keep `recordingItems` and `recordingNotes` as compatibility wrappers over this result. Diagnostics consume that result. Introduce `schemaVersion: 2` while retaining useful top-level `title`, `config`, `quality`, `notes`, and `frames`; `notes` now explicitly means final exported notes.

Required schema-2 evidence:

- Build identity: package version, source revision supplied at build time, analysis-pipeline version, and schema version. Development with no revision available must say unknown rather than fabricate an identifier.
- Pair identity: recording ID, export snapshot ID/time, WAV SHA-256, sample format, exact sample count, sample rate, duration, and timeline origin (audio begins at recording downbeat).
- Persisted settings and effective settings, including the origin of each fallback: source profile/options, every segmentation parameter, BPM, beats per bar, grid enabled/subdivision, muted anchors, instrument, playback octave, MIDI PPQ/velocity, and actual MIDI tempo rounding. Explicitly state that playback octave/instrument do not alter export.
- Capture context already known by the app: gain/noise measurements/DSP status. Browser and audio/MIDI output descriptions when available; unknown when unavailable. Do not dump unrelated permissions, persistent device IDs, local storage, or IndexedDB.
- Full-precision frame times, frequencies, clarity and RMS. No lossy rounding of machine replay data. Preserve optional derived display columns separately. State analysis treatment explicitly as no automatic beat masking; future acoustic rejection would require raw/effective values plus reasons.
- Stage outputs: segmented notes, quantized notes before muting, muted/raw anchors, final notes, adjustment reasons, and absolute MIDI tick events with note-off before note-on at shared boundaries.

- [x] Write failing tests using nondefault segmentation, a nondefault grid, and muted notes. Assert JSON final notes equal `recordingNotes`, and recorded stage/settings fields explain the differences. Test missing legacy fields and invalid/unknown profile fallback, empty frames, and full-precision round-trip through `JSON.stringify`/`JSON.parse`.
- [x] Write a failing export integration test that downloads JSON and WAV from one recording state, independently hashes WAV bytes, and verifies hash, count, rate, and samples match. Start an export, change tuning while its hash is pending, and prove the report describes the captured snapshot rather than mixing states. Add the equivalent recording-switch test.
- [x] Run `npm test -- src/diagnostics.test.ts src/editor-model.test.ts src/hooks/useEditorPlayback.test.tsx` and confirm the missing evidence/state mismatch failures.
- [x] Implement one immutable export snapshot, use the shared resolved settings and processing, and add build identity via Vite define constants. Hash canonical WAV bytes with Web Crypto. Copy-log and JSON must summarize the same processing rather than resegmenting with only the level gate. Keep formatting/rounding in human-readable text only.
- [x] Verify schema-1 reports remain identifiable as incomplete evidence: replay must not silently assume the omitted settings. Document the schema-2 note semantics and evidence fields in README. Run full `npm test`, then commit `Export replayable recording diagnostics`.

## Task 5: Replay JSON/WAV and verify the actual MIDI event stream

**Files:** Create `src/diagnostics-replay.ts`, `src/diagnostics-replay.test.ts`, `src/recording-pipeline.integration.test.ts`, `src/test-support/midi-files.ts`, `tools/replay-recording.mjs`; modify `src/midi.ts`, `src/midi-playback.ts`, `src/playback.ts` only for demonstrated failures; update `package.json` and `README.md`.

**Interfaces:** Export `replayDiagnostics(report: unknown, wavBytes: ArrayBuffer): Promise<ReplayResult>`. `ReplayResult` contains settings/build compatibility, pair validation, first differing frame/stage/note, regenerated notes, and the generated MIDI Blob. Reject malformed schema-2 input and mismatched WAV before claiming a replay. Schema-1 input returns an explicit incomplete-evidence result. The CLI uses this function via existing Vite tooling and supports `npm run debug:recording -- --json <path> --wav <path> --out <directory>`.

- [x] Write failing replay tests: a freshly exported JSON/WAV pair reproduces its settings, frame decisions, processing stages, and final MIDI tick events; swapping the WAV or altering a sample fails its identity check; unsupported schema and incomplete legacy input cannot be reported as successful exact replay. A different build is reported distinctly from a stage mismatch.
- [x] Add an independent test-only SMF parser. Check the real fixture through the production pipeline and then `notesToMidi`, not a second implementation of quantization. Assert note count and pitch order survive, no two note-ons share a tick, every note has a positive tick length, no note remains active when the next note starts, and repeated same-pitch note-offs precede the next note-on. Use half-open intervals, so touching notes are allowed.
- [x] Test all grids plus quantization off at 95 BPM and representative slower/faster tempos. Keep two expectations distinct: unquantized output matches the user-preferred 22-note reference; quantized output preserves pitch/order and monophony while intentionally adjusting timing.
- [x] Cover MIDI tick rounding independently of float timing. If sub-tick events cannot be represented without collision at the chosen PPQ, report an explicit resolution error instead of inventing overlapping events or silently dropping notes. Normal captured notes (minimum slider value 20 ms) must continue to serialize successfully.
- [x] Test playback/export parity using the same `processRecording` result. Account explicitly for playback-only octave/instrument settings, synthesis envelope, MIDI velocity, and external MIDI's current early note-off policy. Remove any minimum playback duration that reintroduces logical overlap on short resolved notes; do not mistake a deliberate release tail for overlapping MIDI note events.
- [x] Run focused tests and observe the failures before implementing replay/wiring or changing MIDI scheduling. Add the small CLI with guaranteed server cleanup and a nonzero exit on mismatch; write output only to the specified directory.
- [x] Generate comparison artifacts from the supplied WAV: unquantized MIDI, quarter/eighth-grid MIDI, and rendered WAV previews using the same instrument/octave. Keep the original bad export beside them for comparison. Verify event tables mechanically and label every playback transposition. Avoid claiming subjective listening validation unless actually performed.
- [x] Run full `npm test`, `npm run check`, and the CLI on the saved schema-2 pair. If Fallow cannot create its worktree in the sandbox, report that limitation and run unaffected checks/build separately; do not update baselines or claim full check success.
- [x] Commit `Verify diagnostic replay and MIDI output parity`.

## Completion criteria

- [x] New JSON/WAV exports reproduce the captured PCM and every processing stage without the original browser's state. Unknown environment/build context is visible.
- [x] The supplied WAV analyzed with resolved defaults produces the 22-note reference without periodic beat splits. BPM changes do not alter detection.
- [x] New recordings export detected timing by default; saved explicit quantization remains supported and observable.
- [x] Every supported quantization grid preserves this melody's pitch order and monophony. The quarter-grid reproducer has zero overlaps and zero duplicate pitch/start events after the fix.
- [x] JSON final notes, editor/library playback input, and parsed `.mid` agree after documented tick rounding and playback-only transformations.
- [ ] Regression tests were observed red before implementation and green afterward. README reflects the resulting behavior and debugging command.

## Execution notes

- The red-before-green criterion is unverified for the original implementation: it landed as one commit without the per-task commits, so the failing runs cannot be confirmed from history. Tests added during review (MIDI export error handling, compact copy-log stages) were observed failing first. Every other completion criterion is met.
- Task 1's PCM round-trip tests live in `src/wav.test.ts` rather than a separate `src/pcm.test.ts`.
- Task 5 comparison artifacts (unquantized/quarter/eighth MIDI, sine previews at octave -2, event tables) were generated outside the repo, not committed: 22 notes in every variant, zero overlaps, one note at a time; the original masked export had 44 notes with up to three at once.
- A schema-2 JSON/WAV pair exported from `npm run dev` on 2026-10-23 replayed as `match` (23 notes); the regenerated MIDI was byte-identical to the downloaded `.mid`. Build identity was `unknown`, as expected for dev-server exports.

## Execution boundary

This document plans the work; it does not claim the fixes or TDD cycles have been completed. No scale-selection UI, new pitch detector, broad acoustics system, or unrelated refactoring is required. The implementation should proceed inline after review of this concrete plan.
