# Coverage and Focused Refactoring Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox syntax for tracking. Implementation and automated review complete. User owns all commits; agent must not stage or commit.

**Goal:** Establish measured test coverage, then simplify trace rendering, editor orchestration, note segmentation, capture orchestration, and MIDI output without changing user behavior.

**Architecture:** Capture current behavior before moving code. Extract cohesive rendering stages and lifecycle owners while retaining the existing screen APIs and note-processing results. Keep small pure helpers private unless a real consumer needs them.

**Tech Stack:** TypeScript, React 19, Vitest 5.0.5, V8 coverage, Fallow, Canvas 2D, Web Audio, Web MIDI.

**Spec:** The user's October 23 request and the scope/decisions below. This is a refactoring plan, not a feature redesign.

## Scope and decisions

- Implement the first five targets from the assessment: `trace.ts`, `useEditor.ts`, `notes.ts`, `useCapture.ts`, and `midiout.ts`.
- Ignore churn in prioritization and acceptance. Do not use the aggregate health score as the success criterion because it includes churn.
- Exclude styling/CSS work. Leave `take.ts` together. Do not refactor the pitch-detection algorithm.
- Preserve routes, component-facing hook return shapes, storage schema, tuning defaults, note timing, MIDI protocol behavior, and audio scheduling.
- Prefer six sequential, independently reviewable change sets for the user to commit: coverage infrastructure plus one commit per target. Add characterization tests and extract code within each target's commit.
- Do not require new characterization tests to fail against correct current behavior. Run them before and after extraction; when a test exposes a bug, document it and separate its fix from the refactor.
- Measure coverage before choosing numerical thresholds. Do not add arbitrary global percentage gates or exclude difficult production files to improve the number.
- Do not enlarge Fallow baselines or suppress findings to make refactors pass. Prune resolved baseline entries; investigate any new findings.

## Approach

Use incremental extraction with behavior tests. A combined rewrite would make regressions hard to locate. Splitting every flagged file would add unnecessary boundaries, particularly around the already cohesive take-processing helpers. Preserve the public APIs and introduce only boundaries that own a rendering stage or a resource lifecycle.

Baseline from the assessment: 28 tests in 13 files pass; 9 functions exceed a complexity/risk threshold. Cognitive complexity: `drawTrace` 52, `useEditor` 62, `segmentNotes` 32, `useCapture` 48. CRAP risk scores are currently estimates. Refresh these figures at execution time.

## Review focus

1. Canvas state leaks: muted-note dashes and active-note opacity must not affect subsequent layers or redraws (Task 2).
2. Editor async work: leaving/changing takes must stop playback and flush tuning without overwriting newer edits (Task 3).
3. Note boundaries: silence, debounce, hysteresis, and repeated-note merging must retain exact timing semantics (Task 4).
4. Capture cancellation: stale microphone/recorder promises must dispose resources and never restart a departed screen (Task 5).
5. MIDI cancellation: stopping before scheduled playback completes must clear queued events where supported and send note-offs (Task 6).

## Task 1: Measure coverage and connect it to Fallow

**Files:** Modify `package.json`, `package-lock.json`, `vite.config.ts`, `.gitignore`, `README.md`, and `.github/workflows/pages.yml`.

**Interfaces:** Produce `coverage/coverage-final.json` (Istanbul JSON map), `coverage/coverage-summary.json`, and an HTML report. Add `test:coverage` and `metrics:coverage` scripts.

- [x] Install `@vitest/coverage-v8` at the exact installed Vitest version (currently `5.0.5`); preserve compatibility when updating the lockfile.
- [x] Use `defineConfig` from `vitest/config` in the existing Vite config. Keep the React plugin and Vite server/build options. Configure V8 coverage with `include: ["src/**/*.{ts,tsx}"]`, test-file exclusions, `reportsDirectory: "coverage"`, and reporters `text`, `json`, `json-summary`, `html`. Keep coverage opt-in.
- [x] Add `test:coverage` as `npm test -- --coverage`. Add `metrics:coverage` as `npm run test:coverage && fallow health --complexity --file-scores --coverage coverage/coverage-final.json --report-only`. The latter always regenerates coverage before reading it and omits hotspot/target rankings.
- [x] Ignore `coverage/`. Document both scripts, report locations, and the distinction between runtime coverage and Fallow's static dependency reachability.
- [x] Update `check` to run `test:coverage` in place of its existing `npm test` invocation and run coverage-aware Fallow metrics afterward. Do not run the suite twice through `metrics:coverage`; invoke Fallow directly in this path. Keep existing checks, including formatting, without adding CSS cleanup.
- [x] In `.github/workflows/pages.yml`, upload `coverage/` after checks using a separate coverage artifact step with `if: always()` and `if-no-files-found: ignore`; keep the Pages artifact limited to `dist`. A test failure must remain a CI failure.
- [x] Run `npm run metrics:coverage`. Verify the JSON report contains production files even when their implementations are mocked or never called. Inspect zero-hit functions in `pitch.ts`, `trace.ts`, and MIDI playback rather than treating module imports as coverage.
- [x] Save the measured baseline summary in this plan: statements, branches, functions, and lines for all source and each target. Record which Fallow entries use measured versus estimated coverage. Do not commit generated coverage artifacts.
- [x] Run `npm run check`; suggested user commit: `test: measure runtime coverage and report Fallow risk`.

