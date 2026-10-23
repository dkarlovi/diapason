# Recording Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, or superpowers:subagent-driven-development if the user explicitly chooses delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace New recording with a source-aware, progressively unlocked wizard, persistent checks, a shared live beat/pitch/level monitor, and manual/tap/clap tempo selection; rename take concepts throughout.

**Architecture:** Pure models own prerequisites, bounded measurements, and tempo estimation. Hooks own microphone sampling, clap onset timing, playback, and cancellation; shared UI renders the monitor and status rows. Source profiles drive both live and saved-recording analysis.

**Tech Stack:** React 19, strict TypeScript, Vite, Web Audio, canvas, IndexedDB, Vitest, React Testing Library; Node 22+.

**Spec:** [Recording wizard design](../specs/2026-10-23-recording-wizard-design.md). Read it with this plan; proposed acoustic defaults require real-device validation.

## Global Constraints

- Use **recording** throughout the application and its implementation.
- Replace take URLs directly; no aliases or redirects are required.
- Keep `/diapason/`, local IndexedDB recordings, one-bar count-in, MIDI/WAV exports, and click masking.
- Humming and instruments are future capabilities; initially expose only whistling.
- Calibration results persist within the open wizard; transient live feedback never clears them.
- BPM is an integer 40–220; beats per bar is an integer 1–12.
- Use existing dependencies; do not grow committed duplication or health baselines.
- Before product implementation, read applicable frontend, debugging/TDD, and verification skills; run modern-web-guidance for wizard accessibility and Web Audio capture/timing. This document adds no product code.

## Review Focus

- Suspended audio contexts, hidden tabs, and dropped sampling must not produce successful empty calibration (Tasks 4, 7).
- Device/gain edits during asynchronous measurements must invalidate old callbacks (Tasks 3, 4).
- Clap tails, ambient impulses, and audible metronome feedback must not yield false stable tempo (Tasks 6, 7).
- Count-in/grid/audio time origins must agree across preview, stop/restart, and recording (Tasks 5, 8).
- Stored recordings must retain audio and consistent analysis while terminology and source metadata change (Tasks 1, 2, 8).

## File responsibilities

- Rename `src/take.ts` and its test to `src/recording.ts` and `src/recording.test.ts`: shared note calculations.
- `src/recording-profiles.ts` (+ test): source definitions and effective analysis options.
- `src/recording-setup.ts` (+ test): workflow state, result dependencies, eligibility.
- `src/capture-model.ts` (+ existing test): pure room/sound verdicts and input setting status.
- `src/tempo-model.ts` (+ test): tap/clap interval estimate and tempo bounds.
- `src/clap-detector.ts` (+ test): sample-based transient onset extraction.
- `src/hooks/useRoomCalibration.ts`, `useSoundCheck.ts` (+ tests): bounded measurement lifecycles extracted from microphone ownership.
- `src/hooks/useMicrophone.ts` (+ existing test): one live pipeline and device ownership; provide observations separately from completed checks.
- `src/hooks/useTempo.ts` (+ test): tempo input/listening/preview lifecycle.
- `src/hooks/useCapture.ts`: compose setup, microphone, tempo, recorder, and persistence.
- `src/components/StatusChecklist.tsx`, `LiveMonitor.tsx`, `TempoSetup.tsx` (+ behavior tests): reusable presentation.
- `src/components/Capture.tsx` (+ existing capture tests): six-step progressive flow and summaries.
- `src/trace.ts` (+ existing test): shared static/live grid rendering.
- Existing router, storage, analysis consumers, library/editor UI, CSS, diagnostics, tests, and README change with their owning task.

## Execution order

Tasks are sequential integration slices. Each task uses its listed tests: add regression cases, run them and confirm the expected failure, implement, rerun to green, then make a focused commit if implementation includes commits. Do not commit this planning work automatically.

### Task 1: Replace take terminology and routes

**Files:** Rename `src/take.ts`, `src/take.test.ts`; modify `src/router.ts`, `src/main.tsx`, library/editor/capture hooks and components, `src/styles.css`, relevant tests, comments, and `README.md`.

