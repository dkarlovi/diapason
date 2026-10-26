# Reliable Note Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship manual pitch editing whose saved intent survives tuning, timing changes, splits, filtering, reloads, and independently resettable descendants.

**Architecture:** Persist nonoverlapping source-time coverage for manual pitch choices. Use coverage edges to constrain segmentation, then apply exact pitch overrides after automatic interpretation and rhythm shaping. Keep source identity separate from output notes and sequence labels; design future timing/velocity coverage without implementing those axes now.

**Tech Stack:** Existing React, strict TypeScript, Vite, IndexedDB, Vitest, and React Testing Library; no new dependencies.

**Spec:** [Source-based note editing](../specs/2026-10-26-note-editing-design.md). Product behavior is agreed; technical design and this implementation sequence are ready for review before execution.

## Global Constraints

- Preserve Node 22+, the `/diapason/` base path, local IndexedDB storage, and existing unedited MIDI output, including the approved Clean intro bytes.
- Add no dependencies and do not grow duplication/health baselines.
- Keep original audio untouched.
- BPM is fixed; keep seconds for source and output times.
- Implement only pitch now. Future offset, duration, and velocity must have independent source coverage and reset semantics.
- Automatic processing never writes edits, allocates IDs, or changes source coverage. Only explicit user actions do so.
- Existing playback octave remains playback-only; export/roll semantics do not change in this delivery.

## Review Focus

- A reset child's override must not return after filtering, reload, or a different path through tuning settings (Tasks 1, 3, 4).
- Same-pitch neighboring notes remain separate while either has manual coverage; complete reset removes historical protection (Tasks 2, 3).
- Exact boundary contact must not spread a pitch override to a neighbor, including the recording endpoint (Tasks 1, 2).
- An override equal to automatic pitch is still explicit intent with an edited indicator and structural protection (Tasks 3, 5).
- A delayed tuning write or preset audition must not overwrite saved edits or target a preview-only descendant (Tasks 4, 5).

## Task 1: Pure persisted pitch intent and scope operations

**Files:** Create `src/note-edits.ts`, `src/note-edits.test.ts`; modify `src/db.ts`; test `src/db.test.ts`.

**Interfaces:** Define/export the spec's `SourceRange`, `PitchEdit`, and `NoteEdits`. Add `Recording.noteEdits?: NoteEdits`. Export:

```ts
setPitchEdit(edits: NoteEdits | undefined, scope: SourceRange, midi: number, id: string): NoteEdits;
resetPitchEdit(edits: NoteEdits | undefined, scope: SourceRange): NoteEdits;
protectedNoteBoundaries(edits: NoteEdits | undefined): number[];
pitchEditFor(edits: NoteEdits | undefined, source: SourceRange): PitchEdit | undefined;
isNoteEdits(value: unknown, durationSec: number): value is NoteEdits;
```

`setPitchEdit`/`resetPitchEdit` operate on half-open coverage and preserve untouched record IDs; pass a fresh ID from the caller when setting. Reject malformed operation inputs rather than constructing invalid coverage. `pitchEditFor` returns the sole containing edit or undefined; a crossing/competing match violates the constrained-segmentation contract and must throw a descriptive error. Boundary results are unique, ascending range endpoints. No coalescing of independent records.

- [ ] Write tests: set MIDI 73 over `[0,2)`; resolve both `[0,1)` and `[1,2)` to that same edit ID; reset `[0,1)` and retain only `[1,2)` at 73 with the original ID. Setting the left to 75 creates a second independent record; the right remains 73.
- [ ] Add tests for replacing the middle of a range (retaining two fragments), complete removal, no-op reset, immutable inputs, zero-length/negative/nonfinite ranges, MIDI −1/128/fractions, duplicate IDs, unknown versions, overlapping saved records, and rejection of a source segment crossing a coverage edge. `[1,2)` must not affect `[0,1)` or `[2,3)`.
- [ ] Run `npm test -- src/note-edits.test.ts`; confirm the new interfaces/tests fail before implementation.
- [ ] Implement the interval operations and validator. Generate no IDs inside these functions; remove empty records, sort coverage, and preserve explicit equal-valued choices.
- [ ] Add IndexedDB round-trip coverage for the versioned layer and legacy records without it. Verify fully resetting returns `{ version: 1, pitch: [] }` with no protected boundaries and preserves unrelated recording fields.
- [ ] Run `npm test -- src/note-edits.test.ts src/db.test.ts`; expect all tests passing. Commit the model and persistence change together.

## Task 2: Source provenance and constrained segmentation

**Files:** Modify `src/melody/decode.ts`, `src/melody/interpret.ts`; test `src/melody/decode.test.ts`, `src/melody/interpret.test.ts`, `src/melody/intro.integration.test.ts`.

**Interfaces:** Add `source: SourceRange` to `Segment`, recording source start/end directly from frame boundary timestamps. Extend `segmentMelody(frames: Frame[], knobs: Knobs, protectedBoundaries?: readonly number[]): Segment[]`. Add optional `protectedBoundaries?: readonly number[]` to `interpretMelody` input and `segments: Segment[]` to its `Interpretation` result. Existing `decoded` and rhythm-shaped `notes` remain index-aligned with those segments.