Reference: [Vitest coverage guide](https://main.vitest.dev/guide/coverage) and [coverage configuration](https://main.vitest.dev/config/coverage). Fallow's installed `health --help` confirms support for `--coverage coverage/coverage-final.json` and section filters.

## Task 2: Extract trace rendering stages

**Files:** Modify `src/trace.ts`; create `src/trace.test.ts`.

**Interfaces:** Preserve `TraceView`, `autoRange(frames: Frame[])`, and `drawTrace(canvas: HTMLCanvasElement, frames: Frame[], view: TraceView): void`. Introduce a private `TraceGeometry` containing `width`, `height`, `semitoneHeight`, `xOf(t: number): number`, and `yOf(midi: number): number`.

- [x] Add a small stateful Canvas 2D test double that records drawing operations together with current stroke/fill style, alpha, line width, and dash settings. Exercise the real `drawTrace`; do not mock it in this test file.
- [x] Characterize: device-pixel-ratio resizing and transform; zero-width time/pitch ranges; default and voiced `autoRange`; beat/subdivision/bar placement; silence and out-of-window frames breaking pitch lines; faint traces behind notes; muted outlines; narrow notes omitting labels. Assert representative coordinates and layer order rather than a snapshot of every canvas call.
- [x] Specifically render muted and active notes together and redraw on the same context. Assert active notes use solid outlines and subsequent operations have restored alpha 1.
- [x] Run `npm test -- src/trace.test.ts` and confirm the tests pass before extraction.
- [x] Keep canvas sizing/clearing and geometry construction in `drawTrace`. Extract private `drawPitchGrid(ctx, geometry, view)`, `drawBeatGrid(ctx, geometry, view)`, `drawPitchFrames(ctx, geometry, frames, view)`, and `drawNoteBars(ctx, geometry, view)` functions. Type `ctx` as `CanvasRenderingContext2D`, `geometry` as `TraceGeometry`, and `view` as `TraceView`; each returns `void`. Preserve the original order and state transitions. Do not introduce a renderer class or export helpers for testing.
- [x] Run the trace and existing capture/editor tests, then the standard completion checks below. Confirm no extracted function has simply inherited the original critical complexity. Suggested user commit: `refactor: separate trace rendering stages`.

## Task 3: Separate editor playback and export lifecycles

**Files:** Modify `src/hooks/useEditor.ts`; create `src/hooks/useEditorPlayback.ts`, `src/hooks/useEditorExports.ts`, and `src/hooks/useEditorPlayback.test.tsx`; extend `src/components/Editor.loaded.test.tsx`.

**Interfaces:** Preserve the existing `useEditor(id)` return shape. `useEditorPlayback({ takeId, recordRef, pcmRef, notes })` consumes `takeId: string`, `recordRef: RefObject<Recording | null>`, `pcmRef: RefObject<Float32Array>`, and `notes: NoteEvent[]`. Return `{ playing, position, externalOutput, togglePlayback(kind: "audio" | "midi"), previewNote(note: NoteEvent), stopPlayback() }`; methods return `void`.

`useEditorExports({ takeId, recordRef, pcmRef, frames, statsRef })` consumes `takeId: string`, the same recording/audio refs, `frames: Frame[]`, and `statsRef: RefObject<QualityStats | null>`. Return `{ logRef, reportText, copyStatus, downloadMidi, downloadWav, downloadJson, copyLog }`, matching existing types. Derive export notes from the current recording and frames using `takeItems`, retaining muting/quantization behavior.

- [x] Extend tests for audio/MIDI toggling, natural completion, preview replacement, output-change interruption, take-ID change, and unmount. Assert `Playback.stop()` and RAF cancellation; assert late ticks do not update a departed take. Use deterministic fake clocks and playback handles.
- [x] Retain and run existing rename-after-tuning and leave-before-debounce tests. Add changing take IDs while a tuning save is pending: the old take is flushed and the new take is not overwritten. Keep loading, `recordRef`, replacement, persistence, and tuning debounce together in `useEditor`.
- [x] Add export checks for MIDI's enabled/quantized notes, WAV sample rate/audio, JSON diagnostics, and clipboard rejection selecting the fallback text. Verify report/copy state resets on take change and a late clipboard promise cannot update the new take. Mock downloads/clipboard at their external boundaries and inspect payloads.
- [x] Run those tests against the existing hook before extraction.
- [x] Move playback state, playback/preview handles, RAF ownership, MIDI subscription, and their cleanup into `useEditorPlayback`. Let this hook handle cleanup on `takeId` change as well as unmount; avoid competing cleanup owners in `useEditor`. Pass a clicked note to `previewNote` after the existing hit/mute logic.
- [x] Move filenames, downloads, report/copy state, and clipboard fallback into `useEditorExports`. Preserve current filenames and metadata. Retain canvas drawing, view derivation, and editing actions in `useEditor`; do not split every callback into another hook.
- [x] Run focused tests and completion checks. Compare cognitive complexity and API size across all three hooks, not just the smaller entry hook. Suggested user commit: `refactor: separate editor playback and exports`.

## Task 4: Extract the note segmentation pipeline

**Files:** Modify `src/notes.ts`; create `src/notes.test.ts`; retain `src/take.test.ts` as integration coverage.

**Interfaces:** Preserve `segmentNotes(frames: Frame[], opts?: SegmentOptions): NoteEvent[]`, note/frequency helpers, exported types, and every default. Add private stage functions: `voicedPitches(frames, cfg): (number | null)[]`, `medianSmooth(pitches, window): (number | null)[]`, `stickyLabels(pitches, hysteresis): (number | null)[]`, `collectEvents(frames, smooth, labels, cfg): NoteEvent[]`, and `mergeAdjacent(events, silenceGapSec): NoteEvent[]`. Use `cfg: Required<SegmentOptions>`, `window: number`, `hysteresis: number`, and `silenceGapSec: number`.

- [x] Build deterministic frame fixtures at 20 ms intervals using `440 * 2 ** ((midi - 69) / 12)` for voiced samples; use explicit clarity/RMS and timestamps. Assert complete output events and numeric times with suitable floating-point tolerance.
- [x] Characterize empty/unvoiced input, gates immediately below/at threshold, stable pitch, isolated jitter, hysteresis boundary crossing, a brief rejected pitch change, sustained accepted pitch change, trailing active-note closure, and notes immediately below/at minimum duration.
- [x] Cover short silence continuing a note, silence closing a note, same-pitch rearticulation remaining separate, and adjacent relabeled same-pitch events merging. Assert input frames remain unchanged. Use custom options to isolate each rule from smoothing/debounce where needed.
- [x] Run `npm test -- src/notes.test.ts src/take.test.ts` before extraction. Record current outputs for cases where the interaction of rules is surprising; do not silently reinterpret the algorithm.
- [x] Extract the five stages in their current order. Keep candidate/current-note state and final closure inside `collectEvents`; retain the existing upper-median selection and strict/inclusive comparisons. Keep all stages private in `notes.ts`.
- [x] Rerun focused tests and completion checks. Review complexity within `collectEvents` separately: the state machine may retain justified branching, while `segmentNotes` should clearly express the pipeline. Suggested user commit: `refactor: express note segmentation as stages`.

## Task 5: Separate microphone monitoring from capture orchestration

**Files:** Modify `src/hooks/useCapture.ts`; create `src/hooks/useMicrophone.ts` and `src/hooks/useMicrophone.test.tsx`; extend `src/components/Capture.ready.test.tsx` and `src/components/Capture.record.test.tsx`.

**Interfaces:** Preserve the component-facing `useCapture()` return shape. Introduce `useMicrophone({ isBusy, onError, onBeforeClose })`, where `isBusy(): boolean` synchronously reads the parent's recording/starting refs and `onError(message: string): void` writes existing status text. Pass stable callbacks. `onBeforeClose(): void` lets the capture owner dispose its recorder/metronome before the microphone closes, including on device switches.

The microphone hook owns the mic, detector, monitoring RAF, device enumeration, gain, room calibration, trace canvas ref, checks, and noise timer. Return the existing corresponding UI fields/actions, plus `currentMic(): MicHandle | null`, `isCurrentMic(handle: MicHandle): boolean`, and `captureSettings(): { gain: number; noiseFloor: number }`. `isCurrentMic` checks both handle identity and mounted status. Keep any generation counter private for competing device-open requests.

- [x] Add tests for two device requests resolving out of order, unmount during open, calibration reset on device switch, calibration timer cancellation, RAF cancellation, and microphone closure. Assert obsolete handles close and only the newest request starts a monitor loop.
- [x] Extend recording tests for unmount during context resume and recorder creation: no recording starts afterward and a late recorder is disposed. Retain the duplicate-start guard, calibration requirement, count-in trimming, metadata, and encoding-failure tests.
- [x] Add a short-recording case verifying no save occurs; verify metronome and recorder cleanup while counting in and recording. Assert device switching remains blocked synchronously during starting/recording.
- [x] Run capture tests before extraction.
- [x] Move microphone monitoring/calibration ownership into `useMicrophone`. Keep recorder, metronome/beat feedback, start/stop/save, and navigation in `useCapture`. Replace cross-await generation checks in recording startup with `isCurrentMic(opened)`; retain a capture-owned mounted guard for saves/navigation. The monitor must neither dispose the recorder nor stop the metronome.
- [x] Preserve the existing order of cleanup and the shared AudioContext clock. Do not introduce a generic session framework or rework capture UX. Rerun tests and completion checks; suggested user commit: `refactor: isolate microphone monitoring lifecycle`.

## Task 6: Separate MIDI scheduling from output selection

**Files:** Modify `src/midiout.ts` and `src/playback.ts`; create `src/midi-playback.ts` and `src/midi-playback.test.ts`; extend `src/midiout.test.tsx`.

**Interfaces:** Move `playNotesMidi(out: MIDIOutput, notes: NoteEvent[], duration: number, octave: number): Playback` unchanged to `midi-playback.ts`. Keep `Playback` as a type-only import from `playback.ts`; keep port discovery, access, preferences, and subscriptions in `midiout.ts`. Update `playback.ts` to import the scheduler directly; do not add a re-export shim.

- [x] Test scheduling against a fake MIDI output and fixed `performance.now()`: 50 ms lead, octave shift, rejection outside MIDI 0–127, velocity 100, note-off 5 ms early with a 20 ms minimum, and playback end covering the longest note or requested duration.
- [x] Test stop before the first scheduled note, optional `clear()` presence/absence, note-offs for tracked keys, channel-1 all-notes-off, repeated stop idempotence, and null position after stop/completion. Run these tests first against the current export.
- [x] Add port tests for absent/denied MIDI access, restoring the selected port, disconnected-port fallback, and unsubscribe behavior. Reset module singleton state between independent cases; use existing component coverage for hostile port identifiers.
- [x] Move only scheduling into `midi-playback.ts`, update imports and the scheduler test import, and rerun tests. Do not change output-selection behavior or add a shared utility module just for the existing type-only dependency.
- [x] Run completion checks and confirm no new runtime import cycle. Suggested user commit: `refactor: separate MIDI scheduling from port selection`.

## Completion checks for each refactor

- [x] Run the target's tests and `npm run check` (which captures fresh coverage after Task 1).
- [x] Review `fallow health --complexity --file-scores --coverage coverage/coverage-final.json --report-only`; compare measured coverage and complexity for the changed functions and all extracted helpers. Ignore churn and CSS findings in this review.
- [x] Run `fallow architecture` and `fallow dead-code` using the installed binary. Require no new dependency cycles or dead production exports.
- [x] Review the full branch diff with `fallow audit --base <starting-commit> --health-baseline .fallow-health-baseline.json --fail-on-baseline-growth --baseline-base origin/main`, not just the existing npm script's `HEAD^` scope. Resolve findings without broadening the baseline. Preserve the starting commit hash at execution start.
- [x] Record per-target before/after coverage and complexity. Accept a change when it preserves behavior and creates a clear responsibility boundary; a better aggregate score alone is insufficient.

## Final review

- [x] Verify all five targets are addressed, `take.ts` and CSS are untouched, and pitch detection has not changed.
- [x] Check tests exercise real refactored implementations rather than only their mocks. Remaining hardware integration limits must be stated explicitly.
- [ ] Perform a browser smoke check with a real mic and available MIDI output: calibrate, count in, save, reopen, tune, rename, mute, play audio/MIDI, change output, and export. If hardware is unavailable, report that verification gap without claiming it passed.
- [ ] Review the measured results and decide whether focused coverage gates are now justified. Setting those gates is a follow-up decision, not a requirement to reach an arbitrary percentage in this refactor.

## Measured baseline (before extraction)

| File                    | Statements | Branches | Functions | Lines  |
| ----------------------- | ---------- | -------- | --------- | ------ |
| All source              | 45.44%     | 41.5%    | 52.51%    | 47.08% |
| src/midiout.ts          | 47.54%     | 40%      | 71.42%    | 47.05% |
| src/notes.ts            | 80.72%     | 60.37%   | 100%      | 80.55% |
| src/trace.ts            | 7.4%       | 1.78%    | 50%       | 5.94%  |
| src/hooks/useCapture.ts | 87.55%     | 66.27%   | 76.19%    | 92.14% |
| src/hooks/useEditor.ts  | 67.08%     | 47.32%   | 68.18%    | 72.68% |

Fallow matched 278/416 functions to runtime coverage; unmatched functions still use estimates. `drawTrace` and the pitch detector were never executed in the baseline despite their modules being reachable from tests.

## Execution results

All six change sets are implemented and left uncommitted for the user. The early commit attempt failed during signing; HEAD remains `71e9dcd`. Files staged by that attempt were not restaged or unstaged afterward.

| File                           | Statements | Branches | Functions | Lines  |
| ------------------------------ | ---------- | -------- | --------- | ------ |
| All source                     | 69.43%     | 65.29%   | 68.78%    | 71.38% |
| src/midi-playback.ts           | 100%       | 100%     | 100%      | 100%   |
| src/midiout.ts                 | 100%       | 100%     | 100%      | 100%   |
| src/notes.ts                   | 100%       | 100%     | 100%      | 100%   |
| src/trace.ts                   | 100%       | 96.42%   | 100%      | 100%   |
| src/hooks/useCapture.ts        | 89.62%     | 64.86%   | 71.42%    | 93.68% |
| src/hooks/useEditor.ts         | 79.39%     | 67.07%   | 81.25%    | 86.33% |
| src/hooks/useEditorExports.ts  | 92.85%     | 65%      | 100%      | 100%   |
| src/hooks/useEditorPlayback.ts | 98.24%     | 92.85%   | 100%      | 100%   |
| src/hooks/useMicrophone.ts     | 97.76%     | 90%      | 100%      | 100%   |

| Entry point   | Cognitive before | Cognitive after | Notes                                                                                                         |
| ------------- | ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------- |
| drawTrace     | 52               | 4               | Largest rendering stage is drawPitchFrames at 18.                                                             |
| useEditor     | 62               | 45              | Playback 13; exports 11. Editor remains flagged critical, with loading/persistence/editing retained together. |
| segmentNotes  | 32               | 0               | State machine remains explicit in collectEvents at 21.                                                        |
| useCapture    | 48               | 22              | Microphone 14; room calibration 11; live trace 8.                                                             |
| playNotesMidi | 4                | 4               | Moved unchanged; port selection and scheduling now have separate owners.                                      |

Validation: `npm run check` passes, including typecheck, lint, format, duplication, 75 tests in 18 files with coverage, baseline audit, measured metrics, and production build. Full-change audit against `71e9dcd` passes. Fallow architecture and dead-code checks report no issues. Baselines were pruned (health entries 11 to 6; duplicate groups 2 to 0), with no additions. CSS, take.ts, and the pitch detector implementation are unchanged.

An independent read-only reviewer found no introduced production defect. Follow-up tests address its three gaps: exact exported MIDI timing/muting, root StrictMode replay, and queue behavior on MIDI ports without clear(). The clipboard and playback stale-callback regression tests were also verified to fail when their guards were temporarily removed, then pass after restoration.

Execution adjustments: coverage generation precedes audit so Fallow never consumes stale pre-refactor data in check. Room calibration and live trace monitoring are private hooks in useMicrophone.ts; capture supplies onBeforeClose for resource release order. Device metadata is stored together, while high-frequency signal state stays separate. Existing screen-facing hook APIs are preserved. Editor tests exercise its public facade and both extracted implementations rather than mocking the new hooks.

Remaining verification: no real microphone/MIDI browser smoke test was performed; this environment has no `/dev/snd` audio device. Ports without clear() retain the preexisting limitation that immediate note-offs cannot cancel future queued note-ons. Numeric coverage gates remain deferred; measured risk elsewhere (library playback, buffer analysis, storage estimates) is outside these five refactors. Fallow still estimates risk for functions it cannot map to coverage; module-level percentages do not imply every function-level score is exact.