**Interfaces:** Export `recordingPath(id: string): string`, `recordingItems(record: Recording, frames: Frame[]): NoteItem[]`, and `recordingNotes(record: Recording, frames: Frame[]): NoteEvent[]`. Route is `/recording/:id`, under the existing BrowserRouter basename.

- [ ] Update observable route/copy tests: `recordingPath("recording/one") === "/recording/recording%2Fone"`; navigation reaches `/diapason/recording/first`; library/editor/new default names use Recording. Confirm current code fails those expectations.
- [ ] Rename modules/imports, `TakeRoute`, helpers, domain variables, CSS classes, export fallbacks, and recording-related test descriptions/fixtures. Remove the microphone helper variable named `session`. Preserve ordinary English verbs such as “takes note events.” Do not add old-route handling, delete stored recordings, or rewrite user-authored names.
- [ ] Run `npm test -- src/router.test.ts src/router.integration.test.tsx src/recording.test.ts src/components/Library.test.tsx src/components/Editor.test.tsx src/components/Editor.loaded.test.tsx src/hooks/useEditorPlayback.test.tsx` and `npm run typecheck`. Expect passes. Search `src` and `README.md` for take/takes/session remnants; inspect hits rather than banning ordinary English.
- [ ] Commit the terminology and route change as one reviewable slice.

### Task 2: Source profiles and consistent analysis

**Files:** Create `src/recording-profiles.ts`, `src/recording-profiles.test.ts`; modify `src/db.ts`, `src/hooks/useMicrophone.ts`, `src/hooks/useCapture.ts`, `src/hooks/useEditor.ts`, `src/hooks/useLibrary.ts`, `src/editor-model.ts`, `src/diagnostics.ts`, relevant tests.

**Interfaces:** `SoundProfile` owns `id`, label/instructions, `analysis: Required<Pick<AnalyzeOptions, "windowSize" | "hop" | "minFreq" | "maxFreq" | "clarityThreshold">>`, and sound-check thresholds. Export `SOUND_PROFILES`, `getSoundProfile(id: string): SoundProfile`, and `analysisOptionsFor(record: Recording): AnalyzeOptions`. Add optional `source: { profileId: string; analysis: SoundProfile["analysis"] }` to `Recording`; missing metadata resolves to whistle settings. Keep click-mask BPM supplied by the recording at each analysis call.

- [ ] Add tests asserting whistle range 250–3000, clarity 0.9, window 2048/hop 512; missing metadata uses those defaults; stored effective options beat changed profile defaults; invalid/unknown metadata uses a safe whistle fallback. Verify failures.
- [ ] Implement one selectable whistle profile and supply its options to live detection and editor/library analysis. Persist effective options on new recordings and copies; include them in diagnostics. Ensure changing analysis settings clears any library analysis cache. Keep user tuning and calibrated gate separate from detector parameters.
- [ ] Run `npm test -- src/recording-profiles.test.ts src/editor-model.test.ts src/hooks/useEditorPlayback.test.tsx src/components/Library.test.tsx` and `npm run typecheck`; expect passes.
- [ ] Commit source-profile plumbing without exposing unsupported capabilities.

### Task 3: Explicit wizard state and retained results

**Files:** Create `src/recording-setup.ts`, `src/recording-setup.test.ts`.

**Interfaces:** Export `SetupStep = "sound" | "microphone" | "room" | "sound-check" | "tempo" | "record"`; `CheckStatus = "unchecked" | "checking" | "passed" | "attention"`; `SetupCheck { id: string; label: string; status: CheckStatus; detail: string; blocking: boolean }`; `SetupState`, `SetupAction`, `setupReducer(state: SetupState, action: SetupAction): SetupState`, `nextSetupStep(state: SetupState): SetupStep`, and `canRecord(state: SetupState): boolean`. Store a dependency revision with every asynchronous measurement action; mismatched results are ignored. Keep confirmed tempo independent of earlier measurement validity.