- [ ] Write real-frame tests showing a low-steadiness sequence that merges at high steadiness, then protect the middle note's source endpoints and assert high steadiness preserves them. Repeat for equal-pitch neighbors; boundaries, not pitch differences, must preserve identity.
- [ ] Test a protected long span that splits naturally inside it, outer-edge protection, zero/duplicate/out-of-range cuts, final-frame endpoints, and filtering all/subsets of protected pieces. Cuts must not create voiced notes from empty/unvoiced input or override minimum-duration filtering.
- [ ] Run `npm test -- src/melody/decode.test.ts src/melody/interpret.test.ts`; confirm new behavior fails.
- [ ] Split voiced/articulated pieces at protected cuts before `segmentPiece`, so smoothing, dynamic programming, and `absorbSlips` cannot cross the cuts. Preserve direct source endpoint provenance and the existing zero-constraint path. Update segment fixtures/helpers to carry source intervals.
- [ ] Thread boundaries through interpretation and expose segments without feeding manual target pitches into key/harmony estimation.
- [ ] Run `npm test -- src/melody/decode.test.ts src/melody/interpret.test.ts src/melody/intro.integration.test.ts`; expect pass, including byte-identical approved Clean MIDI. Commit this independently testable detection contract.

## Task 3: Shared resolution and mapping regressions

**Files:** Modify `src/recording.ts`; extend `src/note-edits.ts`; test `src/recording.test.ts`, `src/note-edits.test.ts`; create `src/note-edits.integration.test.ts`.

**Interfaces:** Extend `NoteItem` with `source: SourceRange`, `automatic: NoteEvent`, and `editState: { ids: string[]; axes: "pitch"[]; differingAxes: "pitch"[] }`. Preserve existing `raw`, sequence `id`, `muted`, and effective `note`. Export from `note-edits.ts`:

```ts
interface PitchEditCoverage {
  id: string;
  status: "active" | "partial" | "inactive";
  missing: SourceRange[];
}
summarizePitchEdits(edits: NoteEdits | undefined, sources: readonly SourceRange[]): PitchEditCoverage[];
```

Add `editCoverage: PitchEditCoverage[]` to the `processRecording` result. Compute missing coverage by interval subtraction, not floating-point equality of accumulated lengths.

- [ ] Test automatic C5 (72), manual C#5 (73), changed key/automatic octave reinterpretation, and reset. A matched override remains 73 until reset; its name is C#5. An override equal to `automatic.midi` still has `axes: ["pitch"]`, but `differingAxes: []`.
- [ ] Add a real-pipeline split → reset left child → increase steadiness → filter out right child → restore settings scenario. The left remains automatic, the right remains edited, the boundary cannot merge while the right is edited, and full reset reproduces the untouched recording's notes exactly.
- [ ] Test two edited neighbors with equal and different targets, wholly inactive edits, partial coverage, empty frames, source endpoint contact, mute/unmute, and grid/swing/preset changes. No action may migrate an edit to neighboring source material.
- [ ] Test tuning-path independence: process settings A, B, C and A, C using identical final saved state; results and saved scopes match. Repeating processing does not change IDs, serialized edits, or source ranges.
- [ ] Run `npm test -- src/recording.test.ts src/note-edits.test.ts src/note-edits.integration.test.ts`; confirm failures for unimplemented behavior.
- [ ] Validate saved edit layers, derive cuts, and pass them to interpretation. Resolve each item's source scope after rhythm shaping; override only MIDI/name. Apply existing muting separately, return coverage summaries, and keep all consumers using the resulting enabled notes.
- [ ] Run the focused tests plus `npm test -- src/melody/intro.integration.test.ts`; expect pass and unchanged approved bytes. Commit the shared processing layer.

## Task 4: Source-based selection and reliable editor writes

**Files:** Modify `src/hooks/useEditor.ts`, `src/editor-model.ts`; test `src/editor-model.test.ts`, `src/components/Editor.loaded.test.tsx`; create `src/hooks/useEditor.note-edits.test.tsx` if the existing loaded-editor fixture cannot exercise save ordering cleanly.

**Interfaces:** Export `selectedSourceItem(items: readonly NoteItem[], t: number): NoteItem | undefined` from `editor-model.ts` using half-open source containment. The editor keeps a source reference point and returns `selectedPitchEdited: boolean`, `canEditPitch: boolean`, `shiftSelectedPitch(delta: -1 | 1): void`, `resetSelectedPitch(): void`, `resetAllNoteEdits(): void`, and `inactivePitchEditCount: number` to its view. Existing `selectedNote` and `selectedNoteId` remain available.

