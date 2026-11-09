# Glide integration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Integrate the approved Glide control, curved notes and editable bends with consistent playback, export and restoration.

**Architecture:** Source segments retain compact normalized pitch contours; final notes carry their contour and effective Glide value. A pure evaluator and step expander supply the renderer and transports. Interpretation v3 encodes contours and manual bend edits while v1/v2 retain their original defaults and wire bytes.

**Tech stack:** React, TypeScript, Canvas, Web Audio, MIDI 1.0, Vitest, existing portable-tune codec.

**Spec:** `docs/superpowers/specs/2026-11-08-glide-output.md`; approved runnable study `dev/glide-study.html`.

## Global constraints

Preserve original PCM, frozen published preset values, v1/v2 wire contracts and the `/diapason/` base path. Presets only supply explicit controls. Source and persisted shapes use explicit `*.type.ts` definitions. Do not expand lint, duplication or health baselines. Keep screenshots in temporary storage.

## Review focus

- Small drifting held notes and repeated equal pitches must not become indiscriminate glides or merges.
- Clean short semitone steps survive contour segmentation; real articulation and saved edit boundaries remain represented.
- Muting, whole-note transposition, timing changes, preview, undo and reload retain the same contour semantics.
- Every MIDI bend starts from a known state, uses the advertised range, and cannot leak into later notes or survive interruption.
- 41%, 70%, and 100% must differ audibly while destinations remain fixed; pointer and keyboard editing must agree at low amounts.

### Task 1: Shared contour model, evaluator and explicit control

**Files:** Create `src/Melody/PitchCurve.type.ts`, `PitchCurve.ts`, `PitchCurve.test.ts`; modify `Notes.ts`, `Decode.type.ts`, `Knobs.ts`, knob tests and historical-control fixtures.

**Interfaces:** `PitchPoint { position: number; offset: number }`; `NoteBend { points: PitchPoint[]; glide: number }`; optional `Segment.curve` and `NoteEvent.bend`. `notePitchAt(note, position): number`; `bendSamples(note)`; `steppedNotes(notes): NoteEvent[]`; `snapGlide(value): number`.

- [x] Write failing tests for the approved stops, audible-range time mapping, fixed point pitches/arrival times, reversed contours, stepped output and malformed curves.
- [x] Run focused tests, implement the pure evaluator/validators and bounded sampling/step expansion, then run them green.
- [x] Add Glide (0–1, step 0.01, default 0) in Shape/Essentials. Preserve old recipes by adding only their historical zero default. Add interpretation version 3 and v1/v2 defaults without changing existing control meanings.

### Task 2: Contour-aware source segmentation

**Files:** Create `src/Melody/ContourSegmentation.type.ts`, `ContourSegmentation.ts`, `ContourSegmentation.test.ts`; modify `Decode.ts`, `Interpret.ts`, `Processing.ts`, `NoteSource.ts`.

**Interfaces:** `findContourParts(pitch, minLength, steadiness)` returns indexed regions and representative pitches; contour extraction returns `PitchPoint[] | undefined`. `segmentMelody` and interpretation accept an explicit interpretation version, defaulting to legacy behavior for legacy controls.

- [x] Write failing tests using held drift, mirrored slides, 128ms chromatic steps, vibrato, articulated runs and repeated notes; add the reviewed Moon 10/11 merge separately from baseline characterization.
- [x] Implement stable-region segmentation within existing voiced/articulation/protected pieces. Retain moving transitions with their destination, suppress small wobble using Steadiness, and compact meaningful contours. Keep v1/v2 decoder paths unchanged.
- [x] Run focused segmentation, interpretation and approved fixture tests; inventory real-fixture changes under opt-in v3 independently of Context correction.

### Task 3: Bend edits and interpretation-v3 persistence

**Files:** Create `src/Editing/NoteEdits.type.ts`, `BendEdits.ts`, `BendEdits.test.ts`; modify note-edit imports, `NoteEdits.ts`, `NoteItem.type.ts`, `Processing.ts`, `NoteSource.ts`, `PortableTune.type.ts`, `PortableTune.ts`, `TuneFields.ts`, `Tune.codec.ts`, package validation/comparison and extension merging.

**Interfaces:** Optional `NoteEdits.bend` entries contain id, the original `Segment`, and edited `PitchPoint[]`. `setBendEdit`/`resetBendEdit` preserve pitch edits. `PortableTune.bendEdits` stores note index plus edited points in v3 only.