- [ ] Write tests for ordered unlocking, unknown/failed prerequisites, all invalidation rules in the spec, retained results after silence, reopening without changes, failed explicit retests replacing success, stale callbacks after device/gain edits, and room remeasurement invalidating sound. Verify failures.
- [ ] Implement the reducer and selectors; editing a value triggers invalidation only when it actually changes. `canRecord` requires all prerequisites and no ongoing measurement, count-in, recording, or save. A microphone loss immediately blocks recording.
- [ ] Run `npm test -- src/recording-setup.test.ts`; expect passes.
- [ ] Commit the setup model.

### Task 4: Bounded room and sound checks

**Files:** Modify `src/capture-model.ts`, its test, `src/hooks/useMicrophone.ts`, its test; create `src/hooks/useRoomCalibration.ts`, `src/hooks/useSoundCheck.ts` and tests; modify `src/ui.ts` only where needed to avoid conflating editor diagnostics with setup results.

**Interfaces:** Export `evaluateRoom(samples: Array<{ t: number; rms: number; peak: number }>): { floor: number; gate: number; checks: SetupCheck[]; pass: boolean }` and `evaluateSound(frames: Frame[], peak: number, floor: number, profile: SoundProfile): { checks: SetupCheck[]; pass: boolean }`. `useMicrophone` exposes timestamped post-gain observations `{ t, samples, frame, peak }` to registered listeners through `subscribe(listener): () => void`; samples are borrowed and must be consumed synchronously. Measurement hooks expose `start()`, `cancel()`, `checks`, and completed results; reducer actions attach input revision.

- [ ] Add pure tests at and around every spec threshold, including explicit Low room noise, invalid values, empty/stalled input, clipping despite a quiet RMS, and steadiness advice not blocking success. Verify failures.
- [ ] Add lifecycle tests for 1.5 s room/2 s sound windows, minimum sample coverage, suspended contexts, repeat/cancel, gain/device changes mid-test, unmount, silence after success, and no late result from an old stream. Verify failures.
- [ ] Implement checks using centralized defaults from the spec. Preserve actual floor and derived gate as distinct values; current `captureSettings().noiseFloor` stores a gate under a misleading name, so add explicit `rmsGate` metadata for new records rather than silently treating old values as true floor. Apply the accepted gate to new recording segmentation defaults while retaining unrelated last-used tuning.
- [ ] Represent raw settings as off/on/unknown; false passes, true blocks, unknown requires explicit acknowledgment. No silent success for absent `getSettings()` properties. Acknowledgment remains scoped to the current device.
- [ ] Run `npm test -- src/capture-model.test.ts src/hooks/useMicrophone.test.tsx src/hooks/useRoomCalibration.test.tsx src/hooks/useSoundCheck.test.tsx src/recording-setup.test.ts`; expect passes.
- [ ] Commit retained calibration and checks.

### Task 5: Shared monitor, checklist, and live beat bars

**Files:** Create `src/components/StatusChecklist.tsx`, `src/components/LiveMonitor.tsx`, tests; modify `src/components/Checklist.test.tsx`, `src/trace.ts`, `src/trace.test.ts`, `src/hooks/useMicrophone.ts`, `src/styles.css`.

**Interfaces:** `StatusChecklist({ checks }: { checks: SetupCheck[] })`; `LiveMonitor` accepts live level/pitch, contextual mode, trace ref, and tempo/transport state. Extend `TraceView` with `beatOrigin?: number` (same coordinate system as frames), `playheadTime?: number`, and a count-in flag if needed for labels; omission preserves existing editor behavior. Share a `TransportState` type in `src/metronome.ts`: BPM, beats/bar, AudioContext downbeat time, phase (preview/count-in/recording), and running state.

- [ ] Test identical status semantics across raw settings and acoustic checks, textual unknown states, sound-without-pitch messaging, room/clap instructions, and retained passed rows during silence. Verify failures.
- [ ] Extend trace tests for beat spacing at 60/120 BPM, emphasized bars, shifted origins, negative count-in beats, playhead, and unchanged static editor output. Verify failures using canvas call assertions, not raster snapshots.
- [ ] Implement shared presentation, accessible canvas description/readouts, and grid drawing. Time frames from the opened AudioContext; only convert coordinates once. Scrolling history remains bounded. Seconds scale before a tempo exists; draft/default grid explicitly says Preview until confirmed. Silence must not disable grid animation.
- [ ] Run `npm test -- src/trace.test.ts src/components/StatusChecklist.test.tsx src/components/LiveMonitor.test.tsx src/components/Checklist.test.tsx`; expect passes.
- [ ] Commit shared monitor/grid UI.