- [ ] Test selection remaining on the same source after pitch/key/grid changes; a split chooses the child containing the saved reference point. Filtering clears visible selection without removing saved edits. A click selects using the source midpoint, never output pitch as identity.
- [ ] Test rapid up/up/down (73, 74, 73 from 72), persisted IDs/coverage, reset after tuning changes, and MIDI endpoint moves as no-ops. Per-note actions target only the selected source scope and current effective untransposed pitch.
- [ ] Test a pitch write while a tuning save is pending with fake timers; both changes survive flush and reload. Duplicate the edited recording and edit the copy; the original stays unchanged, including nested coverage arrays.
- [ ] Test auditions using the saved layer without mutation. Mutation/reset handlers are guarded while auditioning, including direct handler invocation; preview-only segmentation must not become a write target. Stop restores applied results and selection anchor.
- [ ] Run the focused model/loaded-editor/hook tests and confirm new cases fail; implement handlers against the latest `recordRef`, updating in-memory state before persistence and using immutable layer operations. Stop current playback on committed edit/reset. IDs are allocated only for explicit pitch choices.
- [ ] Run `npm test -- src/editor-model.test.ts src/components/Editor.loaded.test.tsx src/hooks/useEditor.note-edits.test.tsx` (omit the last path if no new hook test was needed); expect pass. Commit the editor state/actions.

## Task 5: Minimal note controls and observable edit rendering

**Files:** Modify `src/components/NoteDetail.tsx`, `src/hooks/useEditorPlot.ts`, `src/trace.ts`; add minimal styles in `src/editor.css` if needed. Test `src/components/Editor.loaded.test.tsx`, `src/hooks/useEditorPlot.test.tsx`, and `src/trace.test.ts`.

**Interfaces:** Add optional `edited?: NoteEvent[]` to `TraceView` and pass edited effective notes (including muted notes) through plot options. Build that list from `NoteItem.editState.axes`; do not infer edit status from pitch equality. Reuse the Task 4 state/actions in the existing menu.

- [ ] Before frontend implementation, read/apply `modern-web-guidance` and the relevant React guidance. Preserve existing popover, focus, selection keys, and zoom behavior.
- [ ] Add user-facing tests for accessible “Up one semitone”, “Down one semitone”, and “Reset pitch” controls. Reset is disabled without pitch intent; moves are disabled at endpoints and all mutation controls are disabled during auditions. Editing an already muted note keeps it muted.
- [ ] Add tests for an explicit edited marker even when manual/automatic pitch agree, and for the marker on a muted edited note. Keep sounding and selection states distinguishable.
- [ ] Test a compact inactive-edit count and an explicit “Reset all note edits” action, with confirmation only for bulk reset. Cancel preserves edits; confirm removes active and inactive intent without changing Tune settings.
- [ ] Run focused component/plot/trace tests and confirm new cases fail; implement the minimal menu controls and metadata-driven marker without redesigning the editor.
- [ ] Run focused tests and check keyboard/focus, narrow viewport, and light/dark behavior in the browser. Capture visible changes for review. Commit the minimal UI slice.

## Task 6: Replay evidence, documentation, and whole-change verification

**Files:** Modify `src/diagnostics.ts`, `src/diagnostics-validation.ts`, `src/diagnostics-replay.ts`, `src/build-info.ts`, `README.md`; test `src/diagnostics.test.ts`, `src/diagnostics-replay.test.ts`, `src/melody/replay.integration.test.ts`, `src/melody/intro.integration.test.ts`, `src/midi-playback.test.ts`.

**Interfaces:** Diagnostic schema/pipeline become 4. Schema 4 snapshots carry saved versioned edits, source provenance, automatic/effective notes, and coverage summaries. Older diagnostic schemas return `status: "incomplete"` with an older-pipeline explanation; unknown future schemas still fail. Keep legacy browser records supported and fixture artifacts untouched.

- [ ] Add a serialized edited JSON/WAV round-trip through real analysis. Assert identical coverage, pre-/post-edit notes, and exported MIDI bytes; tampered or malformed edit scopes/targets must fail validation or produce a clear replay mismatch.
- [ ] Update legacy replay tests explicitly for schema 3's incomplete status, new schema 4 validation, and pipeline 4. Verify hashing/snapshot capture freezes edits before asynchronous work, so later resetting cannot change an export in flight.
- [ ] Test browser/external playback octave shifting on edited notes exactly once. Preserve external MIDI's existing skip behavior outside 0–127; stored override and export pitch remain unchanged.
- [ ] Run the diagnostic/replay/playback/intro tests and confirm new cases fail; implement the schema/version updates and evidence reporting. Update the text log with edit IDs/source scopes and inactive status sufficient to investigate mapping failures.
- [ ] Update README with shipped pitch controls, partial-reset/split behavior, protected merges, inactive edit recovery, playback octave semantics, and schema-4 replay compatibility. Link design/implementation records; do not advertise the other axes as implemented.
- [ ] Run `npm run check`; require successful typecheck, lint, formatting, duplication/health checks, coverage tests, and production build. Do not change the approved Clean MIDI or baselines to make failures pass. Review the final diff and commit the evidence/documentation slice.

## Deferred work

Offset/duration/velocity controls, timing affine-map implementation, overlap-aware MIDI scheduling, and any new global exported transposition control require their own vertical slices. Their deferred implementation must preserve the source-coverage and per-axis-reset contracts in the spec. None blocks the pitch-first mapping delivery.