- [x] Write failing tests for edit validation, reset preserving other axes, fixed edited source coverage, transposition and undo snapshots.
- [x] Preserve edited source segments during live re-segmentation, applying relative curves after pitch correction and normalized timing.
- [x] Append Glide as v3 control bit 14; reserve note flags for source curve and manual curve, each encoded as a bounded count and exact Float64 position/offset pairs. Reject them in v1/v2. Older controls/notes retain exact bytes.
- [x] Test portable/WAV/MIDI metadata roundtrips, malformed points/counts/versions, tampering, manual reset and explicit zero. Update maintained format documentation.

### Task 4: Browser and MIDI playback/export

**Files:** Modify `Playback/Instruments.ts`, `Playback.ts`, MIDI writer/live transport, inspection event normalization and related tests; create explicit voice/ MIDI event types and shared bend helpers as needed.

**Interfaces:** Synth voices expose their pitched AudioParams separately from lifecycle nodes. MIDI event generation includes RPN range configuration and 14-bit bends only for smooth output; stepped notes expand through the shared helper.

- [x] Write failing tests for all instrument pitch paths, stepped note articulation, range configuration, ordering, bend resets, cancellation, transposition and unchanged legacy bytes.
- [x] Use shared pitch samples to schedule detune on pitched oscillators/buffers, preserving intentional detuning and excluding vibrato/noise sources.
- [x] Emit standard MIDI bends using a matching range up to 48 semitones. Handle stale timers, note boundaries and interruption without bend leakage. Validate exported rendered bytes against the embedded v3 tune.
- [x] Run focused playback, MIDI, inspection and format tests. Render 41/70/100% audio for the demonstration contour and check differences and fixed destinations.

### Task 5: Curve rendering, bounds and selection

**Files:** Modify `Audio/Trace.ts`, `Trace.type.ts`, `Editing/Editor.model.ts`, `Features/Editor/EditorViewport.ts`, and corresponding tests.

- [x] Write failing geometry/hit tests for large ascending and descending bends, step blocks, muted/edited notes, target references and octave changes.
- [x] Draw ribbons/step blocks from the shared evaluator, keep target identity visible, and use contour-aware hit tests and pitch bounds. Preserve existing bar rendering when no bend exists.
- [x] Draw selected raw control points with stable, adequate pointer targets. Clip stripes to ribbons and preserve selection and key-warning roles.

### Task 6: Editor slider and bend gestures

**Files:** Modify `MelodyKnob.tsx`, control labeling, `useEditor.ts`, `useEditorPlot.ts`, `NoteDetail.tsx`, editor styles and tests; add a focused bend-gesture hook/model if needed.

- [x] Write failing tests for detents, keyboard movement past stops, one-commit dragging, cancellation, Reset, undo/redo and reload.
- [x] Integrate Glide with existing preview/history/reset controls and aligned value/action columns. Selected notes in smooth mode expose editable points, including a flat initial curve for fixed notes without recorded movement.
- [x] Prioritize bend handles over whole-note dragging and canvas panning. Supply keyboard/inspector editing, retain focus, and preserve target-pitch destination. Respect preview and locked states.
- [x] Verify in a browser with actual v3 data at default/minimum panel widths and phone portrait/landscape. Capture geometry/screenshots to `/tmp`.

### Task 7: End-to-end verification, review and documentation

**Files:** README and maintained studio/limitations/architecture/sharing/format/development guides; integration tests and reviewed demonstration fixture as needed.

- [x] Exercise a live recording and fixed-note v3 tune through Glide, bend editing, undo, save/reopen, sharing, WAV and MIDI roundtrips. Retain legacy fixture assertions.
- [x] Run `npm run check`, fix all new findings without baseline growth, and obtain one fresh whole-change code review. Address material findings with regression tests.
- [x] Record browser evidence and audible-range evidence. Update the public overview and detailed guides to describe shipped behavior and remaining hardware/detection limits accurately. Keep the work uncommitted unless requested.

Validation evidence is stored outside the repository: `/tmp/diapason-glide-editor/` contains desktop, 286px sidebar, 390px/320px portrait and 844px landscape captures and geometry, saved-edit/undo/redo/reset checks, and a real touch drag. `/tmp/diapason-glide-audio/` contains 21 offline browser renders (all seven instruments at 41/70/100%) and pitch measurements. Source/MIDI/WAV tests cover legacy bytes, independent manual axes, malformed curves, reset/re-export and the Moon held note. A fresh whole-change review and its follow-up found no remaining important correctness issues after the slow-glide, pitch-range and close-point fixes.

Final verification: `npm run check` exits 0; 156 test files / 1,107 tests pass. Audit reports no new dead code, complexity or duplication findings; the health gate and production build pass. Existing health baselines are unchanged, and one stale lint suppression entry was removed. Work remains uncommitted. Physical external MIDI hardware was not available; browser audio, MIDI bytes and transport messages were verified.