### Task 6: Pure tempo estimator and clap detector

**Files:** Create `src/tempo-model.ts`, `src/tempo-model.test.ts`, `src/clap-detector.ts`, `src/clap-detector.test.ts`.

**Interfaces:** `estimateTempo(eventsSec: number[]): { bpm: number | null; stable: boolean; eventCount: number }`; `adjustTempo(bpm: number, factor: 0.5 | 2): number | null` (null outside 40–220); `createClapDetector(sampleRate: number, noiseFloor: number): { process(samples: Float32Array, startSec: number): number[]; reset(): void }`. Events use seconds and strictly increasing timestamps.

- [ ] Test evenly spaced 60/90/120 BPM events, jitter, <5 events, duplicates/nonfinite/nonmonotonic input, 40/220 boundaries, pauses >2 s, out-of-range intervals, unstable timing, and half/double results. Stable requires the spec's median-deviation ratio <=0.15; show low confidence rather than pretending to infer meter. Verify failures.
- [ ] Test synthetic impulses over noise, one clap tail counted once, sustained tones rejected, low noise-relative impulses rejected, 150 ms refractory behavior, and irregular block sizes with accurate event times. Verify failures.
- [ ] Implement interval estimation and sample-based transient processing. Keep at most the latest 9 events; reset on >2 s pause. Initial clap threshold: RMS envelope >= max(0.015, floor * 4), rising from <= half that threshold, peak/RMS >=2; envelope uses 10 ms blocks across input chunks. These proposed values require Task 9 real-device validation.
- [ ] Run `npm test -- src/tempo-model.test.ts src/clap-detector.test.ts`; expect passes.
- [ ] Commit tempo and clap algorithms.

### Task 7: Tap/clap/manual tempo controls and preview

**Files:** Create `src/hooks/useTempo.ts`, `src/hooks/useTempo.test.tsx`, `src/components/TempoSetup.tsx`, `src/components/TempoSetup.test.tsx`; modify `src/audio.ts`, `src/metronome.ts` and tests as needed for reliable sample delivery and preview cleanup.

**Interfaces:** `useTempo` consumes the current microphone, room floor, and setup dispatch; exposes draft BPM/meter, stable estimate, tap/reset, start/stop clap listening, preview start/stop, confirm, and shared `TransportState`. Add `subscribePcm(listener: (samples: Float32Array, startSec: number) => void): () => void` to `MicHandle`, backed by an AudioWorklet delivering non-overlapping PCM with audio-clock timestamps only while clap listening. Do not feed overlapping analyser frames into the clap detector. Reuse recorder worklet infrastructure where practical; otherwise create `src/clap-input.ts` (+ lifecycle test).

- [ ] Test button taps and Space, ignoring repeat/modified keys and editable fields; manual numeric entry, invalid/fractional values, no usable estimate, restart, half/double, explicit confirmation, optional preview, and meter choice. Verify failures.
- [ ] Test clap start/stop exclusivity with audible preview, device loss, context suspension, hidden-tab cancellation, stale worklet messages, timeout after 15 s without a stable estimate, unmount cleanup, and preservation of prior room/sound checks. Verify failures.
- [ ] Implement accessible tempo controls with event/stability feedback and plain failure/retry text. Space must not double-count native button activation. A manual value can be confirmed without a detection estimate; unstable detected estimates cannot be silently confirmed. Editing accepted BPM/meter clears confirmation. Preview uses `countInBars: 0`; stop its transport before starting a recording count-in.
- [ ] Run `npm test -- src/tempo-model.test.ts src/clap-detector.test.ts src/hooks/useTempo.test.tsx src/components/TempoSetup.test.tsx`; expect passes.
- [ ] Commit tempo selection and listening UI.

### Task 8: Assemble the gated wizard and recording lifecycle

**Files:** Modify `src/components/Capture.tsx`, `src/hooks/useCapture.ts`, all capture tests, relevant library/editor analysis tests, and `src/styles.css`.

**Interfaces:** Compose Tasks 2–7; `startRecording()` calls `canRecord` against current state, then locks the confirmed source/gain/tempo/meter snapshot. Publish actual metronome downbeat to the live monitor and use that same timestamp in `trimCountIn`. Save source analysis, true noise floor, gate, and actual DSP status separately; acknowledgment of unknown DSP must not store `dspOff: true`.

- [ ] Rewrite capture tests around source -> microphone -> room -> sound -> tempo -> record. Test hidden future controls, completed summary Edit, first unmet step after edits, microphone permission denial/retry, stale results, focus movement, and no recording-handler bypass. Verify failures.
- [ ] Add recording regression tests for preview-to-count-in re-anchoring, negative count-in grid, exact downbeat trimming, stop during count-in, too-short retry, save failure/retry, and cleanup on device loss/navigation. Freeze settings while counting in, recording, and saving. Verify failures.
- [ ] Implement six steps with the monitor mounted once outside step content. Initiate microphone opening from step 2 user action, not page mount. Use shared status rows and source-specific language. Preserve confirmed tempo across unrelated calibration invalidation. Stop other app playback before measurements or clap listening using the existing playback owners' stop APIs.
- [ ] Confirm new recordings open at `/diapason/recording/:id`, retain chosen profile/gate, and analyze consistently in library/editor. Existing stored audio remains readable with whistle defaults; exports/duplicates/muting/quantization keep working.
- [ ] Run `npm test -- src/components/Capture.test.tsx src/components/Capture.ready.test.tsx src/components/Capture.record.test.tsx src/hooks/useMicrophone.test.tsx src/components/Library.test.tsx src/hooks/useEditorPlayback.test.tsx` and `npm run typecheck`; expect passes.
- [ ] Commit the integrated wizard.

### Task 9: Real-device validation, documentation, and final checks

**Files:** Update `README.md` and touched styles/copy; adjust centralized thresholds only with observed evidence and corresponding regression tests.

- [ ] Verify in a localhost/HTTPS browser with an actual microphone: quiet/noisy rooms, silence, normal/soft whistles, clipping, gain changes, permission denial, unplug/reconnect, suspended/resumed audio, rapid step edits, and an unsupported DSP setting. Record observations and any untested hardware/browser limitations.
- [ ] Validate taps and claps at slow/medium/fast tempos, clap tails, incidental speech/knocks, and metronome bleed. Confirm preview/listening exclusion, no false calibration resets, and retry guidance. Exercise at least a laptop microphone and an external input if available; do not call synthetic tests real-device validation.
- [ ] Inspect live moving beat/bar lines at 90 and 120 BPM and multiple meters. Confirm audible click, visual beat, count-in, and saved editor grid agree; resize at narrow widths. Check keyboard-only flow, visible focus, readable status without color, and reduced-motion behavior (keep necessary timing feedback; avoid decorative animation).
- [ ] Update README with the six steps, supported sound source, new route, tap/clap/manual tempo, local recording persistence, and relevant permission/browser limitations. Capture screenshots of the visible changes for a future PR.
- [ ] Run `npm run check`; expect exit 0. Ensure `origin/main` and `HEAD^` exist for Fallow; report missing prerequisites rather than changing baselines to force success. Do not run broad checks again unless subsequent changes require it.
- [ ] Review spec coverage and the final diff; record completed validation and remaining limitations. Commit final refinements if requested. Creating a PR, merging, or deploying is outside this planning request.

## Completion criteria

All six steps work in order; checks persist after silence and invalidate only for actual dependencies; the shared monitor includes live level/pitch and synchronized beat/bar lines; tap/clap/manual tempo can be confirmed independently; recording uses the validated snapshot; take domain terminology/URLs are replaced; existing stored audio survives; unsupported future source choices are not exposed. Required automated checks pass and real-device validation results are reported honestly.
